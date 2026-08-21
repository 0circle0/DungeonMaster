/** What the dead leave behind, and who is allowed to find it. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule, Scope } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce } from './reduce.js';
import { narrateEvent } from './narrate/narrate.js';
import { rollLoot, singleScope } from './world/populate.js';
import { createMap } from './grid/tiles.js';
import type { GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const ctx = { module: GREENMARCH };

/** The party on an open map with one hound standing next to them, nearly dead. */
function arena(seed = 3, houndHp = 1): GameState {
  const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
  const hero = base.entities[base.party[0]!]!;
  const hound = spawnMonster(GREENMARCH, 'e:99', 'bog_hound');

  return {
    ...base,
    currentMap: 'here',
    maps: {
      here: {
        id: 'here', tiles: createMap(11, 11, 'floor'), kind: 'area', source: 'millford',
        explored: [], gates: {}, exits: {}, items: {}, marks: {},
      traps: {}, rooms: [], depth: 1,
      },
    },
    entities: {
      ...base.entities,
      [hero.id]: { ...hero, map: 'here', position: { x: 5, y: 5 } },
      'e:99': {
        ...hound, map: 'here', position: { x: 6, y: 5 },
        disposition: 'hostile', resources: { ...hound.resources, hp: houndHp },
      },
    },
  };
}

/** Every item lying on the floor of a map, flattened. */
function floorItems(state: GameState, mapId = 'here'): string[] {
  return Object.values(state.maps[mapId]?.items ?? {})
    .flat()
    .map((stack) => stack.item);
}

describe('loot on death', () => {
  it('drops what the creature was carrying, onto the ground where it fell', () => {
    let dropped = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      const { state } = reduce(arena(seed), { type: 'attack', target: 'e:99' }, ctx);
      if (!state.entities['e:99']!.alive && floorItems(state).length > 0) dropped += 1;
    }
    expect(dropped).toBeGreaterThan(0);
  });

  it('says so, so the drop is not silent', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const state = arena(seed);
      const { state: after, events } = reduce(state, { type: 'attack', target: 'e:99' }, ctx);
      const drop = events.find((event) => event.type === 'droppedLoot');
      if (!drop) continue;

      expect(drop).toMatchObject({ from: 'e:99' });

      // And it reaches the transcript in words, not just the event stream.
      const line = narrateEvent({ module: GREENMARCH, state: after, seed: 1 }, drop);
      expect(line?.text).toMatch(/Bog Hound leaves .+ behind\./);
      return;
    }
    throw new Error('no drop across 30 seeds — the table cannot be that empty');
  });

  it('leaves nothing behind for a creature that declares no table', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      content: { monsters: Record<string, unknown>[] };
    };
    for (const monster of doc.content.monsters) delete monster['loot'];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    for (let seed = 0; seed < 10; seed += 1) {
      const { state } = reduce(arena(seed), { type: 'attack', target: 'e:99' }, { module: compiled.module });
      expect(floorItems(state)).toEqual([]);
    }
  });
});

describe('who a loot gate is asked about', () => {
  const member = (level: number, lore: number): Scope => ({
    actor: {
      level, class: 'warden', ancestry: 'human', abilities: [],
      attr: {}, mod: {}, skills: { lore }, inventory: {}, equippedItems: {}, conditions: {},
    },
    quests: { the_mill_door: { status: 'complete', objectives: {} } },
    flags: {}, reputation: {}, tiers: {}, ranks: {}, world: { day: 1 },
  });

  const draw = (scopes: Parameters<typeof rollLoot>[2], seeds = 200): Set<string> => {
    const seen = new Set<string>();
    for (let seed = 0; seed < seeds; seed += 1) {
      for (const got of rollLoot(GREENMARCH, 'fen_scavenge', scopes, Rng.fromSeed(seed))) {
        seen.add(got.item);
      }
    }
    return seen;
  };

  it('lets one qualifying member open an anyMember entry', () => {
    const illiterate = { finder: member(3, 0), members: [member(3, 0), member(3, 0)] };
    const withReader = { finder: member(3, 0), members: [member(3, 0), member(3, 2)] };

    expect(draw(illiterate).has('rune_tablet')).toBe(false);
    expect(draw(withReader).has('rune_tablet')).toBe(true);
  });

  it('requires every member for a party entry', () => {
    const oneBehind = { finder: member(3, 2), members: [member(3, 2), member(1, 2)] };
    const allProven = { finder: member(3, 2), members: [member(3, 2), member(3, 2)] };

    expect(draw(oneBehind).has('warded_blade')).toBe(false);
    expect(draw(allProven).has('warded_blade')).toBe(true);
  });

  it('asks only the finder for a finder entry', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      content: { lootTables: { id: string; entries: { value: Record<string, unknown> }[] }[] };
    };
    const table = doc.content.lootTables.find((t) => t.id === 'fen_scavenge')!;
    const tablet = table.entries.find((e) => e.value['item'] === 'rune_tablet')!;
    tablet.value['requirementScope'] = 'finder';
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const scan = (scopes: Parameters<typeof rollLoot>[2]) => {
      const seen = new Set<string>();
      for (let seed = 0; seed < 200; seed += 1) {
        for (const got of rollLoot(compiled.module, 'fen_scavenge', scopes, Rng.fromSeed(seed))) {
          seen.add(got.item);
        }
      }
      return seen;
    };

    // A reader in the party is no longer enough — the finder must be the reader.
    expect(scan({ finder: member(3, 0), members: [member(3, 0), member(3, 2)] }).has('rune_tablet')).toBe(false);
    expect(scan({ finder: member(3, 2), members: [member(3, 2), member(3, 0)] }).has('rune_tablet')).toBe(true);
  });
});

describe('unique loot', () => {
  const proven = (flags: Record<string, boolean>): Scope => ({
    actor: {
      level: 3, class: 'warden', ancestry: 'human', abilities: [],
      attr: {}, mod: {}, skills: { lore: 2 }, inventory: {}, equippedItems: {}, conditions: {},
    },
    quests: { the_mill_door: { status: 'complete', objectives: {} } },
    flags, reputation: {}, tiers: {}, ranks: {}, world: { day: 1 },
  });

  it('drops at most once, and reports that it did', () => {
    let flagged = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      for (const got of rollLoot(GREENMARCH, 'fen_scavenge', singleScope(proven({})), Rng.fromSeed(seed))) {
        if (got.item === 'warded_blade') {
          expect(got.unique).toBe(true);
          expect(got.quantity).toBe(1);
          flagged += 1;
        }
      }
    }
    expect(flagged).toBeGreaterThan(0);
  });

  it('is gone from the table once the save records it', () => {
    const already = singleScope(proven({ 'unique:warded_blade': true }));
    for (let seed = 0; seed < 200; seed += 1) {
      for (const got of rollLoot(GREENMARCH, 'fen_scavenge', already, Rng.fromSeed(seed))) {
        expect(got.item).not.toBe('warded_blade');
      }
    }
  });

  it('leaves the remaining odds intact rather than swallowing a draw', () => {
    const open = singleScope(proven({}));
    const spent = singleScope(proven({ 'unique:warded_blade': true }));

    const count = (scopes: Parameters<typeof rollLoot>[2]) => {
      let items = 0;
      for (let seed = 0; seed < 400; seed += 1) {
        items += rollLoot(GREENMARCH, 'fen_scavenge', scopes, Rng.fromSeed(seed)).length;
      }
      return items;
    };

    expect(count(spent)).toBeGreaterThanOrEqual(count(open) - 20);
  });
});

describe('a scavenging skill', () => {
  it('earns extra draws on a success', () => {
    const scope: Scope = {
      actor: {
        level: 1, class: 'warden', ancestry: 'human', abilities: [],
        attr: {}, mod: {}, skills: {}, inventory: {}, equippedItems: {}, conditions: {},
      },
      quests: {}, flags: {}, reputation: {}, tiers: {}, ranks: {}, world: { day: 1 },
    };

    let plain = 0;
    let bonus = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      plain += rollLoot(GREENMARCH, 'fen_scavenge', singleScope(scope), Rng.fromSeed(seed)).length;
      bonus += rollLoot(
        GREENMARCH, 'fen_scavenge', singleScope(scope), Rng.fromSeed(seed), { bonusRolls: 1 },
      ).length;
    }
    expect(bonus).toBeGreaterThan(plain);
  });
});

describe('a place with its own loot', () => {
  it('yields it once, on the first visit', () => {
    const base = newGame(GREENMARCH, { seed: 5, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const hero = base.entities[base.party[0]!]!;
    const keyed: GameState = {
      ...base,
      entities: {
        ...base.entities,
        [hero.id]: { ...hero, inventory: [...hero.inventory, { item: 'brass_key', quantity: 1 }] },
      },
    };

    const out = reduce(keyed, { type: 'travelToArea', area: 'the_fens' }, ctx).state;
    const first = reduce(out, { type: 'travelToArea', area: 'millford' }, ctx).state;
    expect(first.currentMap).not.toBe('');

    const entered = reduce(first, { type: 'enter', target: 'the_mill' }, ctx).state;
    expect(entered.location).toMatchObject({ kind: 'poi', poi: 'the_mill' });

    const map = entered.currentMap;
    expect(floorItems(entered, map)).toContain('millers_ledger');
    expect(entered.flags['looted:the_mill']).toBe(true);

    // Walking back in does not restock it.
    const again = reduce(entered, { type: 'enter', target: 'the_mill' }, ctx).state;
    expect(floorItems(again, map).filter((item) => item === 'millers_ledger')).toHaveLength(1);
  });
});
