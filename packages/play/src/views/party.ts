/**
 * The party roster, as data.
 *
 * Gains what the terminal never computed: conditions, who each member is
 * following, and where they stand — a click-to-select roster and a map marker
 * both need those, and they are free to read.
 */

import type { CompiledModule } from '@dm/module';
import type { GameState, EntityId, Position } from '@dm/engine';
import { statsOf } from '@dm/engine';
import type { ResourceReading } from './status.js';

export interface PartyMember {
  readonly id: EntityId;
  readonly name: string;
  readonly level: number;
  readonly alive: boolean;
  readonly selected: boolean;
  /** The vital pool, or null for a module that declares none. */
  readonly vital: ResourceReading | null;
  readonly conditions: readonly string[];
  readonly following: EntityId | null;
  readonly position: Position;
}

export function partyView(module: CompiledModule, state: GameState): readonly PartyMember[] {
  const vitalId = module.source.rules.vitalResource;

  return state.party.flatMap((id) => {
    const member = state.entities[id];
    if (!member) return [];

    const stats = statsOf(module, member);
    const max = stats.max[vitalId] ?? 0;
    const current = member.resources[vitalId] ?? 0;
    const ratio = max > 0 ? current / max : 0;
    const vitalName = module.find<{ name: string }>('rules.resources', vitalId)?.name ?? vitalId;

    return [{
      id,
      name: member.name,
      level: member.level,
      alive: member.alive,
      selected: id === state.selected,
      vital: max > 0
        ? {
            id: vitalId, name: vitalName, current, max, vital: true,
            band: ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'hurt' : 'critical',
          }
        : null,
      conditions: member.conditions.map((held) => held.condition),
      following: member.following,
      position: member.position,
    }];
  });
}
