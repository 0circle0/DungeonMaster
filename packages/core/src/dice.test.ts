import { describe, it, expect } from 'vitest';
import { parseDice, rollDice, roll, minRoll, maxRoll, averageRoll, DiceParseError } from './dice.js';
import { Rng } from './rng.js';

describe('parseDice', () => {
  it('parses a bare die', () => {
    expect(parseDice('d6').terms).toEqual([
      { kind: 'dice', count: 1, sides: 6, keep: null, sign: 1 },
    ]);
  });

  it('parses count and modifier', () => {
    expect(parseDice('2d6+3').terms).toEqual([
      { kind: 'dice', count: 2, sides: 6, keep: null, sign: 1 },
      { kind: 'constant', value: 3, sign: 1 },
    ]);
  });

  it('parses subtraction and multiple dice terms', () => {
    expect(parseDice('1d8+1d4-1').terms).toEqual([
      { kind: 'dice', count: 1, sides: 8, keep: null, sign: 1 },
      { kind: 'dice', count: 1, sides: 4, keep: null, sign: 1 },
      { kind: 'constant', value: 1, sign: -1 },
    ]);
  });

  it('parses keep clauses, defaulting to keeping one', () => {
    expect(parseDice('4d6kh3').terms[0]).toMatchObject({ keep: { mode: 'highest', count: 3 } });
    expect(parseDice('2d20kh').terms[0]).toMatchObject({ keep: { mode: 'highest', count: 1 } });
    expect(parseDice('2d20kl1').terms[0]).toMatchObject({ keep: { mode: 'lowest', count: 1 } });
  });

  it('accepts a flat constant', () => {
    expect(parseDice('5').terms).toEqual([{ kind: 'constant', value: 5, sign: 1 }]);
  });

  it('ignores whitespace and case', () => {
    expect(parseDice(' 2D6 + 3 ').terms).toEqual(parseDice('2d6+3').terms);
  });

  // Content is validated at load, so a typo must be a load error rather than
  // an exception thrown in the middle of a fight.
  it.each([
    ['', 'empty'],
    ['abc', 'nonsense'],
    ['2d', 'missing sides'],
    ['d', 'bare d'],
    ['2d6+', 'dangling operator'],
    ['0d6', 'zero dice'],
    ['2d0', 'zero sides'],
    ['2d6kh5', 'keeping more dice than rolled'],
    ['2d6kh0', 'keeping zero dice'],
    ['5000d6', 'absurd die count'],
  ])('rejects %j (%s)', (source) => {
    expect(() => parseDice(source)).toThrow(DiceParseError);
  });
});

describe('rollDice', () => {
  it('stays within bounds over many rolls', () => {
    const rng = Rng.fromSeed(1);
    const expr = parseDice('2d6+3');
    for (let i = 0; i < 1000; i++) {
      const r = rollDice(expr, rng);
      expect(r.total).toBeGreaterThanOrEqual(5);
      expect(r.total).toBeLessThanOrEqual(15);
    }
  });

  it('reports every face rolled, for the combat log', () => {
    const rng = Rng.fromSeed(2);
    const r = rollDice(parseDice('3d8+2'), rng);
    expect(r.dice).toHaveLength(3);
    expect(r.modifier).toBe(2);
    expect(r.dice.reduce((sum, d) => sum + d.value, 0) + 2).toBe(r.total);
  });

  it('marks dropped dice and excludes them from the total', () => {
    const rng = Rng.fromSeed(3);
    const r = rollDice(parseDice('4d6kh3'), rng);
    expect(r.dice).toHaveLength(4);
    expect(r.dice.filter((d) => d.dropped)).toHaveLength(1);

    const kept = r.dice.filter((d) => !d.dropped);
    expect(kept.reduce((s, d) => s + d.value, 0)).toBe(r.total);

    // The dropped die must be the lowest.
    const droppedValue = r.dice.find((d) => d.dropped)!.value;
    for (const k of kept) expect(k.value).toBeGreaterThanOrEqual(droppedValue);
  });

  it('keeps the lowest for disadvantage', () => {
    const rng = Rng.fromSeed(4);
    for (let i = 0; i < 200; i++) {
      const r = rollDice(parseDice('2d20kl1'), rng);
      const kept = r.dice.find((d) => !d.dropped)!;
      const other = r.dice.find((d) => d.dropped)!;
      expect(kept.value).toBeLessThanOrEqual(other.value);
      expect(r.total).toBe(kept.value);
    }
  });

  it('subtracts negated terms', () => {
    const rng = Rng.fromSeed(5);
    const r = rollDice(parseDice('1d4-1'), rng);
    expect(r.total).toBe(r.dice[0]!.value - 1);
  });

  it('is deterministic for a given seed', () => {
    const expr = parseDice('3d6+2');
    const a = rollDice(expr, Rng.fromSeed(77));
    const b = rollDice(expr, Rng.fromSeed(77));
    expect(a.total).toBe(b.total);
    expect(a.dice).toEqual(b.dice);
  });

  it('rolls from source in one step', () => {
    const r = roll('1d20', Rng.fromSeed(9));
    expect(r.total).toBeGreaterThanOrEqual(1);
    expect(r.total).toBeLessThanOrEqual(20);
  });
});

describe('bounds', () => {
  it.each([
    ['2d6+3', 5, 15],
    ['1d20', 1, 20],
    ['4d6kh3', 3, 18],
    ['1d8-2', -1, 6],
    ['5', 5, 5],
  ])('bounds %s as [%i, %i]', (source, min, max) => {
    const expr = parseDice(source);
    expect(minRoll(expr)).toBe(min);
    expect(maxRoll(expr)).toBe(max);
  });

  it('bounds actually contain observed rolls', () => {
    const rng = Rng.fromSeed(31);
    for (const source of ['2d6+3', '4d6kh3', '1d8+1d4-1', '2d20kl1']) {
      const expr = parseDice(source);
      const lo = minRoll(expr);
      const hi = maxRoll(expr);
      for (let i = 0; i < 500; i++) {
        const total = rollDice(expr, rng).total;
        expect(total).toBeGreaterThanOrEqual(lo);
        expect(total).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe('averageRoll', () => {
  it('is exact for plain dice', () => {
    expect(averageRoll(parseDice('2d6+3'))).toBeCloseTo(10, 10);
    expect(averageRoll(parseDice('1d20'))).toBeCloseTo(10.5, 10);
  });

  it('tracks the empirical mean closely enough for balance tooling', () => {
    const rng = Rng.fromSeed(64);
    for (const source of ['2d6+3', '4d6kh3', '2d20kh1']) {
      const expr = parseDice(source);
      let sum = 0;
      const n = 40_000;
      for (let i = 0; i < n; i++) sum += rollDice(expr, rng).total;
      expect(Math.abs(sum / n - averageRoll(expr))).toBeLessThan(0.6);
    }
  });
});
