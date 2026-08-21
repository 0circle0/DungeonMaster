/**
 * Value noise, in integer arithmetic.
 *
 * The point of a noise field is spatial correlation: neighbouring tiles get similar values and
 * distant ones unrelated values. That is the difference between a lake and a scattering of puddles,
 * and no independent roll per tile can produce it.
 *
 * Every step is integer arithmetic with one division at the end. Doubles represent all of these
 * exactly, so the field is bit-identical on every platform.
 */

export interface NoiseOptions {
  /** Tiles across one lattice cell. Larger means broader features. */
  readonly scale?: number;
  /** Layers of detail, each half the scale and (by `persistence`) quieter. */
  readonly octaves?: number;
  /** Amplitude decay per octave, in 1/256ths. 128 is a half. */
  readonly persistence?: number;
}

export interface NoiseField {
  /** The field at a tile, in `[0, 1)`. */
  at(x: number, y: number): number;
}

const DEFAULT_SCALE = 8;
const DEFAULT_OCTAVES = 2;
const DEFAULT_PERSISTENCE = 128;

/** The splitmix32 finalizer, used here as an integer hash rather than a stream. */
function avalanche(value: number): number {
  let t = value | 0;
  t ^= t >>> 16;
  t = Math.imul(t, 0x21f0_aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a_2d97);
  t ^= t >>> 15;
  return t >>> 0;
}

/**
 * The lattice value at an integer corner, as a 24-bit integer. Hashed rather than stored, so a
 * field costs nothing to create and can be sampled anywhere — negative coordinates included —
 * without allocating a grid.
 */
function corner(seed: number, ix: number, iy: number): number {
  const mixed = (seed ^ Math.imul(ix, 0x8da6_b343) ^ Math.imul(iy, 0xd816_3841)) | 0;
  return avalanche(mixed) >>> 8;
}

/**
 * Smoothstep in 8-bit fixed point: `3t² − 2t³`, with `t` in `[0, 256)`. Linear interpolation
 * between lattice corners leaves visible creases; this rounds them off.
 */
function ease(t: number): number {
  return (Math.imul(Math.imul(t, t), 768 - 2 * t) >> 16) & 0xff;
}

/**
 * Blend two 24-bit values by an 8-bit fraction. `Math.floor(… / 256)` rather than `>> 8`: the
 * product reaches 0xFFFFFF × 255, and a shift would coerce that to int32 and wrap it negative.
 */
function lerp(a: number, b: number, t: number): number {
  return a + Math.floor(((b - a) * t) / 256);
}

/** One octave, sampled at an integer tile with a given lattice size. */
function octave(seed: number, x: number, y: number, scale: number): number {
  // `Math.floor` rather than `| 0`, which truncates toward zero and would fold the lattice back on
  // itself either side of the origin.
  const ix = Math.floor(x / scale);
  const iy = Math.floor(y / scale);

  // Position within the cell, as a fraction in [0, 256).
  const fx = ease((((x - ix * scale) * 256) / scale) | 0);
  const fy = ease((((y - iy * scale) * 256) / scale) | 0);

  const top = lerp(corner(seed, ix, iy), corner(seed, ix + 1, iy), fx);
  const bottom = lerp(corner(seed, ix, iy + 1), corner(seed, ix + 1, iy + 1), fx);
  return lerp(top, bottom, fy);
}

/**
 * A deterministic value-noise field. Seeded by a plain integer rather than an `Rng`: the caller
 * derives a throwaway sub-stream and takes one number from it, so sampling cannot advance or depend
 * on the run's generator.
 */
export function valueNoise(seed: number, options: NoiseOptions = {}): NoiseField {
  const baseScale = Math.max(2, Math.trunc(options.scale ?? DEFAULT_SCALE));
  const octaves = Math.max(1, Math.trunc(options.octaves ?? DEFAULT_OCTAVES));
  const persistence = Math.max(1, Math.min(255, Math.trunc(options.persistence ?? DEFAULT_PERSISTENCE)));

  // Amplitudes in 1/256ths, and the total to divide by, both fixed up front so `at` is a pure sum
  // of integers with a single division at the end.
  const layers: { seed: number; scale: number; amplitude: number }[] = [];
  let amplitude = 256;
  let scale = baseScale;
  let total = 0;

  for (let index = 0; index < octaves; index += 1) {
    layers.push({ seed: (seed + Math.imul(index, 0x9e37_79b9)) | 0, scale, amplitude });
    total += amplitude;
    amplitude = (amplitude * persistence) >> 8;
    scale = Math.max(2, scale >> 1);
    // Once an octave contributes nothing, the rest contribute nothing either.
    if (amplitude === 0) break;
  }

  // 24-bit corners × the summed amplitude, so the quotient lands in [0, 1).
  const range = total * 0x100_0000;

  return {
    at(x: number, y: number): number {
      const tx = Math.trunc(x);
      const ty = Math.trunc(y);

      let sum = 0;
      for (const layer of layers) {
        sum += octave(layer.seed, tx, ty, layer.scale) * layer.amplitude;
      }
      return sum / range;
    },
  };
}
