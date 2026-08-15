import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce, reduceAll } from './reduce.js';
import { save, load, statesEqual } from './save.js';
import { Transaction, applyOps, adjustResource, applyCondition } from './rules/apply.js';
import { tickConditions, rollConditionSaves } from './rules/conditions.js';
import { createMap, key, unkey } from './grid/tiles.js';
import { SAVE_VERSION } from './state.js';
import type { GameState } from './state.js';
import type { Action } from './actions.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');

/** A game with the party standing on a small open map. */
function started(module = GREENMARCH, seed = 1): GameState {
  const base = newGame(module, { seed, party: [defaultChoices(module, 'Ash')] });
  const floor = module.source.id === 'minimal' ? 'bare_floor' : 'floor';
  const tiles = createMap(11, 11, floor);

  const hero = base.entities[base.party[0]!]!;
  return {
    ...base,
    currentMap: 'test',
    maps: {
      test: { id: 'test', tiles, kind: 'room', source: 'test', explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1 },
    },
    entities: {
      ...base.entities,
      [hero.id]: { ...hero, map: 'test', position: { x: 5, y: 5 } },
    },
  };
}

function withMonster(state: GameState, module: CompiledModule, id: string, at: { x: number; y: number }): GameState {
  const monster = spawnMonster(module, 'e:99', id);
  return {
    ...state,
    entities: { ...state.entities, 'e:99': { ...monster, map: state.currentMap, position: at } },
  };
}

const ctx = { module: GREENMARCH };

describe('reduce', () => {
  it('moves a character one tile and records the cost', () => {
    const state = started();
    const { state: next, events } = reduce(state, { type: 'step', direction: 'east' }, ctx);

    expect(next.entities['e:1']!.position).toEqual({ x: 6, y: 5 });
    expect(events.some((e) => e.type === 'moved')).toBe(true);
  });

  it('refuses to walk into a wall and says what blocked it', () => {
    const base = started();
    const state: GameState = {
      ...base,
      maps: {
        test: { ...base.maps['test']!, tiles: { ...base.maps['test']!.tiles, tiles: base.maps['test']!.tiles.tiles.map((t, i) => (i === 5 * 11 + 6 ? 'wall' : t)) } },
      },
    };

    const { state: next, events } = reduce(state, { type: 'step', direction: 'east' }, ctx);
    expect(next.entities['e:1']!.position).toEqual({ x: 5, y: 5 });
    const blocked = events.find((e) => e.type === 'blocked');
    expect(blocked).toMatchObject({ by: 'wall' });
  });

  it('refuses to walk off the edge of the map', () => {
    const base = started();
    const state: GameState = {
      ...base,
      entities: { ...base.entities, 'e:1': { ...base.entities['e:1']!, position: { x: 0, y: 0 } } },
    };
    const { events } = reduce(state, { type: 'step', direction: 'west' }, ctx);
    expect(events.some((e) => e.type === 'blocked')).toBe(true);
  });

  it('will not walk through another creature', () => {
    const state = withMonster(started(), GREENMARCH, 'bog_hound', { x: 6, y: 5 });
    const { state: next, events } = reduce(state, { type: 'step', direction: 'east' }, ctx);
    expect(next.entities['e:1']!.position).toEqual({ x: 5, y: 5 });
    expect(events.find((e) => e.type === 'blocked')).toMatchObject({ by: 'Bog Hound' });
  });

  // What the party *saw*, not where they trod. Recording only the tile under
  // their feet left the remembered layer as a one-tile breadcrumb trail through
  // rooms they had stood in the middle of and looked around.
  it('remembers what the party could see, not just where they walked', () => {
    const state = started();
    const { state: next } = reduce(state, { type: 'step', direction: 'east' }, ctx);
    const explored = next.maps['test']!.explored;

    expect(explored.length).toBeGreaterThan(1);

    // A tile they can see but have never stood on is remembered...
    const walker = next.entities['e:1']!;
    const ahead = key({ x: walker.position.x + 2, y: walker.position.y });
    expect(explored).toContain(ahead);

    // ...and nothing off the edge of the map is.
    const map = next.maps['test']!;
    for (const packed of explored) {
      const at = unkey(packed);
      expect(at.x, `${at.x},${at.y}`).toBeGreaterThanOrEqual(0);
      expect(at.y, `${at.x},${at.y}`).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThan(map.tiles.width);
      expect(at.y).toBeLessThan(map.tiles.height);
    }

    // Sorted, so two runs that saw the same ground in a different order still
    // compare equal.
    expect([...explored].sort((a, b) => a - b)).toEqual([...explored]);
  });

  it('walks a whole route with travelTo', () => {
    const state = started();
    const { state: next } = reduce(state, { type: 'travelTo', to: { x: 8, y: 5 } }, ctx);
    expect(next.entities['e:1']!.position).toEqual({ x: 8, y: 5 });
    expect(next.maps['test']!.explored.length).toBeGreaterThan(1);
  });

  it('refuses an unreachable route rather than half-walking it', () => {
    const base = started();
    // Wall off the whole column east of the party.
    const walled = base.maps['test']!.tiles.tiles.map((t, i) => (i % 11 === 7 ? 'wall' : t));
    const state: GameState = {
      ...base,
      maps: { test: { ...base.maps['test']!, tiles: { ...base.maps['test']!.tiles, tiles: walled } } },
    };

    const { state: next, events } = reduce(state, { type: 'travelTo', to: { x: 9, y: 5 } }, ctx);
    expect(next.entities['e:1']!.position).toEqual({ x: 5, y: 5 });
    expect(events.find((e) => e.type === 'refused')).toMatchObject({ reason: 'no way through' });
  });

  it('advances the world clock and announces a new day', () => {
    const state = started();
    const { state: next, events } = reduce(state, { type: 'advanceTime', minutes: 1440 }, ctx);
    expect(next.minute).toBe(state.minute + 1440);
    expect(events.some((e) => e.type === 'dayBroke')).toBe(true);
  });

  it('selects another party member, and refuses a stranger', () => {
    const module = GREENMARCH;
    const base = newGame(module, {
      seed: 1,
      party: [defaultChoices(module, 'Ash'), defaultChoices(module, 'Vess')],
    });
    expect(reduce(base, { type: 'select', entity: 'e:2' }, ctx).state.selected).toBe('e:2');
    expect(
      reduce(base, { type: 'select', entity: 'e:99' }, ctx).events.some((e) => e.type === 'refused'),
    ).toBe(true);
  });

  // Tests the default branch directly rather than naming a specific
  // unimplemented action, which goes stale the moment that action is built.
  it('refuses an action it does not recognise, rather than throwing', () => {
    const bogus = { type: 'polymorph_into_a_goose' } as unknown as Action;
    const { events } = reduce(started(), bogus, ctx);
    const refusal = events.find((e) => e.type === 'refused');
    expect(refusal).toBeDefined();
    if (refusal?.type !== 'refused') return;
    expect(refusal.reason).toContain('polymorph_into_a_goose');
  });

  it('never mutates the state it was given', () => {
    const state = started();
    const snapshot = JSON.stringify(state);
    reduce(state, { type: 'step', direction: 'east' }, ctx);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

// The property the entire save and replay system rests on.
describe('the clock while walking', () => {
  it('spends the module\'s minutes per tile', () => {
    const state = started();
    const { state: next } = reduce(state, { type: 'step', direction: 'east' }, ctx);
    expect(next.minute - state.minute).toBe(GREENMARCH.source.world.time.minutesPerTile);
    expect(next.minute).toBeGreaterThan(state.minute);
  });

  it('spends nothing for a module that does not track it', () => {
    // minimal declares no clock at all, so walking is free — the feature is
    // opt-in, like everything else.
    const state = started(MINIMAL, 2);
    const { state: next } = reduce(state, { type: 'step', direction: 'east' }, { module: MINIMAL });
    expect(next.minute).toBe(state.minute);
  });

  it('does not run the clock during a fight', () => {
    // A round is seconds long; the world clock has no business moving.
    const state = withMonster(started(), GREENMARCH, 'bog_hound', { x: 8, y: 5 });
    const fighting = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
    expect(fighting.combat).not.toBeNull();

    const { state: next } = reduce(fighting, { type: 'step', direction: 'west' }, ctx);
    expect(next.minute).toBe(fighting.minute);
  });

  it('names the terrain that blocked you rather than its id', () => {
    const state = started();
    const walled: GameState = {
      ...state,
      entities: {
        ...state.entities,
        [state.party[0]!]: { ...state.entities[state.party[0]!]!, position: { x: 0, y: 5 } },
      },
    };
    const { events } = reduce(walled, { type: 'step', direction: 'west' }, ctx);
    const blocked = events.find((e) => e.type === 'blocked');
    expect(blocked).toBeDefined();
  });
});

describe('determinism', () => {
  const script: Action[] = [
    { type: 'step', direction: 'east' },
    { type: 'step', direction: 'south' },
    { type: 'advanceTime', minutes: 90 },
    { type: 'travelTo', to: { x: 3, y: 8 } },
    { type: 'endTurn' },
  ];

  it('produces byte-identical state from the same seed and actions', () => {
    const a = reduceAll(started(GREENMARCH, 4242), script, ctx);
    const b = reduceAll(started(GREENMARCH, 4242), script, ctx);
    expect(statesEqual(a.state, b.state)).toBe(true);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('advances the stored RNG, so state carries its own randomness', () => {
    const state = started();
    const next = reduce(state, { type: 'advanceTime', minutes: 10 }, ctx).state;
    // The generator is written back whether or not it was drawn from.
    expect(next.rng).toHaveLength(4);
  });
});

describe('applying effects', () => {
  function transact(state: GameState): Transaction {
    return new Transaction(state, GREENMARCH);
  }

  it('applies damage and reports the resource it came off', () => {
    const state = started();
    const txn = transact(state);
    const hero = txn.entity('e:1')!;
    const before = hero.resources['hp']!;

    applyOps(txn, [{ op: 'damage', target: 'e:1', amount: 4, damageType: 'slashing' }]);
    const { state: next, events } = txn.finish();

    expect(next.entities['e:1']!.resources['hp']).toBe(before - 4);
    expect(events.find((e) => e.type === 'damaged')).toMatchObject({ amount: 4, resource: 'hp' });
  });

  it('clamps healing at the maximum', () => {
    const txn = transact(started());
    applyOps(txn, [{ op: 'heal', target: 'e:1', amount: 999 }]);
    const hero = txn.finish().state.entities['e:1']!;
    expect(hero.resources['hp']).toBe(started().entities['e:1']!.resources['hp']);
  });

  it('kills an entity when its vital resource empties, and says who did it', () => {
    const txn = transact(started());
    applyOps(txn, [{ op: 'damage', target: 'e:1', amount: 9999, damageType: null }], 'e:99');
    const { state: next, events } = txn.finish();

    expect(next.entities['e:1']!.alive).toBe(false);
    expect(events.some((e) => e.type === 'depleted')).toBe(true);
    expect(events.find((e) => e.type === 'died')).toMatchObject({ killer: 'e:99' });
  });

  // Without this an area effect "kills" a corpse once per tick.
  it('does not damage or heal the dead', () => {
    const txn = transact(started());
    applyOps(txn, [{ op: 'damage', target: 'e:1', amount: 9999, damageType: null }]);
    const deaths = () => txn.finish().events.filter((e) => e.type === 'died').length;
    applyOps(txn, [{ op: 'damage', target: 'e:1', amount: 5, damageType: null }]);
    applyOps(txn, [{ op: 'heal', target: 'e:1', amount: 5 }]);
    expect(deaths()).toBe(1);
    expect(txn.finish().state.entities['e:1']!.alive).toBe(false);
  });

  it('refuses ops naming things the module does not define', () => {
    const txn = transact(started());
    applyOps(txn, [
      { op: 'adjustResource', target: 'e:1', resource: 'mana', amount: 1 },
      { op: 'applyCondition', target: 'e:1', condition: 'cursed', duration: 2, magnitude: null },
      { op: 'grantItem', target: 'e:1', item: 'excalibur', quantity: 1 },
      { op: 'adjustReputation', faction: 'nobody', amount: 5 },
    ]);
    const refusals = txn.finish().events.filter((e) => e.type === 'refused');
    expect(refusals).toHaveLength(4);
  });

  it('ignores ops aimed at entities that do not exist', () => {
    const txn = transact(started());
    applyOps(txn, [{ op: 'damage', target: 'nobody', amount: 5, damageType: null }]);
    expect(txn.finish().events).toHaveLength(0);
  });

  it('adds and removes inventory, merging stacks', () => {
    const txn = transact(started());
    applyOps(txn, [
      { op: 'grantItem', target: 'e:1', item: 'rope', quantity: 2 },
      { op: 'removeItem', target: 'e:1', item: 'rope', quantity: 1 },
    ]);
    const rope = txn.finish().state.entities['e:1']!.inventory.find((s) => s.item === 'rope');
    // The warden starts with one rope, gains two, loses one.
    expect(rope!.quantity).toBe(2);
  });

  it('sets flags and emits custom events for content to react to', () => {
    const txn = transact(started());
    applyOps(txn, [
      { op: 'setFlag', flag: 'mill_clear', value: true },
      { op: 'emit', event: 'deed', data: { kind: 'mill_cleared' } },
    ]);
    const { state: next, events } = txn.finish();
    expect(next.flags['mill_clear']).toBe(true);
    expect(events.find((e) => e.type === 'custom')).toMatchObject({ event: 'deed' });
  });

  it('spills reputation into allied and rival factions', () => {
    const txn = transact(started());
    applyOps(txn, [{ op: 'adjustReputation', faction: 'wardens', amount: 20 }]);
    const { state: next } = txn.finish();
    expect(next.reputation['wardens']).toBe(20);
    // greenmarch declares wardens ↔ fen_things at -0.5.
    expect(next.reputation['fen_things']).toBe(-20 + -10);
  });

  describe('damage interactions', () => {
    it('halves, negates, and doubles damage by type', () => {
      const module = loadModule('greenmarch');
      const doc = JSON.parse(JSON.stringify(module.source)) as Record<string, never>;
      const monsters = (doc as never as { content: { monsters: Record<string, unknown>[] } }).content.monsters;
      monsters[0]!['damageInteractions'] = [
        { damageType: 'fire', multiplier: 0.5, unless: [] },
        { damageType: 'slashing', multiplier: 0, unless: [] },
        { damageType: 'piercing', multiplier: 2, unless: [] },
      ];
      const compiled = compileModule(doc);
      if (!compiled.ok) throw new Error('fixture failed to compile');

      const base = withMonster(started(), compiled.module, 'bog_hound', { x: 6, y: 5 });
      const before = base.entities['e:99']!.resources['hp']!;

      const check = (damageType: string, amount: number): number => {
        const txn = new Transaction(base, compiled.module);
        applyOps(txn, [{ op: 'damage', target: 'e:99', amount, damageType }]);
        return before - (txn.finish().state.entities['e:99']!.resources['hp'] ?? 0);
      };

      expect(check('fire', 8)).toBe(4);
      expect(check('slashing', 8)).toBe(0);
      expect(check('piercing', 4)).toBe(8);
      expect(check('blunt', 6)).toBe(6);
    });
  });
});

describe('conditions', () => {
  function transact(state: GameState): Transaction {
    return new Transaction(state, GREENMARCH);
  }

  it('applies a condition with a duration', () => {
    const txn = transact(started());
    applyCondition(txn, txn.entity('e:1')!, 'frightened', 2, null, null);
    const { state: next, events } = txn.finish();
    expect(next.entities['e:1']!.conditions).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'conditionApplied', condition: 'frightened' });
  });

  it('refreshes rather than duplicating, per the declared stacking rule', () => {
    const txn = transact(started());
    applyCondition(txn, txn.entity('e:1')!, 'frightened', 2, null, null);
    applyCondition(txn, txn.entity('e:1')!, 'frightened', 5, null, null);
    const conditions = txn.finish().state.entities['e:1']!.conditions;
    expect(conditions).toHaveLength(1);
    expect(conditions[0]!.remaining).toBe(5);
  });

  it('counts down and expires', () => {
    const txn = transact(started());
    applyCondition(txn, txn.entity('e:1')!, 'frightened', 2, null, null);

    tickConditions(txn, 'e:1', Rng.fromSeed(1));
    expect(txn.entity('e:1')!.conditions[0]!.remaining).toBe(1);

    tickConditions(txn, 'e:1', Rng.fromSeed(1));
    expect(txn.entity('e:1')!.conditions).toHaveLength(0);
    expect(txn.finish().events.some((e) => e.type === 'conditionRemoved')).toBe(true);
  });

  it('runs onTick effects while active — bleeding deals damage each round', () => {
    const txn = transact(started());
    const before = txn.entity('e:1')!.resources['hp']!;
    applyCondition(txn, txn.entity('e:1')!, 'bleeding', 3, null, null);

    tickConditions(txn, 'e:1', Rng.fromSeed(1));
    expect(txn.entity('e:1')!.resources['hp']).toBe(before - 1);

    tickConditions(txn, 'e:1', Rng.fromSeed(1));
    expect(txn.entity('e:1')!.resources['hp']).toBe(before - 2);
  });

  // Greenmarch's `frightened` declares `defaultDuration: 2`, and that used to be
  // ignored — so "frightened for two rounds" meant frightened until something
  // removed it, for the rest of the game.
  it('falls back to the condition\'s own duration when an effect names none', () => {
    const txn = transact(started());
    applyCondition(txn, txn.entity('e:1')!, 'frightened', null, null, null);
    expect(txn.entity('e:1')!.conditions[0]!.remaining).toBe(2);

    for (let i = 0; i < 3; i += 1) tickConditions(txn, 'e:1', Rng.fromSeed(i));
    expect(txn.entity('e:1')!.conditions).toHaveLength(0);
  });

  it('leaves a condition with no declared duration in place forever', () => {
    // Both shipped modules give every condition a default, so "until removed"
    // needs a module that does not.
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { conditions: Record<string, unknown>[] };
    };
    const frightened = doc.rules.conditions.find((c) => c['id'] === 'frightened')!;
    delete frightened['defaultDuration'];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const txn = new Transaction(started(), compiled.module);
    applyCondition(txn, txn.entity('e:1')!, 'frightened', null, null, null);
    expect(txn.entity('e:1')!.conditions[0]!.remaining).toBeNull();

    for (let i = 0; i < 20; i += 1) tickConditions(txn, 'e:1', Rng.fromSeed(i));
    expect(txn.entity('e:1')!.conditions).toHaveLength(1);
  });

  // The whole point of running `onDepleted` before declaring death: a module
  // that catches the character on the way down keeps them alive, which is the
  // D&D "dropped to 0 and stabilised" shape. The engine needs no concept of
  // dying separate from a resource running out.
  it('lets onDepleted catch a character before death is declared', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { resources: Record<string, unknown>[]; conditions: Record<string, unknown>[] };
    };
    doc.rules.conditions.push({ id: 'downed', name: 'Downed', prevents: ['action'] });
    const hp = doc.rules.resources.find((r) => r['id'] === 'hp')!;
    hp['onDepleted'] = [
      { heal: { target: { ref: 'actor.id' }, amount: 1 } },
      { applyCondition: { target: { ref: 'actor.id' }, condition: 'downed' } },
    ];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const txn = new Transaction(started(compiled.module), compiled.module);
    const hero = txn.entity('e:1')!;
    adjustResource(txn, hero, 'hp', -999);

    const after = txn.entity('e:1')!;
    expect(after.alive).toBe(true);
    expect(after.resources['hp']).toBe(1);
    expect(after.conditions.map((c) => c.condition)).toContain('downed');
    expect(txn.finish().events.some((e) => e.type === 'died')).toBe(false);
  });

  it('still declares death when onDepleted does not intervene', () => {
    const txn = transact(started());
    adjustResource(txn, txn.entity('e:1')!, 'hp', -999);
    expect(txn.entity('e:1')!.alive).toBe(false);
    expect(txn.finish().events.some((e) => e.type === 'died')).toBe(true);
  });

  // "Save ends" is half of D&D's conditions, and the schema has always
  // described it — a save, a difficulty, a timing. Nothing rolled it, so a
  // condition with a save behaved exactly like one without.
  it('rolls a save to shake off a condition that allows one', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { conditions: Record<string, unknown>[]; savingThrows?: unknown[] };
    };
    doc.rules.savingThrows = [{ id: 'will', name: 'Will', attribute: 'presence' }];
    const frightened = doc.rules.conditions.find((c) => c['id'] === 'frightened')!;
    frightened['defaultDuration'] = 99;
    frightened['savingThrow'] = { save: 'will', difficulty: 5, timing: 'endOfTurn' };
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    // Difficulty 5 on a d20: a handful of end-of-turn passes will land it.
    const txn = new Transaction(started(), compiled.module);
    applyCondition(txn, txn.entity('e:1')!, 'frightened', null, null, null);
    expect(txn.entity('e:1')!.conditions).toHaveLength(1);

    for (let i = 0; i < 6 && txn.entity('e:1')!.conditions.length > 0; i += 1) {
      rollConditionSaves(txn, 'e:1', 'endOfTurn', Rng.fromSeed(i));
    }

    expect(txn.entity('e:1')!.conditions).toHaveLength(0);
    expect(txn.finish().events).toContainEqual(
      expect.objectContaining({ type: 'conditionRemoved', condition: 'frightened', reason: 'saved' }),
    );
  });

  it('does not roll a save at a timing the condition did not ask for', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { conditions: Record<string, unknown>[]; savingThrows?: unknown[] };
    };
    doc.rules.savingThrows = [{ id: 'will', name: 'Will', attribute: 'presence' }];
    const frightened = doc.rules.conditions.find((c) => c['id'] === 'frightened')!;
    frightened['savingThrow'] = { save: 'will', difficulty: 1, timing: 'endOfTurn' };
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const txn = new Transaction(started(), compiled.module);
    applyCondition(txn, txn.entity('e:1')!, 'frightened', null, null, null);
    for (let i = 0; i < 6; i += 1) rollConditionSaves(txn, 'e:1', 'startOfTurn', Rng.fromSeed(i));
    expect(txn.entity('e:1')!.conditions).toHaveLength(1);
  });

  it('respects condition immunity from a statblock', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      content: { monsters: Record<string, unknown>[] };
    };
    doc.content.monsters[0]!['conditionImmunities'] = ['frightened'];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const state = withMonster(started(), compiled.module, 'bog_hound', { x: 6, y: 5 });
    const txn = new Transaction(state, compiled.module);
    applyCondition(txn, txn.entity('e:99')!, 'frightened', 3, null, null);

    const { state: next, events } = txn.finish();
    expect(next.entities['e:99']!.conditions).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: 'conditionResisted', reason: 'immune' });
  });
});

describe('save and load', () => {
  it('round-trips exactly', () => {
    const state = reduceAll(started(GREENMARCH, 77), [
      { type: 'step', direction: 'east' },
      { type: 'advanceTime', minutes: 200 },
    ], ctx).state;

    const result = load(save(state, 0), GREENMARCH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(statesEqual(result.state, state)).toBe(true);
  });

  // The migration machinery had never once run before perception needed it.
  it('carries a save forward from the version before perception', () => {
    const current = started(GREENMARCH, 77);

    // A version 1 save is this one with the three perception fields stripped,
    // which is exactly what an older engine would have written.
    const old = JSON.parse(save(current, 0)) as {
      saveVersion: number;
      state: Record<string, any>;
    };
    old.saveVersion = 1;
    old.state.saveVersion = 1;
    for (const entity of Object.values(old.state.entities as Record<string, any>)) {
      delete entity.alerts;
      delete entity.stance;
      delete entity.following;
    }
    for (const map of Object.values(old.state.maps as Record<string, any>)) {
      delete map.marks;
    }

    const result = load(JSON.stringify(old), GREENMARCH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Every step of the chain runs, not just the first.
    expect(result.warnings).toContain('migrated save from version 1 to 2');
    expect(result.warnings).toContain('migrated save from version 2 to 3');
    // Not merely loadable — indistinguishable from a save written today, which
    // is the property that stops a migrated game drifting from a fresh one.
    expect(statesEqual(result.state, current)).toBe(true);
  });

  it('carries a save forward from the version before the party walked together', () => {
    const current = started(GREENMARCH, 77);

    const old = JSON.parse(save(current, 0)) as {
      saveVersion: number;
      state: Record<string, any>;
    };
    old.saveVersion = 2;
    old.state.saveVersion = 2;
    for (const entity of Object.values(old.state.entities as Record<string, any>)) {
      delete entity.following;
    }

    const result = load(JSON.stringify(old), GREENMARCH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(statesEqual(result.state, current)).toBe(true);
  });

  it('refuses a save it has no way to bring forward', () => {
    const state = started(GREENMARCH);
    const orphaned = JSON.stringify({ saveVersion: 0, savedAt: 0, state });
    const result = load(orphaned, GREENMARCH);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no migration from save version 0 to 1/);
  });

  it('refuses a save from a different module', () => {
    const result = load(save(started(GREENMARCH), 0), MINIMAL);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/belongs to module/);
  });

  // An edited module is the common case, so it must be reported, not guessed at.
  it('refuses a save whose module has changed, unless drift is allowed', () => {
    const state = started(GREENMARCH);
    const drifted: GameState = { ...state, module: { ...state.module, hash: 'deadbeefdeadbeef' } };

    const refused = load(save(drifted, 0), GREENMARCH);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/has changed/);

    const allowed = load(save(drifted, 0), GREENMARCH, { allowModuleDrift: true });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.warnings[0]).toMatch(/has changed/);
  });

  // A migration that forgets to move `saveVersion` produces a state forever
  // unequal to an identical fresh one, which the determinism net then blames on
  // whatever changed last.
  it('migrates a v3 save forward into a world with no traps and no money', () => {
    const current = started(GREENMARCH, 21);
    const raw = JSON.parse(save(current, 0)) as {
      saveVersion: number;
      state: { saveVersion: number; maps: Record<string, Record<string, unknown>> };
    };

    // Roll it back to what a version-3 save looked like.
    raw.saveVersion = 3;
    raw.state.saveVersion = 3;
    delete (raw.state as Record<string, unknown>)['purse'];
    for (const map of Object.values(raw.state.maps)) {
      delete map['traps'];
      delete map['rooms'];
      delete map['depth'];
    }

    const loaded = load(JSON.stringify(raw), GREENMARCH);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(loaded.state.saveVersion).toBe(SAVE_VERSION);
    const map = loaded.state.maps['test']!;
    expect(map.traps).toEqual({});
    expect(map.rooms).toEqual([]);
    expect(map.depth).toBe(1);
    // An old party is exactly as poor as it was.
    expect(loaded.state.purse).toBe(0);

    // And it is otherwise the same game it was saved from. The purse is the one
    // thing a v3 save genuinely does not know, so it is compared against zero
    // rather than against a party that started with coin.
    expect(statesEqual(loaded.state, { ...current, purse: 0 })).toBe(true);
  });

  it('refuses a save written by a newer engine', () => {
    const text = JSON.stringify({ saveVersion: 999, savedAt: 0, state: started() });
    const result = load(text, GREENMARCH);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer engine/);
  });

  it('reports malformed saves rather than throwing', () => {
    expect(load('{not json', GREENMARCH).ok).toBe(false);
    expect(load('{"saveVersion":1}', GREENMARCH).ok).toBe(false);
  });

  it('survives a full replay after reloading mid-run', () => {
    const script: Action[] = [
      { type: 'step', direction: 'east' },
      { type: 'step', direction: 'east' },
      { type: 'advanceTime', minutes: 60 },
    ];
    const straight = reduceAll(started(GREENMARCH, 5), script, ctx).state;

    // Same actions, but saved and reloaded halfway through.
    const half = reduceAll(started(GREENMARCH, 5), script.slice(0, 2), ctx).state;
    const reloaded = load(save(half, 0), GREENMARCH);
    if (!reloaded.ok) throw new Error(reloaded.error);
    const resumed = reduceAll(reloaded.state, script.slice(2), ctx).state;

    expect(statesEqual(resumed, straight)).toBe(true);
  });
});

/**
 * The standing net for everything that adds to state.
 *
 * `statesEqual` compares canonical JSON *including the RNG position*, so one
 * script run twice catches the four ways a new state field goes wrong: a `Set`
 * or `Map` (which `JSON.stringify` flattens to `{}`), a `"x,y"` tile key
 * (which enumerates in string order), an id-keyed record where an array with a
 * total sort was needed, and a migration that forgot to move `saveVersion`.
 *
 * It runs against a real `newGame` rather than a synthetic map so that map
 * generation, arrival, and the world clock are all inside the comparison.
 */
describe('determinism', () => {
  const step = (...directions: readonly ('north' | 'south' | 'east' | 'west')[]): Action[] =>
    directions.map((direction) => ({ type: 'step', direction }));

  // `newGame` leaves the party on no map — arriving is the front end's first
  // act — so the script travels before it tries to walk.
  const script: Action[] = [
    { type: 'travelToArea', area: 'the_fens' },
    { type: 'look' },
    ...step('east', 'east', 'south', 'south', 'west', 'north'),
    { type: 'setStance', stance: 'sneak' },
    { type: 'sense', sense: 'hearing' },
    { type: 'advanceTime', minutes: 90 },
    { type: 'endTurn' },
    ...step('east', 'north', 'north', 'west'),
    { type: 'advanceTime', minutes: 600 },
    { type: 'travelToArea', area: 'millford' },
    { type: 'enter', target: 'millford_village' },
    { type: 'search' },
    { type: 'look' },
  ];

  const run = (seed: number) =>
    reduceAll(newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] }), script, ctx);
  const play = (seed: number) => run(seed).state;

  // A script of nothing but refusals would replay identically too, so the net
  // is only worth having while the run is genuinely doing something.
  it('is a script that actually plays', () => {
    const { state, events } = run(4242);
    expect(events.filter((event) => event.type === 'moved').length).toBeGreaterThanOrEqual(8);
    expect(events.some((event) => event.type === 'triggerFired')).toBe(true);
    expect(Object.keys(state.maps)).toHaveLength(2);
    expect(state.location).toEqual({ kind: 'poi', area: 'millford', poi: 'millford_village' });
    // Every refusal must be one the script means; "not on a map" is not.
    for (const event of events) {
      if (event.type === 'refused') expect(event.reason).toMatch(/you find nothing here/);
    }
  });

  it('replays the same script to the same state', () => {
    expect(statesEqual(play(4242), play(4242))).toBe(true);
  });

  it('reaches a state a save round-trip cannot tell from the original', () => {
    const played = play(4242);
    const reloaded = load(save(played, 0), GREENMARCH);
    if (!reloaded.ok) throw new Error(reloaded.error);
    expect(statesEqual(reloaded.state, played)).toBe(true);
  });

  it('gives a different seed a different run', () => {
    expect(statesEqual(play(4242), play(9999))).toBe(false);
  });
});

// The no-hardcoding proof, now that the engine actually does something.
describe('nothing is hardcoded', () => {
  it('runs the whole spine against minimal\'s alien ruleset', () => {
    const state = started(MINIMAL, 9);
    const context = { module: MINIMAL };

    const moved = reduce(state, { type: 'step', direction: 'east' }, context);
    expect(moved.events.some((e) => e.type === 'moved')).toBe(true);

    const txn = new Transaction(moved.state, MINIMAL);
    const hero = txn.entity('e:1')!;
    // minimal's vital resource is "vitality", not "hp".
    const before = hero.resources['vitality']!;
    adjustResource(txn, hero, 'vitality', -3);
    expect(txn.entity('e:1')!.resources['vitality']).toBe(before - 3);

    applyOps(txn, [{ op: 'damage', target: 'e:1', amount: 9999, damageType: 'blunt' }]);
    expect(txn.entity('e:1')!.alive).toBe(false);

    const dead = txn.finish().state;
    const settled = reduce(dead, { type: 'wait', minutes: 1 }, context);
    expect(settled.state.outcome).toBe('defeat');
  });

  it('has no game-specific vocabulary in the engine source', () => {
    // If the engine mentions a fantasy attribute or resource by name, some
    // module out there cannot run on it.
    const banned = ['"might"', '"agility"', '"hp"', "'hp'", '"fire"', '"slashing"', '"warden"'];
    const files = [
      'reduce.ts', 'save.ts', 'events.ts', 'actions.ts', 'state.ts', 'stats.ts',
      'character.ts', 'newgame.ts', 'rules/apply.ts', 'rules/conditions.ts',
      'grid/tiles.ts', 'grid/geometry.ts', 'grid/fov.ts', 'grid/path.ts',
    ];
    for (const file of files) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      for (const word of banned) {
        expect(source.includes(word), `${file} mentions ${word}`).toBe(false);
      }
    }
  });
});
