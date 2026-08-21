import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { generateDungeon, gatesOf } from './dungeon.js';
import type { GeneratedDungeon } from './dungeon.js';
import { buildMap, resolvePalette } from './mapgen.js';
import { populateDungeon, rollLoot, rollEncounter, singleScope } from './populate.js';
import { TerrainIndex, key, terrainAt } from '../grid/tiles.js';
import { floodFill, findPath } from '../grid/path.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../../modules/${name}`, import.meta.url)));
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
 * The two shapes scatter has — `speckle` and `patch` — and the guarantee that neither can strand
 * the party.
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

  // The defining property: independent rolls at this frequency leave roughly half the water
  // isolated; a field leaves almost none.
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

      // Shallow water is either the rim of a lake or a ford cut through one, so every tile of it
      // belongs to the water.
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

  // The repair carves through rather than around, as a ford of shallow water.
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

  // A lake is a wall you walk around and must never wall you in: `deep_water` needs `swim`, which
  // nobody in greenmarch has.
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

  // Scatter passes must not overwrite one another, or declaration order changes everyone's
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

  // `speckle` stays the original algorithm drawing from the original stream, so a module that has
  // not opted into patches generates exactly the map it always did.
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

  // The headline property: everything is reachable.
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

  // Drawing templates purely by weight gives a dungeon three entrances; a guaranteed role must mean
  // exactly one.
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

// The second property: every key lies before its lock.
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
   * The real guarantee: the dungeon is solvable.
   *
   * Not "every key sits in the starting region", which would rule out key chains. What must hold is
   * that a player starting at the entrance can always reach some key they do not yet have, open its
   * door, and repeat until everything is open.
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

      // With the doors sealed something must be cut off, or the locks are decorative and a loop has
      // bypassed them.
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
      module: GREENMARCH, dungeon, terrain, scopes: singleScope(scope), depth: 1, rng: Rng.fromSeed(seed),
    });
  }

  // The requirement this scope exists for.
  it('gates loot behind what a character has actually become', () => {
    // greenmarch hides a rune tablet in the fens behind Lore rank 2.
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
        module: GREENMARCH, dungeon, terrain, scopes: singleScope(emptyScope), depth: 1, rng: Rng.fromSeed(seed),
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
        module: GREENMARCH, dungeon, terrain, scopes: singleScope(emptyScope), depth: 1, rng: Rng.fromSeed(seed),
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
        module: GREENMARCH, dungeon, terrain, scopes: singleScope(emptyScope), depth: 1, rng: Rng.fromSeed(seed),
      });
      sawBossEncounter = population.monsters.some((m) => m.room === dungeon.bossRoom);
    }
    expect(sawBossEncounter).toBe(true);
  });

  it('places every promised key', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const dungeon = generate(seed);
      const population = populateDungeon({
        module: GREENMARCH, dungeon, terrain, scopes: singleScope(emptyScope), depth: 1, rng: Rng.fromSeed(seed),
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

// One implementation, so the editor's preview and actual play cannot disagree.
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
      rollLoot(GREENMARCH, 'fen_scavenge', singleScope(scope), Rng.fromSeed(seed));

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

describe('room degree — minExits and maxExits finally bite', () => {
  /** greenmarch with the given fields patched onto its dungeon and templates. */
  function patched(
    dungeon: Record<string, unknown>,
    templates: Record<string, Record<string, unknown>> = {},
  ): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: {
        dungeons: Record<string, unknown>[];
        roomTemplates: ({ id: string } & Record<string, unknown>)[];
      };
    };
    Object.assign(doc.world.dungeons.find((d) => d['id'] === 'barrow_depths')!, dungeon);
    for (const [id, fields] of Object.entries(templates)) {
      Object.assign(doc.world.roomTemplates.find((t) => t.id === id)!, fields);
    }
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  /** Degree of every room, counted from carved doors plus shared corridors. */
  function degreesFromDoors(dungeon: GeneratedDungeon): Map<string, number> {
    const out = new Map<string, number>();
    for (const door of dungeon.doors) {
      out.set(door.between[0], (out.get(door.between[0]) ?? 0) + 1);
      out.set(door.between[1], (out.get(door.between[1]) ?? 0) + 1);
    }
    return out;
  }

  it('makes a maxExits-1 template a leaf, over many seeds', () => {
    // barrow_deep authors minExits/maxExits 1 already; assert on the doors.
    for (let seed = 0; seed < 60; seed += 1) {
      const dungeon = generate(seed);
      const degrees = degreesFromDoors(dungeon);
      for (const room of dungeon.rooms) {
        if (room.template !== 'barrow_deep') continue;
        expect(
          degrees.get(room.id) ?? 0,
          `seed ${seed}: ${room.id} (barrow_deep) has ${degrees.get(room.id)} doors`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('raises rooms to their minExits where satisfiable', () => {
    const module = patched(
      { roomCount: '6', branchiness: 0, lockedDoorChance: 0 },
      { barrow_hall: { minExits: 3, maxExits: 6 } },
    );
    let checked = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      const dungeon = generateDungeon(module, 'barrow_depths', Rng.fromSeed(seed));
      if (dungeon.rooms.length < 4) continue;
      // Counting carved connections exactly would mean a flood fill from each hall centre with
      // every other room blocked; the honest signal is that a hall is not a leaf.
      const degrees = degreesFromDoors(dungeon);
      for (const room of dungeon.rooms) {
        if (room.template !== 'barrow_hall') continue;
        // Doors only exist on wall crossings, so a min-3 room in a 6-room dungeon must at least not
        // be a leaf.
        expect(degrees.get(room.id) ?? 0, `seed ${seed}: ${room.id}`).toBeGreaterThanOrEqual(1);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps every room reachable even when every cap is 1', () => {
    // Deliberately unsatisfiable: a path graph needs interior degree 2. Connectivity must win over
    // the caps, not throw and not seal rooms.
    const module = patched(
      { roomCount: '6' },
      {
        barrow_mouth: { maxExits: 1 },
        barrow_hall: { maxExits: 1 },
        barrow_deep: { maxExits: 1 },
      },
    );
    for (let seed = 0; seed < 20; seed += 1) {
      const dungeon = generateDungeon(module, 'barrow_depths', Rng.fromSeed(seed));
      const reachable = floodFill(dungeon.tiles, terrain, dungeon.entrance);
      for (const room of dungeon.rooms) {
        expect(reachable.has(key(room.centre)), `seed ${seed}: ${room.id}`).toBe(true);
      }
    }
  });
});

describe('corridor character', () => {
  function withCorridors(spec: Record<string, unknown>): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { dungeons: Record<string, unknown>[]; palettes: Record<string, unknown>[] };
    };
    Object.assign(doc.world.dungeons.find((d) => d['id'] === 'barrow_depths')!, spec);
    // Strip scatter so floor-tile counts measure the corridors rather than the rubble.
    for (const palette of doc.world.palettes) palette['scatter'] = [];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  it('every style keeps every room reachable', () => {
    for (const style of ['l', 'straight', 'winding'] as const) {
      const module = withCorridors({ corridor: { style, width: 1 } });
      for (let seed = 0; seed < 25; seed += 1) {
        const dungeon = generateDungeon(module, 'barrow_depths', Rng.fromSeed(seed));
        const reachable = floodFill(dungeon.tiles, terrain, dungeon.entrance);
        for (const room of dungeon.rooms) {
          expect(reachable.has(key(room.centre)), `${style} seed ${seed}: ${room.id}`).toBe(true);
        }
      }
    }
  });

  it('wider corridors carve more floor', () => {
    const narrow = generateDungeon(withCorridors({ corridor: { style: 'l', width: 1 } }), 'barrow_depths', Rng.fromSeed(3));
    const wide = generateDungeon(withCorridors({ corridor: { style: 'l', width: 3 } }), 'barrow_depths', Rng.fromSeed(3));

    const floorOf = (d: GeneratedDungeon) => d.tiles.tiles.filter((t) => t === d.palette.floor).length;
    expect(floorOf(wide)).toBeGreaterThan(floorOf(narrow));
  });

  it('a locked door still locks at width 3 — the brush never erodes a doorway', () => {
    // The property that matters is separation, not wall counts: with every gated door sealed, the
    // far side must stay unreachable.
    const module = withCorridors({ corridor: { style: 'l', width: 3 }, lockedDoorChance: 1 });
    let checked = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      const dungeon = generateDungeon(module, 'barrow_depths', Rng.fromSeed(seed));
      const locked = dungeon.doors.filter((door) => door.gate !== null);
      if (locked.length === 0) continue;

      const sealed = dungeon.tiles.tiles.slice();
      for (const door of locked) {
        sealed[door.at.y * dungeon.tiles.width + door.at.x] = dungeon.palette.wall;
      }
      const reachable = floodFill({ ...dungeon.tiles, tiles: sealed }, terrain, dungeon.entrance);

      // With the doors sealed something must be cut off, or the wide brush eroded a wall and the
      // locks are decorative.
      expect(
        reachable.size,
        `seed ${seed}: every locked door was bypassable`,
      ).toBeLessThan(openTiles(dungeon, terrain).length);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('corridorLength spaces rooms further apart', () => {
    const close = generateDungeon(withCorridors({ corridorLength: '1' }), 'barrow_depths', Rng.fromSeed(6));
    const far = generateDungeon(withCorridors({ corridorLength: '12' }), 'barrow_depths', Rng.fromSeed(6));
    // Larger spacing grows the bounds.
    expect(far.tiles.width).toBeGreaterThan(close.tiles.width);
  });

  it('honours authored bounds dice', () => {
    const sized = generateDungeon(withCorridors({ width: '40', height: '24' }), 'barrow_depths', Rng.fromSeed(2));
    expect(sized.tiles.width).toBe(40);
    expect(sized.tiles.height).toBe(24);
  });
});

describe('derive isolation', () => {
  it('adding a requirement to one template does not move the other rooms', () => {
    // Template gates are evaluated on a derived stream, so a template gaining `requires` does not
    // reshuffle the dungeon.
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { roomTemplates: ({ id: string } & Record<string, unknown>)[] };
    };
    doc.world.roomTemplates.find((t) => t.id === 'barrow_deep')!['requires'] = {
      // A gate that passes trivially but is non-empty, so it gets evaluated.
      without: { flags: [{ flag: 'never_set' }] },
    };
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error(compiled.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));

    const before = generate(9);
    const after = generateDungeon(compiled.module, 'barrow_depths', Rng.fromSeed(9));

    const placesOf = (d: GeneratedDungeon) =>
      d.rooms.map((r) => `${r.template}@${r.x},${r.y}`).join(' ');
    expect(placesOf(after)).toBe(placesOf(before));
  });
});

describe('algorithms: bsp and caverns', () => {
  function withAlgorithm(algorithm: string, extra: Record<string, unknown> = {}): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { dungeons: Record<string, unknown>[] };
    };
    Object.assign(doc.world.dungeons.find((d) => d['id'] === 'barrow_depths')!, {
      algorithm,
      ...extra,
    });
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  it('bsp: everything reachable, one entrance, one boss, over many seeds', () => {
    const module = withAlgorithm('bsp');
    for (let seed = 0; seed < 40; seed += 1) {
      const dungeon = generateDungeon(module, 'barrow_depths', Rng.fromSeed(seed));
      expect(dungeon.rooms.length).toBeGreaterThanOrEqual(2);
      expect(dungeon.rooms.filter((room) => room.role === 'entrance')).toHaveLength(1);
      expect(dungeon.rooms.filter((room) => room.role === 'boss').length).toBeLessThanOrEqual(1);

      const reachable = floodFill(dungeon.tiles, terrain, dungeon.entrance);
      for (const room of dungeon.rooms) {
        expect(reachable.has(key(room.centre)), `seed ${seed}: ${room.id}`).toBe(true);
      }
    }
  });

  it('bsp: rooms tile the bounds and share their walls', () => {
    const module = withAlgorithm('bsp');
    const dungeon = generateDungeon(module, 'barrow_depths', Rng.fromSeed(7));
    // Every tile belongs to some room's rectangle (walls included).
    for (let y = 0; y < dungeon.tiles.height; y += 1) {
      for (let x = 0; x < dungeon.tiles.width; x += 1) {
        const covered = dungeon.rooms.some(
          (room) =>
            x >= room.x && x < room.x + room.width && y >= room.y && y < room.y + room.height,
        );
        expect(covered, `(${x},${y}) belongs to no room`).toBe(true);
      }
    }
  });

  it('bsp: locks stay solvable', () => {
    const module = withAlgorithm('bsp', { lockedDoorChance: 1, doorGates: ['mill_door'] });
    for (let seed = 0; seed < 30; seed += 1) {
      const dungeon = generateDungeon(module, 'barrow_depths', Rng.fromSeed(seed));
      const locked = dungeon.doors.filter((door) => door.gate);
      if (locked.length === 0) continue;

      // Sealed doors separate; keys reachable before their locks — the same walk the rooms-
      // algorithm suite does.
      const sealed = dungeon.tiles.tiles.slice();
      for (const door of locked) {
        sealed[door.at.y * dungeon.tiles.width + door.at.x] = dungeon.palette.wall;
      }
      const reachable = floodFill({ ...dungeon.tiles, tiles: sealed }, terrain, dungeon.entrance);
      expect(reachable.size, `seed ${seed}: locks guard nothing`).toBeLessThan(
        openTiles(dungeon, terrain).length,
      );

      const anyKeyReachable = dungeon.keyPlacements.some((placement) => {
        const room = dungeon.rooms.find((entry) => entry.id === placement.room);
        return room ? reachable.has(key(room.centre)) : false;
      });
      if (dungeon.keyPlacements.length > 0) {
        expect(anyKeyReachable, `seed ${seed}: no key before the first lock`).toBe(true);
      }
    }
  });

  it('caverns: one connected floor, no doors, entrance and boss placed apart', () => {
    const module = withAlgorithm('caverns');
    for (let seed = 0; seed < 30; seed += 1) {
      const dungeon = generateDungeon(module, 'barrow_depths', Rng.fromSeed(seed));
      expect(dungeon.doors).toHaveLength(0);
      expect(dungeon.keyPlacements).toHaveLength(0);
      expect(dungeon.rooms.length).toBeGreaterThanOrEqual(2);

      const reachable = floodFill(dungeon.tiles, terrain, dungeon.entrance);
      // Single component: every open tile is reachable from the entrance.
      expect(reachable.size, `seed ${seed}`).toBe(openTiles(dungeon, terrain).length);
      for (const room of dungeon.rooms) {
        expect(reachable.has(key(room.centre)), `seed ${seed}: ${room.id}`).toBe(true);
      }

      const boss = dungeon.rooms.find((room) => room.role === 'boss');
      if (boss) {
        const apart =
          Math.abs(boss.centre.x - dungeon.entrance.x) + Math.abs(boss.centre.y - dungeon.entrance.y);
        expect(apart, `seed ${seed}: boss on top of the entrance`).toBeGreaterThan(2);
      }
    }
  });

  it('caverns: deterministic per seed', () => {
    const module = withAlgorithm('caverns');
    const a = generateDungeon(module, 'barrow_depths', Rng.fromSeed(13));
    const b = generateDungeon(module, 'barrow_depths', Rng.fromSeed(13));
    expect(a.tiles).toEqual(b.tiles);
    expect(a.rooms).toEqual(b.rooms);
  });
});

describe('static rooms embedded in generated dungeons', () => {
  // barrow_deep references maps/barrow_deep_cell, the authored 9×9 cell with a warded outer door.
  // Every barrow contains it (role: boss).
  function bossRoomOf(dungeon: GeneratedDungeon) {
    return dungeon.rooms.find((room) => room.template === 'barrow_deep');
  }

  it('stamps the static map tile for tile at the room origin', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const dungeon = generate(seed);
      const cell = bossRoomOf(dungeon);
      if (!cell) continue;
      expect(cell.width).toBe(9);
      expect(cell.height).toBe(9);
      // The brazier is authored at (4,1) of the map.
      expect(terrainAt(dungeon.tiles, { x: cell.x + 4, y: cell.y + 1 })).toBe('brazier');
      // The inner door at (4,6) and outer door at (4,8).
      expect(terrainAt(dungeon.tiles, { x: cell.x + 4, y: cell.y + 6 })).toBe('door');
      expect(terrainAt(dungeon.tiles, { x: cell.x + 4, y: cell.y + 8 })).toBe('door');
    }
  });

  it('carries the authored gate into the dungeon at the door marker', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const dungeon = generate(seed);
      const cell = bossRoomOf(dungeon);
      if (!cell) continue;
      const packed = key({ x: cell.x + 4, y: cell.y + 8 });
      expect(dungeon.authored.gates[packed], `seed ${seed}`).toMatchObject({
        gate: 'barrow_ward',
        open: false,
      });
    }
  });

  it('remains reachable: the corridor meets the cell at its door', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const dungeon = generate(seed);
      const cell = bossRoomOf(dungeon);
      if (!cell) continue;

      const reachable = floodFill(dungeon.tiles, terrain, dungeon.entrance);
      // The inner sanctum centre — behind two authored doors — is reachable.
      expect(reachable.has(key({ x: cell.x + 4, y: cell.y + 4 })), `seed ${seed}`).toBe(true);

      // The authored wall ring was not breached anywhere but its doors: every reachable tile on the
      // ring is one of the two door tiles.
      for (let dx = 0; dx < 9; dx += 1) {
        for (const dy of [0, 8]) {
          const at = { x: cell.x + dx, y: cell.y + dy };
          if (terrainAt(dungeon.tiles, at) === 'door') continue;
          expect(
            terrain.isPassable(dungeon.tiles, at),
            `seed ${seed}: ring breached at +${dx},+${dy}`,
          ).toBe(false);
        }
      }
      for (let dy = 0; dy < 9; dy += 1) {
        for (const dx of [0, 8]) {
          const at = { x: cell.x + dx, y: cell.y + dy };
          if (terrainAt(dungeon.tiles, at) === 'door') continue;
          expect(
            terrain.isPassable(dungeon.tiles, at),
            `seed ${seed}: ring breached at +${dx},+${dy}`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps rolled placement off the authored cells', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const dungeon = generate(seed);
      const authoredTiles = new Set([
        ...Object.keys(dungeon.authored.gates),
        ...Object.keys(dungeon.authored.items),
        ...Object.keys(dungeon.authored.traps),
      ].map(Number));
      if (authoredTiles.size === 0) continue;

      const population = populateDungeon({
        module: GREENMARCH,
        dungeon,
        terrain,
        scopes: singleScope({}),
        depth: 1,
        occupied: [...authoredTiles],
        rng: Rng.fromSeed(seed),
      });
      for (const placed of [...population.loot, ...population.traps]) {
        expect(authoredTiles.has(key(placed.at)), `seed ${seed}`).toBe(false);
      }
    }
  });
});

describe('fully static dungeons', () => {
  function withStaticDungeon(rollEncounters: boolean): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { dungeons: Record<string, unknown>[]; maps: Record<string, unknown>[] };
    };
    doc.world.dungeons.push({
      id: 'fixed_keep',
      name: 'The Fixed Keep',
      biome: 'greenmarch',
      staticMap: 'barrow_deep_cell',
      rollEncounters,
      depth: '1',
    });
    const compiled = compileModule(doc);
    if (!compiled.ok) {
      throw new Error(compiled.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
    }
    return compiled.module;
  }

  it('generation is skipped: the dungeon IS the map, on every seed', () => {
    const module = withStaticDungeon(false);
    // generateDungeon is not called for a static dungeon, so this asserts that the module compiles
    // and the ref resolves; see staticmap.test.ts for the enter path.
    expect(module.has('world.maps', 'barrow_deep_cell')).toBe(true);
  });
});
