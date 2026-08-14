import { describe, it, expect } from 'vitest';
import { Rng } from '@dm/core';
import { evalExpr, evalPredicate, evalEffects, evalRule, DslError } from './eval.js';
import type { EvalContext, Scope } from './eval.js';
import type { Effect, Expr, Predicate } from './types.js';

/** A stand-in for the scope the engine will supply during play. */
const SCOPE: Scope = {
  actor: {
    name: 'Vess',
    level: 3,
    hp: 22,
    maxHp: 30,
    attr: { might: 16, agility: 12, presence: 8 },
    conditions: { burning: 2 },
    inventory: { rope: 1, torch: 3 },
    tags: ['undead', 'boss'],
  },
  target: { name: 'Skeleton', hp: 9, attr: { might: 10 } },
  enemies: [
    { id: 'e:1', hp: 9 },
    { id: 'e:2', hp: 4 },
  ],
  flags: { met_vess: true, opened_crypt: false },
  world: { day: 12, nothing: null },
};

function ctx(seed = 1): EvalContext {
  return { scope: SCOPE, rng: Rng.fromSeed(seed) };
}

const ev = (expr: Expr, c = ctx()) => evalExpr(expr, c);
const pr = (pred: Predicate, c = ctx()) => evalPredicate(pred, c);

describe('expressions', () => {
  it('passes literals through', () => {
    expect(ev(5)).toBe(5);
    expect(ev('hello')).toBe('hello');
    expect(ev(true)).toBe(true);
    expect(ev(null)).toBe(null);
  });

  describe('ref', () => {
    it('reads nested paths', () => {
      expect(ev({ ref: 'actor.attr.might' })).toBe(16);
      expect(ev({ ref: 'actor.name' })).toBe('Vess');
      expect(ev({ ref: 'flags.met_vess' })).toBe(true);
    });

    it('indexes into lists', () => {
      expect(ev({ ref: 'enemies.1.hp' })).toBe(4);
      expect(ev({ ref: 'actor.tags.0' })).toBe('undead');
    });

    // A silent zero for a typo'd path is the single worst failure mode for a
    // data-driven game: the ability just quietly stops working.
    it('throws on an unknown path rather than defaulting', () => {
      expect(() => ev({ ref: 'actor.attr.wisdom' })).toThrow(DslError);
      expect(() => ev({ ref: 'nope.at.all' })).toThrow(/unknown path/);
    });

    it('uses else when the path is missing', () => {
      expect(ev({ ref: 'actor.attr.wisdom', else: 0 })).toBe(0);
      expect(ev({ ref: 'actor.attr.might', else: 0 })).toBe(16);
    });

    it('is insensitive to key order', () => {
      const reordered = JSON.parse('{"else": 99, "ref": "actor.attr.wisdom"}') as Expr;
      expect(ev(reordered)).toBe(99);
    });

    it('reports the failing path in the error', () => {
      try {
        ev({ add: [1, { ref: 'bogus.path' }] });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as DslError).path).toBe('add[1].ref');
      }
    });
  });

  describe('arithmetic', () => {
    it('computes the core-fantasy attribute modifier from data alone', () => {
      // floor((might - 10) / 2) — the formula lives in the module, not in code.
      const modifier: Expr = { floor: { div: [{ sub: [{ ref: 'actor.attr.might' }, 10] }, 2] } };
      expect(ev(modifier)).toBe(3);
    });

    it('handles add, sub, mul, div, mod, neg', () => {
      expect(ev({ add: [1, 2, 3] })).toBe(6);
      expect(ev({ add: [] })).toBe(0);
      expect(ev({ sub: [10, 4] })).toBe(6);
      expect(ev({ mul: [3, 4] })).toBe(12);
      expect(ev({ div: [10, 4] })).toBe(2.5);
      expect(ev({ mod: [10, 3] })).toBe(1);
      expect(ev({ neg: 5 })).toBe(-5);
    });

    it('rounds and bounds', () => {
      expect(ev({ floor: 2.9 })).toBe(2);
      expect(ev({ ceil: 2.1 })).toBe(3);
      expect(ev({ round: 2.5 })).toBe(3);
      expect(ev({ abs: -7 })).toBe(7);
      expect(ev({ min: [5, 2, 9] })).toBe(2);
      expect(ev({ max: [5, 2, 9] })).toBe(9);
      expect(ev({ clamp: [15, 1, 10] })).toBe(10);
      expect(ev({ clamp: [-3, 1, 10] })).toBe(1);
      expect(ev({ clamp: [5, 1, 10] })).toBe(5);
    });

    it('rejects arithmetic on non-numbers instead of coercing', () => {
      expect(() => ev({ add: [1, 'two'] })).toThrow(/finite number/);
      expect(() => ev({ add: [{ ref: 'actor.name' }] })).toThrow(DslError);
    });

    it('rejects division and modulo by zero', () => {
      expect(() => ev({ div: [1, 0] })).toThrow(/division by zero/);
      expect(() => ev({ mod: [1, 0] })).toThrow(/modulo by zero/);
    });

    it('rejects wrong operand counts and inverted clamp bounds', () => {
      expect(() => ev({ sub: [1] as unknown as [Expr, Expr] })).toThrow(/exactly 2/);
      expect(() => ev({ clamp: [1, 10, 1] })).toThrow(/inverted/);
      expect(() => ev({ min: [] })).toThrow(/at least one/);
    });
  });

  describe('roll', () => {
    it('rolls dice notation within bounds', () => {
      const c = ctx(7);
      for (let i = 0; i < 200; i++) {
        const v = evalExpr({ roll: '2d6+3' }, c) as number;
        expect(v).toBeGreaterThanOrEqual(5);
        expect(v).toBeLessThanOrEqual(15);
      }
    });

    it('accepts computed notation', () => {
      const c = ctx(3);
      const v = evalExpr({ roll: { concat: ['1d', 20] } }, c) as number;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    });

    it('is deterministic for a seed', () => {
      expect(evalExpr({ roll: '3d6' }, ctx(42))).toBe(evalExpr({ roll: '3d6' }, ctx(42)));
    });

    it('surfaces bad notation as a DSL error with a path', () => {
      expect(() => ev({ roll: 'not-dice' })).toThrow(DslError);
    });
  });

  it('supports cond, concat, length, and list', () => {
    expect(ev({ cond: { gt: [{ ref: 'actor.hp' }, 10] }, then: 'alive', else: 'hurt' })).toBe('alive');
    expect(ev({ concat: ['HP ', { ref: 'actor.hp' }, '/', { ref: 'actor.maxHp' }] })).toBe('HP 22/30');
    expect(ev({ length: { ref: 'enemies' } })).toBe(2);
    expect(ev({ length: { ref: 'actor.name' } })).toBe(4);
    expect(ev({ list: [1, { ref: 'actor.hp' }] })).toEqual([1, 22]);
  });

  it('rejects unknown operators', () => {
    expect(() => ev({ frobnicate: [1] } as unknown as Expr)).toThrow(/no known operator/);
  });

  it('rejects ambiguous nodes with two operators', () => {
    expect(() => ev({ add: [1], mul: [2, 3] } as unknown as Expr)).toThrow(/ambiguous/);
  });
});

describe('predicates', () => {
  it('handles logic, including the empty-list identities', () => {
    expect(pr(true)).toBe(true);
    expect(pr({ not: true })).toBe(false);
    expect(pr({ all: [true, true] })).toBe(true);
    expect(pr({ all: [true, false] })).toBe(false);
    expect(pr({ any: [false, true] })).toBe(true);
    expect(pr({ any: [false, false] })).toBe(false);
    // An absent condition list should permit by default.
    expect(pr({ all: [] })).toBe(true);
    expect(pr({ any: [] })).toBe(false);
  });

  it('compares numbers and strings', () => {
    expect(pr({ gte: [{ ref: 'actor.attr.might' }, 14] })).toBe(true);
    expect(pr({ lt: [{ ref: 'actor.hp' }, 10] })).toBe(false);
    expect(pr({ eq: [{ ref: 'actor.name' }, 'Vess'] })).toBe(true);
    expect(pr({ ne: [{ ref: 'actor.name' }, 'Vess'] })).toBe(false);
    expect(pr({ lt: ['apple', 'banana'] })).toBe(true);
  });

  it('compares lists structurally', () => {
    expect(pr({ eq: [{ ref: 'actor.tags' }, { list: ['undead', 'boss'] }] })).toBe(true);
    expect(pr({ eq: [{ ref: 'actor.tags' }, { list: ['boss', 'undead'] }] })).toBe(false);
  });

  it('refuses to compare a non-number ordinally rather than silently failing', () => {
    expect(() => pr({ gt: [{ ref: 'actor.tags' }, 1] })).toThrow(DslError);
  });

  it('tests membership', () => {
    expect(pr({ in: ['boss', { ref: 'actor.tags' }] })).toBe(true);
    expect(pr({ in: ['elf', { ref: 'actor.tags' }] })).toBe(false);
    expect(() => pr({ in: ['x', 5] })).toThrow(/needs a list/);
  });

  it('expresses flags, conditions, and inventory as plain paths', () => {
    expect(pr({ test: { ref: 'flags.met_vess' } })).toBe(true);
    expect(pr({ test: { ref: 'flags.opened_crypt' } })).toBe(false);
    expect(pr({ exists: 'actor.conditions.burning' })).toBe(true);
    expect(pr({ exists: 'actor.conditions.frozen' })).toBe(false);
    expect(pr({ gte: [{ ref: 'actor.inventory.rope', else: 0 }, 1] })).toBe(true);
    expect(pr({ gte: [{ ref: 'actor.inventory.shield', else: 0 }, 1] })).toBe(false);
  });

  it('treats a stored null as not existing', () => {
    expect(pr({ exists: 'world.nothing' })).toBe(false);
  });

  it('evaluates truthiness consistently', () => {
    expect(pr({ test: 0 })).toBe(false);
    expect(pr({ test: 3 })).toBe(true);
    expect(pr({ test: '' })).toBe(false);
    expect(pr({ test: 'x' })).toBe(true);
    expect(pr({ test: { list: [] } })).toBe(false);
    expect(pr({ test: null })).toBe(false);
  });

  describe('chance', () => {
    it('is certain at the extremes without consuming RNG', () => {
      expect(pr({ chance: 0 })).toBe(false);
      expect(pr({ chance: 1 })).toBe(true);
      expect(pr({ chance: -1 })).toBe(false);
      expect(pr({ chance: 2 })).toBe(true);
    });

    it('approximates the requested probability', () => {
      const c = ctx(2024);
      let hits = 0;
      const n = 20_000;
      for (let i = 0; i < n; i++) if (evalPredicate({ chance: 0.25 }, c)) hits++;
      expect(hits / n).toBeGreaterThan(0.23);
      expect(hits / n).toBeLessThan(0.27);
    });

    it('is deterministic for a seed', () => {
      const run = () => {
        const c = ctx(5);
        return Array.from({ length: 20 }, () => evalPredicate({ chance: 0.5 }, c));
      };
      expect(run()).toEqual(run());
    });
  });
});

describe('effects', () => {
  it('produces intents rather than mutating anything', () => {
    const ops = evalEffects(
      [{ damage: { target: { ref: 'target.name' }, amount: 7, damageType: 'fire' } }],
      ctx(),
    );
    expect(ops).toEqual([{ op: 'damage', target: 'Skeleton', amount: 7, damageType: 'fire' }]);
  });

  it('computes amounts from expressions', () => {
    const ops = evalEffects(
      [
        {
          damage: {
            target: 'target',
            amount: { add: [{ floor: { div: [{ sub: [{ ref: 'actor.attr.might' }, 10] }, 2] } }, 4] },
          },
        },
      ],
      ctx(),
    );
    expect(ops[0]).toMatchObject({ op: 'damage', amount: 7 });
  });

  it('defaults optional fields', () => {
    const ops = evalEffects(
      [
        { damage: { target: 'target', amount: 3 } },
        { grantItem: { target: 'actor', item: 'rope' } },
        { setFlag: { flag: 'opened_crypt' } },
      ],
      ctx(),
    );
    expect(ops[0]).toMatchObject({ damageType: null });
    expect(ops[1]).toMatchObject({ quantity: 1 });
    expect(ops[2]).toMatchObject({ value: true });
  });

  it('covers every effect kind', () => {
    const effects: Effect[] = [
      { heal: { target: 'actor', amount: 5 } },
      { applyCondition: { target: 'target', condition: 'burning', duration: 3, magnitude: 2 } },
      { removeCondition: { target: 'actor', condition: 'burning' } },
      { adjustResource: { target: 'actor', resource: 'focus', amount: -2 } },
      { adjustReputation: { faction: 'thieves', amount: -3 } },
      { removeItem: { target: 'actor', item: 'torch', quantity: 2 } },
      { move: { target: 'actor', to: 'crypt_03' } },
      { emit: { event: 'door_opened', data: { room: 'crypt_03', loud: true } } },
    ];
    const ops = evalEffects(effects, ctx());
    expect(ops.map((o) => o.op)).toEqual([
      'heal', 'applyCondition', 'removeCondition', 'adjustResource',
      'adjustReputation', 'removeItem', 'move', 'emit',
    ]);
    expect(ops[7]).toEqual({
      op: 'emit',
      event: 'door_opened',
      data: { room: 'crypt_03', loud: true },
    });
  });

  describe('control flow', () => {
    it('branches on if', () => {
      const effect: Effect = {
        if: {
          when: { gte: [{ ref: 'actor.attr.might' }, 14] },
          then: [{ setFlag: { flag: 'strong' } }],
          else: [{ setFlag: { flag: 'weak' } }],
        },
      };
      expect(evalEffects([effect], ctx())[0]).toMatchObject({ flag: 'strong' });
    });

    it('yields nothing when a branch is absent', () => {
      const effect: Effect = { if: { when: false, then: [{ setFlag: { flag: 'x' } }] } };
      expect(evalEffects([effect], ctx())).toEqual([]);
    });

    it('repeats and exposes the loop index', () => {
      const effect: Effect = {
        repeat: { times: 3, do: [{ damage: { target: { ref: 'index' }, amount: 1 } }] },
      };
      const ops = evalEffects([effect], ctx());
      expect(ops).toHaveLength(3);
      expect(ops.map((o) => (o as { target: number }).target)).toEqual([0, 1, 2]);
    });

    it('iterates a list with forEach', () => {
      const effect: Effect = {
        forEach: {
          in: { ref: 'enemies' },
          as: 'foe',
          do: [{ damage: { target: { ref: 'foe.id' }, amount: { ref: 'foe.hp' } } }],
        },
      };
      const ops = evalEffects([effect], ctx());
      expect(ops).toEqual([
        { op: 'damage', target: 'e:1', amount: 9, damageType: null },
        { op: 'damage', target: 'e:2', amount: 4, damageType: null },
      ]);
    });

    it('binds a value once with let, so a roll is not repeated', () => {
      const effect: Effect = {
        let: {
          name: 'dmg',
          value: { roll: '1d6' },
          in: [
            { damage: { target: 'a', amount: { ref: 'dmg' } } },
            { damage: { target: 'b', amount: { ref: 'dmg' } } },
          ],
        },
      };
      const ops = evalEffects([effect], ctx(11));
      expect((ops[0] as { amount: number }).amount).toBe((ops[1] as { amount: number }).amount);
    });

    it('does not leak bindings out of the loop body', () => {
      const effects: Effect[] = [
        { forEach: { in: { list: [1] }, as: 'tmp', do: [{ setFlag: { flag: 'inner' } }] } },
      ];
      evalEffects(effects, ctx());
      expect(() => ev({ ref: 'tmp' })).toThrow(DslError);
    });

    it('caps repeat so a bad module cannot hang the game', () => {
      const effect: Effect = { repeat: { times: 100_000, do: [{ setFlag: { flag: 'x' } }] } };
      expect(() => evalEffects([effect], ctx())).toThrow(/exceeds the limit/);
    });

    it('rejects a negative or fractional repeat count', () => {
      expect(() =>
        evalEffects([{ repeat: { times: -1, do: [] } }], ctx()),
      ).toThrow(/non-negative integer/);
      expect(() =>
        evalEffects([{ repeat: { times: 1.5, do: [] } }], ctx()),
      ).toThrow(/non-negative integer/);
    });

    it('rejects forEach over a non-list', () => {
      expect(() =>
        evalEffects([{ forEach: { in: 5, as: 'x', do: [] } }], ctx()),
      ).toThrow(/needs a list/);
    });
  });

  it('reports a path deep inside nested effects', () => {
    const effects: Effect[] = [
      { setFlag: { flag: 'ok' } },
      { if: { when: true, then: [{ damage: { target: 'x', amount: { ref: 'bad.path' } } }] } },
    ];
    try {
      evalEffects(effects, ctx());
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as DslError).path).toContain('[1].if.then');
      expect((err as DslError).path).toContain('amount');
    }
  });

  it('rejects unknown effects', () => {
    expect(() => evalEffects([{ explode: {} } as unknown as Effect], ctx())).toThrow(
      /no known operator/,
    );
  });
});

describe('evalRule', () => {
  it('runs the body when the guard passes', () => {
    const ops = evalRule(
      { when: { gte: [{ ref: 'actor.level' }, 3] }, then: [{ setFlag: { flag: 'veteran' } }] },
      ctx(),
    );
    expect(ops).toHaveLength(1);
  });

  it('yields nothing when the guard fails', () => {
    const ops = evalRule(
      { when: { gte: [{ ref: 'actor.level' }, 10] }, then: [{ setFlag: { flag: 'veteran' } }] },
      ctx(),
    );
    expect(ops).toEqual([]);
  });

  it('treats an absent guard as unconditional', () => {
    expect(evalRule({ then: [{ setFlag: { flag: 'always' } }] }, ctx())).toHaveLength(1);
  });
});

describe('determinism', () => {
  // The property the whole save/replay system rests on.
  it('reproduces identical ops for the same seed', () => {
    const effects: Effect[] = [
      {
        forEach: {
          in: { ref: 'enemies' },
          as: 'foe',
          do: [
            {
              if: {
                when: { chance: 0.5 },
                then: [{ damage: { target: { ref: 'foe.id' }, amount: { roll: '2d6' } } }],
                else: [{ applyCondition: { target: { ref: 'foe.id' }, condition: 'dazed', duration: { roll: '1d4' } } }],
              },
            },
          ],
        },
      },
    ];
    const run = () => JSON.stringify(evalEffects(effects, ctx(31337)));
    expect(run()).toBe(run());
    expect(run()).not.toBe(JSON.stringify(evalEffects(effects, ctx(1))));
  });
});
