/**
 * Character creation.
 *
 * Everything offered comes from the module: which ancestries and classes exist,
 * how many points there are to spend, and what each attribute point costs. The
 * shell knows only how to ask.
 *
 * Costs are read from `start.creation.attributeCosts`, a map from target score
 * to total cost. A module that omits it gets a flat one-point-per-step scale,
 * which is the sane default and keeps a half-authored module playable.
 */

import type { CompiledModule } from '@dm/module';
import type { CharacterChoices } from '@dm/engine';

interface AttributeDef {
  id: string;
  name: string;
  abbrev: string;
  min: number;
  max: number;
  default: number;
}

export interface CreationRules {
  readonly attributes: readonly AttributeDef[];
  readonly ancestries: readonly { id: string; name: string; description: string }[];
  readonly classes: readonly { id: string; name: string; description: string }[];
  readonly points: number;
  readonly startingLevel: number;
  /** Ranks each character distributes across skills at creation. */
  readonly skillRanks: number;
  /** What the party starts with, so the screen can say so. */
  readonly startingCurrency: number;
}

/** Narrow a list to what the module permits; an empty allow-list permits all. */
function allowed<T extends { id: string }>(
  everything: readonly T[],
  permitted: readonly string[],
): readonly T[] {
  if (permitted.length === 0) return everything;
  const wanted = new Set(permitted);
  const narrowed = everything.filter((entry) => wanted.has(entry.id));
  // A restriction that leaves nothing is an authoring error the linter reports;
  // it must not leave the player unable to make a character at all.
  return narrowed.length > 0 ? narrowed : everything;
}

export function creationRules(module: CompiledModule): CreationRules {
  const creation = module.source.start.creation;
  return {
    attributes: module.all<AttributeDef>('rules.attributes'),
    // Restricted to what the module allows, if it restricts anything. An empty
    // list means everything is allowed, which is what the schema says — and
    // both fields were read by nothing, so a module that wanted a dwarves-only
    // campaign still offered every ancestry it had ever defined.
    ancestries: allowed(
      module.all<{ id: string; name: string; description: string }>('content.ancestries'),
      creation.allowedAncestries,
    ),
    classes: allowed(
      module.all<{ id: string; name: string; description: string }>('content.classes'),
      creation.allowedClasses,
    ),
    points: creation.attributePoints,
    startingLevel: creation.startingLevel,
    skillRanks: creation.skillRanks,
    startingCurrency: creation.startingCurrency,
  };
}

// `costOf`, `totalSpent` and `baseAllocation` are the ruleset's, not this
// screen's, and live in `@dm/engine` beside `createCharacter` — which enforces
// the same budget for parties that never come through a creation screen.
export { costOf, totalSpent, baseAllocation } from '@dm/engine';
import { totalSpent } from '@dm/engine';

export type AdjustResult =
  | { readonly ok: true; readonly attributes: Record<string, number> }
  | { readonly ok: false; readonly message: string };

/**
 * Raise or lower one attribute, refusing anything the rules forbid.
 *
 * Refusals name the reason, so a player learns the budget by bumping into it
 * rather than by reading a table.
 */
export function adjust(
  module: CompiledModule,
  attributes: Readonly<Record<string, number>>,
  attributeId: string,
  delta: number,
): AdjustResult {
  const attribute = module.find<AttributeDef>('rules.attributes', attributeId);
  if (!attribute) return { ok: false, message: `there is no ${attributeId}` };

  const current = attributes[attributeId] ?? attribute.default;
  const next = current + delta;

  if (next < attribute.min) return { ok: false, message: `${attribute.name} cannot go below ${attribute.min}` };
  if (next > attribute.max) return { ok: false, message: `${attribute.name} cannot go above ${attribute.max}` };

  const proposed = { ...attributes, [attributeId]: next };
  const spent = totalSpent(module, proposed);
  const budget = module.source.start.creation.attributePoints;

  if (spent > budget) {
    return { ok: false, message: `that would cost ${spent} of ${budget} points` };
  }

  return { ok: true, attributes: proposed };
}

/** Points left to spend. */
export function remaining(
  module: CompiledModule,
  attributes: Readonly<Record<string, number>>,
): number {
  return module.source.start.creation.attributePoints - totalSpent(module, attributes);
}

/** Assemble the choices, filling anything unset with the module's own defaults. */
export function toChoices(
  module: CompiledModule,
  name: string,
  ancestry: string | undefined,
  characterClass: string | undefined,
  attributes: Readonly<Record<string, number>>,
): CharacterChoices {
  const rules = creationRules(module);
  return {
    name,
    ancestry: ancestry ?? rules.ancestries[0]?.id ?? '',
    characterClass: characterClass ?? rules.classes[0]?.id ?? '',
    attributes,
  };
}
