/**
 * Traps, room descriptions, and depth.
 *
 * The generator placed traps from the first day and `enterDungeon` threw the
 * array away, so `content.traps` was a whole collection — a detect check, a
 * disarm check, effects on both — that could not fire. Greenmarch has declared
 * a `snare` in its biome the entire time.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { reduce } from './reduce.js';
import { Transaction } from './rules/apply.js';
import { enterDungeon } from './sim/enter.js';
import { springTrap, searchForTraps, disarmTrap, reachableTrap } from './sim/traps.js';
import { TerrainIndex, key, unkey } from './grid/tiles.js';
import type { GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const terrain = new TerrainIndex(GREENMARCH);

/** A party standing inside the generated barrow, with the seed that trapped it. */
function inBarrow(seed: number): { state: GameState; txn: Transaction } {
  const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
  const txn = new Transaction(base, GREENMARCH);
  enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(seed));
  return { state: txn.state, txn };
}

/** The first seed whose barrow actually contains a trap. */
function seedWithTrap(): { seed: number; txn: Transaction; tile: number } {
  for (let seed = 1; seed < 80; seed += 1) {
    const { txn } = inBarrow(seed);
    const map = txn.state.maps['dungeon:barrow_depths'];
    const tiles = Object.keys(map?.traps ?? {});
    if (tiles.length > 0) return { seed, txn, tile: Number(tiles[0]) };
  }
  throw new Error('no barrow in 80 seeds had a trap — trapChance cannot be that low');
}

describe('traps exist at all', () => {
  it('installs the traps the generator places instead of discarding them', () => {
    const { txn, tile } = seedWithTrap();
    const map = txn.state.maps['dungeon:barrow_depths']!;
    expect(map.traps[tile]).toMatchObject({ trap: 'snare', state: 'hidden' });
  });

  it('keys them by the packed tile integer, like gates and marks', () => {
    const { txn } = seedWithTrap();
    const map = txn.state.maps['dungeon:barrow_depths']!;
    for (const packed of Object.keys(map.traps)) {
      expect(Number.isInteger(Number(packed))).toBe(true);
      const at = unkey(Number(packed));
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('springing a trap', () => {
  it('runs its effects on whoever stepped on it', () => {
    const { txn, tile } = seedWithTrap();
    const hero = txn.entity(txn.state.selected)!;
    const at = unkey(tile);

    const before = hero.resources['hp']!;
    springTrap(txn, { ...hero, position: at }, Rng.fromSeed(1));

    // greenmarch's snare deals 1d6 piercing to whoever set it off.
    expect(txn.entity(hero.id)!.resources['hp']!).toBeLessThan(before);
    expect(txn.finish().events.some((e) => e.type === 'trapSprung')).toBe(true);
  });

  it('is spent once it has gone off, unless it is reusable', () => {
    const { txn, tile } = seedWithTrap();
    const hero = txn.entity(txn.state.selected)!;
    springTrap(txn, { ...hero, position: unkey(tile) }, Rng.fromSeed(1));

    const map = txn.state.maps['dungeon:barrow_depths']!;
    expect(map.traps[tile]!.state).toBe('sprung');

    // And a spent trap does nothing the second time.
    const hp = txn.entity(hero.id)!.resources['hp']!;
    springTrap(txn, { ...txn.entity(hero.id)!, position: unkey(tile) }, Rng.fromSeed(2));
    expect(txn.entity(hero.id)!.resources['hp']!).toBe(hp);
  });

  it('re-arms a reusable trap, but stops keeping it a secret', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      content: { traps: Record<string, unknown>[] };
    };
    doc.content.traps[0]!['reusable'] = true;
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const { seed, tile } = seedWithTrap();
    const base = newGame(compiled.module, { seed, party: [defaultChoices(compiled.module, 'Ash')] });
    const txn = new Transaction(base, compiled.module);
    enterDungeon(txn, new TerrainIndex(compiled.module), 'barrow_depths', Rng.fromSeed(seed));

    const hero = txn.entity(txn.state.selected)!;
    springTrap(txn, { ...hero, position: unkey(tile) }, Rng.fromSeed(1));
    expect(txn.state.maps['dungeon:barrow_depths']!.traps[tile]!.state).toBe('found');
  });

  it('catches monsters too — the trap does not know who is standing on it', () => {
    const { txn, tile } = seedWithTrap();
    const monster = Object.values(txn.state.entities).find((e) => e.kind === 'monster');
    if (!monster) return;

    const before = monster.resources['hp']!;
    springTrap(txn, { ...monster, position: unkey(tile) }, Rng.fromSeed(1));
    expect(txn.entity(monster.id)!.resources['hp']!).toBeLessThan(before);
  });
});

describe('finding a trap', () => {
  it('stays hidden until somebody searches — there is no passive roll', () => {
    const { txn, tile } = seedWithTrap();
    const hero = txn.entity(txn.state.selected)!;

    // Standing right beside it, doing nothing, reveals nothing.
    txn.putEntity({ ...hero, position: unkey(tile) });
    expect(txn.state.maps['dungeon:barrow_depths']!.traps[tile]!.state).toBe('hidden');
  });

  it('is revealed by searching next to it', () => {
    const { txn, tile } = seedWithTrap();
    const hero = txn.entity(txn.state.selected)!;
    txn.putEntity({ ...hero, position: unkey(tile) });

    // The detect check can fail, so search until it lands.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      searchForTraps(txn, txn.entity(hero.id)!, Rng.fromSeed(attempt));
      if (txn.state.maps['dungeon:barrow_depths']!.traps[tile]!.state === 'found') break;
    }
    expect(txn.state.maps['dungeon:barrow_depths']!.traps[tile]!.state).toBe('found');
    expect(txn.finish().events.some((e) => e.type === 'discovered' && e.kind === 'trap')).toBe(true);
  });

  it('reports nothing in range as nothing to find', () => {
    const { txn } = seedWithTrap();
    const hero = txn.entity(txn.state.selected)!;
    // The far corner of the map, away from anything.
    txn.putEntity({ ...hero, position: { x: 0, y: 0 } });
    expect(searchForTraps(txn, txn.entity(hero.id)!, Rng.fromSeed(1))).toBe(false);
  });
});

describe('disarming', () => {
  /** A trap found and within reach, ready to be worked on. */
  function found(): { txn: Transaction; tile: number } {
    const { txn, tile } = seedWithTrap();
    const hero = txn.entity(txn.state.selected)!;
    txn.putEntity({ ...hero, position: unkey(tile) });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      searchForTraps(txn, txn.entity(hero.id)!, Rng.fromSeed(attempt));
      if (txn.state.maps['dungeon:barrow_depths']!.traps[tile]!.state === 'found') break;
    }
    return { txn, tile };
  }

  it('offers only a trap that has been found and is in reach', () => {
    const { txn, tile } = found();
    expect(reachableTrap(txn, txn.entity(txn.state.selected)!)).toMatchObject({ tile, trap: 'snare' });
  });

  it('takes it apart on a successful check', () => {
    const { txn, tile } = found();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      disarmTrap(txn, txn.entity(txn.state.selected)!, Rng.fromSeed(attempt));
      if (txn.state.maps['dungeon:barrow_depths']!.traps[tile]!.state === 'disarmed') break;
    }
    expect(txn.state.maps['dungeon:barrow_depths']!.traps[tile]!.state).toBe('disarmed');
  });

  it('refuses plainly when there is nothing to work on', () => {
    const { txn } = seedWithTrap();
    const hero = txn.entity(txn.state.selected)!;
    txn.putEntity({ ...hero, position: { x: 0, y: 0 } });

    expect(disarmTrap(txn, txn.entity(hero.id)!, Rng.fromSeed(1))).toBe(false);
    expect(txn.finish().events).toContainEqual(
      expect.objectContaining({ type: 'refused', action: 'disarm' }),
    );
  });
});

describe('how deep a dungeon runs', () => {
  it('rolls the declared depth instead of assuming one', () => {
    // greenmarch's barrow declares `depth: "2"`.
    const { txn } = inBarrow(5);
    expect(txn.state.maps['dungeon:barrow_depths']!.depth).toBe(2);
  });

  it('keeps it, so a return trip finds the same dungeon', () => {
    const { txn } = inBarrow(5);
    const first = txn.state.maps['dungeon:barrow_depths']!.depth;

    // Walk out and back in.
    txn.set({ ...txn.state, location: { kind: 'area', area: 'millford' } });
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(99));
    expect(txn.state.maps['dungeon:barrow_depths']!.depth).toBe(first);
  });
});

describe('a generated room says what it is', () => {
  it('records the rooms it was built from', () => {
    const { txn } = inBarrow(5);
    const map = txn.state.maps['dungeon:barrow_depths']!;
    expect(map.rooms.length).toBeGreaterThan(0);
    expect(map.rooms[0]).toMatchObject({ template: expect.any(String), role: expect.any(String) });
  });

  it('narrates a room the first time the party walks into it', () => {
    // Every greenmarch room template declares `barrow_room`, a required field
    // that was narrated nowhere — so a generated dungeon read as blank ground.
    // Seeds vary in whether any room happens to have a west-side approach, so
    // scan until one does.
    let txn: Transaction | null = null;
    let doorway: { x: number; y: number } | null = null;

    for (let seed = 1; seed < 40 && !doorway; seed += 1) {
      const candidate = inBarrow(seed).txn;
      const map = candidate.state.maps['dungeon:barrow_depths']!;

      const inRoom = (at: { x: number; y: number }) => map.rooms.some((room) =>
        at.x >= room.x && at.x < room.x + room.width
        && at.y >= room.y && at.y < room.y + room.height);

      // A walkable tile outside every room with a room tile due east of it:
      // the step across that line is the one that should introduce the room.
      for (let y = 1; y < map.tiles.height - 1 && !doorway; y += 1) {
        for (let x = 1; x < map.tiles.width - 2; x += 1) {
          const here = { x, y };
          const east = { x: x + 1, y };
          if (inRoom(here) || !inRoom(east)) continue;
          if (!terrain.isPassable(map.tiles, here) || !terrain.isPassable(map.tiles, east)) continue;
          doorway = here;
          txn = candidate;
          break;
        }
      }
    }
    if (!doorway || !txn) throw new Error('no barrow in 40 seeds has a west-approach room');

    const hero = txn.entity(txn.state.selected)!;
    const state: GameState = {
      ...txn.state,
      entities: { ...txn.state.entities, [hero.id]: { ...hero, position: doorway } },
    };

    const { events } = reduce(state, { type: 'step', direction: 'east' }, { module: GREENMARCH });
    expect(events.some((e) => e.type === 'moved')).toBe(true);
    expect(events.some((e) => e.type === 'narrate' && e.textKey === 'barrow_room')).toBe(true);
  });

  it('introduces a room once, not on every step back across the threshold', () => {
    const { txn } = inBarrow(5);
    const map = txn.state.maps['dungeon:barrow_depths']!;
    const room = map.rooms[0]!;
    const hero = txn.entity(txn.state.selected)!;

    const outside = { x: room.x + 1, y: room.y + 1 };
    const seen = `seen:dungeon:barrow_depths:${room.id}`;
    const state: GameState = {
      ...txn.state,
      flags: { ...txn.state.flags, [seen]: true },
      entities: { ...txn.state.entities, [hero.id]: { ...hero, position: outside } },
    };

    const { events } = reduce(state, { type: 'step', direction: 'east' }, { module: GREENMARCH });
    expect(events.some((e) => e.type === 'narrate' && e.textKey === 'barrow_room')).toBe(false);
  });
});

describe('the occasions a trigger can declare', () => {
  // `runTriggers` was only ever called with 'enter', from three places, so
  // seven of the eight occasions were authorable and inert.
  it('fires a rest trigger when the party rests', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { areas: { id: string; triggers?: unknown[] }[] };
    };
    const millford = doc.world.areas.find((a) => a.id === 'millford')!;
    millford.triggers = [
      ...(millford.triggers ?? []),
      { id: 'restless', on: 'rest', mode: 'everyEntry', effects: [{ setFlag: { flag: 'rested_here', value: true } }] },
    ];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const base = newGame(compiled.module, { seed: 3, party: [defaultChoices(compiled.module, 'Ash')] });
    const ctx = { module: compiled.module };
    const arrived = reduce(base, { type: 'travelToArea', area: 'the_fens' }, ctx).state;
    const back = reduce(arrived, { type: 'travelToArea', area: 'millford' }, ctx).state;

    const rests = compiled.module.all<{ id: string }>('rules.rests');
    const rested = reduce(back, { type: 'rest', kind: rests[0]!.id }, ctx).state;
    expect(rested.flags['rested_here']).toBe(true);
  });

  it('fires a timePass trigger as the clock moves', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { areas: { id: string; triggers?: unknown[] }[] };
    };
    const fens = doc.world.areas.find((a) => a.id === 'the_fens')!;
    fens.triggers = [
      ...(fens.triggers ?? []),
      { id: 'fen_stirs', on: 'timePass', mode: 'everyEntry', effects: [{ setFlag: { flag: 'stirred', value: true } }] },
    ];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const base = newGame(compiled.module, { seed: 3, party: [defaultChoices(compiled.module, 'Ash')] });
    const ctx = { module: compiled.module };
    const arrived = reduce(base, { type: 'travelToArea', area: 'the_fens' }, ctx).state;
    const waited = reduce(arrived, { type: 'advanceTime', minutes: 30 }, ctx).state;
    expect(waited.flags['stirred']).toBe(true);
  });

  it('fires a search trigger when the party searches', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { areas: { id: string; triggers?: unknown[] }[] };
    };
    const fens = doc.world.areas.find((a) => a.id === 'the_fens')!;
    fens.triggers = [
      ...(fens.triggers ?? []),
      { id: 'turned_over', on: 'search', mode: 'everyEntry', effects: [{ setFlag: { flag: 'turned_over', value: true } }] },
    ];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const base = newGame(compiled.module, { seed: 3, party: [defaultChoices(compiled.module, 'Ash')] });
    const ctx = { module: compiled.module };
    const arrived = reduce(base, { type: 'travelToArea', area: 'the_fens' }, ctx).state;
    const searched = reduce(arrived, { type: 'search' }, ctx).state;
    expect(searched.flags['turned_over']).toBe(true);
  });
});

describe('a trap on the map is only drawn once it is known', () => {
  it('never reports a hidden trap through the view model', async () => {
    const { mapView } = await import('../../play/src/views/map.js');
    const { txn, tile } = seedWithTrap();

    const view = mapView(GREENMARCH, txn.state, terrain, { viewport: { width: 80, height: 40 } });
    const cell = view?.cells.find((c) => key({ x: c.x, y: c.y }) === tile);
    expect(cell?.trap ?? null).toBeNull();
  });
});
