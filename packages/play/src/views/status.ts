/**
 * How the selected character is doing, as data.
 *
 * The derivation half of the terminal's status line: pools with their bands,
 * the clock, the stance when the module offers a choice of them, and — new —
 * whose turn it is in combat, which the terminal never computed and both front
 * ends want.
 */

import type { CompiledModule } from '@dm/module';
import type { GameState, EntityId } from '@dm/engine';
import { statsOf, stanceOf } from '@dm/engine';

export interface ResourceReading {
  readonly id: string;
  readonly name: string;
  readonly current: number;
  readonly max: number;
  /** The module's vital resource — the one whose loss is dying. */
  readonly vital: boolean;
  /** The same 0.5 / 0.25 thresholds the terminal colours by. */
  readonly band: 'ok' | 'hurt' | 'critical';
}

export interface StatusView {
  readonly actor: EntityId;
  readonly name: string;
  readonly level: number;
  readonly resources: readonly ResourceReading[];
  readonly conditions: readonly string[];
  /** Null when the module offers no choice of pace. */
  readonly stance: { readonly id: string; readonly name: string } | null;
  readonly clock: {
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    /** `day 2 07:15` — the string both front ends print. */
    readonly text: string;
  };
  readonly combat: {
    readonly round: number;
    readonly turnOf: EntityId | null;
    /** The active combatant's name, ready to print. */
    readonly turnName: string | null;
    /** Whether the active combatant is a party member. */
    readonly yours: boolean;
  } | null;
}

/** `day 2 07:15`, by the module's own day length. */
export function clockOf(module: CompiledModule, state: GameState): string {
  const time = module.source.world.time;
  const day = Math.floor(state.minute / time.minutesPerDay) + 1;
  const clock = state.minute % time.minutesPerDay;
  const hh = String(Math.floor(clock / 60)).padStart(2, '0');
  const mm = String(clock % 60).padStart(2, '0');
  return `day ${day} ${hh}:${mm}`;
}

export function statusView(module: CompiledModule, state: GameState): StatusView | null {
  const actor = state.entities[state.selected];
  if (!actor) return null;

  const stats = statsOf(module, actor);
  const vitalId = module.source.rules.vitalResource;

  const resources = module
    .all<{ id: string; name: string }>('rules.resources')
    .map((resource): ResourceReading => {
      const current = actor.resources[resource.id] ?? 0;
      const max = stats.max[resource.id] ?? 0;
      const ratio = max > 0 ? current / max : 0;
      return {
        id: resource.id,
        name: resource.name,
        current,
        max,
        vital: resource.id === vitalId,
        band: ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'hurt' : 'critical',
      };
    });

  const time = module.source.world.time;
  const clockMinute = state.minute % time.minutesPerDay;

  // The pace, shown only when the module gives a choice — it is the difference
  // between being heard and not.
  const stance = stanceOf(module, actor);
  const paced = stance && module.all('rules.stances').length > 1
    ? { id: stance.id, name: stance.name }
    : null;

  const activeId = state.combat ? state.combat.order[state.combat.turn] ?? null : null;
  const active = activeId ? state.entities[activeId] ?? null : null;

  return {
    actor: actor.id,
    name: actor.name,
    level: actor.level,
    resources,
    conditions: actor.conditions.map((held) => held.condition),
    stance: paced,
    clock: {
      day: Math.floor(state.minute / time.minutesPerDay) + 1,
      hour: Math.floor(clockMinute / 60),
      minute: clockMinute % 60,
      text: clockOf(module, state),
    },
    combat: state.combat
      ? {
          round: state.combat.round,
          turnOf: active?.id ?? null,
          turnName: active?.name ?? null,
          yours: active?.kind === 'character',
        }
      : null,
  };
}
