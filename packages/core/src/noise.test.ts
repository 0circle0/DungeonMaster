/**
 * The property that matters is not randomness — it is *correlation*.
 *
 * Independent per-tile rolls are perfectly random and produce confetti. These
 * tests pin the thing that makes a field usable for terrain: neighbours agree,
 * distant tiles do not, and the same seed says the same thing forever.
 */

import { describe, it, expect } from 'vitest';
import { valueNoise } from './noise.js';

describe('value noise', () => {
  it('stays inside [0, 1)', () => {
    const field = valueNoise(12345);
    for (let y = -40; y < 40; y += 1) {
      for (let x = -40; x < 40; x += 1) {
        const value = field.at(x, y);
        expect(value, `${x},${y}`).toBeGreaterThanOrEqual(0);
        expect(value, `${x},${y}`).toBeLessThan(1);
      }
    }
  });

  it('gives the same field for the same seed, forever', () => {
    const a = valueNoise(99);
    const b = valueNoise(99);
    for (let i = 0; i < 200; i += 1) expect(a.at(i, i * 3)).toBe(b.at(i, i * 3));
  });

  it('gives a different field for a different seed', () => {
    const a = valueNoise(1);
    const b = valueNoise(2);
    let same = 0;
    for (let i = 0; i < 200; i += 1) if (a.at(i, 0) === b.at(i, 0)) same += 1;
    expect(same).toBeLessThan(20);
  });

  // The whole reason this file exists. Neighbouring tiles must be far more
  // alike than distant ones, or thresholding it produces speckle.
  it('correlates neighbours and not distant tiles', () => {
    const field = valueNoise(7, { scale: 8 });

    let near = 0;
    let far = 0;
    let samples = 0;
    for (let y = 0; y < 60; y += 1) {
      for (let x = 0; x < 60; x += 1) {
        near += Math.abs(field.at(x, y) - field.at(x + 1, y));
        far += Math.abs(field.at(x, y) - field.at(x + 37, y));
        samples += 1;
      }
    }

    expect(near / samples).toBeLessThan((far / samples) / 3);
  });

  it('makes broader features at a larger scale', () => {
    const spread = (scale: number) => {
      let delta = 0;
      const field = valueNoise(5, { scale, octaves: 1 });
      for (let x = 0; x < 400; x += 1) delta += Math.abs(field.at(x, 0) - field.at(x + 1, 0));
      return delta;
    };
    expect(spread(24)).toBeLessThan(spread(4));
  });

  it('works either side of the origin', () => {
    // Truncating toward zero rather than flooring would mirror the lattice
    // about x=0, giving a visible seam down the middle of any map.
    const field = valueNoise(3, { scale: 8, octaves: 1 });
    const left = field.at(-9, 0);
    const right = field.at(9, 0);
    expect(left).not.toBe(right);
    // And it is still smooth across the boundary.
    expect(Math.abs(field.at(-1, 0) - field.at(0, 0))).toBeLessThan(0.35);
  });

  // A golden vector: if the algorithm is ever changed, every generated world
  // changes with it, and that must be a deliberate act rather than a surprise.
  it('has not drifted', () => {
    const field = valueNoise(2024, { scale: 8, octaves: 2 });
    const sample = [[0, 0], [1, 0], [5, 3], [8, 8], [17, 42], [-6, -11]]
      .map(([x, y]) => Number(field.at(x!, y!).toFixed(6)));
    expect(sample).toMatchInlineSnapshot(`
      [
        0.795837,
        0.755676,
        0.416406,
        0.306015,
        0.470816,
        0.391078,
      ]
    `);
  });
});
