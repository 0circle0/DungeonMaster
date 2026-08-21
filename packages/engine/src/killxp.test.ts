/** Experience for what the party killed, and which rolls may crit. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { Transaction } from './rules/apply.js';
import { awardKillXp } from './sim/quests.js';
import { check, skillCheck, savingThrow } from './rules/check.js';
import { createMap } from './grid/tiles.js';
import type { GameEvent } from './events.js';
import type { GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');

/** A party, and a hound standing next to them. */
function arena(module = GREENMARCH): GameState {
  const base = newGame(module, { seed: 6, party: [defaultChoices(module, 'Ash')] });
  const hero = base.entities[base.party[0]!]!;
  const hound = spawnMonster(module, 'e:99', 'bog_hound');
  return {
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
      [hero.id]: { ...hero, map: 'here', position: { x: 4, y: 4 } },
      'e:99': { ...hound, map: 'here', position: { x: 5, y: 4 }, disposition: 'hostile' },
    },
  };
}

/** What the party's experience became after these events were swept. */
function xpAfter(events: GameEvent[], module = GREENMARCH): number {
  const txn = new Transaction(arena(module), module);
  awardKillXp(txn, events, Rng.fromSeed(1));
  return txn.entity(txn.state.party[0]!)!.xp;
}

const died = (killer: string | null): GameEvent => ({ type: 'died', entity: 'e:99', killer });

describe('experience for a kill', () => {
  const worth = GREENMARCH.find<{ xp: number }>('content.monsters', 'bog_hound')!.xp;

  it('is the creature\'s own authored worth', () => {
    expect(worth).toBeGreaterThan(0);
    expect(xpAfter([died('e:1')])).toBe(worth);
  });

  // A creature killed by another creature, or by the ground it stood on, teaches the party nothing.
  it('goes unpaid when the party did not do it', () => {
    expect(xpAfter([died('m:0')])).toBe(0);
    expect(xpAfter([died(null)])).toBe(0);
  });

  it('pays once per creature, not once per event', () => {
    expect(xpAfter([died('e:1'), died('e:1')])).toBe(worth * 2);
  });

  it('pays nothing for a creature worth nothing', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      content: { monsters: Record<string, unknown>[] };
    };
    doc.content.monsters.find((m) => m['id'] === 'bog_hound')!['xp'] = 0;
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    expect(xpAfter([died('e:1')], compiled.module)).toBe(0);
  });
});

describe('criticalScope', () => {
  /** Greenmarch that only lets the named kinds of roll crit. */
  function scoped(kinds: string[]): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { resolution: Record<string, unknown> };
    };
    doc.rules.resolution['criticalScope'] = kinds;
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  /** A seed that rolls a natural 20 on the first die. */
  const NAT_20 = (() => {
    for (let seed = 0; seed < 500; seed += 1) {
      if (check(GREENMARCH, Rng.fromSeed(seed), { difficulty: 99 }).natural === 20) return seed;
    }
    throw new Error('no seed rolled a natural 20');
  })();

  const outcome = (module: CompiledModule, kind: 'attack' | 'save' | 'check'): string =>
    check(module, Rng.fromSeed(NAT_20), { difficulty: 99, kind }).outcome;

  it('lets everything crit by default, which is what the engine always did', () => {
    expect(GREENMARCH.source.rules.resolution.criticalScope)
      .toEqual(['attack', 'save', 'check']);
    for (const kind of ['attack', 'save', 'check'] as const) {
      expect(outcome(GREENMARCH, kind)).toBe('critical');
    }
  });

  // A natural 20 that no longer picks a lock no amount of skill could open.
  it('decides an excluded kind on its total alone', () => {
    const combat = scoped(['attack', 'save']);
    expect(outcome(combat, 'attack')).toBe('critical');
    expect(outcome(combat, 'save')).toBe('critical');
    expect(outcome(combat, 'check')).toBe('failure');
  });

  it('can be emptied without touching criticalSuccessAt', () => {
    expect(outcome(scoped([]), 'attack')).toBe('failure');
  });

  it('reaches the helpers, which is where kinds are actually declared', () => {
    const combat = scoped(['attack', 'save']);
    const state = arena(combat);
    const hero = state.entities['e:1']!;
    const rng = () => Rng.fromSeed(NAT_20);
    // A save still crits; a skill check no longer does.
    expect(savingThrow(combat, rng(), hero, 'will', 99).outcome).toBe('critical');
    expect(skillCheck(combat, rng(), hero, 'perception', 99).outcome).toBe('failure');
  });
});
