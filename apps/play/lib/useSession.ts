'use client';

/**
 * The session as React state.
 *
 * The engine's `reduce` is deliberately NOT the React reducer: React 19
 * StrictMode double-invokes reducers, and `state.rng` advances per action — the
 * second invocation's events would be silently dropped, a divergent-replay bug
 * found days later. So the engine call happens in the event handler, and the
 * React reducer only files results. `sessionReducer` is exported separately so
 * it is testable without a DOM.
 */

import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { CompiledModule } from '@dm/module';
import type { Action, GameState, Line, SaveFile } from '@dm/engine';
import { TerrainIndex, load as loadState, save as saveState } from '@dm/engine';
import { startSession, applyTo, interpret } from '@dm/play';
import type { ModSetup } from './mods';
import type { MetaCommand, CharacterChoicesLike } from './choices.js';

export interface SessionFrame {
  readonly state: GameState;
  readonly transcript: readonly Line[];
  readonly seed: number;
  /** Bumped on every reset, so panes can drop per-run state. */
  readonly run: number;
}

export type SessionMsg =
  | { readonly type: 'applied'; readonly state: GameState; readonly lines: readonly Line[] }
  | { readonly type: 'note'; readonly line: Line }
  | { readonly type: 'reset'; readonly state: GameState; readonly transcript: readonly Line[]; readonly seed: number };

/** Pure, and exported for tests: the hook's own logic is only wiring. */
export function sessionReducer(frame: SessionFrame, msg: SessionMsg): SessionFrame {
  switch (msg.type) {
    case 'applied':
      return { ...frame, state: msg.state, transcript: [...frame.transcript, ...msg.lines] };
    case 'note':
      return { ...frame, transcript: [...frame.transcript, msg.line] };
    case 'reset':
      return { state: msg.state, transcript: msg.transcript, seed: msg.seed, run: frame.run + 1 };
  }
}

export interface SessionApi {
  readonly frame: SessionFrame;
  readonly module: CompiledModule;
  readonly terrain: TerrainIndex;
  /** Apply an engine action — a click, a button, a picked option. */
  readonly dispatchAction: (action: Action) => void;
  /** Run a typed line. Returns a meta command for the shell to handle, if any. */
  readonly submit: (input: string) => MetaCommand | null;
  /** Start over, optionally with a created roster and a fresh seed. */
  readonly restart: (seed: number, roster?: readonly CharacterChoicesLike[]) => void;
  /** Replace the run with a loaded save. Returns an error to show, or null. */
  readonly restore: (text: string, allowDrift?: boolean) => string | null;
  readonly note: (text: string, kind?: Line['kind']) => void;
  /**
   * Serialize the run, carrying the lineage and the active mod set.
   *
   * On the API rather than left to each caller because the append rule is easy
   * to get subtly wrong, and a lineage that silently restarts is worse than
   * none — it would claim a save had only ever seen one module build.
   */
  readonly serialize: (savedAt: number) => string;
}

export function useSession(
  module: CompiledModule,
  initialSeed: number,
  /** Resolved mods, or null when the game uses none. */
  setup: ModSetup | null = null,
): SessionApi {
  const mods = setup?.runtime ?? undefined;
  const modIds = useMemo(() => setup?.identities ?? [], [setup]);

  /**
   * The save this run was loaded from, so its lineage carries forward.
   *
   * Without it every load-then-save would start the chain over, and the chain
   * is the whole point: it is what says which module build a broken save came
   * from.
   */
  const previousRef = useRef<SaveFile | null>(null);
  // Large, non-serializable, constant per module — a ref, not a memo: useMemo
  // is a hint, and losing the terrain index mid-run would rebuild it silently.
  const terrainRef = useRef<{ module: CompiledModule; terrain: TerrainIndex } | null>(null);
  if (!terrainRef.current || terrainRef.current.module !== module) {
    terrainRef.current = { module, terrain: new TerrainIndex(module) };
  }
  const terrain = terrainRef.current.terrain;

  const [frame, dispatch] = useReducer(
    sessionReducer,
    { module, seed: initialSeed },
    ({ module: m, seed }) => {
      const session = startSession(m, seed);
      return { state: session.state, transcript: session.transcript, seed, run: 0 };
    },
  );

  // The frame the *next* handler should read: React state is asynchronous, and
  // two clicks in one tick must not both apply to the same starting state.
  const liveRef = useRef(frame);
  liveRef.current = frame;

  const dispatchAction = useCallback((action: Action) => {
    const current = liveRef.current;
    const turn = applyTo(
      { module, state: current.state, terrain, seed: current.seed, mods },
      action,
    );
    liveRef.current = { ...current, state: turn.state, transcript: [...current.transcript, ...turn.lines] };
    dispatch({ type: 'applied', state: turn.state, lines: turn.lines });
  }, [module, terrain, mods]);

  const submit = useCallback((input: string): MetaCommand | null => {
    const current = liveRef.current;
    const outcome = interpret(
      { module, state: current.state, terrain, seed: current.seed, mods },
      input,
    );

    switch (outcome.kind) {
      case 'turn':
        liveRef.current = {
          ...current,
          state: outcome.turn.state,
          transcript: [...current.transcript, ...outcome.turn.lines],
        };
        dispatch({ type: 'applied', state: outcome.turn.state, lines: [...outcome.turn.lines] });
        return null;
      case 'error':
        if (outcome.message) {
          dispatch({ type: 'note', line: { text: outcome.message, kind: 'refusal' } });
        }
        return null;
      case 'meta':
        return outcome.command;
    }
  }, [module, terrain, mods]);

  const restart = useCallback((seed: number, roster?: readonly CharacterChoicesLike[]) => {
    const session = startSession(module, seed, undefined, roster);
    liveRef.current = {
      state: session.state, transcript: session.transcript, seed, run: liveRef.current.run + 1,
    };
    dispatch({ type: 'reset', state: session.state, transcript: session.transcript, seed });
  }, [module]);

  const restore = useCallback((text: string, allowDrift = false): string | null => {
    const result = loadState(text, module, { allowModuleDrift: allowDrift, mods: modIds });
    if (!result.ok) return result.error;

    // Mod drift never blocks a load. The engine cannot tell whether a different
    // mod set matters, because it does not know what any mod changed — so it
    // names what differs and leaves the judgement to the player.
    const notes: Line[] = [
      { text: 'Loaded.', kind: 'note' },
      ...result.warnings.map((text): Line => ({ text, kind: 'refusal' })),
    ];
    previousRef.current = result.file;

    const current = liveRef.current;
    liveRef.current = {
      ...current, state: result.state, transcript: [...current.transcript, ...notes],
    };
    dispatch({ type: 'applied', state: result.state, lines: notes });
    return null;
  }, [module, modIds]);

  const note = useCallback((text: string, kind: Line['kind'] = 'note') => {
    dispatch({ type: 'note', line: { text, kind } });
  }, []);

  const serialize = useCallback(
    (savedAt: number) =>
      saveState(liveRef.current.state, savedAt, {
        // Carrying the file this run was loaded from is what keeps the lineage
        // a chain rather than a single link.
        previous: previousRef.current,
        mods: modIds,
      }),
    [modIds],
  );

  return { frame, module, terrain, dispatchAction, submit, restart, restore, note, serialize };
}
