/**
 * Story arcs: the shape a run has, above its quests.
 *
 * `narrative.arcs` was never queried at all — a collection the schema accepted,
 * the linter cleared and the docs described, that no code path had ever
 * dereferenced. `isEnding` in particular promised the game would end and did
 * nothing whatsoever.
 *
 * An arc's status is **derived from its quests**, never stored. Storing it would
 * create a second source of truth that a save could disagree with — the same
 * argument `stageIndexOf` already makes for which stage a quest is on.
 */

import type { CompiledModule, Value } from '@dm/module';
import type { GameState } from '../state.js';

export interface ArcDef {
  id: string;
  name: string;
  description: string;
  quests: string[];
  isEnding: boolean;
}

export type ArcStatus = 'unstarted' | 'active' | 'complete' | 'failed';

/** A quest's standing from the arc's point of view, `unstarted` included. */
export type ArcQuestStatus = 'unstarted' | 'available' | 'active' | 'complete' | 'failed';

export interface ArcView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: ArcStatus;
  /** Quests finished, out of how many the arc names. */
  readonly done: number;
  readonly total: number;
  /** Reaching the end of this ends the run. */
  readonly isEnding: boolean;
  readonly quests: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: ArcQuestStatus;
  }[];
}

/**
 * Where every arc stands.
 *
 * `failed` beats `complete` beats `active`: an arc with a failed quest in it has
 * gone wrong however much of the rest was finished, which is the reading that
 * lets a module write a story that can be lost.
 */
export function arcsOf(module: CompiledModule, state: GameState): readonly ArcView[] {
  return module.all<ArcDef>('narrative.arcs').map((arc) => {
    // A quest with no record has not been taken; the state only holds the ones
    // that have been offered or started.
    const quests: ArcView['quests'] = arc.quests.map((id) => ({
      id,
      name: module.find<{ name: string }>('narrative.quests', id)?.name ?? id,
      status: state.quests[id]?.status ?? 'unstarted',
    }));

    const done = quests.filter((quest) => quest.status === 'complete').length;
    const failed = quests.some((quest) => quest.status === 'failed');
    const started = quests.some((quest) => quest.status !== 'unstarted');

    const status: ArcStatus =
      failed ? 'failed'
      : done === quests.length && quests.length > 0 ? 'complete'
      : started ? 'active'
      : 'unstarted';

    return {
      id: arc.id,
      name: arc.name,
      description: arc.description,
      status,
      done,
      total: quests.length,
      isEnding: arc.isEnding,
      quests,
    };
  });
}

/** Whether any arc that ends the game has been finished. */
export function endingReached(module: CompiledModule, state: GameState): ArcView | null {
  return arcsOf(module, state).find((arc) => arc.isEnding && arc.status === 'complete') ?? null;
}

/**
 * Arc status as the DSL sees it.
 *
 * Populated for **every** declared arc rather than only the started ones, so
 * `arcs` is a closed namespace and a misspelled arc id is a loud error rather
 * than a silent `unstarted`.
 */
export function arcScope(module: CompiledModule, state: GameState): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const arc of arcsOf(module, state)) {
    out[arc.id] = { status: arc.status, done: arc.done, total: arc.total };
  }
  return out;
}
