'use client';

/**
 * Saving as you type, rather than when you remember to.
 *
 * An editor people leave open for hours should not be able to lose an
 * afternoon to a closed tab, and `⌘S` as the only path to disk makes that the
 * author's job. Undo is the safety net for a change you regret; it is not a
 * reason to keep work in memory.
 *
 * Two destinations, because the files being written are the ones the game
 * loads and those have to stay loadable:
 *
 * - the document **validates** → its real files, and any draft is cleared;
 * - it **does not** → a draft outside git, recovered when the module reopens.
 *
 * A half-typed id is a normal state of a text box, so the second case is
 * frequent and has to be as durable as the first.
 *
 * The delay is idle time, not a timer: it restarts on every keystroke, so a
 * sentence is written once when it is finished rather than once per letter.
 * It sits behind the 300 ms validation tier deliberately — saving a document
 * before knowing whether it is valid would pick the wrong destination.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModuleStore } from './store';

const IDLE_MS = 900;

export type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'draft' | 'error';

export interface Autosave {
  readonly state: AutosaveState;
  readonly note: string;
  /** Write now rather than waiting out the idle delay. ⌘S, or closing. */
  readonly flush: () => Promise<void>;
}

export function useAutosave(store: ModuleStore, moduleName: string, enabled: boolean): Autosave {
  const [state, setState] = useState<AutosaveState>('idle');
  const [note, setNote] = useState('');

  // The save reads these at the moment it runs, not at the moment it was
  // scheduled — otherwise a burst of typing would each save its own stale copy.
  const latest = useRef({ doc: store.doc, ok: store.validation.ok });
  latest.current = { doc: store.doc, ok: store.validation.ok };

  const inFlight = useRef(false);
  const again = useRef(false);

  const save = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    if (inFlight.current) {
      // Something changed while a write was in the air; go round once more
      // rather than dropping it or queueing an unbounded chain.
      again.current = true;
      return;
    }

    inFlight.current = true;
    setState('saving');
    const { doc, ok } = latest.current;

    try {
      if (ok) {
        const response = await fetch(`/api/modules/${moduleName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(doc),
        });
        const body = (await response.json()) as {
          project?: { written: number } | null;
          error?: string;
        };
        if (!response.ok) {
          setState('error');
          setNote(body.error ?? 'could not save');
        } else {
          // The real files hold this work now, so the draft is not a second
          // opinion about it.
          await fetch(`/api/modules/${moduleName}/draft`, { method: 'DELETE' });
          store.markSaved();
          setState('saved');
          setNote(body.project ? `${body.project.written} file(s)` : 'saved');
        }
      } else {
        await fetch(`/api/modules/${moduleName}/draft`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(doc),
        });
        // Deliberately *not* `markSaved`: the module on disk is still the last
        // valid one, and saying "saved" about a document with errors in it
        // would be a lie the author acts on.
        setState('draft');
        setNote('kept as a draft — has errors');
      }
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
  }, [enabled, moduleName, store]);

  // Idle, restarted by every edit.
  useEffect(() => {
    if (!enabled || !store.dirty) return;
    setState('pending');
    const timer = setTimeout(() => void save(), IDLE_MS);
    return () => clearTimeout(timer);
  }, [enabled, store.doc, store.dirty, save]);

  // Closing the tab mid-delay is the window this whole thing exists to close.
  // `sendBeacon` survives teardown where `fetch` does not.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (!store.dirty) return;
      const body = new Blob([JSON.stringify(latest.current.doc)], { type: 'application/json' });
      navigator.sendBeacon(`/api/modules/${moduleName}/draft`, body);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [enabled, moduleName, store.dirty]);

  return { state, note, flush: save };
}
