import { describe, it, expect } from 'vitest';
import { ExprSchema, PredicateSchema, EffectSchema, RuleSchema, diceNotation } from './schema.js';

describe('DSL schemas', () => {
  it('accepts literals and nested expressions', () => {
    for (const valid of [5, 'text', true, null, { ref: 'actor.attr.might' }]) {
      expect(ExprSchema.safeParse(valid).success).toBe(true);
    }
    expect(
      ExprSchema.safeParse({ floor: { div: [{ sub: [{ ref: 'actor.attr.might' }, 10] }, 2] } })
        .success,
    ).toBe(true);
  });

  // The forward reference from Expr's `cond` to Predicate is resolved lazily;
  // this asserts it actually works at runtime rather than hitting a TDZ error.
  it('resolves the mutual recursion between expressions and predicates', () => {
    expect(
      ExprSchema.safeParse({
        cond: { gte: [{ ref: 'actor.hp' }, 10] },
        then: 'ok',
        else: { roll: '1d4' },
      }).success,
    ).toBe(true);
  });

  // A misspelled key must fail loudly; silently ignoring it would leave an
  // ability that parses fine and does nothing.
  it('rejects unknown keys', () => {
    expect(ExprSchema.safeParse({ ref: 'a.b', fallback: 0 }).success).toBe(false);
    expect(
      EffectSchema.safeParse({ damage: { target: 'x', amount: 1, conditon: 'burning' } }).success,
    ).toBe(false);
  });

  it('validates dice notation at load time', () => {
    expect(diceNotation.safeParse('2d6+3').success).toBe(true);
    expect(diceNotation.safeParse('2d').success).toBe(false);
    expect(diceNotation.safeParse('nonsense').success).toBe(false);
  });

  it('validates ref paths', () => {
    expect(ExprSchema.safeParse({ ref: 'actor.attr.might' }).success).toBe(true);
    expect(ExprSchema.safeParse({ ref: '' }).success).toBe(false);
    expect(ExprSchema.safeParse({ ref: 'actor..might' }).success).toBe(false);
    expect(ExprSchema.safeParse({ ref: '1bad' }).success).toBe(false);
  });

  it('enforces operand arity', () => {
    expect(ExprSchema.safeParse({ sub: [1, 2] }).success).toBe(true);
    expect(ExprSchema.safeParse({ sub: [1] }).success).toBe(false);
    expect(ExprSchema.safeParse({ sub: [1, 2, 3] }).success).toBe(false);
    expect(ExprSchema.safeParse({ min: [] }).success).toBe(false);
  });

  it('accepts every predicate form', () => {
    for (const valid of [
      true,
      { all: [{ gte: [{ ref: 'a.b' }, 1] }] },
      { any: [] },
      { not: false },
      { in: ['boss', { list: ['boss'] }] },
      { chance: 0.25 },
      { exists: 'actor.conditions.burning' },
      { test: { ref: 'flags.x' } },
    ]) {
      expect(PredicateSchema.safeParse(valid).success).toBe(true);
    }
  });

  it('accepts effects, including nested control flow', () => {
    expect(
      EffectSchema.safeParse({
        forEach: {
          in: { ref: 'enemies' },
          as: 'foe',
          do: [
            {
              if: {
                when: { chance: 0.5 },
                then: [{ damage: { target: { ref: 'foe.id' }, amount: { roll: '2d6' } } }],
                else: [],
              },
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid binding name', () => {
    expect(
      EffectSchema.safeParse({ forEach: { in: { list: [] }, as: '2bad', do: [] } }).success,
    ).toBe(false);
  });

  it('parses a guarded rule and requires a body', () => {
    expect(
      RuleSchema.safeParse({ when: { test: true }, then: [{ setFlag: { flag: 'x' } }] }).success,
    ).toBe(true);
    expect(RuleSchema.safeParse({ then: [] }).success).toBe(true);
    expect(RuleSchema.safeParse({ when: true }).success).toBe(false);
  });
});
