import { describe, it, expect } from 'vitest';
import { Rng, hashString } from './rng.js';

describe('Rng', () => {
  it('is reproducible from a seed', () => {
    const a = Rng.fromSeed(12345);
    const b = Rng.fromSeed(12345);
    const seqA = Array.from({ length: 50 }, () => a.nextUint32());
    const seqB = Array.from({ length: 50 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = Rng.fromSeed(1);
    const b = Rng.fromSeed(2);
    expect(a.nextUint32()).not.toBe(b.nextUint32());
  });

  it('accepts a textual seed', () => {
    expect(Rng.fromString('grimhold').nextUint32()).toBe(Rng.fromString('grimhold').nextUint32());
    expect(Rng.fromString('grimhold').nextUint32()).not.toBe(Rng.fromString('vess').nextUint32());
  });

  // The save-file contract: this is what makes replay tests possible.
  it('resumes exactly from serialized state', () => {
    const rng = Rng.fromSeed(999);
    for (let i = 0; i < 17; i++) rng.nextUint32();

    const state = rng.save();
    const expected = Array.from({ length: 20 }, () => rng.nextUint32());
    const restored = Rng.fromState(state);
    const actual = Array.from({ length: 20 }, () => restored.nextUint32());

    expect(actual).toEqual(expected);
  });

  it('serializes to four plain integers that survive JSON', () => {
    const rng = Rng.fromSeed(42);
    rng.nextUint32();
    const state = rng.save();

    expect(state).toHaveLength(4);
    for (const word of state) {
      expect(Number.isInteger(word)).toBe(true);
      expect(word).toBeGreaterThanOrEqual(0);
      expect(word).toBeLessThan(2 ** 32);
    }
    const roundTripped = Rng.fromState(JSON.parse(JSON.stringify(state)));
    expect(roundTripped.nextUint32()).toBe(Rng.fromState(state).nextUint32());
  });

  it('clones without entangling the two generators', () => {
    // Reference sequence the clone must reproduce on its own.
    const expected = (() => {
      const r = Rng.fromSeed(7);
      return Array.from({ length: 10 }, () => r.nextUint32());
    })();

    const rng = Rng.fromSeed(7);
    const copy = rng.clone();

    // Exhaust the original; the clone must be entirely unaffected.
    for (let i = 0; i < 100; i++) rng.nextUint32();

    expect(Array.from({ length: 10 }, () => copy.nextUint32())).toEqual(expected);
  });

  describe('derive', () => {
    it('is deterministic for the same label', () => {
      const parent = Rng.fromSeed(5);
      expect(parent.derive('combat:1').nextUint32()).toBe(parent.derive('combat:1').nextUint32());
    });

    it('gives independent streams per label', () => {
      const parent = Rng.fromSeed(5);
      expect(parent.derive('combat:1').nextUint32()).not.toBe(
        parent.derive('combat:2').nextUint32(),
      );
    });

    // The whole point of sub-streams: a longer fight must not reshape the dungeon.
    it('does not advance the parent, so sibling streams are unaffected', () => {
      const parent = Rng.fromSeed(5);
      const dungeonBefore = parent.derive('dungeon:a').nextUint32();

      const combat = parent.derive('combat:1');
      for (let i = 0; i < 500; i++) combat.nextInt(1, 20);

      expect(parent.derive('dungeon:a').nextUint32()).toBe(dungeonBefore);
    });
  });

  describe('nextInt', () => {
    it('stays within the inclusive bounds', () => {
      const rng = Rng.fromSeed(3);
      for (let i = 0; i < 5000; i++) {
        const v = rng.nextInt(1, 20);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(20);
      }
    });

    it('hits both extremes of a d20', () => {
      const rng = Rng.fromSeed(11);
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) seen.add(rng.nextInt(1, 20));
      expect(seen.size).toBe(20);
    });

    it('handles a single-value range', () => {
      expect(Rng.fromSeed(1).nextInt(7, 7)).toBe(7);
    });

    it('supports negative ranges', () => {
      const rng = Rng.fromSeed(1);
      for (let i = 0; i < 200; i++) {
        const v = rng.nextInt(-5, -1);
        expect(v).toBeGreaterThanOrEqual(-5);
        expect(v).toBeLessThanOrEqual(-1);
      }
    });

    it('rejects inverted and non-integer bounds', () => {
      const rng = Rng.fromSeed(1);
      expect(() => rng.nextInt(5, 1)).toThrow(RangeError);
      expect(() => rng.nextInt(1.5, 3)).toThrow(RangeError);
    });

    // Rejection sampling exists so a d20 is not quietly skewed.
    it('is close to uniform on a d20', () => {
      const rng = Rng.fromSeed(20250812);
      const counts = new Array(21).fill(0) as number[];
      const n = 200_000;
      for (let i = 0; i < n; i++) counts[rng.nextInt(1, 20)]! += 1;

      const expected = n / 20;
      for (let face = 1; face <= 20; face++) {
        expect(Math.abs(counts[face]! - expected) / expected).toBeLessThan(0.05);
      }
    });
  });

  describe('weightedPick', () => {
    it('never returns a zero-weighted entry, so content can disable a row', () => {
      const rng = Rng.fromSeed(4);
      const items = [
        { id: 'disabled', w: 0 },
        { id: 'live', w: 5 },
      ];
      for (let i = 0; i < 500; i++) {
        expect(rng.weightedPick(items, (it) => it.w).id).toBe('live');
      }
    });

    it('respects weight proportions', () => {
      const rng = Rng.fromSeed(8);
      const items = [
        { id: 'common', w: 90 },
        { id: 'rare', w: 10 },
      ];
      let rare = 0;
      const n = 20_000;
      for (let i = 0; i < n; i++) {
        if (rng.weightedPick(items, (it) => it.w).id === 'rare') rare += 1;
      }
      expect(rare / n).toBeGreaterThan(0.07);
      expect(rare / n).toBeLessThan(0.13);
    });

    it('throws when nothing is eligible', () => {
      const rng = Rng.fromSeed(1);
      expect(() => rng.weightedPick([{ w: 0 }], (it) => it.w)).toThrow(RangeError);
    });
  });

  describe('shuffle', () => {
    it('preserves the multiset and leaves the input untouched', () => {
      const rng = Rng.fromSeed(6);
      const input = [1, 2, 3, 4, 5, 6, 7, 8];
      const out = rng.shuffle(input);
      expect(out.slice().sort()).toEqual(input.slice().sort());
      expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  it('picks from a list and rejects an empty one', () => {
    const rng = Rng.fromSeed(2);
    expect(['a', 'b']).toContain(rng.pick(['a', 'b']));
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

describe('hashString', () => {
  it('is stable and returns an unsigned 32-bit value', () => {
    expect(hashString('skeleton')).toBe(hashString('skeleton'));
    expect(hashString('skeleton')).not.toBe(hashString('skeletons'));
    expect(hashString('')).toBeGreaterThanOrEqual(0);
    expect(hashString('a')).toBeLessThan(2 ** 32);
  });
});
