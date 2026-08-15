import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce } from './reduce.js';
import { Transaction } from './rules/apply.js';
import { takeItem, dropItem, equipItem, unequipItem, useItem, giveItem, itemsWithinReach } from './sim/items.js';
import { enterDungeon } from './sim/enter.js';
import { statsOf } from './stats.js';
import { createMap, TerrainIndex, key } from './grid/tiles.js';
import type { GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
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
      traps: {}, rooms: [], depth: 1,
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
      maps: { here: { id: 'here', tiles: createMap(11, 11, 'floor'), kind: 'area', source: 'x', explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1 } },
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
    const { rollLoot, singleScope } = await import('./world/populate.js');

    // The preview's first trial must match a direct draw on the same stream.
    const preview = simulateLoot(GREENMARCH, 'fen_scavenge', veteran, { trials: 1, seed: 5 });
    const direct = rollLoot(GREENMARCH, 'fen_scavenge', singleScope(veteran), Rng.fromSeed(5).derive('trial:0'));

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

/** Put a monster beside the party, on a seed-varied stream. */
function withMonster(
  state: GameState,
  statblock: string,
  at: { x: number; y: number },
  seed: number,
): GameState {
  const monster = spawnMonster(GREENMARCH, 'e:99', statblock);
  return {
    ...state,
    seed,
    rng: Rng.fromSeed(seed).save(),
    entities: {
      ...state.entities,
      'e:99': { ...monster, map: state.currentMap, position: at, disposition: 'hostile' },
    },
  };
}

describe('the weapon in your hand', () => {
  /** A hero wielding one item. */
  function wielding(item: string | null) {
    const state = fresh();
    const hero = state.entities['e:1']!;
    const equipped = item ? { hand: [item] } : {};
    return {
      ...state,
      entities: {
        ...state.entities,
        'e:1': { ...hero, equipped, inventory: item ? [{ item, quantity: 1 }] : [] },
      },
    };
  }

  // `items[].damage` was unread, so a bare `strike` dealt whatever the ability
  // declared however you were armed — swapping a 15-gold iron sword for a
  // 200-gold warded blade changed nothing whatsoever.
  it('decides the damage when the ability declares none', () => {
    const totals = (item: string | null) => {
      let sum = 0;
      for (let seed = 0; seed < 120; seed += 1) {
        const state = withMonster(wielding(item), 'bog_hound', { x: 6, y: 5 }, seed);
        const { events } = reduce(state, { type: 'attack', target: 'e:99' }, ctx);
        for (const event of events) {
          if (event.type === 'damaged' && event.entity === 'e:99') sum += event.raw;
        }
      }
      return sum;
    };

    // 1d8+2 must land harder than 1d8 over a long run.
    expect(totals('warded_blade')).toBeGreaterThan(totals('iron_sword'));
  });

  it('leaves an ability that declares its own damage alone', () => {
    // `strike` carries damage of its own; arming the hero must not double it.
    const state = withMonster(wielding('iron_sword'), 'bog_hound', { x: 6, y: 5 }, 1);
    const { events } = reduce(state, { type: 'useAbility', ability: 'strike', target: 'e:99' }, ctx);
    const hits = events.filter((e) => e.type === 'damaged' && e.entity === 'e:99');
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  it('carries the blade\'s own tags, so a resistance can make an exception', () => {
    // The wight halves slashing `unless` the blow is silvered, and only the
    // warded blade is. That pairing is the whole reason the sword costs 200.
    //
    // Only blows the wight survives are counted: `amount` is the resource
    // change after clamping, so a killing blow always reads lower than `raw`
    // for reasons that have nothing to do with resistance.
    const landed = (item: string) => {
      let raw = 0;
      let taken = 0;
      for (let seed = 0; seed < 200; seed += 1) {
        const state = withMonster(wielding(item), 'barrow_wight', { x: 6, y: 5 }, seed);
        const { state: after, events } = reduce(state, { type: 'attack', target: 'e:99' }, ctx);
        if (!after.entities['e:99']!.alive) continue;

        for (const event of events) {
          if (event.type !== 'damaged' || event.entity !== 'e:99') continue;
          raw += event.raw;
          taken += event.amount;
        }
      }
      return taken / raw;
    };

    // Silver lands in full; ordinary steel lands at about half — "about",
    // because a 1-point blow halves to 1 rather than to nothing.
    expect(landed('warded_blade')).toBe(1);
    expect(landed('iron_sword')).toBeGreaterThan(0.45);
    expect(landed('iron_sword')).toBeLessThan(0.65);
  });

  it('reports what a character is carrying, so a module can build encumbrance', async () => {
    const { buildScope } = await import('./stats.js');
    const state = wielding('iron_sword');
    const scope = buildScope(GREENMARCH, state, state.entities['e:1']);
    // greenmarch's iron sword weighs 3.
    expect((scope['actor'] as { carried: number }).carried).toBe(3);
  });
});
