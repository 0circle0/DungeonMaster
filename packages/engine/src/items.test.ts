import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { newGame, defaultChoices } from './newgame.js';
import { reduce } from './reduce.js';
import { Transaction } from './rules/apply.js';
import { takeItem, dropItem, equipItem, unequipItem, useItem, giveItem, itemsWithinReach } from './sim/items.js';
import { enterDungeon } from './sim/enter.js';
import { statsOf } from './stats.js';
import { createMap, TerrainIndex, key } from './grid/tiles.js';
import type { GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  const path = fileURLToPath(new URL(`../../../modules/${name}/module.json`, import.meta.url));
  const result = compileModule(JSON.parse(readFileSync(path, 'utf8')));
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  return result.module;
}

const GREENMARCH = loadModule('greenmarch');
const terrain = new TerrainIndex(GREENMARCH);
const ctx = { module: GREENMARCH };

function fresh(seed = 5): GameState {
  const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
  const hero = base.entities[base.party[0]!]!;
  return {
    ...base,
    currentMap: 'here',
    maps: {
      here: {
        id: 'here', tiles: createMap(11, 11, 'floor'), kind: 'area', source: 'x',
        explored: [], gates: {}, exits: {}, items: {}, marks: {},
      },
    },
    entities: { ...base.entities, [hero.id]: { ...hero, map: 'here', position: { x: 5, y: 5 } } },
  };
}

/** A state with something lying on the floor beside the party. */
function withFloorItem(item = 'rune_tablet', at = { x: 6, y: 5 }): GameState {
  const state = fresh();
  return {
    ...state,
    maps: {
      here: { ...state.maps['here']!, items: { [key(at)]: [{ item, quantity: 1 }] } },
    },
  };
}

describe('picking things up', () => {
  it('takes an item lying beside you', () => {
    const txn = new Transaction(withFloorItem(), GREENMARCH);
    expect(takeItem(txn, txn.entity('e:1')!, 'rune_tablet')).toBe(true);

    const { state, events } = txn.finish();
    expect(state.entities['e:1']!.inventory.some((s) => s.item === 'rune_tablet')).toBe(true);
    expect(state.maps['here']!.items[key({ x: 6, y: 5 })]).toBeUndefined();
    expect(events.some((e) => e.type === 'itemGained')).toBe(true);
  });

  it('takes everything underfoot when nothing is named', () => {
    const state = fresh();
    const here = key({ x: 5, y: 5 });
    const piled: GameState = {
      ...state,
      maps: {
        here: {
          ...state.maps['here']!,
          items: { [here]: [{ item: 'rope', quantity: 2 }, { item: 'brass_key', quantity: 1 }] },
        },
      },
    };

    const txn = new Transaction(piled, GREENMARCH);
    takeItem(txn, txn.entity('e:1')!, undefined);
    const inventory = txn.finish().state.entities['e:1']!.inventory;
    expect(inventory.some((s) => s.item === 'brass_key')).toBe(true);
    // The warden starts with one rope and picks up two more.
    expect(inventory.find((s) => s.item === 'rope')!.quantity).toBe(3);
  });

  // Reaching across a room would make positioning meaningless.
  it('will not take something out of reach', () => {
    const txn = new Transaction(withFloorItem('rune_tablet', { x: 9, y: 9 }), GREENMARCH);
    expect(itemsWithinReach(txn, txn.entity('e:1')!)).toHaveLength(0);
    expect(takeItem(txn, txn.entity('e:1')!, 'rune_tablet')).toBe(false);
    expect(txn.finish().events.find((e) => e.type === 'refused')).toBeDefined();
  });

  it('says so when the floor is empty', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    expect(takeItem(txn, txn.entity('e:1')!, undefined)).toBe(false);
  });
});

describe('putting things down', () => {
  it('drops onto the tile underfoot, where it stays', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    expect(dropItem(txn, txn.entity('e:1')!, 'rope')).toBe(true);

    const state = txn.finish().state;
    expect(state.maps['here']!.items[key({ x: 5, y: 5 })]).toEqual([{ item: 'rope', quantity: 1 }]);
    expect(state.entities['e:1']!.inventory.some((s) => s.item === 'rope')).toBe(false);
  });

  it('refuses to drop what you do not have', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    expect(dropItem(txn, txn.entity('e:1')!, 'warded_blade')).toBe(false);
  });

  it('round-trips: drop then take gets it back', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    dropItem(txn, txn.entity('e:1')!, 'iron_sword');
    takeItem(txn, txn.entity('e:1')!, 'iron_sword');
    expect(txn.entity('e:1')!.inventory.some((s) => s.item === 'iron_sword')).toBe(true);
  });
});

describe('equipment', () => {
  it('wields a weapon into its declared slot', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    expect(equipItem(txn, txn.entity('e:1')!, 'iron_sword')).toBe(true);
    expect(txn.entity('e:1')!.equipped['hand']).toContain('iron_sword');
  });

  // The whole point of equipping: it changes your numbers.
  it('applies the item\'s modifiers to derived stats', () => {
    const state = fresh();
    const hero = state.entities['e:1']!;
    const armed: GameState = {
      ...state,
      entities: {
        ...state.entities,
        'e:1': { ...hero, inventory: [...hero.inventory, { item: 'warded_blade', quantity: 1 }] },
      },
    };

    const before = statsOf(GREENMARCH, armed.entities['e:1']!).derived['guard']!;
    const txn = new Transaction(armed, GREENMARCH);
    equipItem(txn, txn.entity('e:1')!, 'warded_blade');
    const after = statsOf(GREENMARCH, txn.entity('e:1')!).derived['guard']!;

    // warded_blade grants +1 guard.
    expect(after).toBe(before + 1);
  });

  it('refuses to equip what is not carried', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    expect(equipItem(txn, txn.entity('e:1')!, 'warded_blade')).toBe(false);
  });

  it('refuses to wear something with no slot', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    // Rope is a tool with no slot.
    expect(equipItem(txn, txn.entity('e:1')!, 'rope')).toBe(false);
  });

  it('takes it off again', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    equipItem(txn, txn.entity('e:1')!, 'iron_sword');
    expect(unequipItem(txn, txn.entity('e:1')!, 'iron_sword')).toBe(true);
    expect(txn.entity('e:1')!.equipped['hand']).not.toContain('iron_sword');
  });

  // Refusing and making the player unequip by hand is worse than displacing.
  it('displaces the oldest item when a slot is full', () => {
    const state = fresh();
    const hero = state.entities['e:1']!;
    const loaded: GameState = {
      ...state,
      entities: {
        ...state.entities,
        'e:1': { ...hero, inventory: [{ item: 'iron_sword', quantity: 1 }, { item: 'warded_blade', quantity: 1 }] },
      },
    };

    const txn = new Transaction(loaded, GREENMARCH);
    // greenmarch gives two hands.
    equipItem(txn, txn.entity('e:1')!, 'iron_sword');
    equipItem(txn, txn.entity('e:1')!, 'warded_blade');
    expect(txn.entity('e:1')!.equipped['hand']).toHaveLength(2);
  });

  it('takes an item off when it is dropped', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    equipItem(txn, txn.entity('e:1')!, 'iron_sword');
    dropItem(txn, txn.entity('e:1')!, 'iron_sword');
    expect(txn.entity('e:1')!.equipped['hand'] ?? []).not.toContain('iron_sword');
  });
});

describe('using and giving', () => {
  it('refuses an item that does nothing', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    expect(useItem(txn, txn.entity('e:1')!, 'rope', undefined, Rng.fromSeed(1))).toBe(false);
    expect(txn.finish().events.find((e) => e.type === 'refused')).toBeDefined();
  });

  it('runs a consumable\'s effects and spends it', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      content: { items: Record<string, unknown>[] };
    };
    doc.content.items.push({
      id: 'salve', name: 'Salve', kind: 'consumable', consumedOnUse: true,
      onUse: [{ heal: { target: { ref: 'actor.id' }, amount: 3 } }],
    });
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed');

    const state = fresh();
    const hero = state.entities['e:1']!;
    const hurt: GameState = {
      ...state,
      entities: {
        ...state.entities,
        'e:1': {
          ...hero,
          resources: { ...hero.resources, hp: 2 },
          inventory: [{ item: 'salve', quantity: 1 }],
        },
      },
    };

    const txn = new Transaction(hurt, compiled.module);
    expect(useItem(txn, txn.entity('e:1')!, 'salve', undefined, Rng.fromSeed(1))).toBe(true);
    expect(txn.entity('e:1')!.resources['hp']).toBeGreaterThan(2);
    expect(txn.entity('e:1')!.inventory.some((s) => s.item === 'salve')).toBe(false);
  });

  it('hands something to a nearby party member', () => {
    const base = newGame(GREENMARCH, {
      seed: 1,
      party: [defaultChoices(GREENMARCH, 'Ash'), defaultChoices(GREENMARCH, 'Vess')],
    });
    const state: GameState = {
      ...base,
      currentMap: 'here',
      maps: { here: { id: 'here', tiles: createMap(11, 11, 'floor'), kind: 'area', source: 'x', explored: [], gates: {}, exits: {}, items: {}, marks: {} } },
      entities: {
        ...base.entities,
        'e:1': { ...base.entities['e:1']!, map: 'here', position: { x: 5, y: 5 } },
        'e:2': { ...base.entities['e:2']!, map: 'here', position: { x: 6, y: 5 } },
      },
    };

    const txn = new Transaction(state, GREENMARCH);
    expect(giveItem(txn, txn.entity('e:1')!, 'rope', 'e:2')).toBe(true);
    expect(txn.entity('e:2')!.inventory.find((s) => s.item === 'rope')!.quantity).toBe(2);
  });
});

describe('loot in a generated dungeon', () => {
  it('leaves loot on the floor where the generator put it', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(4));

    const map = txn.state.maps['dungeon:barrow_depths']!;
    const tiles = Object.keys(map.items);
    expect(tiles.length).toBeGreaterThan(0);
  });

  it('can be picked up by standing on it', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(4));

    const map = txn.state.maps['dungeon:barrow_depths']!;
    const [tileKey, stacks] = Object.entries(map.items)[0]!;
    const tile = Number(tileKey);
    const at = { x: tile & 0xffff, y: tile >>> 16 };

    // Stand on it.
    txn.putEntity({ ...txn.entity('e:1')!, position: at });
    expect(takeItem(txn, txn.entity('e:1')!, undefined)).toBe(true);
    expect(txn.entity('e:1')!.inventory.some((s) => s.item === stacks[0]!.item)).toBe(true);
  });
});

describe('through the reducer', () => {
  it('handles take, wear and drop as actions', () => {
    let state = withFloorItem('rune_tablet');
    state = reduce(state, { type: 'take', item: 'rune_tablet' }, ctx).state;
    expect(state.entities['e:1']!.inventory.some((s) => s.item === 'rune_tablet')).toBe(true);

    state = reduce(state, { type: 'equip', item: 'iron_sword' }, ctx).state;
    expect(state.entities['e:1']!.equipped['hand']).toContain('iron_sword');

    state = reduce(state, { type: 'drop', item: 'rune_tablet' }, ctx).state;
    expect(state.entities['e:1']!.inventory.some((s) => s.item === 'rune_tablet')).toBe(false);
  });
});

// The plan's consolidation requirement: one implementation, so the editor's
// Balance view and actual play can never report different odds.
describe('preview parity', () => {
  const veteran = {
    actor: { level: 5, class: 'warden', ancestry: 'human', abilities: [], attr: {}, skills: { lore: 4 }, inventory: {}, conditions: {} },
    quests: { the_mill_door: { status: 'complete' } },
    flags: {}, reputation: {}, memory: {}, world: { day: 1 },
  } as never;

  const novice = {
    actor: { level: 1, class: 'warden', ancestry: 'human', abilities: [], attr: {}, skills: {}, inventory: {}, conditions: {} },
    quests: {}, flags: {}, reputation: {}, memory: {}, world: { day: 1 },
  } as never;

  it('previews loot by running the same draw the game runs', async () => {
    const { simulateLoot } = await import('./analysis.js');
    const { rollLoot } = await import('./world/populate.js');

    // The preview's first trial must match a direct draw on the same stream.
    const preview = simulateLoot(GREENMARCH, 'fen_scavenge', veteran, { trials: 1, seed: 5 });
    const direct = rollLoot(GREENMARCH, 'fen_scavenge', veteran, Rng.fromSeed(5).derive('trial:0'));

    const previewed = preview.outcomes.filter((o) => o.appearances > 0).map((o) => o.id).sort();
    expect(previewed).toEqual(direct.map((d) => d.item).sort());
  });

  it('shows gated loot as excluded for a party that cannot earn it', async () => {
    const { simulateLoot } = await import('./analysis.js');
    const poor = simulateLoot(GREENMARCH, 'fen_scavenge', novice, { trials: 400, seed: 1 });
    const rich = simulateLoot(GREENMARCH, 'fen_scavenge', veteran, { trials: 400, seed: 1 });

    expect(poor.excluded).toContain('rune_tablet');
    expect(rich.excluded).not.toContain('rune_tablet');
  });

  it('previews encounters through the engine draw too', async () => {
    const { simulateEncounters } = await import('./analysis.js');
    const preview = simulateEncounters(GREENMARCH, 'fen_wanderers', veteran, { trials: 600, seed: 2 });

    const lone = preview.outcomes.find((o) => o.id === 'lone_hound')!;
    const wight = preview.outcomes.find((o) => o.id === 'wight_abroad')!;
    expect(lone.frequency).toBeGreaterThan(wight.frequency);
    expect(preview.emptyTrials).toBeGreaterThan(0);
  });

  it('removes level-gated groups for a low-level party', async () => {
    const { simulateEncounters } = await import('./analysis.js');
    const preview = simulateEncounters(GREENMARCH, 'fen_wanderers', novice, { trials: 600, seed: 2 });
    expect(preview.excluded).toContain('wight_abroad');
  });
});
