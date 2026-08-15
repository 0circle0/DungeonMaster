/**
 * What a character and a creature actually are.
 *
 * Every ancestry field except attribute and skill bonuses was dropped on the
 * floor at creation, statblock skills were discarded at spawn, and resistances
 * were read only from a statblock — which a player character does not have, so
 * `ancestries[].damageInteractions` was unreachable by construction rather than
 * merely unimplemented.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');

describe('the character sheet is real', () => {
  /** One character, built the way a new game builds them. */
  const build = (ancestry: string) => {
    const module = GREENMARCH;
    const choices = { ...defaultChoices(module, 'Ash'), ancestry };
    return newGame(module, { seed: 3, party: [choices] });
  };

  // `createCharacter` passed `undefined` where the ancestry's speeds belong, so
  // a flying ancestry could not fly and a swimming one could not swim.
  it('gives a character the movement modes its ancestry declares', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { movementModes: Record<string, unknown>[] };
      content: { ancestries: Record<string, unknown>[] };
    };
    doc.rules.movementModes.push({ id: 'fly', name: 'Fly', defaultSpeed: 40 });
    doc.content.ancestries.find((a) => a['id'] === 'human')!['speeds'] = { walk: 30, fly: 40 };
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const state = newGame(compiled.module, {
      seed: 3,
      party: [{ ...defaultChoices(compiled.module, 'Ash'), ancestry: 'human' }],
    });
    expect(state.entities[state.party[0]!]!.movementModes).toContain('fly');
  });

  it('records what a character is, so content can ask', () => {
    const state = build('dwarf');
    const hero = state.entities[state.party[0]!]!;
    expect(hero.extra['creatureType']).toBe('humanoid');
    expect(hero.extra['size']).toBe('medium');
    expect(hero.extra['languages']).toEqual(['common', 'old_tongue']);
  });

  it('starts a character wearing the gear they were given', () => {
    // Starting items landed in the bag and nowhere else, so a fresh party stood
    // in its first fight holding swords in their packs.
    const state = build('human');
    const hero = state.entities[state.party[0]!]!;
    expect(Object.values(hero.equipped).flat()).toContain('iron_sword');
  });

  it('lets a player character have a resistance at all', async () => {
    const { Transaction, applyOps } = await import('./rules/apply.js');
    // greenmarch's dwarf halves piercing. Only statblocks were consulted before,
    // and a character has none — so this was unreachable by construction.
    const hit = (ancestry: string) => {
      const state = build(ancestry);
      const txn = new Transaction(state, GREENMARCH);
      const hero = txn.entity(state.party[0]!)!;
      applyOps(txn, [{ op: 'damage', target: hero.id, amount: 8, damageType: 'piercing' }], null);
      const event = txn.finish().events.find((e) => e.type === 'damaged');
      return event?.type === 'damaged' ? event.amount : 0;
    };

    expect(hit('dwarf')).toBe(4);
    expect(hit('human')).toBe(8);
  });
});

describe('a monster knows what it is trained in', () => {
  it('copies the statblock\'s skill bonuses instead of starting at zero', async () => {
    const { spawnMonster } = await import('./character.js');
    // The hound is described as keen-nosed and quiet; before, it rolled
    // perception and stealth at rank 0 like a rock.
    const hound = spawnMonster(GREENMARCH, 'e:99', 'bog_hound');
    expect(hound.skills['perception']).toBe(3);
    expect(hound.skills['stealth']).toBe(2);
    expect(hound.extra['creatureType']).toBe('beast');
  });
});
