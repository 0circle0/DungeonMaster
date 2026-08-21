/** Pinned against the Python it replaces. */

import { describe, it, expect } from 'vitest';
import { layOut, ringSpot } from './layout.js';

/** From `dmkit.regions.lay_out`, fifteen entries in one area, three map sizes. */
const FROM_PYTHON = [
  {
    width: 31,
    height: 21,
    spots: [[3, 3], [9, 3], [15, 3], [21, 3], [27, 3], [27, 10], [27, 17], [21, 17], [15, 17], [9, 17], [3, 17], [3, 10], [7, 7], [11, 7], [15, 7]],
  },
  {
    width: 41,
    height: 31,
    spots: [[3, 3], [11, 3], [20, 3], [28, 3], [37, 3], [37, 15], [37, 27], [29, 27], [20, 27], [12, 27], [3, 27], [3, 15], [7, 7], [13, 7], [20, 7]],
  },
  {
    width: 21,
    height: 21,
    spots: [[3, 3], [6, 3], [10, 3], [13, 3], [17, 3], [17, 10], [17, 17], [14, 17], [10, 17], [7, 17], [3, 17], [3, 10], [7, 7], [8, 7], [10, 7]],
  },
] as const;

describe('layOut', () => {
  it.each(FROM_PYTHON)('matches dmkit on a $width×$height map', ({ width, height, spots }) => {
    const entries = spots.map((_, i) => ({ id: `p${i}`, area: 'a' }));
    const placed = layOut(entries, [{ id: 'a', width, height }]);
    expect(placed.map((p) => [p.position.x, p.position.y])).toEqual(spots.map((s) => [...s]));
  });

  it('leaves a hand-placed entry alone, and does not return it', () => {
    const placed = layOut(
      [
        { id: 'kept', area: 'a', position: { x: 12, y: 4 } },
        { id: 'laid', area: 'a' },
      ],
      [{ id: 'a', width: 31, height: 21 }],
    );
    expect(placed.map((p) => p.id)).toEqual(['laid']);
    expect(placed[0]?.position).toEqual({ x: 3, y: 3 });
  });

  it('counts per area, so two areas both start at the first spot', () => {
    const placed = layOut(
      [{ id: 'x', area: 'a' }, { id: 'y', area: 'b' }],
      [{ id: 'a', width: 31, height: 21 }, { id: 'b', width: 31, height: 21 }],
    );
    expect(placed[0]?.position).toEqual(placed[1]?.position);
  });

  it('falls back to a default size for an area with no map', () => {
    const placed = layOut([{ id: 'x', area: 'nowhere' }], []);
    expect(placed[0]?.position).toEqual({ x: 3, y: 3 });
  });

  it('keeps every spot inside the map, even on a tiny one', () => {
    for (const [width, height] of [[9, 9], [11, 13], [21, 21], [81, 81]] as const) {
      for (let i = 0; i < 30; i += 1) {
        const { x, y } = ringSpot(i, width, height);
        expect(x).toBeGreaterThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(1);
        expect(x).toBeLessThanOrEqual(width - 2);
        expect(y).toBeLessThanOrEqual(height - 2);
      }
    }
  });

  it('gives twelve distinct spots on a ring, which is what a ring is for', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const { x, y } = ringSpot(i, 41, 31);
      seen.add(`${x},${y}`);
    }
    expect(seen.size).toBe(12);
  });
});
