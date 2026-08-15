/**
 * The character sheet, as data.
 */

import type { CompiledModule } from '@dm/module';
import type { GameState, EntityId } from '@dm/engine';
import { statsOf, slotsFor, proficiencyOf } from '@dm/engine';

export interface AttributeReading {
  readonly id: string;
  readonly name: string;
  readonly abbrev: string;
  readonly score: number;
  readonly modifier: number;
}

export interface SheetView {
  readonly actor: EntityId;
  readonly name: string;
  readonly level: number;
  readonly xp: number;
  readonly attributes: readonly AttributeReading[];
  readonly derived: readonly { readonly id: string; readonly name: string; readonly value: number }[];
  readonly abilities: readonly { readonly id: string; readonly name: string }[];
  readonly skills: readonly { readonly id: string; readonly name: string; readonly rank: number }[];
  /**
   * Spell slots left at each level, lowest first.
   *
   * Empty for anyone who does not cast, so a module with no magic shows no
   * slots rather than a row of zeroes.
   */
  readonly slots: readonly { readonly level: number; readonly left: number; readonly total: number }[];
  /** What this character is holding a spell on, if anything. */
  readonly concentrating: { readonly id: string; readonly name: string } | null;
  /** The proficiency bonus, when the module declares one. */
  readonly proficiency: number;
}

export function sheetView(module: CompiledModule, state: GameState): SheetView | null {
  const actor = state.entities[state.selected];
  if (!actor) return null;
  const stats = statsOf(module, actor);

  return {
    actor: actor.id,
    name: actor.name,
    level: actor.level,
    xp: actor.xp,
    attributes: module
      .all<{ id: string; name: string; abbrev: string }>('rules.attributes')
      .map((attribute) => ({
        id: attribute.id,
        name: attribute.name,
        abbrev: attribute.abbrev,
        score: actor.attributes[attribute.id] ?? 0,
        modifier: stats.mod[attribute.id] ?? 0,
      })),
    derived: module
      .all<{ id: string; name: string }>('rules.derivedStats')
      .map((stat) => ({ id: stat.id, name: stat.name, value: stats.derived[stat.id] ?? 0 })),
    abilities: actor.abilities.map((id) => ({
      id,
      name: module.find<{ name: string }>('content.abilities', id)?.name ?? id,
    })),
    skills: Object.entries(actor.skills).map(([id, rank]) => ({
      id,
      name: module.find<{ name: string }>('content.skills', id)?.name ?? id,
      rank,
    })),
    slots: slotsFor(module, actor).map((total, index) => ({
      level: index + 1,
      total,
      left: total - (actor.slotsUsed[index] ?? 0),
    })),
    concentrating: actor.concentrating
      ? {
          id: actor.concentrating,
          name: module.find<{ name: string }>('content.abilities', actor.concentrating)?.name
            ?? actor.concentrating,
        }
      : null,
    proficiency: proficiencyOf(module, actor),
  };
}
