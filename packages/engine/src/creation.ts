/** What a legal starting character is. */

import type { CompiledModule } from '@dm/module';

interface AttributeDef {
  id: string;
  name: string;
  default: number;
  min: number;
  max: number;
}

/** Total cost of a score. */
export function costOf(module: CompiledModule, attribute: AttributeDef, score: number): number {
  const table = module.source.start.creation.attributeCosts;
  const key = String(score);

  if (Object.keys(table).length > 0) {
    if (key in table) return table[key]!;

    // Outside the table: continue at the last step's rate, and never below zero.
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

/** What an allocation costs in total. */
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

/** Why this character could not be made, or null. */
export function creationProblem(
  module: CompiledModule,
  choices: {
    readonly ancestry: string;
    readonly characterClass: string;
    readonly attributes: Readonly<Record<string, number>>;
  },
): string | null {
  const creation = module.source.start.creation;

  if (creation.allowedAncestries.length > 0
    && !creation.allowedAncestries.includes(choices.ancestry)) {
    return `ancestry ${JSON.stringify(choices.ancestry)} is not one this campaign allows`;
  }
  if (creation.allowedClasses.length > 0
    && !creation.allowedClasses.includes(choices.characterClass)) {
    return `class ${JSON.stringify(choices.characterClass)} is not one this campaign allows`;
  }

  const spent = totalSpent(module, choices.attributes);
  if (spent > creation.attributePoints) {
    return `attributes cost ${spent} of ${creation.attributePoints} points`;
  }

  return null;
}
