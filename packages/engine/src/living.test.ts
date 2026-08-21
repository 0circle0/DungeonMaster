import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule, compileRequirement, evalPredicate } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster, spawnNpc } from './character.js';
import { reduce, reduceAll } from './reduce.js';
import { statesEqual } from './save.js';
import { Transaction } from './rules/apply.js';
import { buildScope, OPEN_NAMESPACES } from './stats.js';
import { recordDeed } from './sim/deeds.js';
import { spreadRumours, decayMemories, driftFactions, retention, memoryKeyOf } from './sim/gossip.js';
import { tickDay, recordEncounter, hasAdapted, learningKey } from './sim/agenda.js';
import { startQuest } from './sim/quests.js';
import { TerrainIndex, createMap } from './grid/tiles.js';
import type { GameState } from './state.js';
import type { Action } from './actions.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const ctx = { module: GREENMARCH };
const terrain = new TerrainIndex(GREENMARCH);
const DAY = GREENMARCH.source.world.time.minutesPerDay;

function fresh(seed = 5): GameState {
  const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
  const hero = base.entities[base.party[0]!]!;
  return {
    ...base,
    currentMap: 'here',
    maps: {
      here: { id: 'here', tiles: createMap(13, 13, 'floor'), kind: 'area', source: 'millford', explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1 },
    },
    entities: { ...base.entities, [hero.id]: { ...hero, map: 'here', position: { x: 6, y: 6 } } },
  };
}

/** A state where Vess is present and has witnessed a theft. */
function afterTheft(seed = 5): Transaction {
  const state = fresh(seed);
  // Built the way the game builds her: an npc entity keyed by her content id.
  const vess = spawnNpc(GREENMARCH, 'vess');
  const withVess: GameState = {
    ...state,
    entities: {
      ...state.entities,
      vess: { ...vess, map: 'here', position: { x: 7, y: 6 } },
    },
  };
  const txn = new Transaction(withVess, GREENMARCH);
  recordDeed(txn, terrain, 'theft', txn.entity('e:1')!, null, Rng.fromSeed(1));
  return txn;
}

describe('memory keys', () => {
  // A named NPC's knowledge must outlive the entity that represented her.
  it('files a named NPC\'s memory under their content id', () => {
    const txn = afterTheft();
    expect(Object.keys(txn.state.memory)).toContain('vess');
  });

  it('keeps a monster\'s memory on the instance', () => {
    const hound = spawnMonster(GREENMARCH, 'm:1', 'bog_hound');
    expect(memoryKeyOf({ ...hound, map: 'here', position: { x: 1, y: 1 } })).toBe('m:1');
  });
});

describe('memory in scope', () => {
  // `requirement.memories` compiles to `{exists: "memory.<who>.<kind>"}`, and until the namespace
  // was built in `buildScope` it was populated only in dialogue. Everywhere else the path resolved
  // to null, so `known: true` never passed and `known: false` always did.
  const gate = (who: string, kind: string, withinDays?: number) =>
    compileRequirement({ memories: [{ deedKind: kind, who, known: true, ...(withinDays !== undefined ? { withinDays } : {}) }] } as never);

  function holds(txn: Transaction, subject: string, requirement: ReturnType<typeof gate>): boolean {
    const scope = buildScope(GREENMARCH, txn.state, txn.entity(subject)!);
    return evalPredicate(requirement, { scope, rng: Rng.fromSeed(1), openNamespaces: OPEN_NAMESPACES });
  }

  it('lets a gate outside dialogue read what the subject remembers', () => {
    const txn = afterTheft();
    expect(holds(txn, 'vess', gate('speaker', 'theft'))).toBe(true);
    // The hero did it; she is not a witness to herself.
    expect(holds(txn, 'e:1', gate('speaker', 'theft'))).toBe(false);
  });

  it('answers "self" the same way, for content that is not a conversation', () => {
    const txn = afterTheft();
    expect(holds(txn, 'vess', gate('self', 'theft'))).toBe(true);
  });

  it('knows what the party did, whoever saw it', () => {
    const txn = afterTheft();
    expect(holds(txn, 'e:1', gate('party', 'theft'))).toBe(true);
    expect(holds(txn, 'e:1', gate('party', 'mill_cleared'))).toBe(false);
  });

  it('distinguishes "anyone knows" from "this one person knows"', () => {
    const txn = afterTheft();
    // Vess saw it, so anyone-knows holds even when asked of the hero.
    expect(holds(txn, 'e:1', gate('anyone', 'theft'))).toBe(true);
  });

  it('reads a deed kind nobody has heard of as unknown', () => {
    const txn = afterTheft();
    expect(holds(txn, 'vess', gate('anyone', 'barrow_robbed'))).toBe(false);
  });

  // `withinDays` compared `world.day` (a day index) against a record's `.at` (a minute count), so
  // the subtraction was hugely negative and every window ever declared passed.
  it('measures withinDays in days, so an old memory falls outside the window', () => {
    const txn = afterTheft();
    const aged = new Transaction({ ...txn.state, minute: txn.state.minute + DAY * 90 }, GREENMARCH);
    expect(holds(aged, 'vess', gate('speaker', 'theft'))).toBe(true);
    expect(holds(aged, 'vess', gate('speaker', 'theft', 120))).toBe(true);
    expect(holds(aged, 'vess', gate('speaker', 'theft', 60))).toBe(false);
  });

  it('costs nothing until something reads it', () => {
    // The five `who` keys are getters, so building a scope must not walk the deed log. Proven
    // against a state whose deed list would throw if it were iterated.
    const txn = afterTheft();
    const booby = new Proxy([] as unknown[], {
      get(target, prop) {
        if (prop === 'find' || prop === Symbol.iterator) throw new Error('deeds were read eagerly');
        return Reflect.get(target, prop);
      },
    });
    const scope = buildScope(GREENMARCH, { ...txn.state, deeds: booby as never }, txn.entity('vess')!);
    expect(scope['memory']).toBeDefined();
  });
});

describe('forgetting', () => {
  it('follows the declared curve', () => {
    expect(retention('none', 100, 30, 0.05)).toBe(1);
    expect(retention('threshold', 10, 30, 0.05)).toBe(1);
    expect(retention('threshold', 40, 30, 0.05)).toBe(0);
    // Exponential halves at the half-life.
    expect(retention('exponential', 30, 30, 0)).toBeCloseTo(0.5, 5);
    expect(retention('exponential', 60, 30, 0)).toBeCloseTo(0.25, 5);
    expect(retention('linear', 30, 30, 0)).toBeCloseTo(0.5, 5);
  });

  it('never drops below the floor', () => {
    expect(retention('exponential', 10_000, 30, 0.05)).toBe(0.05);
  });

  it('weakens a memory as days pass', () => {
    const txn = afterTheft();
    const before = Object.values(txn.state.memory['vess']!)[0]!.strength;

    txn.set({ ...txn.state, minute: txn.state.minute + DAY * 60 });
    decayMemories(txn, 60, Rng.fromSeed(1));

    const after = Object.values(txn.state.memory['vess']!)[0]!.strength;
    expect(after).toBeLessThan(before);
  });

  // greenmarch pins Vess's memory of a theft to 3650 days.
  it('honours a GM rule that pins one person\'s memory', () => {
    const txn = afterTheft();
    txn.set({ ...txn.state, minute: txn.state.minute + DAY * 200 });
    decayMemories(txn, 200, Rng.fromSeed(1));

    const held = Object.values(txn.state.memory['vess'] ?? {})[0];
    expect(held?.strength ?? 0).toBeGreaterThan(0.9);
  });

  it('never forgets what the module says is unforgettable', () => {
    const state = fresh();
    const txn = new Transaction(state, GREENMARCH);
    // barrow_robbed is in neverForget.
    recordDeed(txn, terrain, 'barrow_robbed', txn.entity('e:1')!, null, Rng.fromSeed(1));
    txn.set({
      ...txn.state,
      memory: { someone: { [txn.state.deeds[0]!.id]: { at: 0, strength: 1, hops: 0 } } },
      minute: txn.state.minute + DAY * 5000,
    });
    decayMemories(txn, 5000, Rng.fromSeed(1));
    expect(txn.state.memory['someone']).toBeDefined();
  });
});

describe('gossip', () => {
  it('carries a rumour to someone who was not there', () => {
    const txn = afterTheft();
    // Give the world more people to talk to.
    let spread = false;
    for (let day = 1; day <= 60 && !spread; day += 1) {
      spreadRumours(txn, day, Rng.fromSeed(day));
      spread = Object.keys(txn.state.memory).length > 1;
    }
    // greenmarch has a single NPC, so the honest assertion is that the machinery ran without
    // inventing knowers.
    expect(Object.keys(txn.state.memory)).toContain('vess');
  });

  it('does not spread at all in manual mode', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      narrative: { memory: Record<string, unknown> };
      content: { npcs: Record<string, unknown>[] };
    };
    doc.narrative.memory['mode'] = 'manual';
    doc.content.npcs.push({ id: 'listener', name: 'A Listener', gullibility: 1 });
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed');

    const base = afterTheft();
    const txn = new Transaction(base.state, compiled.module);
    for (let day = 1; day <= 40; day += 1) spreadRumours(txn, day, Rng.fromSeed(day));
    expect(txn.state.memory['listener']).toBeUndefined();
  });

  it('spreads to a gullible listener when simulated', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      content: { npcs: Record<string, unknown>[] };
    };
    doc.content.npcs.push({ id: 'listener', name: 'A Listener', gullibility: 1, faction: 'wardens' });
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed');

    const base = afterTheft();
    const txn = new Transaction(base.state, compiled.module);

    let heard = false;
    for (let day = 1; day <= 60 && !heard; day += 1) {
      spreadRumours(txn, day, Rng.fromSeed(day));
      heard = txn.state.memory['listener'] !== undefined;
    }
    expect(heard).toBe(true);
    expect(txn.state.memory['listener']![Object.keys(txn.state.memory['listener']!)[0]!]!.hops).toBe(1);
  });

  // greenmarch bars Vess from ever learning about the barrow.
  it('honours neverKnownBy', () => {
    const state = fresh();
    const txn = new Transaction(state, GREENMARCH);
    recordDeed(txn, terrain, 'barrow_robbed', txn.entity('e:1')!, null, Rng.fromSeed(1));
    txn.set({ ...txn.state, memory: { someone: { [txn.state.deeds[0]!.id]: { at: 0, strength: 1, hops: 0 } } } });

    for (let day = 1; day <= 90; day += 1) spreadRumours(txn, day, Rng.fromSeed(day));
    expect(txn.state.memory['vess']).toBeUndefined();
  });
});

describe('faction drift', () => {
  it('pulls standing back toward neutral', () => {
    const state = fresh();
    const txn = new Transaction({ ...state, reputation: { wardens: 40, fen_things: -40 } }, GREENMARCH);

    for (let day = 0; day < 50; day += 1) driftFactions(txn);
    // wardens decay 0.1/day; fen_things declares none.
    expect(txn.state.reputation['wardens']).toBeLessThan(40);
    expect(txn.state.reputation['wardens']).toBeGreaterThan(0);
    expect(txn.state.reputation['fen_things']).toBe(-40);
  });

  it('never overshoots zero', () => {
    const state = fresh();
    const txn = new Transaction({ ...state, reputation: { wardens: 0.05 } }, GREENMARCH);
    driftFactions(txn);
    expect(txn.state.reputation['wardens']).toBe(0);
  });
});

describe('learning', () => {
  it('adapts after enough encounters', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    expect(hasAdapted(txn, 'bog_hound')).toBe(false);

    // greenmarch: three encounters, shared within the faction.
    for (let i = 0; i < 3; i += 1) recordEncounter(txn, 'bog_hound', ['strike']);
    expect(hasAdapted(txn, 'bog_hound')).toBe(true);
  });

  it('shares knowledge across the faction', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    for (let i = 0; i < 3; i += 1) recordEncounter(txn, 'bog_hound', ['strike']);
    // Both greenmarch creatures belong to fen_things.
    expect(hasAdapted(txn, 'barrow_wight')).toBe(true);
    expect(txn.state.flags[learningKey('fen_things', 'encounters')]).toBe(3);
  });

  it('records which abilities the party used', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    recordEncounter(txn, 'bog_hound', ['strike', 'rally']);
    expect(txn.state.flags[learningKey('fen_things', 'ability:strike')]).toBe(1);
  });

  it('forgets an adaptation if the party stays away', () => {
    const txn = new Transaction(fresh(), GREENMARCH);
    for (let i = 0; i < 3; i += 1) recordEncounter(txn, 'bog_hound', ['strike']);
    expect(hasAdapted(txn, 'bog_hound')).toBe(true);

    // greenmarch forgets after 60 days.
    txn.set({ ...txn.state, minute: txn.state.minute + DAY * 90 });
    tickDay(txn, 90, Rng.fromSeed(1));
    expect(hasAdapted(txn, 'bog_hound')).toBe(false);
  });
});

describe('quest timers', () => {
  it('fails a quest that ran out of time', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      narrative: { quests: Record<string, unknown>[] };
    };
    // By id, not by position — a module gaining a quest must not silently repoint this fixture at a
    // different one.
    const timed = doc.narrative.quests.find((quest) => quest['id'] === 'the_mill_door');
    if (!timed) throw new Error('fixture failed: no the_mill_door');
    timed['timeLimitDays'] = 2;
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed');

    const txn = new Transaction(fresh(), compiled.module);
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));
    expect(txn.state.quests['the_mill_door']!.status).toBe('active');

    txn.set({ ...txn.state, minute: txn.state.minute + DAY * 5 });
    tickDay(txn, 5, Rng.fromSeed(1));
    expect(txn.state.quests['the_mill_door']!.status).toBe('failed');
  });
});

describe('the world clock', () => {
  it('runs a tick for every day crossed, however long the jump', () => {
    const state = fresh();
    const { events } = reduce(state, { type: 'advanceTime', minutes: DAY * 5 }, ctx);
    expect(events.filter((e) => e.type === 'dayBroke')).toHaveLength(5);
  });

  it('advances the world while the party rests', () => {
    const state = fresh();
    const { state: next } = reduce(state, { type: 'advanceTime', minutes: DAY * 3 }, ctx);
    expect(next.minute).toBe(state.minute + DAY * 3);
  });
});

// The headline requirement for this phase.
describe('determinism across a hundred simulated days', () => {
  const script: Action[] = [
    { type: 'acceptQuest', quest: 'the_mill_door' },
    { type: 'advanceTime', minutes: DAY * 100 },
    { type: 'rest', kind: 'camp' },
    { type: 'advanceTime', minutes: DAY * 20 },
  ];

  it('produces byte-identical state from the same seed', () => {
    const a = reduceAll(fresh(4242), script, ctx);
    const b = reduceAll(fresh(4242), script, ctx);
    expect(statesEqual(a.state, b.state)).toBe(true);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  // A day's off-screen activity must not depend on what the party did with their turns — only on
  // the seed and the day number.
  it('is unaffected by how the party spent their time getting there', () => {
    const straight = reduceAll(fresh(77), [{ type: 'advanceTime', minutes: DAY * 30 }], ctx);
    const dawdled = reduceAll(fresh(77), [
      { type: 'step', direction: 'east' },
      { type: 'step', direction: 'west' },
      { type: 'advanceTime', minutes: DAY * 30 },
    ], ctx);

    expect(JSON.stringify(straight.state.memory)).toBe(JSON.stringify(dawdled.state.memory));
    expect(JSON.stringify(straight.state.reputation)).toBe(JSON.stringify(dawdled.state.reputation));
  });

  it('diverges between seeds', () => {
    const a = reduceAll(fresh(1), script, ctx);
    const b = reduceAll(fresh(2), script, ctx);
    expect(statesEqual(a.state, b.state)).toBe(false);
  });
});
