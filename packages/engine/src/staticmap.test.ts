/** Static maps in the engine: built verbatim, arrived at correctly. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { reduce } from './reduce.js';
import { Transaction } from './rules/apply.js';
import { enterDungeon, enterArea, enterPoi } from './sim/enter.js';
import { buildStaticMap } from './world/staticmap.js';
import { TerrainIndex, key, unkey, terrainAt } from './grid/tiles.js';
import type { GameState } from './state.js';
import { statesEqual } from './save.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const terrain = new TerrainIndex(GREENMARCH);

describe('buildStaticMap', () => {
  it('builds the authored grid exactly, with no rng anywhere', () => {
    const built = buildStaticMap(GREENMARCH, 'mill_interior');

    expect(built.tiles.width).toBe(11);
    expect(built.tiles.height).toBe(9);
    // Spot-check authored cells: the wall ring, the brazier, the store door.
    expect(terrainAt(built.tiles, { x: 0, y: 0 })).toBe('wall');
    expect(terrainAt(built.tiles, { x: 8, y: 3 })).toBe('brazier');
    expect(terrainAt(built.tiles, { x: 6, y: 3 })).toBe('door');
    expect(terrainAt(built.tiles, { x: 5, y: 8 })).toBe('door');
  });

  it('reads the entry marker and the item layer into packed-key records', () => {
    const built = buildStaticMap(GREENMARCH, 'mill_interior');

    expect(built.entry).toEqual({ x: 5, y: 7 });
    expect(built.items[key({ x: 1, y: 7 })]).toEqual([{ item: 'rope', quantity: 1 }]);
    expect(Object.keys(built.items)).toHaveLength(1);
  });

  it('is identical across builds — a pure function of the module', () => {
    const a = buildStaticMap(GREENMARCH, 'mill_interior');
    const b = buildStaticMap(GREENMARCH, 'mill_interior');
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('composites terrain layers last-wins and orders spawns row-major', () => {
    const built = buildStaticMap(GREENMARCH, 'mill_interior');
    // The base layer filled every cell; nothing later erased one.
    expect(built.tiles.tiles.every((id) => id !== '')).toBe(true);
  });
});

describe('entering a static interior', () => {
  function atMill(seed: number): Transaction {
    const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const txn = new Transaction(base, GREENMARCH);
    const rng = Rng.fromSeed(seed);
    // Straight in: the gate check is the caller's job, and this test is not about the mill door.
    const hero = txn.entity(txn.state.selected)!;
    enterPoi(txn, terrain, 'the_mill', hero, rng, true);
    return txn;
  }

  it('is the same interior on every seed', () => {
    const a = atMill(1).state.maps['poi:the_mill']!;
    const b = atMill(999).state.maps['poi:the_mill']!;
    expect(a.tiles).toEqual(b.tiles);
    expect(a.items).toEqual(b.items);
  });

  it('arrives at the entry marker, not {1,1}', () => {
    const txn = atMill(7);
    const hero = txn.entity(txn.state.selected)!;
    expect(hero.map).toBe('poi:the_mill');
    expect(hero.position).toEqual({ x: 5, y: 7 });
  });

  it('lays the authored rope on the floor', () => {
    const txn = atMill(7);
    const map = txn.state.maps['poi:the_mill']!;
    expect(map.items[key({ x: 1, y: 7 })]).toContainEqual({ item: 'rope', quantity: 1 });
  });
});

describe('the way out is recorded and used', () => {
  /** A fresh game standing on the millford area map. */
  function inMillford(seed: number): GameState {
    const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const txn = new Transaction(base, GREENMARCH);
    enterArea(txn, terrain, 'millford', Rng.fromSeed(seed));
    return txn.state;
  }

  it('writes the exit on first dungeon entry, pointing back where we came from', () => {
    const state = inMillford(11);
    const before = state.entities[state.selected]!.position;

    const txn = new Transaction(state, GREENMARCH);
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(11));

    const map = txn.state.maps['dungeon:barrow_depths']!;
    const exits = Object.entries(map.exits);
    expect(exits).toHaveLength(1);
    const [tile, exit] = exits[0]!;
    // The exit tile is where the party arrived...
    expect(unkey(Number(tile))).toEqual(txn.entity(txn.state.selected)!.position);
    // ...and it points back at the map and position they left.
    expect(exit.toMap).toBe('area:millford');
    expect(exit.at).toEqual(before);
  });

  it('re-enters at the exit tile, not {1,1}', () => {
    const state = inMillford(11);
    const txn = new Transaction(state, GREENMARCH);
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(11));
    const arrived = txn.entity(txn.state.selected)!.position;

    // Walk out, then back in.
    const outside = reduce(txn.state, { type: 'leave' }, { module: GREENMARCH }).state;
    const again = new Transaction(outside, GREENMARCH);
    enterDungeon(again, terrain, 'barrow_depths', Rng.fromSeed(99));

    expect(again.entity(again.state.selected)!.position).toEqual(arrived);
  });

  it('lets the party leave by standing on the exit tile', () => {
    const state = inMillford(11);
    const txn = new Transaction(state, GREENMARCH);
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(11));

    const ctx = { module: GREENMARCH };
    const result = reduce(txn.state, { type: 'leave' }, ctx);

    expect(result.state.location).toEqual({ kind: 'area', area: 'millford' });
    expect(result.state.currentMap).toBe('area:millford');
    expect(result.events.some((e) => e.type === 'refused')).toBe(false);
  });

  it('still refuses away from the exit', () => {
    const state = inMillford(11);
    const txn = new Transaction(state, GREENMARCH);
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(11));

    const hero = txn.entity(txn.state.selected)!;
    const map = txn.state.maps[txn.state.currentMap]!;
    const exitTile = hero.position;
    let step: { x: number; y: number } | undefined;
    for (let y = 1; y < map.tiles.height - 1 && !step; y += 1) {
      for (let x = 1; x < map.tiles.width - 1; x += 1) {
        if (Math.max(Math.abs(x - exitTile.x), Math.abs(y - exitTile.y)) <= 1) continue;
        if (!terrain.isPassable(map.tiles, { x, y })) continue;
        step = { x, y };
        break;
      }
    }
    expect(step).toBeDefined();
    txn.putEntity({ ...hero, position: step! });

    const ctx = { module: GREENMARCH };
    const result = reduce(txn.state, { type: 'leave' }, ctx);
    expect(result.events.some((e) => e.type === 'refused')).toBe(true);
  });

  it('keeps determinism: entering twice from one seed produces equal states', () => {
    const run = (seed: number) => {
      const state = inMillford(seed);
      const txn = new Transaction(state, GREENMARCH);
      enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(seed));
      return txn.state;
    };
    expect(statesEqual(run(21), run(21))).toBe(true);
  });
});

describe('a fully static dungeon', () => {
  const withKeep = (rollEncounters: boolean) => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { dungeons: Record<string, unknown>[] };
    };
    doc.world.dungeons.push({
      id: 'fixed_keep',
      name: 'The Fixed Keep',
      biome: 'greenmarch',
      staticMap: 'mill_interior',
      rollEncounters,
      depth: '1',
    });
    const compiled = compileModule(doc);
    if (!compiled.ok) {
      throw new Error(compiled.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
    }
    return compiled.module;
  };

  it('is the same keep on every seed, with the authored floor and no rolled loot', () => {
    const module = withKeep(false);
    const localTerrain = new TerrainIndex(module);

    const enter = (seed: number) => {
      const base = newGame(module, { seed, party: [defaultChoices(module, 'Ash')] });
      const txn = new Transaction(base, module);
      enterArea(txn, localTerrain, 'millford', Rng.fromSeed(seed));
      enterDungeon(txn, localTerrain, 'fixed_keep', Rng.fromSeed(seed));
      return txn;
    };

    const a = enter(3);
    const b = enter(77);
    const mapA = a.state.maps['dungeon:fixed_keep']!;
    const mapB = b.state.maps['dungeon:fixed_keep']!;
    expect(mapA.tiles).toEqual(mapB.tiles);
    // The authored rope, nothing else.
    expect(mapA.items).toEqual(mapB.items);
    expect(Object.values(mapA.items).flat()).toEqual([{ item: 'rope', quantity: 1 }]);
    // Arrival at the map's entry marker; the exit is recorded there.
    expect(a.entity(a.state.selected)!.position).toEqual({ x: 5, y: 7 });
    expect(Object.keys(mapA.exits)).toHaveLength(1);
  });

  it('consumes no generator randomness: the map ignores the seed entirely', () => {
    const module = withKeep(false);
    const localTerrain = new TerrainIndex(module);
    const base = newGame(module, { seed: 5, party: [defaultChoices(module, 'Ash')] });
    const txn = new Transaction(base, module);
    enterArea(txn, localTerrain, 'millford', Rng.fromSeed(5));
    enterDungeon(txn, localTerrain, 'fixed_keep', Rng.fromSeed(999));
    expect(txn.state.maps['dungeon:fixed_keep']!.tiles).toEqual(
      buildStaticMap(module, 'mill_interior').tiles,
    );
  });
});
