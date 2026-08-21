/** Prose from templates. */

import { Rng, hashString } from '@dm/core';
import { evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { CompiledModule, Predicate, Requirement, Scope } from '@dm/module';

interface TextVariant {
  text: string;
  when?: Predicate;
  requires?: Requirement;
  weight: number;
  tags: string[];
}

interface TextPool {
  id: string;
  variants: TextVariant[];
}

export interface NarrateOptions {
  /** Values for `{placeholder}` substitution. */
  readonly context?: Readonly<Record<string, string | number>>;
  /** Scope for evaluating variant conditions. */
  readonly scope?: Scope;
  /** Stable identity for the thing being described. */
  readonly sceneKey?: string;
  readonly openNamespaces?: readonly string[];
}

/** Substitute `{name}` placeholders, leaving unknown ones visible. */
export function interpolate(
  template: string,
  context: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = context[name];
    // An unresolved placeholder is left in place rather than blanked.
    return value === undefined ? whole : String(value);
  });
}

/** Expand a text pool into a line. */
export function narrateFrom(
  module: CompiledModule,
  poolId: string,
  seed: number,
  options: NarrateOptions = {},
): string {
  const pool = module.find<TextPool>('narrative.textGrammar', poolId);
  if (!pool || pool.variants.length === 0) return '';

  // The scene key decides the phrasing, so a room reads the same way all run.
  const rng = Rng.fromSeed(seed ^ hashString(options.sceneKey ?? poolId));

  const eligible = options.scope
    ? pool.variants.filter((variant) => allows(variant, options.scope!, rng, options.openNamespaces))
    : pool.variants;

  const usable = eligible.length > 0 ? eligible : pool.variants;
  const chosen = rng.weightedPick(usable, (variant) => variant.weight ?? 1);

  return interpolate(chosen.text, options.context ?? {});
}

function allows(
  variant: TextVariant,
  scope: Scope,
  rng: Rng,
  openNamespaces: readonly string[] | undefined,
): boolean {
  const context = { scope, rng, ...(openNamespaces ? { openNamespaces } : {}) };
  try {
    if (!isEmptyRequirement(variant.requires)) {
      if (!evalPredicate(compileRequirement(variant.requires), context)) return false;
    }
    if (variant.when && !evalPredicate(variant.when, context)) return false;
  } catch {
    // A variant whose condition cannot be evaluated is skipped.
    return false;
  }
  return true;
}

/** The words a sentence is assembled from, resolved from the module once. */
export interface Grammar {
  readonly and: string;
  readonly or: string;
  readonly separator: string;
  readonly pair: string;
  readonly many: string;
  readonly consonant: string;
  readonly vowel: string;
  readonly counted: string;
  readonly plural: string;
  /** Number words from zero upward; past the end, digits are used. */
  readonly numbers: readonly string[];
}

/** How a noun reads when there is more than one of it. */
export function plural(grammar: Grammar, noun: string): string {
  return interpolate(grammar.plural, { noun });
}

/** Join a list into readable prose: "a, b and c". */
export function list(grammar: Grammar, items: readonly string[], conjunction = grammar.and): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) {
    return interpolate(grammar.pair, { first: items[0]!, last: items[1]!, conjunction });
  }
  return interpolate(grammar.many, {
    head: items.slice(0, -1).join(grammar.separator),
    last: items.at(-1)!,
    conjunction,
  });
}

/** "a sword" / "an apple". */
export function article(grammar: Grammar, noun: string): string {
  return interpolate(/^[aeiou]/i.test(noun) ? grammar.vowel : grammar.consonant, { noun });
}

/** "three hounds" for small numbers, "12 hounds" beyond. */
export function count(
  grammar: Grammar,
  n: number,
  singular: string,
  plural: string,
): string {
  const word = n >= 0 && n < grammar.numbers.length ? grammar.numbers[n]! : String(n);
  return interpolate(grammar.counted, { number: word, noun: n === 1 ? singular : plural });
}

/** How well a typed noun matches a name, from 100 down to 0 for no match. */
export function nameScore(needle: string, name: string): number {
  const typed = needle.trim().toLowerCase();
  const candidate = name.trim().toLowerCase();
  if (typed === '' || candidate === '') return 0;
  if (typed === candidate) return 100;

  const words = candidate.split(/\s+/);
  if (words.includes(typed)) return 90;
  if (candidate.startsWith(typed)) return 80;
  if (words.some((word) => word.startsWith(typed))) return 70;
  if (candidate.includes(typed)) return 60;
  return 0;
}

/** How a creature reads in prose: "a lean, mud-slicked bog hound", from `monsters[].descriptors`. */
export function describeCreature(
  module: CompiledModule,
  entity: { id: string; name: string; statblock: string | null },
  seed: number,
): string {
  if (!entity.statblock) return entity.name;

  const statblock = module.find<{ descriptors?: string[] }>('content.monsters', entity.statblock);
  const descriptors = statblock?.descriptors ?? [];
  if (descriptors.length === 0) return entity.name;

  const rng = Rng.fromSeed(seed).derive(`describe:${entity.id}`);
  return `${rng.pick([...descriptors])} ${entity.name.toLowerCase()}`;
}
