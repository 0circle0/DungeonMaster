/**
 * The test that matters here is not "does `fit` return a number" — it is
 * "does a dungeon sized by `fit` actually generate the rooms it claims".
 *
 * So this runs the engine's own generator and counts. `roomCount` is a request
 * and `placeRooms` gives up quietly, which means a unit test against the
 * arithmetic would pass on exactly the bug this function exists to prevent.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateDungeon, diceMean } from '@dm/engine';
import { compileModule } from '@dm/module';
import { Rng } from '@dm/core';
import { fit, roomsThatFit, MAX_SIDE } from './dungeon.js';

/**
 * A real module with one dungeon in it, because `generateDungeon` takes a
 * compiled module and resolves the biome, palette and templates through it.
 * Built from `minimal`, which has the fewest moving parts of anything shipped.
 */
const BASE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

/** The case that produced two rooms out of fifteen and started all this. */
const FIFTEEN = { rooms: 15, roomSize: '2d3+4', corridorLength: '5d3' };

function roomsGenerated(
  width: number,
  height: number,
  spec: { rooms: number; roomSize: string; corridorLength: string },
  seed: number,
): number {
  const doc = JSON.parse(JSON.stringify(BASE)) as Record<string, unknown>;
  const world = doc['world'] as { dungeons: Record<string, unknown>[] };
  const existing = world.dungeons[0]!;
  // Keep the id, so `start.startingDungeon` still resolves; only the sizing
  // changes, which is all this is measuring.
  world.dungeons = [
    {
      ...existing,
      roomCount: String(spec.rooms),
      roomSize: spec.roomSize,
      corridorLength: spec.corridorLength,
      width: String(width),
      height: String(height),
      algorithm: 'rooms',
    },
  ];
  const compiled = compileModule(doc);
  if (!compiled.ok) throw new Error(compiled.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
  return generateDungeon(compiled.module, String(existing['id']), Rng.fromSeed(seed)).rooms.length;
}

describe('fit', () => {
  it('sizes a map that holds the rooms it was asked for', () => {
    const sized = fit(FIFTEEN);
    let worst = Infinity;
    for (let seed = 0; seed < 8; seed += 1) {
      worst = Math.min(worst, roomsGenerated(sized.width, sized.height, { ...FIFTEEN, corridorLength: sized.corridorLength }, seed));
    }
    expect(worst).toBeGreaterThanOrEqual(FIFTEEN.rooms);
  });

  it('and the map that was there before did not', () => {
    // 47x27 with 5d3 corridors: the shape this was found in.
    expect(roomsGenerated(47, 27, FIFTEEN, 1)).toBeLessThan(FIFTEEN.rooms);
  });

  it('keeps the corridor the author asked for when the map can grow', () => {
    // Four rooms at 5d3 needs about 3,800 tiles, which is inside the ceiling.
    // Eight is not — 81x81 is 6,561 and eight rooms want 7,600 — so this is
    // deliberately the case where growing the map is enough.
    const sized = fit({ rooms: 4, roomSize: '2d3+4', corridorLength: '5d3' });
    expect(sized.corridorLength).toBe('5d3');
    expect(sized.shortened).toBe(false);
  });

  it('shortens the corridor only once the map hits its ceiling, and says so', () => {
    const sized = fit({ rooms: 60, roomSize: '3d4+6', corridorLength: '8d4' });
    expect(sized.shortened).toBe(true);
    expect(diceMean(sized.corridorLength, 6)).toBeLessThan(diceMean('8d4', 6));
    expect(sized.width).toBeLessThanOrEqual(MAX_SIDE);
    expect(sized.height).toBeLessThanOrEqual(MAX_SIDE);
  });

  it('gives odd sides, so the last row is not lost to the wall', () => {
    for (const rooms of [3, 9, 15, 24, 40]) {
      const sized = fit({ rooms, roomSize: '2d3+4', corridorLength: '3d3' });
      expect(sized.width % 2).toBe(1);
      expect(sized.height % 2).toBe(1);
    }
  });

  it('honours an aspect ratio', () => {
    const wide = fit({ rooms: 12, roomSize: '2d3+4', corridorLength: '3d3', aspect: 2 });
    expect(wide.width).toBeGreaterThan(wide.height);
  });
});

describe('roomsThatFit', () => {
  it('reports what a map as written will actually produce', () => {
    // The diagnosis, not the fix: the 47x27 map above.
    expect(roomsThatFit(47, 27, FIFTEEN)).toBeLessThan(FIFTEEN.rooms);
  });

  it('agrees with fit, which is the point of having both', () => {
    const sized = fit(FIFTEEN);
    expect(
      roomsThatFit(sized.width, sized.height, { ...FIFTEEN, corridorLength: sized.corridorLength }),
    ).toBeGreaterThanOrEqual(FIFTEEN.rooms);
  });
});
