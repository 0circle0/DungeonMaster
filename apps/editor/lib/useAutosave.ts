'use client';

/** Saving as you type, rather than when you remember to. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveWorld, recomputeInstancesFor } from '@/lib/worldStore';
import type { ProjectSnapshot } from '@/lib/projectDiff';
import type { ModuleStore } from './store';
import type { WorldAuthoring, WorldMeta } from '@dm/library';

/** Short: a local compressed write costs a fraction of a network round trip. */
const IDLE_MS = 400;

/** Left behind on the way out, read on the way in. */
const PENDING_KEY = 'dm.studio.pending';

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface Autosave {
  readonly state: AutosaveState;
  readonly note: string;
  /** Write now rather than waiting out the idle delay. */
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

  // The save reads these when it runs, not when it was scheduled.
  const latest = useRef({ doc: store.doc, compiled: store.validation.compiled, authoring, world });
  latest.current = { doc: store.doc, compiled: store.validation.compiled, authoring, world };

  /** The world as it was last written, and what the next diff compares against. */
  const snapshot = useRef<ProjectSnapshot | null>(loaded);
  /** Prefabs and style tables never go through the store, so `store.dirty` misses them. */
  const savedAuthoring = useRef<WorldAuthoring | null>(null);

  const inFlight = useRef(false);
  const again = useRef(false);

  const save = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    const { world: target } = latest.current;
    if (!target) return;

    if (inFlight.current) {
      // Something changed while a write was in the air; go round once more.
      again.current = true;
      return;
    }

    inFlight.current = true;
    setState('saving');
    // Captured once.
    const { doc, compiled, authoring: sidecar } = latest.current;

    try {
      // Which fields are the author's rather than the prefab's, from the document being written.
      const written = recomputeInstancesFor(doc, sidecar);
      const { meta, snapshot: next } = await saveWorld({
        world: target,
        doc,
        authoring: written,
        compiled,
        previous: snapshot.current,
      });

      // Only now: a quota failure aborts the transaction, so the snapshot must not move first.
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

  /** The tab going away. */
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

/** Was the last session cut off mid-write? */
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
