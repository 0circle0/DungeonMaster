'use client';

/**
 * Saving as you type, rather than when you remember to.
 *
 * An editor people leave open for hours should not be able to lose an
 * afternoon to a closed tab, and `⌘S` as the only path to safety makes that the
 * author's job. Undo is the safety net for a change you regret; it is not a
 * reason to keep work in memory.
 *
 * Two destinations, because a world has to stay loadable:
 *
 * - the document **validates** → the world itself, and any draft is cleared;
 * - it **does not** → a draft beside it, recovered when the world reopens.
 *
 * A half-typed id is a normal state of a text box, so the second case is
 * frequent and has to be as durable as the first.
 *
 * The delay is idle time, not a timer: it restarts on every keystroke, so a
 * sentence is written once when it is finished rather than once per letter.
 *
 * Both destinations are now on this machine rather than across a network, which
 * changes two things. The idle window is shorter, because a write costs
 * milliseconds instead of a round trip and a two-thousand-file repository
 * update. And durability at teardown is weaker — see `useEffect` below.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { writeWorld, writeDraft, clearDraft, recomputeInstancesFor } from '@/lib/worldStore';
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

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'draft' | 'error';

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
): Autosave {
  const [state, setState] = useState<AutosaveState>('idle');
  const [note, setNote] = useState('');

  // The save reads these at the moment it runs, not at the moment it was
  // scheduled — otherwise a burst of typing would each save its own stale copy.
  const latest = useRef({ doc: store.doc, ok: store.validation.ok, authoring, world });
  latest.current = { doc: store.doc, ok: store.validation.ok, authoring, world };

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
    const { doc, ok, authoring: sidecar } = latest.current;

    try {
      if (ok) {
        // Which fields are the author's rather than the prefab's, worked out
        // from the document being written. Derived rather than tracked, so it
        // matches what the inspector shows by construction.
        const meta = await writeWorld(target, doc, recomputeInstancesFor(doc, sidecar));
        await clearDraft(target.key);
        store.markSaved();
        setState('saved');
        setNote(kb(meta.storedBytes));
      } else {
        await writeDraft(target.key, doc);
        // Deliberately *not* `markSaved`: the world in the library is still the
        // last one that worked, and saying "saved" about a document with errors
        // in it would be a lie the author acts on.
        setState('draft');
        setNote('kept as a draft — has errors');
      }
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

  // Idle, restarted by every edit.
  useEffect(() => {
    if (!enabled || !store.dirty) return;
    setState('pending');
    const timer = setTimeout(() => void save(), IDLE_MS);
    return () => clearTimeout(timer);
  }, [enabled, store.doc, store.dirty, save]);

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
      if (!store.dirty || !target) return;
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
  }, [enabled, store.dirty, save]);

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
