import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import type { CompiledModule, GameModule } from '@dm/module';
import { readAssembledModule } from '@dm/module/load';
import { newGame, defaultChoices, NewGameError } from './newgame.js';
import { createCharacter, spawnMonster } from './character.js';
import { statsOf, buildScope } from './stats.js';
import { Rng } from '@dm/core';

const MINIMAL_DIR = fileURLToPath(new URL('../../../modules/minimal', import.meta.url));

function loadModule(mutate?: (doc: GameModule) => void): CompiledModule {
  const doc = readAssembledModule(MINIMAL_DIR).doc as unknown as GameModule;
  mutate?.(doc);
  const result = compileModule(doc);
  if (!result.ok) {
    throw new Error(`fixture failed to compile:\n${result.errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
  }
  return result.module;
}

const MODULE = loadModule();

function start(module = MODULE, seed = 12345) {
  return newGame(module, { seed, party: [defaultChoices(module, 'Ash')] });
}

describe('newGame', () => {
  it('produces a playable initial state', () => {
    const state = start();
    expect(state.party).toHaveLength(1);
    expect(state.outcome).toBe('playing');
    expect(state.entities[state.party[0]!]!.name).toBe('Ash');
  });

  it('records the module identity and hash, so a save cannot load into a changed module', () => {
    const state = start();
    expect(state.module).toEqual({ id: 'minimal', version: '1.0.0', hash: MODULE.hash });
  });

  it('starts the world clock where the module says', () => {
    expect(start().minute).toBe(MODULE.source.world.time.startMinute);
  });

  it('begins in the module-declared starting dungeon', () => {
    expect(start().location).toMatchObject({ kind: 'dungeon', dungeon: 'first_descent' });
  });

  it('seeds reputation from each faction\'s initial standing', () => {
    const module = loadModule((doc) => {
      doc.content.factions = [
        { id: 'wardens', name: 'Wardens', initialStanding: 5 } as never,
        { id: 'thieves', name: 'Thieves', initialStanding: -3 } as never,
      ];
    });
    expect(start(module).reputation).toEqual({ wardens: 5, thieves: -3 });
  });

  it('carries the module\'s initial flags', () => {
    const module = loadModule((doc) => {
      doc.start.initialFlags = { prologue_seen: false, coin: 3 };
    });
    expect(start(module).flags).toEqual({ prologue_seen: false, coin: 3 });
  });

  // The save/replay contract: state must survive a JSON round trip intact.
  it('is fully serializable', () => {
    const state = start();
    const revived = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(revived).toEqual(state);
    expect(revived.rng).toHaveLength(4);
  });

  it('is deterministic for a seed, and different across seeds', () => {
    const a = JSON.stringify(start(MODULE, 999));
    const b = JSON.stringify(start(MODULE, 999));
    expect(a).toBe(b);

    // Level 3 rolls hit dice, so seeds must actually diverge.
    const levelled = (seed: number) =>
      newGame(MODULE, {
        seed,
        party: [{ ...defaultChoices(MODULE, 'Ash'), level: 3 }],
      });
    const totals = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => levelled(s).entities['e:1']!.resources['vitality']),
    );
    expect(totals.size).toBeGreaterThan(1);
  });

  it('allocates sequential entity ids and tracks the next one', () => {
    const module = loadModule((doc) => { doc.start.partySize = 4; });
    const state = newGame(module, {
      seed: 1,
      party: ['A', 'B', 'C'].map((n) => defaultChoices(module, n)),
    });
    expect(state.party).toEqual(['e:1', 'e:2', 'e:3']);
    expect(state.nextEntityId).toBe(3);
  });

  it('rejects a party that is empty or larger than the module allows', () => {
    expect(() => newGame(MODULE, { seed: 1, party: [] })).toThrow(NewGameError);
    expect(() =>
      newGame(MODULE, { seed: 1, party: [defaultChoices(MODULE, 'A'), defaultChoices(MODULE, 'B')] }),
    ).toThrow(/party of 1/);
  });

  it('refuses to start when the module declares nowhere to begin', () => {
    const module = loadModule((doc) => { delete (doc.start as { startingDungeon?: string }).startingDungeon; });
    expect(() => start(module)).toThrow(/nowhere to begin/);
  });
});

describe('createCharacter', () => {
  const rng = () => Rng.fromSeed(7);

  it('applies ancestry and class bonuses on top of the allocation', () => {
    // Folk grants +1 vigor; the allocation asks for 6.
    const character = createCharacter(MODULE, 'e:1', defaultChoices(MODULE, 'Ash'), rng());
    expect(character.attributes['vigor']).toBe(7);
    expect(character.attributes['wits']).toBe(6);
  });

  it('clamps attributes to the module\'s declared bounds', () => {
    // A budget wide enough that the allocation is legal: what is being tested
    // here is the bounds, and `createCharacter` now also enforces the point
    // budget — which the test below covers on its own.
    const rich = loadModule((doc) => {
      (doc['start'] as { creation: Record<string, unknown> }).creation['attributePoints'] = 99;
    });
    const character = createCharacter(
      rich,
      'e:1',
      { ...defaultChoices(rich, 'Ash'), attributes: { vigor: 12, wits: 0 } },
      rng(),
    );
    expect(character.attributes['vigor']).toBe(12); // capped at max, not 13
    expect(character.attributes['wits']).toBe(1); // raised to min
  });

  /**
   * The campaign's own limits, wherever a character is built.
   *
   * `start.creation` was enforced only by the creation screens, so a party made
   * any other way — a test, a third-party front end — walked past the point
   * budget and the allowed lists entirely.
   */
  it('refuses an allocation the module cannot afford', () => {
    expect(() => createCharacter(
      MODULE,
      'e:1',
      { ...defaultChoices(MODULE, 'Ash'), attributes: { vigor: 12, wits: 6 } },
      rng(),
    )).toThrow(/points/);
  });

  it('refuses an ancestry the campaign does not allow', () => {
    const picky = loadModule((doc) => {
      (doc['start'] as { creation: Record<string, unknown> }).creation['allowedAncestries'] = ['nobody'];
      (doc['content'] as { ancestries: { id: string }[] }).ancestries.push({
        id: 'nobody', name: 'Nobody',
      } as never);
    });
    expect(() => createCharacter(picky, 'e:1', defaultChoices(MODULE, 'Ash'), rng()))
      .toThrow(/not one this campaign allows/);
  });

  it('starts resources full, using the module\'s formula', () => {
    const character = createCharacter(MODULE, 'e:1', defaultChoices(MODULE, 'Ash'), rng());
    // vigor 7 -> mod floor((7-6)/3) = 0 -> vitality 8 + 0*2 = 8
    expect(character.resources['vitality']).toBe(8);
  });

  it('grants starting items and level-appropriate abilities', () => {
    const character = createCharacter(MODULE, 'e:1', defaultChoices(MODULE, 'Ash'), rng());
    expect(character.inventory).toContainEqual({ item: 'cudgel', quantity: 1 });
    expect(character.abilities).toContain('cudgel_swing');
    expect(character.skills['notice']).toBe(1);
  });

  it('rejects unknown ancestry or class', () => {
    const base = defaultChoices(MODULE, 'Ash');
    expect(() => createCharacter(MODULE, 'e:1', { ...base, ancestry: 'elf' }, rng())).toThrow(/unknown ancestry/);
    expect(() => createCharacter(MODULE, 'e:1', { ...base, characterClass: 'mage' }, rng())).toThrow(/unknown class/);
  });
});

describe('spawnMonster', () => {
  it('builds an entity from a statblock using the same pipeline', () => {
    const husk = spawnMonster(MODULE, 'e:9', 'husk');
    expect(husk.kind).toBe('monster');
    expect(husk.statblock).toBe('husk');
    // vigor 5 -> mod floor((5-6)/3) = -1 -> vitality 8 + (-1*2) = 6
    expect(husk.resources['vitality']).toBe(6);
    expect(husk.alive).toBe(true);
  });

  it('rejects an unknown statblock', () => {
    expect(() => spawnMonster(MODULE, 'e:9', 'dragon')).toThrow(/unknown monster/);
  });
});

describe('stats', () => {
  it('computes modifiers, maxima, and derived stats from module formulas', () => {
    const state = start();
    const ash = state.entities['e:1']!;
    const stats = statsOf(MODULE, ash);

    expect(stats.mod['vigor']).toBe(0); // floor((7-6)/3)
    expect(stats.max['vitality']).toBe(8);
    expect(stats.derived['ward']).toBe(8); // 8 + mod wits (0)
  });

  it('folds condition modifiers into derived stats', () => {
    const state = start();
    const ash = state.entities['e:1']!;
    const reeling = { ...ash, conditions: [{ condition: 'reeling', remaining: 2, magnitude: null, source: null }] };

    // Ward is 8 normally; `reeling` declares a -2 modifier.
    expect(statsOf(MODULE, reeling).derived['ward']).toBe(6);
  });

  it('folds equipped item modifiers into derived stats', () => {
    const module = loadModule((doc) => {
      doc.content.items.push({
        id: 'charm', name: 'Charm', kind: 'trinket', slot: 'hand',
        modifiers: { ward: 3 },
      } as never);
    });
    const state = start(module);
    const ash = state.entities['e:1']!;
    const adorned = { ...ash, equipped: { hand: ['charm'] } };

    expect(statsOf(module, adorned).derived['ward']).toBe(11);
  });
});

describe('buildScope', () => {
  it('exposes everything content needs as ordinary paths', () => {
    const state = start();
    const scope = buildScope(MODULE, state, state.entities['e:1']!);
    const actor = scope['actor'] as Record<string, unknown>;

    expect((actor['attr'] as Record<string, number>)['vigor']).toBe(7);
    expect((actor['mod'] as Record<string, number>)['vigor']).toBe(0);
    expect((actor['res'] as Record<string, number>)['vitality']).toBe(8);
    expect((actor['max'] as Record<string, number>)['vitality']).toBe(8);
    expect((actor['derived'] as Record<string, number>)['ward']).toBe(8);
    expect((actor['inventory'] as Record<string, number>)['cudgel']).toBe(1);
    expect(scope['world']).toMatchObject({ day: 1 });
  });
});

/**
 * The no-hardcoding proof.
 *
 * A module with different attribute names, a different modifier curve, and a
 * differently named vital resource must run through the same pipeline. If any
 * fantasy assumption were baked into the engine, this is where it would show.
 */
describe('nothing is hardcoded', () => {
  it('runs a module whose ruleset the engine has never seen', () => {
    const module = loadModule((doc) => {
      doc.id = 'alien';
      doc.rules.attributes = [
        {
          id: 'lumen', name: 'Lumen', abbrev: 'LUM', description: '',
          min: 0, max: 100, default: 50,
          // A completely different curve: tenths, not the d20 convention.
          modifier: { floor: { div: [{ ref: 'value' }, 10] } },
        } as never,
      ];
      doc.rules.resources = [
        {
          id: 'coherence', name: 'Coherence',
          max: { mul: [{ ref: 'actor.mod.lumen' }, 7] },
          min: 0, restoreOnShortRest: 0, restoreOnLongRest: 1, onDepleted: [],
        } as never,
      ];
      doc.rules.derivedStats = [
        { id: 'shimmer', name: 'Shimmer', description: '', formula: { add: [{ ref: 'actor.mod.lumen' }, 2] } },
      ];
      doc.rules.vitalResource = 'coherence';
      delete (doc.rules as { initiativeStat?: string }).initiativeStat;
      doc.rules.conditions = [];
      doc.content.skills = [{ id: 'notice', name: 'Notice', attribute: 'lumen' } as never];
      doc.content.ancestries = [{ id: 'folk', name: 'Folk', attributeBonuses: { lumen: 10 } } as never];
      doc.content.classes[0] = { ...doc.content.classes[0]!, primaryAttribute: 'lumen', attributeBonuses: {} };
      doc.content.monsters[0] = { ...doc.content.monsters[0]!, attributes: { lumen: 30 } };
      doc.content.abilities[0] = {
        ...doc.content.abilities[0]!,
        attack: { stat: 'lumen', against: 'shimmer' },
      };
      doc.content.items[0] = {
        ...doc.content.items[0]!,
        damage: { dice: '1d6', damageType: 'blunt', stat: 'lumen' },
      };
    });

    const state = start(module);
    const hero = state.entities['e:1']!;

    // lumen 50 + 10 = 60 -> mod 6 -> coherence 42
    expect(hero.attributes['lumen']).toBe(60);
    expect(hero.resources['coherence']).toBe(42);
    expect(statsOf(module, hero).derived['shimmer']).toBe(8);
    expect(hero.attributes['vigor']).toBeUndefined();

    // And the same pipeline still spawns a monster.
    expect(spawnMonster(module, 'e:9', 'husk').resources['coherence']).toBe(21);
  });
});
