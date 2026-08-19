/**
 * What a blow is swung with, and what it adds.
 *
 * Two halves of the same roll, both of which were stuck. `finesse` shipped as
 * an item property with an empty body, because `itemProperties[].modifiers`
 * maps to derived stats and finesse is not a bonus to anything -- it is a
 * *choice* of which attribute the roll uses, and no number added to a defence
 * can mean "use agility instead of might".
 *
 * Meanwhile a weapon attack added the bare attribute modifier and nothing
 * else, and nothing raises an attribute after character creation, so a warden
 * hit exactly as often at level 20 as at level 1. Spells had
 * `spellcasting.attackBonus`; weapons had no equivalent at all.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce } from './reduce.js';
import { attackStatFor } from './rules/combat/attack.js';
import { createMap } from './grid/tiles.js';
import type { Entity, GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');

/**
 * Greenmarch with a finesse property that means something, a rapier carrying
 * it, and optionally a rule for what a weapon attack adds.
 */
function armed(options: { attackBonus?: unknown } = {}): CompiledModule {
  const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
    rules: { itemProperties: Record<string, unknown>[]; resolution: Record<string, unknown> };
    content: { items: Record<string, unknown>[] };
  };
  doc.rules.itemProperties.push({ id: 'finesse', name: 'Finesse', attackStats: ['agility'] });
  doc.content.items.push({
    id: 'rapier', name: 'Rapier', kind: 'weapon', slot: 'hand',
    properties: ['finesse'], damage: { dice: '1d6', damageType: 'piercing', stat: 'might' },
  });
  doc.content.items.push({
    id: 'club', name: 'Club', kind: 'weapon', slot: 'hand',
    damage: { dice: '1d6', damageType: 'slashing', stat: 'might' },
  });
  if (options.attackBonus !== undefined) doc.rules.resolution['attackBonus'] = options.attackBonus;

  const compiled = compileModule(doc);
  if (!compiled.ok) throw new Error(`fixture failed to compile: ${JSON.stringify(compiled.errors)}`);
  return compiled.module;
}

/** A duellist: agility well clear of might, so the choice is visible. */
function duellist(module: CompiledModule, weapon: string | null, level = 1): { state: GameState; hero: Entity } {
  const base = newGame(module, { seed: 3, party: [defaultChoices(module, 'Ash')] });
  const id = base.party[0]!;
  const hero: Entity = {
    ...base.entities[id]!,
    level,
    attributes: { ...base.entities[id]!.attributes, might: 10, agility: 18 },
    map: 'here',
    position: { x: 4, y: 4 },
    ...(weapon ? { inventory: [{ item: weapon, quantity: 1 }], equipped: { hand: [weapon] } } : {}),
  };
  const rat = spawnMonster(module, 'e:99', 'bog_hound');
  return {
    hero,
    state: {
      ...base,
      currentMap: 'here',
      maps: {
        here: {
          id: 'here', tiles: createMap(9, 9, 'floor'), kind: 'area', source: 'millford',
          explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1,
        },
      },
      entities: {
        ...base.entities,
        [id]: hero,
        'e:99': { ...rat, map: 'here', position: { x: 5, y: 4 }, disposition: 'hostile', resources: { hp: 999 } },
      },
    },
  };
}

/** The modifier the attack roll actually carried. */
function attackModifier(module: CompiledModule, weapon: string | null, level = 1): number {
  const { state } = duellist(module, weapon, level);
  const { events } = reduce(
    state, { type: 'useAbility', actor: 'e:1', ability: 'strike', target: 'e:99' }, { module },
  );
  const attacked = events.find((event) => event.type === 'attacked');
  if (!attacked || attacked.type !== 'attacked') throw new Error('nothing was swung');
  return attacked.roll.modifier;
}

describe('finesse', () => {
  const MODULE = armed();

  it('lets the weapon offer an attribute the ability did not name', () => {
    const { hero } = duellist(MODULE, 'rapier');
    // greenmarch's `strike` names might; the rapier offers agility, which is better.
    expect(attackStatFor(MODULE, hero, 'might', MODULE.find('content.items', 'rapier')!)).toBe('agility');
  });

  it('leaves a weapon that offers nothing exactly as it was', () => {
    const { hero } = duellist(MODULE, 'club');
    expect(attackStatFor(MODULE, hero, 'might', MODULE.find('content.items', 'club')!)).toBe('might');
    expect(attackStatFor(MODULE, hero, 'might', null)).toBe('might');
  });

  // Ties keep the ability's own attribute, so an offer that is no better is no
  // change at all.
  it('keeps the ability\'s attribute when the offer is not an improvement', () => {
    const { hero } = duellist(MODULE, 'rapier');
    const evenly = { ...hero, attributes: { ...hero.attributes, might: 18, agility: 18 } };
    expect(attackStatFor(MODULE, evenly, 'might', MODULE.find('content.items', 'rapier')!)).toBe('might');
  });

  it('shows up in the roll, not just in the helper', () => {
    // might 10 is +0, agility 18 is +4.
    expect(attackModifier(MODULE, 'club')).toBe(0);
    expect(attackModifier(MODULE, 'rapier')).toBe(4);
  });

  /**
   * The incoherence this replaces: Aurendel's one finesse weapon declared
   * agility damage while `strike` named might, so it was aimed with one arm
   * and hit with the other. Choosing once and using it for both is the rule.
   */
  it('uses the chosen attribute for the damage too', () => {
    const { state } = duellist(MODULE, 'rapier');
    const { events } = reduce(
      state, { type: 'useAbility', actor: 'e:1', ability: 'strike', target: 'e:99' }, { module: MODULE },
    );
    const damaged = events.find((event) => event.type === 'damaged');
    // The rapier *declares* might damage; being swung with agility overrides it,
    // so a 1d6 lands at least 1 + 4 rather than at most 6 + 0.
    if (damaged?.type === 'damaged') expect(damaged.raw).toBeGreaterThan(4);
  });
});

describe('what a weapon attack adds', () => {
  it('is the bare attribute modifier when the ruleset says nothing', () => {
    const plain = armed();
    expect(plain.source.rules.resolution.attackBonus).toBeUndefined();
    expect(attackModifier(plain, 'club', 1)).toBe(0);
    // Twenty levels later, still nothing: no effect raises an attribute.
    expect(attackModifier(plain, 'club', 20)).toBe(0);
  });

  it('follows the ruleset\'s own formula when there is one', () => {
    const scaling = armed({
      attackBonus: { add: [{ ref: 'actor.proficiency' }, { ref: 'actor.attackMod' }] },
    });
    // greenmarch's curve is 2 + floor((level - 1) / 4).
    expect(attackModifier(scaling, 'club', 1)).toBe(2);
    expect(attackModifier(scaling, 'club', 17)).toBe(6);
  });

  it('sees the attribute the attack resolved to, not the one the ability named', () => {
    const scaling = armed({ attackBonus: { ref: 'actor.attackMod' } });
    // The rapier's agility, +4, rather than the strike's might, +0.
    expect(attackModifier(scaling, 'rapier', 1)).toBe(4);
  });
});
