/** Money, and what it is for. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { reduce } from './reduce.js';
import { Transaction } from './rules/apply.js';
import { spawnNpc } from './character.js';
import { shopStock, sellable, shopBarred, priceOf, shopOf } from './sim/trade.js';
import { createMap } from './grid/tiles.js';
import type { GameState } from './state.js';
import { render } from './narrate/systemText.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');
const ctx = { module: GREENMARCH };

/** The party standing at Vess's counter, with the Wardens' good opinion. */
function atTheCounter(standing = 10, purse = 25): GameState {
  const base = newGame(GREENMARCH, { seed: 4, party: [defaultChoices(GREENMARCH, 'Ash')] });
  const hero = base.entities[base.party[0]!]!;
  const vess = spawnNpc(GREENMARCH, 'vess');

  return {
    ...base,
    purse,
    reputation: { ...base.reputation, wardens: standing },
    currentMap: 'here',
    maps: {
      here: {
        id: 'here', tiles: createMap(11, 11, 'floor'), kind: 'area', source: 'millford',
        explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1,
      },
    },
    entities: {
      ...base.entities,
      [hero.id]: { ...hero, map: 'here', position: { x: 5, y: 5 } },
      vess: { ...vess, map: 'here', position: { x: 6, y: 5 } },
    },
  };
}

const read = (state: GameState) => new Transaction(state, GREENMARCH);

describe('a purse', () => {
  it('starts at whatever the module says', () => {
    const fresh = newGame(GREENMARCH, { seed: 1, party: [defaultChoices(GREENMARCH, 'Ash')] });
    expect(fresh.purse).toBe(25);
  });

  it('stays at zero in a module that never mentions money', () => {
    const fresh = newGame(MINIMAL, { seed: 1, party: [defaultChoices(MINIMAL, 'Ash')] });
    expect(fresh.purse).toBe(0);
  });
});

describe('a shopkeeper', () => {
  it('has a shelf that is a pure function of seed, day and party', () => {
    const state = atTheCounter();
    const once = shopStock(read(state), 'vess');
    const again = shopStock(read(state), 'vess');
    expect(once).toEqual(again);
    expect(once.length).toBeGreaterThan(0);
  });

  it('restocks when the day turns, without storing anything', () => {
    const today = atTheCounter();
    const tomorrow: GameState = { ...today, minute: today.minute + 1440 };

    const rolls = new Set<string>();
    for (let day = 0; day < 8; day += 1) {
      const state: GameState = { ...today, minute: today.minute + day * 1440 };
      rolls.add(shopStock(read(state), 'vess').map((e) => `${e.item}x${e.quantity}`).join(','));
    }
    expect(rolls.size).toBeGreaterThan(1);
    expect(shopStock(read(tomorrow), 'vess')).not.toBeUndefined();
  });

  it('prices by the module\'s own multiplier, in both directions', () => {
    const shop = shopOf(read(atTheCounter()), 'vess')!;
    // greenmarch's Vess takes 1.2×; rope is worth 3.
    expect(priceOf(GREENMARCH, 'rope', shop)).toEqual({ buy: 4, sell: 2 });
  });

  it('will not sell a thing with no value — that is a quest object', () => {
    const stock = shopStock(read(atTheCounter()), 'vess');
    expect(stock.some((entry) => entry.item === 'brass_key')).toBe(false);
  });

  it('says why it will not deal with you, rather than shrugging', () => {
    // Vess wants the Wardens to vouch for you: standing 5.
    const cold = shopBarred(read(atTheCounter(0)), 'vess', atTheCounter(0).entities['e:1']!, Rng.fromSeed(1));
    expect(cold.barred).toBe(true);
    expect(cold.requires.map((need) => render(GREENMARCH, need)).join(' ')).toMatch(/warden/i);

    const warm = shopBarred(read(atTheCounter(10)), 'vess', atTheCounter(10).entities['e:1']!, Rng.fromSeed(1));
    expect(warm.barred).toBe(false);
  });

  it('takes only what it deals in', () => {
    const state = atTheCounter();
    const hero = state.entities['e:1']!;
    const carrying: GameState = {
      ...state,
      entities: {
        ...state.entities,
        'e:1': {
          ...hero,
          inventory: [{ item: 'rune_tablet', quantity: 1 }, { item: 'rope', quantity: 2 }],
        },
      },
    };

    // She buys `treasure`; rope is a tool.
    const offers = sellable(read(carrying), 'vess', carrying.entities['e:1']!);
    expect(offers.map((entry) => entry.item)).toEqual(['rune_tablet']);
  });
});

describe('buying', () => {
  it('moves the coin and the goods', () => {
    const state = atTheCounter();
    const entry = shopStock(read(state), 'vess')[0]!;

    const { state: after, events } = reduce(
      state, { type: 'buy', npc: 'vess', item: entry.item }, ctx,
    );

    expect(after.purse).toBe(state.purse - entry.price);
    expect(after.entities['e:1']!.inventory.some((s) => s.item === entry.item)).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'traded', bought: true }));
  });

  it('takes the thing off the shelf, without storing a shelf', () => {
    const state = atTheCounter();
    const entry = shopStock(read(state), 'vess').find((e) => e.quantity === 1);
    if (!entry) return;

    const { state: after } = reduce(state, { type: 'buy', npc: 'vess', item: entry.item }, ctx);
    expect(shopStock(read(after), 'vess').some((e) => e.item === entry.item)).toBe(false);
  });

  it('refuses what you cannot afford, and says so', () => {
    const state = atTheCounter(10, 0);
    const entry = shopStock(read(state), 'vess')[0]!;

    const { state: after, events } = reduce(
      state, { type: 'buy', npc: 'vess', item: entry.item }, ctx,
    );
    expect(after.purse).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'refused', reason: { key: 'refused.buy.tooExpensive' } }),
    );
  });

  it('refuses a customer the shopkeeper will not serve', () => {
    const state = atTheCounter(0);
    const { events } = reduce(state, { type: 'buy', npc: 'vess', item: 'rope' }, ctx);
    const refusal = events.find((e) => e.type === 'refused');
    expect(refusal).toBeDefined();
    if (refusal?.type === 'refused') expect(refusal.reason).toMatchObject({ key: 'refused.trade.barred' });
  });
});

describe('selling', () => {
  it('moves the coin the other way', () => {
    const base = atTheCounter();
    const hero = base.entities['e:1']!;
    const state: GameState = {
      ...base,
      entities: { ...base.entities, 'e:1': { ...hero, inventory: [{ item: 'rune_tablet', quantity: 1 }] } },
    };

    const { state: after, events } = reduce(
      state, { type: 'sell', npc: 'vess', item: 'rune_tablet' }, ctx,
    );

    // 60 at 1.2× sells for 50.
    expect(after.purse).toBe(state.purse + 50);
    expect(after.entities['e:1']!.inventory.some((s) => s.item === 'rune_tablet')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'traded', bought: false }));
  });

  it('refuses what they have no use for', () => {
    const base = atTheCounter();
    const hero = base.entities['e:1']!;
    const state: GameState = {
      ...base,
      entities: { ...base.entities, 'e:1': { ...hero, inventory: [{ item: 'rope', quantity: 1 }] } },
    };

    const { events } = reduce(state, { type: 'sell', npc: 'vess', item: 'rope' }, ctx);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'refused', reason: { key: 'refused.sell.unwanted' } }),
    );
  });
});

describe('a toll', () => {
  // `gate.kind: 'toll'` was a word.
  it('opens for coin, and takes it', () => {
    const base = newGame(GREENMARCH, { seed: 4, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const { state: after, events } = reduce(base, { type: 'travelToArea', area: 'the_fens' }, ctx);

    expect(events.some((e) => e.type === 'gateOpened' && e.gate === 'ferry_toll')).toBe(true);
    expect(after.purse).toBe(15);
    expect(after.location).toMatchObject({ kind: 'area', area: 'the_fens' });
  });

  it('turns away a party that cannot pay, and names the price', () => {
    const base = newGame(GREENMARCH, { seed: 4, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const broke: GameState = { ...base, purse: 3 };

    const { state: after, events } = reduce(broke, { type: 'travelToArea', area: 'the_fens' }, ctx);
    const blocked = events.find((e) => e.type === 'gateBlocked');
    expect(blocked).toBeDefined();
    if (blocked?.type === 'gateBlocked') expect(blocked.missing.map((need) => render(GREENMARCH, need)).join(' ')).toMatch(/marks/);
    expect(after.location).toMatchObject({ area: 'millford' });
  });

  it('charges again on the way back', () => {
    const base = newGame(GREENMARCH, { seed: 4, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const out = reduce(base, { type: 'travelToArea', area: 'the_fens' }, ctx).state;
    const back = reduce(out, { type: 'travelToArea', area: 'millford' }, ctx).state;
    const again = reduce(back, { type: 'travelToArea', area: 'the_fens' }, ctx);

    expect(again.events.some((e) => e.type === 'gateOpened' && e.gate === 'ferry_toll')).toBe(true);
    expect(again.state.purse).toBe(5);
  });
});
