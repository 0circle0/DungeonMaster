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
}

export function creationRules(module: CompiledModule): CreationRules {
  const creation = module.source.start.creation;
  return {
    attributes: module.all<AttributeDef>('rules.attributes'),
    ancestries: module.all<{ id: string; name: string; description: string }>('content.ancestries'),
    classes: module.all<{ id: string; name: string; description: string }>('content.classes'),
    points: creation.attributePoints,
    startingLevel: creation.startingLevel,
  };
}

/**
 * Total cost of a score.
 *
 * The module's table is cumulative — the cost of *having* that score, not of
 * the last step — because that is how point-buy tables are written.
 */
export function costOf(module: CompiledModule, attribute: AttributeDef, score: number): number {
  const table = module.source.start.creation.attributeCosts;
  const key = String(score);

  if (Object.keys(table).length > 0) {
    if (key in table) return table[key]!;

    // Outside the table: continue at the rate of its last step, so a module
    // that only tabulates 8–15 still prices a 16 — and prices it like a 15,
    // not like a rounding error. Never negative: dumping a score below the
    // table's floor gives nothing back, or a module with a cheap floor would
    // hand out free points.
    const known = Object.keys(table).map(Number).sort((a, b) => a - b);
    const below = score < known[0]!;
    const edge = below ? known[0]! : known.at(-1)!;
    const inward = below ? known[1] ?? edge : known.at(-2) ?? edge;
    const step = edge === inward
      ? 1
      : Math.abs(((table[String(edge)] ?? 0) - (table[String(inward)] ?? 0)) / (edge - inward));

    return Math.max(0, (table[String(edge)] ?? 0) + (score - edge) * step);
  }

  // No table: one point per step above the declared default.
  return Math.max(0, score - attribute.default);
}

export function totalSpent(
  module: CompiledModule,
  attributes: Readonly<Record<string, number>>,
): number {
  let spent = 0;
  for (const attribute of module.all<AttributeDef>('rules.attributes')) {
    spent += costOf(module, attribute, attributes[attribute.id] ?? attribute.default);
  }
  return spent;
}

/** A starting allocation: everything at its declared default. */
export function baseAllocation(module: CompiledModule): Record<string, number> {
  const out: Record<string, number> = {};
  for (const attribute of module.all<AttributeDef>('rules.attributes')) {
    out[attribute.id] = attribute.default;
  }
  return out;
}

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

/** Render the allocation as a table, with costs and what is left. */
export function renderAllocation(
  module: CompiledModule,
  attributes: Readonly<Record<string, number>>,
): string {
  const rows = module.all<AttributeDef>('rules.attributes').map((attribute) => {
    const score = attributes[attribute.id] ?? attribute.default;
    const cost = costOf(module, attribute, score);
    return `    ${attribute.abbrev.padEnd(5)} ${attribute.name.padEnd(12)} ${String(score).padStart(2)}   ${cost} pts`;
  });

  const left = remaining(module, attributes);
  return [...rows, '', `    ${left} point${left === 1 ? '' : 's'} left`].join('\n');
}
