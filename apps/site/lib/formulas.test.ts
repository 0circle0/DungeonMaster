/**
 * Every formula printed on the site is a formula that would load.
 *
 * The examples are the part of the documentation most likely to be copied, so
 * they are parsed as JSON and put through the same schemas the validator uses.
 * A typo in an example fails here rather than in somebody's world.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ExprSchema, PredicateSchema, EffectSchema, RuleSchema } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, buildScope, defaultChoices } from '@dm/engine';
import { ALL_FORMULAS, BIG, type Formula } from './formulas';

const SCHEMAS: Record<Formula['kind'], z.ZodTypeAny> = {
  expr: ExprSchema,
  predicate: PredicateSchema,
  effects: z.array(EffectSchema),
  rule: RuleSchema,
};

describe('the formulas on the site', () => {
  it.each(ALL_FORMULAS.map((f) => [f.title, f] as const))('%s parses as JSON', (_title, formula) => {
    expect(() => JSON.parse(formula.json)).not.toThrow();
  });

  it.each(ALL_FORMULAS.map((f) => [f.title, f] as const))('%s is a valid %s', (_title, formula) => {
    const result = SCHEMAS[formula.kind].safeParse(JSON.parse(formula.json));
    expect(result.success ? null : result.error.issues).toBeNull();
  });

  it('has no duplicate titles', () => {
    const titles = ALL_FORMULAS.map((f) => f.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('writes prose without dashes', () => {
    const text = ALL_FORMULAS.flatMap((f) => [f.title, f.note ?? ''])
      .concat(BIG.flatMap((f) => [f.where, f.what]));
    expect(text.filter((line) => /[-‐-―]/.test(line))).toEqual([]);
  });
});

/**
 * The schema cannot catch a path the engine never supplies.
 *
 * `{ "ref": "enemies" }` is a perfectly valid ref: a string, correctly shaped,
 * accepted by every schema. It simply throws at runtime, because nothing puts
 * `enemies` in scope. So the roots are read off a real scope built from a real
 * world, and every path in every example is checked against them.
 */
describe('every path an example reads', () => {
  const module = loadModuleFrom('modules/greenmarch');
  const game = newGame(module, { seed: 1, party: [defaultChoices(module, 'Tester')] });
  const leader = game.entities[game.party[0]];
  if (!leader) throw new Error('the example world produced no party');
  const scope = buildScope(module, game, leader) as Record<string, unknown>;

  /** What the engine supplies, plus the two it adds where there is a subject. */
  const ROOTS = new Set([...Object.keys(scope), 'target', 'speaker', 'value']);
  const ACTOR_KEYS = new Set(Object.keys(scope['actor'] as object));

  /** Names a `forEach` or a `let` introduces inside its own body. */
  function bindings(node: unknown, into = new Set<string>()): Set<string> {
    if (Array.isArray(node)) { for (const item of node) bindings(item, into); return into; }
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      const each = record['forEach'] as { as?: string } | undefined;
      if (each?.as) into.add(each.as);
      const bound = record['let'] as { name?: string } | undefined;
      if (bound?.name) into.add(bound.name);
      if (record['forEach'] || record['repeat']) into.add('index');
      for (const value of Object.values(record)) bindings(value, into);
    }
    return into;
  }

  function refs(node: unknown, into: string[] = []): string[] {
    if (Array.isArray(node)) { for (const item of node) refs(item, into); return into; }
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (typeof record['ref'] === 'string') into.push(record['ref']);
      if (typeof record['exists'] === 'string') into.push(record['exists']);
      for (const value of Object.values(record)) refs(value, into);
    }
    return into;
  }

  it.each(ALL_FORMULAS.map((f) => [f.title, f] as const))('%s reads only real paths', (_t, formula) => {
    const parsed: unknown = JSON.parse(formula.json);
    const local = bindings(parsed);
    const unknown = refs(parsed).filter((path) => {
      const [root, second] = path.split('.');
      if (!root || local.has(root)) return false;
      if (!ROOTS.has(root)) return true;
      // `actor` is a closed shape; a miss there is a typo, not a "not yet".
      return root === 'actor' && second !== undefined && !ACTOR_KEYS.has(second);
    });
    expect(unknown).toEqual([]);
  });
});
