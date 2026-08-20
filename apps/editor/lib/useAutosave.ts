'use client';

/**
 * Saving as you type, rather than when you remember to.
 *
 * An editor people leave open for hours should not be able to lose an
 * afternoon to a closed tab, and `⌘S` as the only path to safety makes that the
 * author's job. Undo is the safety net for a change you regret; it is not a
 * reason to keep work in memory.
 *
 * One destination now, because a world is its files. A draft used to exist so
 * that the library always held a document that compiled while a half-typed one
 * waited beside it — but a file with a half-typed reference is a file, the world
 * still opens, and the diagnostic says so. Nothing has to be set aside.
 *
 * The delay is idle time, not a timer: it restarts on every keystroke, so a
 * sentence is written once when it is finished rather than once per letter. It
 * was never the expensive part, though: the old save re-serialized the whole
 * document and compressed it, so debouncing changed how often that happened and
 * not what it cost. What a save writes now is the files that moved, which for an
 * edited field is one of them.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveWorld, recomputeInstancesFor } from '@/lib/worldStore';
import type { ProjectSnapshot } from '@/lib/projectDiff';
import type { ModuleStore } from './store';
import type { WorldAuthoring, WorldMeta } from '@dm/library';

/**
 * Short, because it can be.
 *
 * The old 900 ms was sized for a network round trip that also rewrote every
 * changed file under `project/`. A local compressed write is a fraction of
 * that, and a shorter window is the only real mitigation available for the
 * teardown case below.
 */
const IDLE_MS = 400;

/**
 * Left behind on the way out, read on the way in.
 *
 * `sendBeacon` used to guarantee the last edit survived a closing tab, because
 * a beacon outlives the page. Nothing local can promise that: an IndexedDB
 * transaction is not guaranteed to commit during teardown, and Safari is
 * documented to kill in-flight ones. So the write is attempted at
 * `visibilitychange`, which is the last reliable moment, and this marker is
 * written synchronously beside it. If the next session finds a marker newer
 * than the world it belongs to, the author is told rather than left to notice.
 */
const PENDING_KEY = 'dm.studio.pending';

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface Autosave {
  readonly state: AutosaveState;
  readonly note: string;
  /** Write now rather than waiting out the idle delay. ⌘S, or switching world. */
  readonly flush: () => Promise<void>;
}

const kb = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

export function useAutosave(
  store: ModuleStore,
  world: WorldMeta | null,
  authoring: WorldAuthoring,
  enabled: boolean,
  /** How the world was read, so the first save compares against it. */
  loaded: ProjectSnapshot | null = null,
): Autosave {
  const [state, setState] = useState<AutosaveState>('idle');
  const [note, setNote] = useState('');

  // The save reads these at the moment it runs, not at the moment it was
  // scheduled — otherwise a burst of typing would each save its own stale copy.
  const latest = useRef({ doc: store.doc, compiled: store.validation.compiled, authoring, world });
  latest.current = { doc: store.doc, compiled: store.validation.compiled, authoring, world };

  /** The world as it was last written, and what the next diff compares against. */
  const snapshot = useRef<ProjectSnapshot | null>(loaded);
  /**
   * Prefabs and style tables never go through the store — `savePrefab` and
   * `linkInstance` set state on the loader instead — so `store.dirty` stays
   * false for them and the idle effect below would never fire. That was already
   * losing a prefab created and not followed by an edit; now that entry files can
   * be recipes *built from* those prefabs, it would also let the two disagree.
   */
  const savedAuthoring = useRef<WorldAuthoring | null>(null);

  const inFlight = useRef(false);
  const again = useRef(false);

  const save = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    const { world: target } = latest.current;
    if (!target) return;

    if (inFlight.current) {
      // Something changed while a write was in the air; go round once more
      // rather than dropping it or queueing an unbounded chain.
      again.current = true;
      return;
    }

    inFlight.current = true;
    setState('saving');
    // Captured once. The diff, the write and the snapshot all have to be about
    // the same document, or the snapshot claims files were written that were not.
    const { doc, compiled, authoring: sidecar } = latest.current;

    try {
      // Which fields are the author's rather than the prefab's, worked out from
      // the document being written. Derived rather than tracked, so it matches
      // what the inspector shows by construction.
      const written = recomputeInstancesFor(doc, sidecar);
      const { meta, snapshot: next } = await saveWorld({
        world: target,
        doc,
        authoring: written,
        compiled,
        previous: snapshot.current,
      });

      // Only now. A quota failure aborts the transaction, and a snapshot that
      // moved first would make the next diff compare against files that were
      // never stored — those edits would never be written again.
      snapshot.current = next;
      savedAuthoring.current = sidecar;
      store.markSaved();
      setState('saved');
      setNote(kb(meta.storedBytes));
      window.localStorage.removeItem(PENDING_KEY);
    } catch (err) {
      setState('error');
      setNote((err as Error).message);
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        void save();
      }
    }
  }, [enabled, store]);

  // Idle, restarted by every edit — and by a prefab, which is not one.
  const authoringDirty = savedAuthoring.current !== null && savedAuthoring.current !== authoring;
  useEffect(() => {
    if (!enabled || (!store.dirty && !authoringDirty)) return;
    setState('pending');
    const timer = setTimeout(() => void save(), IDLE_MS);
    return () => clearTimeout(timer);
  }, [enabled, store.doc, store.dirty, authoringDirty, save]);

  /**
   * The tab going away.
   *
   * `visibilitychange → hidden` fires before `pagehide` and is the last point a
   * write is likely to complete. The marker is written first and synchronously,
   * because it is the only part guaranteed to survive: if the save that follows
   * does not finish, the next session still knows something was in flight.
   */
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      const target = latest.current.world;
      if ((!store.dirty && !authoringDirty) || !target) return;
      try {
        window.localStorage.setItem(PENDING_KEY, JSON.stringify({ key: target.key, at: Date.now() }));
      } catch {
        // A full or disabled localStorage costs the warning, not the save.
      }
      void save();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [enabled, store.dirty, authoringDirty, save]);

  return { state, note, flush: save };
}

/**
 * Was the last session cut off mid-write?
 *
 * Returns the moment it happened, so the studio can say so once. A world whose
 * `updatedAt` is newer than the marker finished saving after all.
 */
export function interruptedAt(world: WorldMeta | null): number | null {
  if (!world || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as { key?: string; at?: number };
    if (pending.key !== world.key || typeof pending.at !== 'number') return null;
    return pending.at > world.updatedAt ? pending.at : null;
  } catch {
    return null;
  }
}

export function clearInterrupted(): void {
  try { window.localStorage.removeItem(PENDING_KEY); } catch { /* nothing to clear */ }
}
