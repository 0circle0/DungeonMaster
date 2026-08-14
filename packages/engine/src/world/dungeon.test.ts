import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { generateDungeon, gatesOf } from './dungeon.js';
import type { GeneratedDungeon } from './dungeon.js';
import { buildMap, resolvePalette } from './mapgen.js';
import { populateDungeon, rollLoot, rollEncounter } from './populate.js';
import { TerrainIndex, key, terrainAt } from '../grid/tiles.js';
import { floodFill, findPath } from '../grid/path.js';

function loadModule(name: string): CompiledModule {
  const path = fileURLToPath(new URL(`../../../../modules/${name}/module.json`, import.meta.url));
  const result = compileModule(JSON.parse(readFileSync(path, 'utf8')));
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  return result.module;
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');
const terrain = new TerrainIndex(GREENMARCH);

const generate = (seed: number, module = GREENMARCH, id = 'barrow_depths'): GeneratedDungeon =>
  generateDungeon(module, id, Rng.fromSeed(seed));

/** Every floor tile the dungeon contains. */
function openTiles(dungeon: GeneratedDungeon, index: TerrainIndex): number[] {
  const out: number[] = [];
  for (let y = 0; y < dungeon.tiles.height; y += 1) {
    for (let x = 0; x < dungeon.tiles.width; x += 1) {
      if (index.isPassable(dungeon.tiles, { x, y })) out.push(key({ x, y }));
    }
  }
  return out;
}

describe('map building', () => {
  it('resolves a palette from the module', () => {
    const palette = resolvePalette(GREENMARCH, 'barrow_stone');
    expect(palette.floor).toBe('floor');
    expect(palette.wall).toBe('wall');
    expect(palette.door).toBe('door');
  });

  it('falls back to the first passable and impassable terrain', () => {
    // A module that never mentions palettes must still generate something walkable.
    const palette = resolvePalette(MINIMAL, undefined);
    expect(palette.floor).toBe('bare_floor');
    expect(palette.wall).toBe('raw_stone');
  });

  it('generates a walled rectangle at the rolled size', () => {
    const built = buildMap(GREENMARCH, { width: '9', height: '7', layout: [], legend: {} }, Rng.fromSeed(1), 'barrow_stone');
    expect(built.tiles.width).toBe(9);
    expect(built.tiles.height).toBe(7);
    expect(terrainAt(built.tiles, { x: 0, y: 0 })).toBe('wall');
    expect(terrainAt(built.tiles, { x: 4, y: 3 })).toBe('floor');
  });

  it('uses a hand-authored layout verbatim and records its markers', () => {
    const built = buildMap(
      GREENMARCH,
      { width: '99', height: '99', layout: ['###', '#@#', '###'], legend: {}, palette: 'barrow_stone' },
      Rng.fromSeed(1),
    );
    // Layout dimensions win over the dice.
    expect(built.tiles.width).toBe(3);
    expect(built.tiles.height).toBe(3);
    expect(terrainAt(built.tiles, { x: 1, y: 1 })).toBe('floor');
    expect(built.marks['@']).toEqual([{ x: 1, y: 1 }]);
  });
});

/**
 * Scatter used to be an independent coin flip per tile, which is why the fens
 * came out as a spray of single water tiles rather than as water. These pin the
 * two shapes it now has, and the guarantee that neither can strand the party.
 */
describe('scattering terrain', () => {
  const FEN = { width: '31', height: '21', layout: [] as string[], legend: {} };
  const fen = (seed: number) =>
    buildMap(GREENMARCH, FEN, Rng.fromSeed(seed), 'fen', { entry: { x: 15, y: 10 } });

  const countOf = (built: ReturnType<typeof buildMap>, id: string): number => {
    let total = 0;
    for (let y = 0; y < built.tiles.height; y += 1) {
      for (let x = 0; x < built.tiles.width; x += 1) {
        if (terrainAt(built.tiles, { x, y }) === id) total += 1;
      }
    }
    return total;
  };

  /** How many of a terrain's tiles touch another of the same terrain. */
  const clustered = (built: ReturnType<typeof buildMap>, id: string): number => {
    let touching = 0;
    let total = 0;
    for (let y = 0; y < built.tiles.height; y += 1) {
      for (let x = 0; x < built.tiles.width; x += 1) {
        if (terrainAt(built.tiles, { x, y }) !== id) continue;
        total += 1;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([dx, dy]) => terrainAt(built.tiles, { x: x + dx!, y: y + dy! }) === id);
        if (near) touching += 1;
      }
    }
    return total === 0 ? 0 : touching / total;
  };

  // The defining property. Independent rolls at this frequency leave roughly
  // half of the water isolated; a field leaves almost none.
  it('makes water that is joined up, not sprayed about', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const built = fen(seed);
      if (countOf(built, 'deep_water') < 8) continue;
      expect(clustered(built, 'deep_water'), `seed ${seed}`).toBeGreaterThan(0.9);
    }
  });

  it('covers about the fraction of floor it was asked for', () => {
    let covered = 0;
    let open = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const built = fen(seed);
      covered += countOf(built, 'deep_water');
      // The interior, which is what `frequency` is a fraction of.
      open += (built.tiles.width - 2) * (built.tiles.height - 2);
    }
    expect(covered / open).toBeGreaterThan(0.1);
    expect(covered / open).toBeLessThan(0.22);
  });

  it('puts a shore around the water', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const built = fen(seed);
      if (countOf(built, 'deep_water') < 8) continue;

      expect(countOf(built, 'shallow_water'), `seed ${seed}`).toBeGreaterThan(0);

      // Shallow water is either the rim of a lake or a ford cut through one, so
      // every tile of it belongs to the water — never a puddle on dry ground.
      for (let y = 0; y < built.tiles.height; y += 1) {
        for (let x = 0; x < built.tiles.width; x += 1) {
          if (terrainAt(built.tiles, { x, y }) !== 'shallow_water') continue;
          const wet = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => {
            if (dx === 0 && dy === 0) return false;
            const beside = terrainAt(built.tiles, { x: x + dx, y: y + dy });
            return beside === 'deep_water' || beside === 'shallow_water';
          }));
          expect(wet, `${x},${y} seed ${seed}`).toBe(true);
        }
      }
    }
  });

  // The repair carves a way through rather than around, and does it as a ford
  // of shallow water — a dry corridor scored across a lake would read as damage.
  it('fords the water rather than cutting a dry trench through it', () => {
    let fords = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const built = fen(seed);
      for (let y = 1; y < built.tiles.height - 1; y += 1) {
        for (let x = 1; x < built.tiles.width - 1; x += 1) {
          if (terrainAt(built.tiles, { x, y }) !== 'floor') continue;
          // Dry floor with water on both sides would be a trench.
          const trench = terrainAt(built.tiles, { x: x - 1, y }) === 'deep_water'
            && terrainAt(built.tiles, { x: x + 1, y }) === 'deep_water';
          expect(trench, `${x},${y} seed ${seed}`).toBe(false);
        }
      }
      if (countOf(built, 'shallow_water') > 0) fords += 1;
    }
    expect(fords).toBeGreaterThan(0);
  });

  it('never scatters onto the walls', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const built = fen(seed);
      const { width, height } = built.tiles;
      for (let x = 0; x < width; x += 1) {
        expect(terrainAt(built.tiles, { x, y: 0 }), `seed ${seed}`).toBe('reeds');
        expect(terrainAt(built.tiles, { x, y: height - 1 }), `seed ${seed}`).toBe('reeds');
      }
    }
  });

  // A lake is meant to be a wall you walk around. It must never be a wall that
  // walls you in — `deep_water` needs `swim`, which nobody in greenmarch has.
  it('always leaves the whole map walkable from the entry', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const built = fen(seed);
      const entry = { x: 15, y: 10 };

      expect(terrain.isPassable(built.tiles, entry, ['walk']), `seed ${seed}`).toBe(true);
      const reached = floodFill(built.tiles, terrain, entry, ['walk']);

      for (let y = 1; y < built.tiles.height - 1; y += 1) {
        for (let x = 1; x < built.tiles.width - 1; x += 1) {
          if (!terrain.isPassable(built.tiles, { x, y }, ['walk'])) continue;
          expect(reached.has(key({ x, y })), `${x},${y} seed ${seed}`).toBe(true);
        }
      }
    }
  });

  it('is the same map every time from the same seed', () => {
    for (const seed of [3, 19, 404]) {
      expect(JSON.stringify(fen(seed).tiles)).toBe(JSON.stringify(fen(seed).tiles));
    }
    expect(JSON.stringify(fen(3).tiles)).not.toBe(JSON.stringify(fen(4).tiles));
  });

  // The old code wrote each pass unconditionally, so a later entry silently
  // deleted a share of an earlier one and declaration order changed everyone's
  // effective frequency but the last's.
  it('does not let a later entry erase an earlier one', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { palettes: { id: string; scatter: Record<string, unknown>[] }[] };
    };
    const fenPalette = doc.world.palettes.find((entry) => entry.id === 'fen')!;
    // Ask the second entry to cover nearly everything; the first must survive.
    fenPalette.scatter[1]!['frequency'] = 0.95;
    fenPalette.scatter[1]!['distribution'] = 'speckle';

    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed');

    const built = buildMap(compiled.module, FEN, Rng.fromSeed(9), 'fen', { entry: { x: 15, y: 10 } });
    expect(countOf(built, 'deep_water')).toBeGreaterThan(0);
  });

  // Rubble genuinely is scattered, so `speckle` stays the original algorithm
  // drawing from the original stream — any module that has not opted into
  // patches must generate exactly the map it always did.
  it('leaves the speckled palettes untouched', () => {
    const built = buildMap(
      GREENMARCH,
      { width: '31', height: '21', layout: [], legend: {} },
      Rng.fromSeed(12345),
      'barrow_stone',
    );

    const rubble: string[] = [];
    for (let y = 0; y < built.tiles.height; y += 1) {
      for (let x = 0; x < built.tiles.width; x += 1) {
        if (terrainAt(built.tiles, { x, y }) === 'rubble') rubble.push(`${x},${y}`);
      }
    }
    expect(rubble).toMatchInlineSnapshot(`
      [
        "5,1",
        "7,1",
        "18,1",
        "5,2",
        "24,2",
        "11,3",
        "23,3",
        "19,4",
        "23,5",
        "9,6",
        "27,6",
        "19,7",
        "9,9",
        "17,10",
        "29,11",
        "8,12",
        "9,12",
        "23,12",
        "6,13",
        "11,13",
        "21,13",
        "3,14",
        "1,15",
        "4,15",
        "13,16",
        "7,17",
        "12,17",
        "18,17",
        "22,17",
        "25,17",
        "29,17",
        "17,18",
        "26,18",
        "1,19",
      ]
    `);
  });
});

describe('dungeon generation', () => {
  it('produces rooms, doors and an entrance', () => {
    const dungeon = generate(1);
    expect(dungeon.rooms.length).toBeGreaterThan(1);
    expect(dungeon.entranceRoom).not.toBe('');
    expect(terrain.isPassable(dungeon.tiles, dungeon.entrance)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(JSON.stringify(generate(42))).toBe(JSON.stringify(generate(42)));
  });

  it('differs between seeds', () => {
    expect(JSON.stringify(generate(1))).not.toBe(JSON.stringify(generate(2)));
  });

  it('never overlaps two rooms', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const rooms = generate(seed).rooms;
      for (let i = 0; i < rooms.length; i += 1) {
        for (let j = i + 1; j < rooms.length; j += 1) {
          const a = rooms[i]!;
          const b = rooms[j]!;
          const apart =
            a.x + a.width <= b.x || b.x + b.width <= a.x ||
            a.y + a.height <= b.y || b.y + b.height <= a.y;
          expect(apart, `seed ${seed}: ${a.id} overlaps ${b.id}`).toBe(true);
        }
      }
    }
  });

  it('keeps every room inside the map', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const dungeon = generate(seed);
      for (const room of dungeon.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.y).toBeGreaterThanOrEqual(0);
        expect(room.x + room.width).toBeLessThanOrEqual(dungeon.tiles.width);
        expect(room.y + room.height).toBeLessThanOrEqual(dungeon.tiles.height);
      }
    }
  });

  // The plan's headline property.
  it('leaves every room reachable from the entrance, over many seeds', () => {
    for (let seed = 0; seed < 120; seed += 1) {
      const dungeon = generate(seed);
      if (dungeon.rooms.length === 0) continue;

      const reachable = floodFill(dungeon.tiles, terrain, dungeon.entrance);

      for (const room of dungeon.rooms) {
        expect(
          reachable.has(key(room.centre)),
          `seed ${seed}: ${room.id} at (${room.centre.x},${room.centre.y}) is sealed off`,
        ).toBe(true);
      }
    }
  });

  it('connects every open tile into one region', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const dungeon = generate(seed);
      const open = openTiles(dungeon, terrain);
      if (open.length === 0) continue;

      const reachable = floodFill(dungeon.tiles, terrain, dungeon.entrance);
      // Nothing walkable should be stranded from the entrance.
      expect(reachable.size, `seed ${seed}`).toBe(open.length);
    }
  });

  // Drawing templates purely by weight gives a dungeon three entrances; a
  // guaranteed role must mean exactly one.
  it('places exactly one entrance and at most one boss, over many seeds', () => {
    for (let seed = 0; seed < 150; seed += 1) {
      const rooms = generate(seed).rooms;
      if (rooms.length === 0) continue;
      expect(rooms.filter((room) => room.role === 'entrance'), `seed ${seed}`).toHaveLength(1);
      expect(rooms.filter((room) => room.role === 'boss').length, `seed ${seed}`).toBeLessThanOrEqual(1);
    }
  });

  it('places the boss room away from the entrance', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const dungeon = generate(seed);
      if (!dungeon.bossRoom) continue;
      expect(dungeon.bossRoom).not.toBe(dungeon.entranceRoom);
    }
  });
});

// The second property, and the one that is easy to get wrong.
describe('locked doors', () => {
  /** A dungeon whose doors are always locked, to exercise the path properly. */
  function alwaysLocked(): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { dungeons: Record<string, unknown>[] };
    };
    for (const dungeon of doc.world.dungeons) {
      dungeon['lockedDoorChance'] = 1;
      dungeon['doorGates'] = ['mill_door'];
      dungeon['branchiness'] = 0.8;
      dungeon['roomCount'] = '8';
    }
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  const LOCKED = alwaysLocked();

  it('records a gate on locked doors and none on open ones', () => {
    const dungeon = generate(3, LOCKED);
    const locked = dungeon.doors.filter((door) => door.gate);
    expect(locked.length).toBeGreaterThan(0);
    expect(Object.keys(gatesOf(dungeon)).length).toBe(locked.length);
  });

  /**
   * The real guarantee: the dungeon is **solvable**.
   *
   * Not "every key sits in the starting region" — that would be needlessly
   * restrictive and rule out key chains. What must hold is that a player who
   * starts at the entrance can always reach *some* key they do not yet have,
   * open its door, and repeat, until everything is open. This simulates exactly
   * that walk.
   */
  it('can always be solved from the entrance, over many seeds', () => {
    for (let seed = 0; seed < 120; seed += 1) {
      const dungeon = generate(seed, LOCKED);
      const lockedDoors = dungeon.doors.filter((door) => door.gate);
      if (lockedDoors.length === 0) continue;

      const openedGates = new Set<string>();
      const width = dungeon.tiles.width;

      for (let step = 0; step <= lockedDoors.length; step += 1) {
        // Seal every door whose gate is still shut.
        const tiles = dungeon.tiles.tiles.slice();
        for (const door of lockedDoors) {
          if (openedGates.has(door.gate!)) continue;
          tiles[door.at.y * width + door.at.x] = dungeon.palette.wall;
        }
        const reachable = floodFill({ ...dungeon.tiles, tiles }, terrain, dungeon.entrance);

        const remaining = lockedDoors.filter((door) => !openedGates.has(door.gate!));
        if (remaining.length === 0) break;

        // Any key we can now walk to unlocks its gate.
        const found = dungeon.keyPlacements.find((placement) => {
          if (openedGates.has(placement.gate)) return false;
          const room = dungeon.rooms.find((entry) => entry.id === placement.room);
          return room ? reachable.has(key(room.centre)) : false;
        });

        expect(
          found,
          `seed ${seed}: stuck with ${remaining.length} locked door(s) and no reachable key`,
        ).toBeDefined();
        if (!found) break;

        openedGates.add(found.gate);
      }
    }
  });

  it('places the first key in reach before anything is opened', () => {
    for (let seed = 0; seed < 80; seed += 1) {
      const dungeon = generate(seed, LOCKED);
      if (dungeon.keyPlacements.length === 0) continue;

      const tiles = dungeon.tiles.tiles.slice();
      for (const door of dungeon.doors) {
        if (!door.gate) continue;
        tiles[door.at.y * dungeon.tiles.width + door.at.x] = dungeon.palette.wall;
      }
      const reachable = floodFill({ ...dungeon.tiles, tiles }, terrain, dungeon.entrance);

      const anyReachable = dungeon.keyPlacements.some((placement) => {
        const room = dungeon.rooms.find((entry) => entry.id === placement.room);
        return room ? reachable.has(key(room.centre)) : false;
      });
      expect(anyReachable, `seed ${seed}: no key reachable at the start`).toBe(true);
    }
  });

  it('does not let an extra loop route around a locked door', () => {
    for (let seed = 0; seed < 80; seed += 1) {
      const dungeon = generate(seed, LOCKED);
      const lockedDoors = dungeon.doors.filter((door) => door.gate);
      if (lockedDoors.length === 0) continue;

      const sealed = dungeon.tiles.tiles.slice();
      for (const door of lockedDoors) {
        sealed[door.at.y * dungeon.tiles.width + door.at.x] = dungeon.palette.wall;
      }
      const blocked = { ...dungeon.tiles, tiles: sealed };
      const reachable = floodFill(blocked, terrain, dungeon.entrance);
      const open = openTiles(dungeon, terrain).length;

      // With the doors sealed, something must be cut off — otherwise the locks
      // are decorative and a loop has bypassed them.
      expect(reachable.size, `seed ${seed}: locked doors guard nothing`).toBeLessThan(open);
    }
  });

  it('leaves everything reachable once the doors are opened', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const dungeon = generate(seed, LOCKED);
      const reachable = floodFill(dungeon.tiles, terrain, dungeon.entrance);
      for (const room of dungeon.rooms) {
        expect(reachable.has(key(room.centre)), `seed ${seed}: ${room.id} unreachable`).toBe(true);
      }
    }
  });
});

describe('across modules', () => {
  it('generates minimal\'s dungeon with its own terrain', () => {
    const dungeon = generateDungeon(MINIMAL, 'first_descent', Rng.fromSeed(5));
    const index = new TerrainIndex(MINIMAL);

    expect(dungeon.rooms.length).toBeGreaterThan(0);
    expect(index.isPassable(dungeon.tiles, dungeon.entrance)).toBe(true);
    // minimal names its terrain differently; the generator never assumes.
    expect(dungeon.palette.floor).toBe('bare_floor');

    const reachable = floodFill(dungeon.tiles, index, dungeon.entrance);
    for (const room of dungeon.rooms) {
      expect(reachable.has(key(room.centre))).toBe(true);
    }
  });

  it('survives a biome with no room templates rather than throwing', () => {
    const doc = JSON.parse(JSON.stringify(MINIMAL.source)) as never as {
      world: { biomes: Record<string, unknown>[] };
    };
    doc.world.biomes[0]!['roomTemplates'] = [];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed');

    const dungeon = generateDungeon(compiled.module, 'first_descent', Rng.fromSeed(1));
    expect(dungeon.tiles.width).toBeGreaterThan(0);
    expect(new TerrainIndex(compiled.module).isPassable(dungeon.tiles, dungeon.entrance)).toBe(true);
  });
});

describe('pathing through a generated dungeon', () => {
  it('can walk from the entrance to the boss room', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const dungeon = generate(seed);
      if (!dungeon.bossRoom) continue;
      const boss = dungeon.rooms.find((room) => room.id === dungeon.bossRoom);
      if (!boss) continue;

      const path = findPath({
        map: dungeon.tiles,
        terrain,
        from: dungeon.entrance,
        to: boss.centre,
      });
      expect(path.found, `seed ${seed}: no route to the boss room`).toBe(true);
    }
  });
});

describe('population', () => {
  const emptyScope = {
    actor: { level: 1, class: '', ancestry: '', abilities: [], attr: {}, skills: {}, inventory: {}, conditions: {} },
    quests: {}, flags: {}, reputation: {}, memory: {}, world: { day: 1 },
  } as never;

  const veteranScope = {
    actor: { level: 5, class: 'warden', ancestry: 'human', abilities: [], attr: {}, skills: { lore: 4 }, inventory: {}, conditions: {} },
    quests: { the_mill_door: { status: 'complete' } },
    flags: {}, reputation: {}, memory: {}, world: { day: 1 },
  } as never;

  function populate(seed: number, scope = emptyScope) {
    const dungeon = generate(seed);
    return populateDungeon({
      module: GREENMARCH, dungeon, terrain, scope, depth: 1, rng: Rng.fromSeed(seed),
    });
  }

  // The requirement this whole scope exists for, and which went untested until
  // the tests themselves were typechecked and the unused variable surfaced.
  it('gates loot behind what a character has actually become', () => {
    // greenmarch hides a rune tablet in the fens behind Lore rank 2: to anyone
    // else it is a rock.
    const gated = 'rune_tablet';

    let noviceFound = false;
    let veteranFound = false;

    for (let seed = 0; seed < 60; seed += 1) {
      if (populate(seed).loot.some((entry) => entry.item === gated)) noviceFound = true;
      if (populate(seed, veteranScope).loot.some((entry) => entry.item === gated)) veteranFound = true;
    }

    expect(noviceFound, 'a novice should never turn up the tablet').toBe(false);
    expect(veteranFound, 'a reader of runes should, given sixty tries').toBe(true);
  });

  it('places monsters, and never two on the same tile', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const population = populate(seed);
      const tiles = new Set<number>();
      for (const monster of population.monsters) {
        expect(tiles.has(key(monster.at)), `seed ${seed}: two monsters on one tile`).toBe(false);
        tiles.add(key(monster.at));
      }
    }
  });

  it('places everything on passable ground', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const dungeon = generate(seed);
      const population = populateDungeon({
        module: GREENMARCH, dungeon, terrain, scope: emptyScope, depth: 1, rng: Rng.fromSeed(seed),
      });
      for (const placed of [...population.monsters, ...population.loot, ...population.traps]) {
        expect(terrain.isPassable(dungeon.tiles, placed.at), `seed ${seed}`).toBe(true);
      }
    }
  });

  // Arriving inside an ambush with no chance to react reads as unfair.
  it('leaves the entrance room free of monsters and traps', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const dungeon = generate(seed);
      const population = populateDungeon({
        module: GREENMARCH, dungeon, terrain, scope: emptyScope, depth: 1, rng: Rng.fromSeed(seed),
      });
      for (const monster of population.monsters) {
        expect(monster.room, `seed ${seed}`).not.toBe(dungeon.entranceRoom);
      }
      for (const trap of population.traps) {
        expect(trap.room, `seed ${seed}`).not.toBe(dungeon.entranceRoom);
      }
    }
  });

  it('puts something in the boss room', () => {
    let sawBossEncounter = false;
    for (let seed = 0; seed < 40 && !sawBossEncounter; seed += 1) {
      const dungeon = generate(seed);
      if (!dungeon.bossRoom) continue;
      const population = populateDungeon({
        module: GREENMARCH, dungeon, terrain, scope: emptyScope, depth: 1, rng: Rng.fromSeed(seed),
      });
      sawBossEncounter = population.monsters.some((m) => m.room === dungeon.bossRoom);
    }
    expect(sawBossEncounter).toBe(true);
  });

  it('places every promised key', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const dungeon = generate(seed);
      const population = populateDungeon({
        module: GREENMARCH, dungeon, terrain, scope: emptyScope, depth: 1, rng: Rng.fromSeed(seed),
      });
      for (const placement of dungeon.keyPlacements) {
        const placed = population.loot.find(
          (entry) => entry.item === placement.item && entry.room === placement.room,
        );
        expect(placed, `seed ${seed}: key ${placement.item} was never placed`).toBeDefined();
      }
    }
  });

  it('is deterministic for a seed', () => {
    expect(JSON.stringify(populate(9))).toBe(JSON.stringify(populate(9)));
  });
});

// The consolidation the plan calls for: one implementation, so the editor's
// preview and actual play can never disagree.
describe('table draws', () => {
  const novice = {
    actor: { level: 1, class: 'warden', ancestry: 'human', abilities: [], attr: {}, skills: {}, inventory: {}, conditions: {} },
    quests: {}, flags: {}, reputation: {}, memory: {}, world: { day: 1 },
  } as never;

  const veteran = {
    actor: { level: 5, class: 'warden', ancestry: 'human', abilities: [], attr: {}, skills: { lore: 4 }, inventory: {}, conditions: {} },
    quests: { the_mill_door: { status: 'complete' } },
    flags: {}, reputation: {}, memory: {}, world: { day: 1 },
  } as never;

  it('removes gated loot before rolling, so the odds are honest', () => {
    const draws = (scope: never, seed: number) =>
      rollLoot(GREENMARCH, 'fen_scavenge', scope, Rng.fromSeed(seed));

    let noviceSawGated = false;
    let veteranSawGated = false;
    for (let seed = 0; seed < 300; seed += 1) {
      if (draws(novice, seed).some((d) => d.item === 'rune_tablet' || d.item === 'warded_blade')) {
        noviceSawGated = true;
      }
      if (draws(veteran, seed).some((d) => d.item === 'rune_tablet')) veteranSawGated = true;
    }
    expect(noviceSawGated).toBe(false);
    expect(veteranSawGated).toBe(true);
  });

  it('removes gated encounter groups for a low-level party', () => {
    let noviceSawWight = false;
    let veteranSawWight = false;
    for (let seed = 0; seed < 400; seed += 1) {
      const a = rollEncounter(GREENMARCH, 'fen_wanderers', novice, Rng.fromSeed(seed));
      const b = rollEncounter(GREENMARCH, 'fen_wanderers', veteran, Rng.fromSeed(seed));
      if (a?.group === 'wight_abroad' || a?.group === 'hound_pack') noviceSawWight = true;
      if (b?.group === 'wight_abroad') veteranSawWight = true;
    }
    expect(noviceSawWight).toBe(false);
    expect(veteranSawWight).toBe(true);
  });

  it('respects the table chance and returns nothing sometimes', () => {
    let empty = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      if (!rollEncounter(GREENMARCH, 'fen_wanderers', veteran, Rng.fromSeed(seed))) empty += 1;
    }
    // fen_wanderers fires 35% of the time and has an empty weight besides.
    expect(empty).toBeGreaterThan(100);
  });

  it('honours the depth band', () => {
    expect(rollEncounter(GREENMARCH, 'fen_wanderers', veteran, Rng.fromSeed(1), 9999)).toBeNull();
  });
});
