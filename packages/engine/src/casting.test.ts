/**
 * Casting.
 *
 * `rules.spellcasting` described slots, a points pool, concentration with its
 * save, rituals, upcasting and components — and not one field of it was read,
 * so a module that declared a wizard got a fighter whose abilities happened to
 * cost focus.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce } from './reduce.js';
import { Transaction, adjustResource } from './rules/apply.js';
import {
  slotsFor, slotsLeft, slotForSpell, saveDifficultyOf, attackBonusOf, recoverSlots,
} from './rules/casting.js';
import { createMap } from './grid/tiles.js';
import type { GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');
const ctx = { module: GREENMARCH };

/** A fenwise caster on an open map, with something to point at. */
function caster(level = 1, seed = 4): GameState {
  const choices = { ...defaultChoices(GREENMARCH, 'Ash'), characterClass: 'fenwise' };
  const base = newGame(GREENMARCH, { seed, party: [choices] });
  const hero = base.entities[base.party[0]!]!;
  const hound = spawnMonster(GREENMARCH, 'e:99', 'bog_hound');

  return {
    ...base,
    currentMap: 'here',
    maps: {
      here: {
        id: 'here', tiles: createMap(11, 11, 'floor'), kind: 'area', source: 'millford',
        explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1,
      },
    },
    entities: {
      ...base.entities,
      [hero.id]: { ...hero, level, map: 'here', position: { x: 5, y: 5 } },
      'e:99': { ...hound, map: 'here', position: { x: 7, y: 5 }, disposition: 'hostile' },
    },
  };
}

describe('slots', () => {
  it('come from the module\'s own table, scaled by the class', () => {
    const state = caster(1);
    // greenmarch: one first-level slot pair at caster level 1.
    expect(slotsFor(GREENMARCH, state.entities['e:1']!)).toEqual([2]);
    expect(slotsFor(GREENMARCH, { ...state.entities['e:1']!, level: 3 })).toEqual([4, 2]);
  });

  it('are none at all for a class that does not cast', () => {
    const base = newGame(GREENMARCH, { seed: 1, party: [defaultChoices(GREENMARCH, 'Ash')] });
    expect(slotsFor(GREENMARCH, base.entities[base.party[0]!]!)).toEqual([]);
  });

  it('are none at all in a module with no casting', () => {
    const base = newGame(MINIMAL, { seed: 1, party: [defaultChoices(MINIMAL, 'Ash')] });
    expect(slotsFor(MINIMAL, base.entities[base.party[0]!]!)).toEqual([]);
  });

  it('are spent by casting, and run out', () => {
    // Alone, so the refusal that lands is the empty slot rather than the action
    // budget of a fight that started when the hound noticed us.
    const armed = caster(1);
    let state: GameState = {
      ...armed,
      entities: Object.fromEntries(Object.entries(armed.entities).filter(([id]) => id !== 'e:99')),
    };
    expect(slotsLeft(GREENMARCH, state.entities['e:1']!)).toEqual([2]);

    state = reduce(state, { type: 'useAbility', ability: 'wardlight' }, ctx).state;
    expect(slotsLeft(GREENMARCH, state.entities['e:1']!)).toEqual([1]);

    state = reduce(state, { type: 'useAbility', ability: 'wardlight' }, ctx).state;
    expect(slotsLeft(GREENMARCH, state.entities['e:1']!)).toEqual([0]);

    const dry = reduce(state, { type: 'useAbility', ability: 'wardlight' }, ctx);
    const refusal = dry.events.find((e) => e.type === 'refused');
    expect(refusal).toBeDefined();
    if (refusal?.type === 'refused') expect(refusal.reason).toMatchObject({ key: 'refused.cast.noSlot' });
  });

  it('come back on the rest the module names', () => {
    let state = caster(1);
    state = reduce(state, { type: 'useAbility', ability: 'wardlight' }, ctx).state;
    expect(slotsLeft(GREENMARCH, state.entities['e:1']!)).toEqual([1]);

    const txn = new Transaction(state, GREENMARCH);
    // `breather` is the short rest; slots come back on `camp`.
    recoverSlots(txn, 'breather');
    expect(slotsLeft(GREENMARCH, txn.entity('e:1')!)).toEqual([1]);

    recoverSlots(txn, 'camp');
    expect(slotsLeft(GREENMARCH, txn.entity('e:1')!)).toEqual([2]);
  });

  it('reaches for a bigger slot when the right one is gone', () => {
    const state = caster(3);
    const hero = state.entities['e:1']!;
    // Level 3 gives [4, 2]. Spend every first-level slot.
    const spent = { ...hero, slotsUsed: [4, 0] };
    expect(slotForSpell(GREENMARCH, spent, 1)).toBe(2);

    const dry = { ...hero, slotsUsed: [4, 2] };
    expect(slotForSpell(GREENMARCH, dry, 1)).toBeNull();
  });
});

describe('the numbers a caster imposes', () => {
  it('computes the save DC from the module\'s formula', () => {
    const state = caster(1);
    const hero = state.entities['e:1']!;
    // greenmarch: 8 + the casting modifier.
    const expected = 8 + Math.floor((hero.attributes['intellect']! - 10) / 2);
    expect(saveDifficultyOf(GREENMARCH, hero)).toBe(expected);
  });

  it('computes the spell attack bonus the same way', () => {
    const hero = caster(1).entities['e:1']!;
    const expected = 2 + Math.floor((hero.attributes['intellect']! - 10) / 2);
    expect(attackBonusOf(GREENMARCH, hero)).toBe(expected);
  });

  it('uses the caster\'s bonus for a spell attack, not the raw attribute', () => {
    // `barrow_bolt` attacks with intellect; the module's bonus adds 2 on top,
    // so a spell attack must land more often than the bare modifier would.
    let landed = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const state = caster(3, seed);
      const { events } = reduce(state, { type: 'useAbility', ability: 'barrow_bolt', target: 'e:99' }, ctx);
      const attack = events.find((e) => e.type === 'attacked');
      if (attack?.type === 'attacked') {
        expect(attack.roll.modifier).toBe(attackBonusOf(GREENMARCH, state.entities['e:1']!));
        landed += 1;
      }
    }
    expect(landed).toBeGreaterThan(0);
  });
});

describe('components', () => {
  it('refuses a spell whose material is not carried', () => {
    const state = caster(1);
    const hero = state.entities['e:1']!;
    const empty: GameState = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, inventory: [] } },
    };

    const { events } = reduce(empty, { type: 'useAbility', ability: 'barrow_bolt', target: 'e:99' }, ctx);
    const refusal = events.find((e) => e.type === 'refused');
    expect(refusal).toBeDefined();
    if (refusal?.type === 'refused') expect(refusal.reason).toMatchObject({ key: 'refused.cast.noComponent' });
  });

  it('spends the material, and keeps the slot', () => {
    const state = caster(1);
    const before = state.entities['e:1']!.inventory.find((s) => s.item === 'grave_ash')!.quantity;

    const { state: after } = reduce(
      state, { type: 'useAbility', ability: 'barrow_bolt', target: 'e:99' }, ctx,
    );
    const left = after.entities['e:1']!.inventory.find((s) => s.item === 'grave_ash')?.quantity ?? 0;
    expect(left).toBe(before - 1);
  });

  it('refuses the words to a caster who cannot speak', () => {
    const state = caster(1);
    const hero = state.entities['e:1']!;
    const gagged: GameState = {
      ...state,
      entities: {
        ...state.entities,
        'e:1': {
          ...hero,
          conditions: [{ condition: 'silenced', remaining: 2, magnitude: null, source: null }],
        },
      },
    };

    const { events } = reduce(gagged, { type: 'useAbility', ability: 'wardlight' }, ctx);
    const refusal = events.find((e) => e.type === 'refused');
    expect(refusal).toBeDefined();
    if (refusal?.type === 'refused') expect(refusal.reason).toMatchObject({ key: 'refused.cast.silenced' });
  });
});

describe('concentration', () => {
  it('is taken up by a spell that asks for it', () => {
    const { state } = reduce(caster(1), { type: 'useAbility', ability: 'wardlight' }, ctx);
    expect(state.entities['e:1']!.concentrating).toBe('wardlight');
  });

  it('is dropped when a second concentration spell is cast', () => {
    let state = reduce(caster(3), { type: 'useAbility', ability: 'wardlight' }, ctx).state;
    const out = reduce(state, { type: 'useAbility', ability: 'wardlight' }, ctx);
    state = out.state;

    expect(out.events.some((e) => e.type === 'concentrationBroken')).toBe(true);
    expect(state.entities['e:1']!.concentrating).toBe('wardlight');
  });

  it('is tested when the caster is hurt, and can be lost', () => {
    const held = reduce(caster(1), { type: 'useAbility', ability: 'wardlight' }, ctx).state;
    expect(held.entities['e:1']!.concentrating).toBe('wardlight');

    // A heavy blow makes the save hard; over a spread of seeds it must
    // sometimes break, and the save must actually be rolled.
    let broken = 0;
    let rolled = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const txn = new Transaction({ ...held, rng: Rng.fromSeed(seed).save() }, GREENMARCH);
      adjustResource(txn, txn.entity('e:1')!, 'hp', -4, { damageType: 'slashing' });
      const { state, events } = txn.finish();
      if (events.some((e) => e.type === 'saved')) rolled += 1;
      if (state.entities['e:1']!.concentrating === null) broken += 1;
    }
    expect(rolled).toBeGreaterThan(0);
    expect(broken).toBeGreaterThan(0);
  });

  it('is not tested for a caster holding nothing', () => {
    const txn = new Transaction(caster(1), GREENMARCH);
    adjustResource(txn, txn.entity('e:1')!, 'hp', -4, { damageType: 'slashing' });
    expect(txn.finish().events.some((e) => e.type === 'saved')).toBe(false);
  });
});

describe('upcasting', () => {
  it('adds the spell\'s own extra effect for every level above its level', () => {
    // `barrow_bolt` is 2d6, rising 1d6 per level. Cast from a second-level slot
    // it must land harder over a run than from a first.
    const total = (usedFirst: number) => {
      let sum = 0;
      for (let seed = 0; seed < 80; seed += 1) {
        const state = caster(3, seed);
        const hero = state.entities['e:1']!;
        const armed: GameState = {
          ...state,
          entities: { ...state.entities, 'e:1': { ...hero, slotsUsed: [usedFirst, 0] } },
        };
        const { events } = reduce(armed, { type: 'useAbility', ability: 'barrow_bolt', target: 'e:99' }, ctx);
        for (const event of events) {
          if (event.type === 'damaged' && event.entity === 'e:99') sum += event.raw;
        }
      }
      return sum;
    };

    // With first-level slots left it goes in a first-level slot; with none, a
    // second — which is where the extra die comes from.
    expect(total(4)).toBeGreaterThan(total(0));
  });
});

describe('rituals', () => {
  it('cost no slot at all', () => {
    const state = caster(2);
    const hero = state.entities['e:1']!;
    const learned: GameState = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, abilities: [...hero.abilities, 'read_the_stones'] } },
    };

    const { state: after, events } = reduce(
      learned, { type: 'useAbility', ability: 'read_the_stones', ritual: true }, ctx,
    );
    expect(after.flags['stones_read']).toBe(true);
    expect(after.entities['e:1']!.slotsUsed).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'spellCast', ritual: true }));
  });

  it('refuse a spell that is not one', () => {
    const { events } = reduce(caster(1), { type: 'useAbility', ability: 'wardlight', ritual: true }, ctx);
    const refusal = events.find((e) => e.type === 'refused');
    expect(refusal).toBeDefined();
    if (refusal?.type === 'refused') expect(refusal.reason).toMatchObject({ key: 'refused.cast.notRitual' });
  });
});

describe('a module with no magic', () => {
  it('is entirely unaffected — an ability with no spellLevel is just an ability', () => {
    const base = newGame(MINIMAL, { seed: 1, party: [defaultChoices(MINIMAL, 'Ash')] });
    const hero = base.entities[base.party[0]!]!;
    expect(hero.slotsUsed).toEqual([]);
    expect(hero.concentrating).toBeNull();
  });
});
