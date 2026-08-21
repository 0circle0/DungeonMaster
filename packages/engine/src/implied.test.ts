/** Conditions that hold without having been applied. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { Transaction } from './rules/apply.js';
import { preventsAction, swingsFrom } from './rules/conditions.js';
import { impliedConditions, conditionsInForce } from './rules/implied.js';
import { statsOf } from './stats.js';
import type { Entity, GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');

/** Greenmarch with a small chain: `felled` implies `sprawled`, which implies `winded`. */
function chained(): CompiledModule {
  const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
    rules: { conditions: Record<string, unknown>[] };
  };
  doc.rules.conditions.push(
    { id: 'winded', name: 'Winded', modifiers: { guard: -1 } },
    { id: 'sprawled', name: 'Sprawled', implies: ['winded'], prevents: ['quick'],
      swings: { ownAttacks: 'disadvantage' } },
    { id: 'felled', name: 'Felled', implies: ['sprawled'], modifiers: { guard: -2 } },
  );
  const compiled = compileModule(doc);
  if (!compiled.ok) throw new Error('fixture failed to compile');
  return compiled.module;
}

const MODULE = chained();

function afflicted(conditions: string[]): { state: GameState; hero: Entity } {
  const base = newGame(MODULE, { seed: 5, party: [defaultChoices(MODULE, 'Ash')] });
  const id = base.party[0]!;
  const hero: Entity = {
    ...base.entities[id]!,
    conditions: conditions.map((condition) => ({
      condition, remaining: null, magnitude: null, source: null,
    })),
  };
  return { state: { ...base, entities: { ...base.entities, [id]: hero } }, hero };
}

describe('impliedConditions', () => {
  it('follows the chain all the way down', () => {
    expect(impliedConditions(MODULE, afflicted(['felled']).hero).sort())
      .toEqual(['sprawled', 'winded']);
  });

  it('is empty for a creature carrying nothing that implies anything', () => {
    expect(impliedConditions(MODULE, afflicted(['frightened']).hero)).toEqual([]);
    expect(impliedConditions(MODULE, afflicted([]).hero)).toEqual([]);
  });

  // Otherwise a condition would be worth more for arriving by two routes.
  it('never repeats one the creature already holds directly', () => {
    expect(impliedConditions(MODULE, afflicted(['felled', 'winded']).hero))
      .toEqual(['sprawled']);
  });

  it('lists the applied ones alongside the implied ones', () => {
    expect(conditionsInForce(MODULE, afflicted(['felled']).hero).sort())
      .toEqual(['felled', 'sprawled', 'winded']);
  });
});

describe('what an implied condition does', () => {
  it('forbids what it forbids', () => {
    const { state, hero } = afflicted(['felled']);
    const txn = new Transaction(state, MODULE);
    // `felled` prevents nothing; `sprawled`, which it implies, prevents `quick`.
    expect(preventsAction(txn, hero, 'quick')).toBe(true);
    expect(preventsAction(txn, hero, 'action')).toBe(false);
  });

  it('leans the dice its own way', () => {
    expect(swingsFrom(MODULE, afflicted(['felled']).hero, 'ownAttacks'))
      .toEqual(['disadvantage']);
  });

  it('applies its modifiers to a derived stat', () => {
    const clean = statsOf(MODULE, afflicted([]).hero).derived['guard']!;
    // felled -2 directly, winded -1 two links away.
    expect(statsOf(MODULE, afflicted(['felled']).hero).derived['guard']).toBe(clean - 3);
  });

  it('counts a doubly reached modifier once', () => {
    const clean = statsOf(MODULE, afflicted([]).hero).derived['guard']!;
    // Holding `winded` directly as well must not subtract it twice.
    expect(statsOf(MODULE, afflicted(['felled', 'winded']).hero).derived['guard'])
      .toBe(clean - 3);
  });

  // The lifecycle stays with the condition that was actually applied.
  it('is not an entry on the creature, so nothing can expire it', () => {
    expect(afflicted(['felled']).hero.conditions.map((c) => c.condition)).toEqual(['felled']);
  });
});
