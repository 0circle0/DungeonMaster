/**
 * Prose from templates.
 *
 * With no LLM at runtime, variety comes from weighted pools keyed on world
 * state. The important property is that expansion is **seeded per scene**, not
 * per call: re-describing the same room gives the same sentence, so a place
 * reads as a place rather than shuffling every time you look at it. Two
 * different playthroughs still describe it differently.
 *
 * Templates interpolate `{placeholder}` from a context the caller supplies.
 */

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
  /**
   * Stable identity for the thing being described. The same key always yields
   * the same phrasing within a run.
   */
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
    // An unresolved placeholder is left in place rather than blanked, so a
    // missing value is visible in play instead of producing a hole in a sentence.
    return value === undefined ? whole : String(value);
  });
}

/**
 * Expand a text pool into a line.
 *
 * Returns an empty string when the pool does not exist, so a missing
 * `textKey` degrades to silence rather than throwing mid-scene.
 */
export function narrateFrom(
  module: CompiledModule,
  poolId: string,
  seed: number,
  options: NarrateOptions = {},
): string {
  const pool = module.find<TextPool>('narrative.textGrammar', poolId);
  if (!pool || pool.variants.length === 0) return '';

  // The scene key decides the phrasing, so the same room reads the same way
  // every time it is described within one run.
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
    // A variant whose condition cannot be evaluated is skipped rather than
    // crashing the scene; the pool's other phrasings still work.
    return false;
  }
  return true;
}

/** Join a list into readable prose: "a, b and c". */
export function list(items: readonly string[], conjunction = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`;
}

/** "a sword" / "an apple" — good enough for English content. */
export function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/** "three hounds" for small numbers, "12 hounds" beyond. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const word = n < words.length ? words[n] : String(n);
  return `${word} ${n === 1 ? singular : plural}`;
}

/**
 * How well a typed noun matches a name, from 100 down to 0 for no match.
 *
 * The ladder is the whole point, and the order of its rungs is load-bearing: a
 * **whole word** beats the **start of a longer word**, which is the difference
 * between `enter mill` finding The Old Mill and finding Millford Village. Put
 * the plain substring test above the word test and the word test becomes dead
 * code, since anything containing a word contains the substring too.
 *
 * Lives here rather than in either front end because the parser and the
 * narrator must agree about what a name means. When they disagreed, `look mill`
 * described one place and `enter mill` walked to another.
 */
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
