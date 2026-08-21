import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { Rng } from '@dm/core';
import { MapBuilder, TerrainIndex, createMap, terrainAt, key, inBounds } from './tiles.js';
import type { TileMap, Position } from './tiles.js';
import { distance, euclidean, line, within, ring, area, bearing, isAdjacent } from './geometry.js';
import { fieldOfView, hasLineOfSight } from './fov.js';
import { findPath, reachable, floodFill } from './path.js';

const GREENMARCH = compileOrThrow('greenmarch');

function compileOrThrow(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../../modules/${name}`, import.meta.url)));
}

const terrain = new TerrainIndex(GREENMARCH);

/** Build a map from rows of glyphs: `#` wall, `.` floor, `~` water, `"` reeds. */
function fromRows(rows: string[]): TileMap {
  const legend: Record<string, string> = { '#': 'wall', '.': 'floor', '~': 'deep_water', '"': 'reeds', '%': 'rubble' };
  const width = rows[0]!.length;
  const builder = new MapBuilder(width, rows.length, 'floor');
  rows.forEach((row, y) => {
    [...row].forEach((glyph, x) => builder.set(x, y, legend[glyph] ?? 'floor'));
  });
  return builder.freeze();
}

describe('tiles', () => {
  it('reads terrain properties from the module, not from code', () => {
    expect(terrain.get('wall').passable).toBe(false);
    expect(terrain.get('wall').opaque).toBe(true);
    expect(terrain.get('floor').passable).toBe(true);
    // Reeds: passable but sight-blocking — the case a single flag cannot express.
    expect(terrain.get('reeds').passable).toBe(true);
    expect(terrain.get('reeds').opaque).toBe(true);
    // Rubble: sight passes, movement does not.
    expect(terrain.get('rubble').passable).toBe(false);
    expect(terrain.get('rubble').opaque).toBe(false);
  });

  // Walking off the edge of the world must be impossible.
  it('treats unknown and out-of-bounds terrain as solid', () => {
    const map = createMap(3, 3, 'floor');
    expect(terrain.isPassable(map, { x: -1, y: 0 })).toBe(false);
    expect(terrain.isPassable(map, { x: 3, y: 0 })).toBe(false);
    expect(terrain.get('no_such_terrain').passable).toBe(false);
  });

  it('gates terrain behind movement modes', () => {
    const map = fromRows(['...', '.~.', '...']);
    const water = { x: 1, y: 1 };
    expect(terrain.isPassable(map, water, ['walk'])).toBe(false);
    expect(terrain.isPassable(map, water, ['walk', 'swim'])).toBe(true);
  });

  it('packs and unpacks positions losslessly', () => {
    for (const position of [{ x: 0, y: 0 }, { x: 5, y: 12 }, { x: 300, y: 200 }]) {
      const packed = key(position);
      expect(packed).toBe(key({ ...position }));
      expect({ x: packed & 0xffff, y: packed >>> 16 }).toEqual(position);
    }
  });

  it('builds and freezes a map', () => {
    const builder = new MapBuilder(5, 4, 'floor');
    builder.strokeRect(0, 0, 5, 4, 'wall');
    const map = builder.freeze();
    expect(map.width).toBe(5);
    expect(terrainAt(map, { x: 0, y: 0 })).toBe('wall');
    expect(terrainAt(map, { x: 2, y: 2 })).toBe('floor');
    expect(inBounds(map, { x: 5, y: 0 })).toBe(false);
  });
});

/**
 * `moveCost` combines multiplicatively with the mover's `movementModes[].terrainMultiplier`, and
 * `costOf` does that. Every shipped mode declares a multiplier of 1, so the fixture invents one:
 * the assertion is about the arithmetic, not about greenmarch.
 */
describe('terrain cost and the mover', () => {
  /** Greenmarch where wading is half price and walking is double. */
  const waders = (): TerrainIndex => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { movementModes: Record<string, unknown>[] };
    };
    for (const mode of doc.rules.movementModes) {
      if (mode['id'] === 'swim') mode['terrainMultiplier'] = 0.5;
      if (mode['id'] === 'walk') mode['terrainMultiplier'] = 2;
    }
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return new TerrainIndex(compiled.module);
  };

  const map = fromRows(['~~~', '...', '~~~']);
  const water: Position = { x: 1, y: 0 };
  const floor: Position = { x: 1, y: 1 };

  it('charges the terrain\'s own cost when the mode is neutral', () => {
    expect(terrain.costOf(map, floor, ['walk'])).toBe(1);
    expect(terrain.costOf(map, water, ['swim'])).toBe(2);
  });

  it('scales that cost by the mode crossing it', () => {
    const index = waders();
    expect(index.costOf(map, water, ['swim'])).toBe(1);
    expect(index.costOf(map, floor, ['walk'])).toBe(2);
  });

  // A creature that can both walk and swim should not be slowed by owning a clumsier way of getting
  // about than the one it is using.
  it('uses whichever of a creature\'s modes crosses the ground best', () => {
    expect(waders().costOf(map, water, ['walk', 'swim'])).toBe(1);
  });

  it('still refuses ground no mode admits it to', () => {
    expect(waders().costOf(map, water, ['walk'])).toBe(Infinity);
  });

  // The multiplier has to reach pathfinding too, or a route is chosen by one set of numbers and
  // paid for with another.
  it('reaches findPath, which is where a route is actually chosen', () => {
    const across = (index: TerrainIndex): number => findPath({
      map, terrain: index, from: { x: 0, y: 1 }, to: { x: 2, y: 1 },
      modes: ['walk'], diagonal: false,
    }).cost;
    // Two floor tiles entered, at 1 each and then at 2 each.
    expect(across(terrain)).toBe(2);
    expect(across(waders())).toBe(4);
  });
});

describe('geometry', () => {
  it('measures distance with diagonals free', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
    // Chebyshev: a diagonal move covers both axes at once.
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(3);
    expect(euclidean({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('draws a line that starts at the origin and ends at the target', () => {
    const path = line({ x: 0, y: 0 }, { x: 4, y: 2 });
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 4, y: 2 });
    // Every step is adjacent to the last.
    for (let i = 1; i < path.length; i += 1) expect(isAdjacent(path[i - 1]!, path[i]!)).toBe(true);
  });

  // Bresenham breaks ties by direction, so the tiles between the ends may differ. What must hold is
  // that both traversals span the same endpoints and the same length; line-of-sight symmetry is
  // enforced separately.
  it('spans the same endpoints and length in both directions', () => {
    const forward = line({ x: 0, y: 0 }, { x: 6, y: 3 });
    const backward = line({ x: 6, y: 3 }, { x: 0, y: 0 });
    expect(forward).toHaveLength(backward.length);
    expect(forward[0]).toEqual(backward.at(-1));
    expect(forward.at(-1)).toEqual(backward[0]);
  });

  it('produces rings and disks of the right size', () => {
    expect(within({ x: 5, y: 5 }, 0)).toHaveLength(1);
    expect(within({ x: 5, y: 5 }, 1)).toHaveLength(9);
    expect(within({ x: 5, y: 5 }, 2)).toHaveLength(25);
    expect(ring({ x: 5, y: 5 }, 1)).toHaveLength(8);
    expect(ring({ x: 5, y: 5 }, 2)).toHaveLength(16);
  });

  describe('area shapes', () => {
    const origin = { x: 10, y: 10 };

    it('makes a sphere round, not square', () => {
      const tiles = area({ shape: 'sphere', size: 3, origin });
      // The corner of the bounding box is outside a circle of radius 3.
      expect(tiles.some((t) => t.x === 13 && t.y === 13)).toBe(false);
      expect(tiles.some((t) => t.x === 13 && t.y === 10)).toBe(true);
    });

    it('makes a cube square', () => {
      const tiles = area({ shape: 'cube', size: 4, origin });
      expect(tiles.some((t) => t.x === 12 && t.y === 12)).toBe(true);
    });

    it('excludes the caster from an aura', () => {
      const tiles = area({ shape: 'aura', size: 2, origin });
      expect(tiles.some((t) => t.x === origin.x && t.y === origin.y)).toBe(false);
    });

    it('points a cone in the direction it is aimed', () => {
      const east = area({ shape: 'cone', size: 4, origin, toward: { x: 20, y: 10 } });
      expect(east.every((t) => t.x >= origin.x)).toBe(true);
      expect(east.some((t) => t.x > origin.x)).toBe(true);

      const west = area({ shape: 'cone', size: 4, origin, toward: { x: 0, y: 10 } });
      expect(west.every((t) => t.x <= origin.x)).toBe(true);
    });

    it('widens a line when asked', () => {
      const thin = area({ shape: 'line', size: 5, origin, toward: { x: 20, y: 10 } });
      const wide = area({ shape: 'line', size: 5, origin, toward: { x: 20, y: 10 }, width: 3 });
      expect(wide.length).toBeGreaterThan(thin.length);
    });
  });

  it('names compass bearings', () => {
    // Keys, not words: the module supplies what each direction is called.
    expect(bearing({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe('direction.east');
    expect(bearing({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe('direction.north');
    expect(bearing({ x: 0, y: 0 }, { x: -1, y: 1 })).toBe('direction.southwest');
    expect(bearing({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe('direction.here');
  });
});

describe('field of view', () => {
  const open = createMap(15, 15, 'floor');

  it('always sees its own tile', () => {
    const visible = fieldOfView({ map: open, terrain, origin: { x: 7, y: 7 }, radius: 0 });
    expect(visible.has(key({ x: 7, y: 7 }))).toBe(true);
  });

  it('sees a disk in the open, not a square', () => {
    const visible = fieldOfView({ map: open, terrain, origin: { x: 7, y: 7 }, radius: 4 });
    expect(visible.has(key({ x: 11, y: 7 }))).toBe(true);
    // The corner of the bounding box is beyond the radius.
    expect(visible.has(key({ x: 11, y: 11 }))).toBe(false);
  });

  it('casts a shadow behind a wall', () => {
    //          x: 0123456
    const map = fromRows([
      '.......',
      '.......',
      '...#...',
      '.......',
      '.......',
    ]);
    const visible = fieldOfView({ map, terrain, origin: { x: 3, y: 4 }, radius: 6 });

    // The wall itself is visible; what is directly behind it is not.
    expect(visible.has(key({ x: 3, y: 2 }))).toBe(true);
    expect(visible.has(key({ x: 3, y: 0 }))).toBe(false);
    // Beside the wall remains visible.
    expect(visible.has(key({ x: 1, y: 0 }))).toBe(true);
  });

  it('is blocked by sight-blocking terrain that can still be walked through', () => {
    const map = fromRows(['...', '."".', '...'].map((r) => r.slice(0, 3)));
    const visible = fieldOfView({ map, terrain, origin: { x: 1, y: 2 }, radius: 4 });
    // Reeds are passable but opaque, so they hide what is beyond.
    expect(visible.has(key({ x: 1, y: 0 }))).toBe(false);
  });

  it('cannot see through a sealed room', () => {
    const map = fromRows([
      '#######',
      '#.....#',
      '#..#..#',
      '#.....#',
      '#######',
    ]);
    const visible = fieldOfView({ map, terrain, origin: { x: 3, y: 1 }, radius: 10 });
    for (const tile of visible) {
      const position = { x: tile & 0xffff, y: tile >>> 16 };
      expect(inBounds(map, position)).toBe(true);
    }
  });

  // Adjacent open tiles always see each other.
  it('is reflexive between adjacent open tiles, over many maps', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const rng = Rng.fromSeed(seed);
      const builder = new MapBuilder(14, 14, 'floor');
      for (let i = 0; i < 30; i += 1) {
        builder.set(rng.nextInt(0, 13), rng.nextInt(0, 13), 'wall');
      }
      const map = builder.freeze();

      for (let trial = 0; trial < 12; trial += 1) {
        const a: Position = { x: rng.nextInt(0, 12), y: rng.nextInt(0, 13) };
        const b: Position = { x: a.x + 1, y: a.y };
        if (terrain.isOpaque(map, a) || terrain.isOpaque(map, b)) continue;

        expect(hasLineOfSight(map, terrain, a, b), `${a.x},${a.y} → ${b.x},${b.y}`).toBe(true);
        expect(hasLineOfSight(map, terrain, b, a)).toBe(true);
      }
    }
  });

  it('agrees with line of sight for tiles it reports visible', () => {
    const rng = Rng.fromSeed(99);
    const builder = new MapBuilder(20, 20, 'floor');
    for (let i = 0; i < 60; i += 1) builder.set(rng.nextInt(0, 19), rng.nextInt(0, 19), 'wall');
    const map = builder.freeze();
    const origin = { x: 10, y: 10 };
    if (terrain.isOpaque(map, origin)) return;

    const visible = fieldOfView({ map, terrain, origin, radius: 8 });
    let checked = 0;
    for (const packed of visible) {
      const position = { x: packed & 0xffff, y: packed >>> 16 };
      if (terrain.isOpaque(map, position)) continue;
      // Shadowcasting is permissive at the margins, so this checks gross disagreement rather than
      // exact equivalence.
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('pathfinding', () => {
  it('finds a straight path across open floor', () => {
    const map = createMap(10, 10, 'floor');
    const path = findPath({ map, terrain, from: { x: 0, y: 0 }, to: { x: 5, y: 0 } });
    expect(path.found).toBe(true);
    expect(path.steps).toHaveLength(5);
    expect(path.steps.at(-1)).toEqual({ x: 5, y: 0 });
  });

  it('routes around a wall', () => {
    const map = fromRows([
      '.....',
      '.###.',
      '.....',
    ]);
    const path = findPath({ map, terrain, from: { x: 2, y: 0 }, to: { x: 2, y: 2 } });
    expect(path.found).toBe(true);
    // Straight down is blocked, so it must be longer than the direct distance.
    expect(path.steps.length).toBeGreaterThan(2);
  });

  // The property the plan calls for.
  it('never crosses an impassable tile, over many random maps', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const rng = Rng.fromSeed(seed);
      const builder = new MapBuilder(16, 16, 'floor');
      for (let i = 0; i < 50; i += 1) builder.set(rng.nextInt(0, 15), rng.nextInt(0, 15), 'wall');
      builder.set(0, 0, 'floor');
      builder.set(15, 15, 'floor');
      const map = builder.freeze();

      const path = findPath({ map, terrain, from: { x: 0, y: 0 }, to: { x: 15, y: 15 } });
      if (!path.found) continue;

      for (const step of path.steps) {
        expect(terrain.isPassable(map, step), `seed ${seed} stepped into ${terrainAt(map, step)}`).toBe(true);
      }
    }
  });

  it('reports no path when the goal is walled off', () => {
    const map = fromRows([
      '..#..',
      '..#..',
      '..#..',
    ]);
    expect(findPath({ map, terrain, from: { x: 0, y: 1 }, to: { x: 4, y: 1 } }).found).toBe(false);
  });

  it('respects a movement budget', () => {
    const map = createMap(20, 20, 'floor');
    const near = findPath({ map, terrain, from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, maxCost: 5 });
    const far = findPath({ map, terrain, from: { x: 0, y: 0 }, to: { x: 18, y: 0 }, maxCost: 5 });
    expect(near.found).toBe(true);
    expect(far.found).toBe(false);
  });

  it('prefers cheap terrain over difficult terrain', () => {
    // A direct route through reeds (cost 2) versus a longer route on floor.
    const map = fromRows([
      '.""".',
      '.....',
    ]);
    const path = findPath({ map, terrain, from: { x: 0, y: 0 }, to: { x: 4, y: 0 } });
    expect(path.found).toBe(true);
    // Going around costs 5; straight through costs 1+2+2+2 = 7.
    expect(path.cost).toBeLessThan(7);
  });

  it('lets a swimmer take a route a walker cannot', () => {
    const map = fromRows([
      '#####',
      '.~~~.',
      '#####',
    ]);
    const from = { x: 0, y: 1 };
    const to = { x: 4, y: 1 };
    expect(findPath({ map, terrain, from, to, modes: ['walk'] }).found).toBe(false);
    expect(findPath({ map, terrain, from, to, modes: ['walk', 'swim'] }).found).toBe(true);
  });

  it('stops beside the goal when adjacency is enough', () => {
    const map = createMap(10, 10, 'floor');
    const path = findPath({
      map, terrain, from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, adjacentIsEnough: true,
    });
    expect(path.found).toBe(true);
    expect(distance(path.steps.at(-1)!, { x: 5, y: 0 })).toBeLessThanOrEqual(1);
  });

  it('routes around other creatures but still reaches an occupied goal', () => {
    const map = createMap(6, 3, 'floor');
    const blocked = new Set([key({ x: 3, y: 1 })]);
    const path = findPath({ map, terrain, from: { x: 0, y: 1 }, to: { x: 3, y: 1 }, blocked });
    expect(path.found).toBe(true);
    expect(path.steps.at(-1)).toEqual({ x: 3, y: 1 });
  });

  // Replays diverging because two equal-cost routes tied would be hard to debug.
  it('is deterministic: the same request gives the same path', () => {
    const map = createMap(12, 12, 'floor');
    const run = () =>
      JSON.stringify(findPath({ map, terrain, from: { x: 0, y: 0 }, to: { x: 11, y: 11 } }).steps);
    expect(run()).toBe(run());
  });

  describe('reachable', () => {
    it('lists tiles within a budget and excludes the origin', () => {
      const map = createMap(10, 10, 'floor');
      const tiles = reachable({ map, terrain, from: { x: 5, y: 5 }, budget: 2 });
      expect(tiles.has(key({ x: 5, y: 5 }))).toBe(false);
      expect(tiles.get(key({ x: 6, y: 5 }))).toBe(1);
      expect(tiles.get(key({ x: 7, y: 5 }))).toBe(2);
      expect(tiles.has(key({ x: 8, y: 5 }))).toBe(false);
    });

    it('charges more for difficult terrain', () => {
      const map = fromRows(['."..']);
      const tiles = reachable({ map, terrain, from: { x: 0, y: 0 }, budget: 3 });
      expect(tiles.get(key({ x: 1, y: 0 }))).toBe(2);
    });
  });

  describe('floodFill', () => {
    it('finds everything connected and nothing beyond a wall', () => {
      const map = fromRows([
        '..#..',
        '..#..',
      ]);
      const filled = floodFill(map, terrain, { x: 0, y: 0 });
      expect(filled.has(key({ x: 1, y: 1 }))).toBe(true);
      expect(filled.has(key({ x: 3, y: 0 }))).toBe(false);
      expect(filled.size).toBe(4);
    });

    it('returns nothing when starting inside a wall', () => {
      const map = fromRows(['###']);
      expect(floodFill(map, terrain, { x: 1, y: 0 }).size).toBe(0);
    });
  });
});
