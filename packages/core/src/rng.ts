/**
 * Deterministic, serializable random number generation.
 *
 * Every random decision in the game flows through here. `Math.random()` must never appear in the
 * engine: a save stores RNG state verbatim, so seed plus action log reproduces a run exactly, and
 * that only holds if this is the sole source of chance.
 *
 * Algorithm is xoshiro128** — four 32-bit words of state, which serializes to four integers rather
 * than an opaque blob.
 */

/** Serializable RNG state: exactly four 32-bit words. */
export type RngState = readonly [number, number, number, number];

const U32 = 0x1_0000_0000;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * splitmix32 — used only to expand a single seed into well-distributed state. xoshiro recovers
 * poorly from low-entropy seeds, so it is never seeded directly.
 */
function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e37_79b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0_aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a_2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** FNV-1a. Turns a stream label into a 32-bit value for seed derivation. */
export function hashString(s: string): number {
  let h = 0x811c_9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x0100_0193);
  }
  return h >>> 0;
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  private constructor(state: RngState) {
    this.s0 = state[0] >>> 0;
    this.s1 = state[1] >>> 0;
    this.s2 = state[2] >>> 0;
    this.s3 = state[3] >>> 0;
  }

  /** Create a generator from a single integer seed. */
  static fromSeed(seed: number): Rng {
    const mix = splitmix32(seed);
    let state: RngState = [mix(), mix(), mix(), mix()];
    // All-zero state is xoshiro's one fixed point; it would emit zeroes forever.
    if (state.every((w) => w === 0)) state = [1, 2, 3, 4];
    return new Rng(state);
  }

  /** Create a generator from a textual seed, so "grimhold" is a valid seed. */
  static fromString(seed: string): Rng {
    return Rng.fromSeed(hashString(seed));
  }

  /** Restore an exact generator from serialized state. */
  static fromState(state: RngState): Rng {
    return new Rng(state);
  }

  /**
   * Derive an independent sub-stream.
   *
   * Sub-streams are why combat rolls cannot shift dungeon layout: the dungeon draws from
   * `dungeon:<siteId>` while a fight draws from `combat:<encounterId>`.
   *
   * Reads the parent's state without advancing it, so deriving is itself deterministic and side-
   * effect free.
   */
  derive(label: string): Rng {
    const h = hashString(label);
    return Rng.fromSeed((this.s0 ^ Math.imul(h, 0x9e37_79b9)) | 0);
  }

  /** Snapshot state for saving. */
  save(): RngState {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  /** Independent copy at the current position; advancing one will not affect the other. */
  clone(): Rng {
    return new Rng(this.save());
  }

  /** Core step: a uniform 32-bit unsigned integer. */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;

    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);

    return result;
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / U32;
  }

  /**
   * Uniform integer in [min, max], inclusive. Rejection sampling rather than modulo: modulo bias is
   * small but real, and on a d20 it would skew every roll in the game.
   */
  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`nextInt requires integer bounds, got [${min}, ${max}]`);
    }
    if (max < min) throw new RangeError(`nextInt: max (${max}) < min (${min})`);

    const range = max - min + 1;
    if (range === 1) return min;
    if (range > U32) throw new RangeError(`nextInt: range ${range} exceeds 2^32`);

    // Discard the values in the final, incomplete bucket.
    const limit = U32 - (U32 % range);
    let x = this.nextUint32();
    while (x >= limit) x = this.nextUint32();
    return min + (x % range);
  }

  /** True with the given probability (0..1). */
  chance(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  /** Uniformly pick one element. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick: cannot choose from an empty list');
    return items[this.nextInt(0, items.length - 1)]!;
  }

  /**
   * Pick one element with weights. Non-positive weights are ineligible, so content can disable a
   * table row with `"weight": 0` instead of deleting it.
   */
  weightedPick<T>(items: readonly T[], weightOf: (item: T) => number): T {
    if (items.length === 0) throw new RangeError('weightedPick: empty list');

    let total = 0;
    for (const item of items) {
      const w = weightOf(item);
      if (w > 0) total += w;
    }
    if (total <= 0) throw new RangeError('weightedPick: all weights are zero or negative');

    // Integer roll keeps this reproducible across platforms; float accumulation could differ in the
    // last bit and desync a replay.
    let roll = this.nextInt(1, Math.max(1, Math.round(total)));
    for (const item of items) {
      const w = weightOf(item);
      if (w <= 0) continue;
      roll -= Math.round(w);
      if (roll <= 0) return item;
    }
    // Rounding can leave a sliver; fall back to the last eligible entry.
    for (let i = items.length - 1; i >= 0; i--) {
      if (weightOf(items[i]!) > 0) return items[i]!;
    }
    throw new RangeError('weightedPick: no eligible item');
  }

  /** In-place Fisher-Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const a = out[i]!;
      out[i] = out[j]!;
      out[j] = a;
    }
    return out;
  }
}
