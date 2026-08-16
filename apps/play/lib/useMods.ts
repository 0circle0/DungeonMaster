'use client';

/**
 * Mod setup as a hook.
 *
 * Two things it has to get right:
 *
 *   - **Nothing renders the game until the answer is known.** A session started
 *     without its mods and then re-created with them would have already
 *     advanced the RNG, so the run would not match a replay.
 *   - **A module that declares no mods pays nothing.** No WASM, no await, no
 *     loading state — `status` is `ready` on the first render and the game
 *     mounts exactly as it did before mods existed.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CompiledModule } from '@dm/module';

import { declarationsOf, readEnabled, setUpMods, writeEnabled } from './mods';
import type { ModSetup, ModWire } from './mods';

export type ModsState =
  | { readonly status: 'ready'; readonly setup: ModSetup | null }
  | { readonly status: 'preparing' }
  | { readonly status: 'blocked'; readonly setup: ModSetup };

export interface ModsApi {
  readonly state: ModsState;
  /** Declared mods and whether each is on, for the settings panel. */
  readonly toggles: readonly { id: string; on: boolean; required: boolean; note: string }[];
  readonly setEnabled: (id: string, on: boolean) => void;
}

export function useMods(module: CompiledModule, available: readonly ModWire[]): ModsApi {
  const declared = useMemo(() => declarationsOf(module), [module]);
  const moduleId = module.source.id;

  const [disabled, setDisabled] = useState<ReadonlySet<string>>(() => readEnabled(moduleId) ?? new Set());
  const [state, setState] = useState<ModsState>(() =>
    declared.length === 0 ? { status: 'ready', setup: null } : { status: 'preparing' },
  );

  useEffect(() => {
    if (declared.length === 0) {
      setState({ status: 'ready', setup: null });
      return;
    }

    let cancelled = false;
    setState({ status: 'preparing' });

    void setUpMods(module, available, (id) => !disabled.has(id)).then((setup) => {
      if (cancelled) return;
      // A missing *required* mod is the one case that stops play: the game says
      // it needs it, and pretending otherwise produces a broken session that
      // reads as an engine bug.
      setState(setup.resolution.ok ? { status: 'ready', setup } : { status: 'blocked', setup });
    });

    return () => {
      cancelled = true;
    };
  }, [module, available, declared.length, disabled]);

  const toggles = declared
    .filter((entry) => entry.target === 'engine')
    .map((entry) => ({
      id: entry.id,
      on: entry.required || !disabled.has(entry.id),
      required: entry.required,
      note: entry.note,
    }));

  return {
    state,
    toggles,
    setEnabled: (id, on) => {
      setDisabled((current) => {
        const next = new Set(current);
        if (on) next.delete(id);
        else next.add(id);
        // Persisted as the *enabled* set, so a mod added to a game later
        // defaults to on rather than inheriting an old absence.
        writeEnabled(
          moduleId,
          declared.filter((d) => !next.has(d.id)).map((d) => d.id),
        );
        return next;
      });
    },
  };
}
