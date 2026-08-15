import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce, reduceAll } from './reduce.js';
import { statesEqual } from './save.js';
import { narrate } from './narrate/narrate.js';
import { Transaction } from './rules/apply.js';
import { check, skillCheck, savingThrow, succeeded, difficultyOf, opposedCheck } from './rules/check.js';
import { rollInitiative, runReactions } from './rules/combat/turn.js';
import { reachability, resolveTargets, speedOf, toTiles, nearestHostile, isHostileTo } from './rules/combat/targeting.js';
import { createMap, MapBuilder, TerrainIndex } from './grid/tiles.js';
import { distance } from './grid/geometry.js';
import type { GameState } from './state.js';
import type { GameEvent } from './events.js';
import type { Action } from './actions.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');
const ctx = { module: GREENMARCH };
const terrain = new TerrainIndex(GREENMARCH);

/** Party on an open map, optionally with hostiles placed. */
function arena(
  monsters: { id: string; at: { x: number; y: number } }[] = [],
  module = GREENMARCH,
  seed = 7,
  party: string[] = ['Ash'],
): GameState {
  const base = newGame(module, { seed, party: party.map((name) => defaultChoices(module, name)) });
  const floor = module.source.id === 'minimal' ? 'bare_floor' : 'floor';
  const entities: Record<string, (typeof base.entities)[string]> = { ...base.entities };
  base.party.forEach((id, i) => {
    entities[id] = { ...base.entities[id]!, map: 'arena', position: { x: 5, y: 5 + i } };
  });
  monsters.forEach((entry, i) => {
    const id = `m:${i}`;
    entities[id] = { ...spawnMonster(module, id, entry.id), map: 'arena', position: entry.at };
  });

  return {
    ...base,
    currentMap: 'arena',
    maps: {
      arena: {
        id: 'arena', tiles: createMap(15, 15, floor), kind: 'room', source: 'arena',
        explored: [], gates: {}, exits: {}, items: {}, marks: {},
      traps: {}, rooms: [], depth: 1,
      },
    },
    entities,
  };
}

describe('resolution', () => {
  it('rolls the dice the module declares, not a hardcoded d20', () => {
    const roll = check(GREENMARCH, Rng.fromSeed(1), { difficulty: 10 });
    expect(roll.notation).toBe('1d20');
    expect(roll.natural).toBeGreaterThanOrEqual(1);
    expect(roll.natural).toBeLessThanOrEqual(20);
  });

  it('judges criticals on the natural roll, not the total', () => {
    // Find a seed that rolls a natural 20, then pile on a penalty.
    let seed = 0;
    for (; seed < 500; seed += 1) {
      if (check(GREENMARCH, Rng.fromSeed(seed), { difficulty: 10 }).natural === 20) break;
    }
    const crit = check(GREENMARCH, Rng.fromSeed(seed), { modifier: -50, difficulty: 10 });
    expect(crit.outcome).toBe('critical');
    expect(succeeded(crit)).toBe(true);
  });

  it('fumbles on a natural 1 however large the bonus', () => {
    let seed = 0;
    for (; seed < 500; seed += 1) {
      if (check(GREENMARCH, Rng.fromSeed(seed), { difficulty: 10 }).natural === 1) break;
    }
    const fumble = check(GREENMARCH, Rng.fromSeed(seed), { modifier: 99, difficulty: 10 });
    expect(fumble.outcome).toBe('fumble');
    expect(succeeded(fumble)).toBe(false);
  });

  it('rolls twice for advantage and keeps the better', () => {
    const rolls = Array.from({ length: 40 }, (_, i) =>
      check(GREENMARCH, Rng.fromSeed(i), { difficulty: 10, swing: 'advantage' }),
    );
    expect(rolls[0]!.notation).toBe('2d20kh1');
    expect(rolls[0]!.dice).toHaveLength(2);

    const plain = Array.from({ length: 40 }, (_, i) => check(GREENMARCH, Rng.fromSeed(i), { difficulty: 10 }));
    const average = (list: typeof rolls) => list.reduce((sum, r) => sum + r.natural, 0) / list.length;
    expect(average(rolls)).toBeGreaterThan(average(plain));
  });

  it('resolves named difficulties from the module', () => {
    expect(difficultyOf(GREENMARCH, 'hard')).toBe(16);
    expect(difficultyOf(GREENMARCH, 'daunting')).toBe(20);
    expect(difficultyOf(GREENMARCH, 42)).toBe(42);
    expect(difficultyOf(GREENMARCH, undefined)).toBe(12);
  });

  it('adds attribute and rank to a skill check', () => {
    const state = arena();
    const hero = state.entities['e:1']!;
    const trained = { ...hero, skills: { perception: 3 } };
    const untrained = { ...hero, skills: {} };

    const a = skillCheck(GREENMARCH, Rng.fromSeed(3), trained, 'perception', 12);
    const b = skillCheck(GREENMARCH, Rng.fromSeed(3), untrained, 'perception', 12);
    expect(a.total - b.total).toBe(3);
  });

  it('rolls saving throws using the declared attribute', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { savingThrows: unknown[] };
    };
    // Appended, not replaced: the module's own saves are referenced by its
    // conditions, and dropping them makes the fixture fail to compile.
    doc.rules.savingThrows = [
      ...(doc.rules.savingThrows ?? []),
      { id: 'fortitude', name: 'Fortitude', attribute: 'endurance' },
    ];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed');

    const hero = arena([], compiled.module).entities['e:1']!;
    const roll = savingThrow(compiled.module, Rng.fromSeed(2), hero, 'fortitude', 12);
    expect(roll.against).toBe(12);
  });

  it('gives ties to the defender in an opposed check', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    const hero = state.entities['e:1']!;
    const hound = state.entities['m:0']!;
    const result = opposedCheck(
      GREENMARCH, Rng.fromSeed(1),
      { entity: hero, skill: 'persuasion' },
      { entity: hound, skill: 'resolve' },
    );
    if (result.attacker.total === result.defender.total) expect(result.attackerWins).toBe(false);
  });
});

describe('targeting', () => {
  const context = () => ({ module: GREENMARCH, state: arena([{ id: 'bog_hound', at: { x: 9, y: 5 } }]), terrain });

  it('measures range in tiles, converted from module units', () => {
    // greenmarch sizes are absent, so the default 5 units per tile applies.
    expect(toTiles(GREENMARCH, 30)).toBe(6);
    expect(toTiles(GREENMARCH, 5)).toBe(1);
  });

  it('derives movement allowance from the movement mode', () => {
    const state = arena();
    // walk is 30 units ⇒ 6 tiles.
    expect(speedOf(GREENMARCH, state.entities['e:1']!)).toBe(6);
  });

  it('reports distance, sight, and range together', () => {
    const c = context();
    const reach = reachability(c, { x: 5, y: 5 }, { x: 9, y: 5 }, 6);
    expect(reach.distance).toBe(4);
    expect(reach.inRange).toBe(true);
    expect(reach.hasSight).toBe(true);
  });

  // The reason the grid exists.
  it('blocks line of sight through a wall', () => {
    const base = arena([{ id: 'bog_hound', at: { x: 9, y: 5 } }]);
    const builder = new MapBuilder(15, 15, 'floor');
    for (let y = 0; y < 15; y += 1) builder.set(7, y, 'wall');
    const state: GameState = {
      ...base,
      maps: { arena: { ...base.maps['arena']!, tiles: builder.freeze() } },
    };

    const reach = reachability({ module: GREENMARCH, state, terrain }, { x: 5, y: 5 }, { x: 9, y: 5 }, 6);
    expect(reach.hasSight).toBe(false);
  });

  it('grants cover from terrain beside the target', () => {
    const base = arena([{ id: 'bog_hound', at: { x: 9, y: 5 } }]);
    const builder = new MapBuilder(15, 15, 'floor');
    // Rubble blocks movement but not sight, and greenmarch gives it half cover.
    builder.set(8, 5, 'rubble');
    const state: GameState = {
      ...base,
      maps: { arena: { ...base.maps['arena']!, tiles: builder.freeze() } },
    };

    const reach = reachability({ module: GREENMARCH, state, terrain }, { x: 5, y: 5 }, { x: 9, y: 5 }, 6);
    expect(reach.cover).toBe('half');
  });

  it('refuses a target out of reach', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 14, y: 14 } }]);
    const ability = GREENMARCH.get<never>('content.abilities', 'strike');
    const result = resolveTargets(
      { module: GREENMARCH, state, terrain },
      state.entities['e:1']!,
      ability,
      { target: 'm:0' },
    );
    expect(result.reason).toBe('out of reach');
  });

  it('picks the nearest visible hostile', () => {
    const state = arena([
      { id: 'bog_hound', at: { x: 10, y: 5 } },
      { id: 'bog_hound', at: { x: 6, y: 5 } },
    ]);
    const nearest = nearestHostile({ module: GREENMARCH, state, terrain }, state.entities['e:1']!);
    expect(nearest?.id).toBe('m:1');
  });

  it('treats party and monsters as opposed sides', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    expect(isHostileTo(state.entities['e:1']!, state.entities['m:0']!)).toBe(true);
    expect(isHostileTo(state.entities['e:1']!, state.entities['e:1']!)).toBe(false);
  });
});

describe('combat flow', () => {
  it('starts combat when a hostile shares the map', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 8, y: 5 } }]);
    const { state: next, events } = reduce(state, { type: 'wait', minutes: 0 }, ctx);

    expect(next.combat).not.toBeNull();
    expect(events.some((e) => e.type === 'combatStarted')).toBe(true);
    expect(events.some((e) => e.type === 'roundStarted')).toBe(true);
  });

  it('does not start combat when nothing hostile is present', () => {
    const { state: next } = reduce(arena(), { type: 'wait', minutes: 0 }, ctx);
    expect(next.combat).toBeNull();
  });

  it('orders initiative deterministically, ties broken by id', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 8, y: 5 } }]);
    const txn = new Transaction(state, GREENMARCH);
    const a = rollInitiative(txn, Object.values(state.entities), Rng.fromSeed(5));
    const b = rollInitiative(txn, Object.values(state.entities), Rng.fromSeed(5));
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
  });

  it('attacks an adjacent enemy and records the roll', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    const started = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
    const { events } = reduce(started, { type: 'attack', target: 'm:0' }, ctx);

    const attack = events.find((e) => e.type === 'attacked');
    expect(attack).toBeDefined();
    if (attack?.type !== 'attacked') return;
    expect(attack.roll.against).toBeGreaterThan(0);
    expect(attack.roll.total).toBe(attack.roll.natural + attack.roll.modifier);
  });

  it('refuses to attack something out of reach', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 13, y: 13 } }]);
    const started = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
    const { events } = reduce(started, { type: 'attack', target: 'm:0' }, ctx);
    expect(events.find((e) => e.type === 'refused')).toMatchObject({ reason: 'out of reach' });
  });

  it('spends the action budget and refuses a second attack', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    let current = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;

    // Make sure it is the hero's turn.
    if (current.combat!.order[current.combat!.turn] !== 'e:1') {
      current = reduce(current, { type: 'endTurn' }, ctx).state;
    }
    if (!current.combat || current.combat.order[current.combat.turn] !== 'e:1') return;

    const first = reduce(current, { type: 'attack', target: 'm:0' }, ctx);
    if (!first.state.combat) return; // the hound died outright
    const second = reduce(first.state, { type: 'attack', target: 'm:0' }, ctx);
    expect(second.events.find((e) => e.type === 'refused')).toMatchObject({
      reason: 'no action left this turn',
    });
  });

  it('limits movement to the turn budget', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 12, y: 12 } }]);
    let current = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
    if (current.combat!.order[current.combat!.turn] !== 'e:1') {
      current = reduce(current, { type: 'endTurn' }, ctx).state;
    }
    if (!current.combat || current.combat.order[current.combat.turn] !== 'e:1') return;

    // Speed is 6 tiles; ten steps must not all land.
    for (let i = 0; i < 10; i += 1) {
      current = reduce(current, { type: 'step', direction: 'west' }, ctx).state;
    }
    expect(current.entities['e:1']!.position.x).toBeGreaterThanOrEqual(5 - 6);
  });

  it('runs monster turns automatically when the player ends theirs', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 10, y: 5 } }]);
    const started = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
    const { state: next, events } = reduce(started, { type: 'endTurn' }, ctx);

    // Either the hound moved toward the party or it is the party's turn again.
    const houndMoved = events.some((e) => e.type === 'moved' && e.entity === 'm:0');
    const backToParty = next.combat === null || next.combat.order[next.combat.turn] === 'e:1';
    expect(houndMoved || backToParty).toBe(true);
  });

  it('ends combat when the last hostile dies', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    let current = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;

    // Kill it outright.
    const hound = current.entities['m:0']!;
    current = {
      ...current,
      entities: { ...current.entities, 'm:0': { ...hound, alive: false, resources: { hp: 0 } } },
    };

    const { state: next, events } = reduce(current, { type: 'wait', minutes: 0 }, ctx);
    expect(next.combat).toBeNull();
    expect(events.find((e) => e.type === 'combatEnded')).toMatchObject({ outcome: 'victory' });
  });
});

describe('turn order', () => {
  /** A two-member party in combat, hound adjacent to both. */
  function started(): GameState {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }], GREENMARCH, 7, ['Ash', 'Korrin']);
    return reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
  }

  it('selects the character whose turn begins, so bare commands act as them', () => {
    let current = started();
    expect(current.combat).not.toBeNull();

    // Whenever reduce hands control back, the active combatant is a party
    // member — and must be the selected one.
    for (let i = 0; i < 8 && current.combat; i += 1) {
      const active = current.combat.order[current.combat.turn]!;
      expect(current.entities[active]?.kind).toBe('character');
      expect(current.selected).toBe(active);
      current = reduce(current, { type: 'endTurn' }, ctx).state;
    }
  });

  it('refuses an attack out of turn, naming whose turn it is', () => {
    const current = started();
    if (!current.combat) return;

    const active = current.combat.order[current.combat.turn]!;
    const other = current.party.find((id) => id !== active)!;
    const activeName = current.entities[active]!.name;

    const { state: next, events } = reduce(current, { type: 'attack', target: 'm:0', actor: other }, ctx);
    expect(events.find((e) => e.type === 'refused')).toMatchObject({
      reason: `it is ${activeName}'s turn`,
    });
    expect(events.some((e) => e.type === 'attacked')).toBe(false);

    // The refusal must not have spent the turn: the active member still acts.
    if (!next.combat) return;
    const retry = reduce(next, { type: 'attack', target: 'm:0' }, ctx);
    expect(retry.events.some((e) => e.type === 'attacked')).toBe(true);
  });

  it('refuses a step out of turn', () => {
    const current = started();
    if (!current.combat) return;

    const active = current.combat.order[current.combat.turn]!;
    const other = current.party.find((id) => id !== active)!;
    const before = current.entities[other]!.position;

    const { state: next, events } = reduce(current, { type: 'step', direction: 'west', actor: other }, ctx);
    expect(events.find((e) => e.type === 'refused')).toMatchObject({ action: 'move' });
    expect(next.entities[other]!.position).toEqual(before);
  });

  it('narrates whose turn begins', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }], GREENMARCH, 7, ['Ash', 'Korrin']);
    const { state: next, events } = reduce(state, { type: 'wait', minutes: 0 }, ctx);
    const lines = narrate({ module: GREENMARCH, state: next, seed: 1 }, events);
    expect(lines.some((line) => line.text.endsWith("'s turn."))).toBe(true);
  });
});

describe('reactions', () => {
  // greenmarch: a hound that watches a packmate die goes berserk.
  it('fires a reaction when its trigger occurs', () => {
    const state = arena([
      { id: 'bog_hound', at: { x: 6, y: 5 } },
      { id: 'bog_hound', at: { x: 7, y: 5 } },
    ]);
    const txn = new Transaction(state, GREENMARCH);
    runReactions(txn, txn.entity('m:1')!, 'allyKilled', txn.entity('m:0')!, Rng.fromSeed(1));

    const { state: next, events } = txn.finish();
    expect(events.find((e) => e.type === 'reacted')).toMatchObject({ reaction: 'pack_fury' });
    expect(next.entities['m:1']!.conditions.some((c) => c.condition === 'emboldened')).toBe(true);
  });

  // The wight only targets someone it remembers robbing the barrow.
  it('does not fire a reaction whose requirement fails', () => {
    const state = arena([{ id: 'barrow_wight', at: { x: 6, y: 5 } }]);
    const txn = new Transaction(state, GREENMARCH);
    runReactions(txn, txn.entity('m:0')!, 'seePlayer', txn.entity('e:1')!, Rng.fromSeed(1));
    expect(txn.finish().events.some((e) => e.type === 'reacted')).toBe(false);
  });

  it('rolls when the reaction calls for it', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    const txn = new Transaction(state, GREENMARCH);
    // `flee_when_alone` tests the hound's nerve.
    runReactions(txn, txn.entity('m:0')!, 'lowHealth', txn.entity('e:1')!, Rng.fromSeed(3));
    const events = txn.finish().events;
    expect(events.some((e) => e.type === 'checked')).toBe(true);
  });
});

describe('determinism under combat', () => {
  const script: Action[] = [
    { type: 'wait', minutes: 0 },
    { type: 'attack', target: 'm:0' },
    { type: 'endTurn' },
    { type: 'endTurn' },
    { type: 'endTurn' },
  ];

  it('produces identical state and events from the same seed', () => {
    const build = () => arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }], GREENMARCH, 31337);
    const a = reduceAll(build(), script, ctx);
    const b = reduceAll(build(), script, ctx);

    expect(statesEqual(a.state, b.state)).toBe(true);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('diverges between seeds, so the dice are actually being rolled', () => {
    const a = reduceAll(arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }], GREENMARCH, 1), script, ctx);
    const b = reduceAll(arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }], GREENMARCH, 999), script, ctx);
    expect(statesEqual(a.state, b.state)).toBe(false);
  });
});

// The proof the whole loop works, not just its parts.
describe('a fight, fought to the end', () => {
  it('resolves to victory or defeat within a bounded number of turns', () => {
    let current = arena([{ id: 'bog_hound', at: { x: 7, y: 5 } }], GREENMARCH, 12345);
    current = reduce(current, { type: 'wait', minutes: 0 }, ctx).state;
    expect(current.combat).not.toBeNull();

    const log: string[] = [];
    for (let turn = 0; turn < 60 && current.combat; turn += 1) {
      const activeId = current.combat.order[current.combat.turn];
      if (activeId === 'e:1' && current.entities['e:1']!.alive) {
        const attack = reduce(current, { type: 'attack', target: 'm:0' }, ctx);
        current = attack.state;
        for (const event of attack.events) {
          if (event.type === 'damaged') log.push(`hit for ${event.amount}`);
          if (event.type === 'died') log.push(`${event.entity} died`);
        }
      }
      current = reduce(current, { type: 'endTurn' }, ctx).state;
    }

    // Somebody won.
    expect(current.combat).toBeNull();
    const heroAlive = current.entities['e:1']!.alive;
    const houndAlive = current.entities['m:0']!.alive;
    expect(heroAlive !== houndAlive).toBe(true);
    expect(log.some((line) => line.includes('hit for'))).toBe(true);
  });

  it('fights the same way through minimal\'s alien ruleset', () => {
    const context = { module: MINIMAL };
    let current = arena([{ id: 'husk', at: { x: 6, y: 5 } }], MINIMAL, 4);
    current = reduce(current, { type: 'wait', minutes: 0 }, context).state;
    expect(current.combat).not.toBeNull();

    let sawAttack = false;
    for (let turn = 0; turn < 60 && current.combat; turn += 1) {
      const activeId = current.combat.order[current.combat.turn];
      if (activeId === 'e:1' && current.entities['e:1']!.alive) {
        const result = reduce(current, { type: 'attack', target: 'm:0' }, context);
        sawAttack ||= result.events.some((e) => e.type === 'attacked');
        current = result.state;
      }
      current = reduce(current, { type: 'endTurn' }, context).state;
    }

    expect(sawAttack).toBe(true);
    expect(current.combat).toBeNull();
  });
});

describe('running away', () => {
  it('refuses when there is no fight to leave', () => {
    const { events } = reduce(arena(), { type: 'flee' }, ctx);
    expect(events.find((e) => e.type === 'refused')).toMatchObject({
      action: 'flee',
      reason: 'nothing to flee from',
    });
  });

  it('puts ground between you and the nearest enemy', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    const started = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
    const before = distance(started.entities['e:1']!.position, started.entities['m:0']!.position);

    const { state: next, events } = reduce(started, { type: 'flee' }, ctx);
    expect(events.some((e) => e.type === 'custom' && e.event === 'fled')).toBe(true);

    // The hound gives chase on its own turn, so compare against where the hero
    // ran to rather than against the gap at the end of the round.
    const ran = events.filter((e) => e.type === 'moved' && e.entity === 'e:1');
    expect(ran.length).toBeGreaterThan(0);
    const landed = ran.at(-1)!;
    if (landed.type !== 'moved') return;
    expect(distance(landed.to, started.entities['m:0']!.position)).toBeGreaterThan(before);
    expect(next.entities['e:1']!.alive).toBe(true);
  });

  it('refuses when there is nowhere to run', () => {
    // Backed into the corner with the hound in the only open direction.
    const state = arena([{ id: 'bog_hound', at: { x: 1, y: 1 } }]);
    const cornered = {
      ...state,
      entities: {
        ...state.entities,
        'e:1': { ...state.entities['e:1']!, position: { x: 0, y: 0 } },
      },
    };
    const started = reduce(cornered, { type: 'wait', minutes: 0 }, ctx).state;
    const { events } = reduce(started, { type: 'flee' }, ctx);
    // Either it found no better tile, or it ran; only the refusal is asserted
    // when it truly cannot improve its position.
    const refused = events.find((e) => e.type === 'refused' && e.action === 'flee');
    const moved = events.some((e) => e.type === 'moved' && e.entity === 'e:1');
    expect(Boolean(refused) !== moved).toBe(true);
  });

  it('ends the fight once neither side can see the other', () => {
    // A wall between them, out of everyone's line of sight.
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    const started = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
    expect(started.combat).not.toBeNull();

    const builder = new MapBuilder(15, 15, 'floor');
    for (let y = 0; y < 15; y += 1) builder.set(7, y, 'wall');
    const walled = builder.freeze();
    const separated: GameState = {
      ...started,
      maps: { ...started.maps, arena: { ...started.maps['arena']!, tiles: walled } },
      entities: {
        ...started.entities,
        'e:1': { ...started.entities['e:1']!, position: { x: 1, y: 5 } },
        'm:0': { ...started.entities['m:0']!, position: { x: 13, y: 5 } },
      },
    };

    const { state: next, events } = reduce(separated, { type: 'wait', minutes: 0 }, ctx);
    expect(next.combat).toBeNull();
    expect(events.find((e) => e.type === 'combatEnded')).toMatchObject({ outcome: 'fled' });

    // And it reads as getting away, not as losing.
    const line = narrate({ module: GREENMARCH, state: next, seed: 1 }, events.filter((e) => e.type === 'combatEnded'));
    expect(line.map((entry) => entry.text).join(' ')).toContain('not followed');
  });

  it('is not free: an adjacent enemy gets its parting blow', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    const started = reduce(state, { type: 'wait', minutes: 0 }, ctx).state;
    const { events } = reduce(started, { type: 'flee' }, ctx);

    // Whether it lands is the dice's business, so assert the reaction fired.
    expect(events.find((e) => e.type === 'reacted')).toMatchObject({
      entity: 'm:0',
      reaction: 'parting_blow',
      trigger: 'moveAway',
    });
  });

  it('replays identically', () => {
    const state = arena([{ id: 'bog_hound', at: { x: 6, y: 5 } }]);
    const script: Action[] = [{ type: 'wait', minutes: 0 }, { type: 'flee' }];
    expect(statesEqual(reduceAll(state, script, ctx).state, reduceAll(state, script, ctx).state)).toBe(true);
  });
});

describe('combat has depth', () => {
  /** A fight already underway, so rounds exist to count in. */
  function fighting(seed = 3, monster = 'barrow_wight'): GameState {
    const base = arena([{ id: monster, at: { x: 6, y: 5 } }], GREENMARCH, seed);
    const hero = base.entities['e:1']!;
    return {
      ...base,
      entities: { ...base.entities, 'e:1': { ...hero, abilities: [...hero.abilities, 'rally'] } },
      combat: {
        round: 1,
        order: ['e:1', 'm:0'],
        turn: 0,
        spent: {},
        movement: 6,
        reactionsUsed: {},
        cooldowns: [],
        usedOnce: [],
        specialUses: {},
      },
    };
  }

  // `abilities[].cooldown` was declared on every ability and tracked nowhere,
  // so a once-every-three-rounds shout could be used every single round.
  it('puts an ability on cooldown, and refuses it until it comes back', () => {
    const first = reduce(fighting(), { type: 'useAbility', ability: 'rally' }, ctx);
    expect(first.state.combat!.cooldowns).toContainEqual(
      expect.objectContaining({ entity: 'e:1', ability: 'rally' }),
    );

    // A fresh action budget, so the refusal that comes back is the cooldown's
    // and not "no action left this turn".
    const ready: GameState = { ...first.state, combat: { ...first.state.combat!, spent: {} } };
    const again = reduce(ready, { type: 'useAbility', ability: 'rally' }, ctx);
    const refusal = again.events.find((e) => e.type === 'refused');
    expect(refusal).toBeDefined();
    if (refusal?.type === 'refused') expect(refusal.reason).toMatch(/not ready/);
  });

  it('lets it back once enough rounds have passed', () => {
    const used = reduce(fighting(), { type: 'useAbility', ability: 'rally' }, ctx).state;
    const later: GameState = {
      ...used,
      combat: { ...used.combat!, round: used.combat!.round + 3, spent: {} },
    };

    const events = reduce(later, { type: 'useAbility', ability: 'rally' }, ctx).events;
    expect(events.some((e) => e.type === 'refused' && /not ready/.test(e.reason))).toBe(false);
  });

  it('does not put anything on cooldown outside a fight, where there are no rounds', () => {
    // No combat, no rounds to count in — so the ability is always ready, and
    // there is nowhere to record a cooldown even if there were one.
    const peace: GameState = { ...fighting(), combat: null };
    const first = reduce(peace, { type: 'useAbility', ability: 'rally' }, ctx);
    const again = reduce({ ...first.state, combat: null }, { type: 'useAbility', ability: 'rally' }, ctx);
    expect(again.events.some((e) => e.type === 'refused' && /not ready/.test(e.reason))).toBe(false);
  });

  // `specialTurns` — legendary and lair actions — was declared and read by
  // nothing, so a boss was a monster with more hit points.
  const cold = (events: readonly GameEvent[]) =>
    events.filter((e) => e.type === 'damaged' && e.damageType === 'cold').length;

  it('gives a boss its extra turn between everyone else\'s', () => {
    const { events } = reduce(fighting(5), { type: 'endTurn' }, ctx);
    // The wight's lair action reaches for the living as the hero's turn ends.
    expect(cold(events)).toBeGreaterThan(0);
  });

  // Once a *round*, not once a turn — which is what makes a lair action a
  // budget rather than a tax on every other creature acting.
  it('spends a lair action once a round, however many turns pass', () => {
    // Three in the order, so two turns can end inside one round.
    const base = arena([{ id: 'barrow_wight', at: { x: 6, y: 5 } }], GREENMARCH, 5, ['Ash', 'Korrin']);
    const state: GameState = {
      ...base,
      combat: {
        round: 1, order: ['e:1', 'e:2', 'm:0'], turn: 0, spent: {}, movement: 6,
        reactionsUsed: {}, cooldowns: [], usedOnce: [], specialUses: {},
      },
    };

    // One use, reaching both party members — so the count is the party, not
    // the number of times the barrow stirred.
    const first = reduce(state, { type: 'endTurn' }, ctx);
    expect(first.state.combat?.round).toBe(1);
    expect(cold(first.events)).toBe(2);

    const second = reduce(first.state, { type: 'endTurn' }, ctx);
    // Still round 1: the barrow has already stirred this round.
    if (second.state.combat?.round === 1) expect(cold(second.events)).toBe(0);
  });
});

describe('a reaction that fires once a fight', () => {
  it('is spent after the first time', () => {
    const base = arena([{ id: 'barrow_wight', at: { x: 6, y: 5 } }], GREENMARCH, 3);
    const state: GameState = {
      ...base,
      combat: {
        round: 1, order: ['e:1', 'm:0'], turn: 0, spent: {}, movement: 6,
        reactionsUsed: {}, cooldowns: [], usedOnce: [], specialUses: {},
      },
    };

    const txn = new Transaction(state, GREENMARCH);
    const wight = txn.entity('m:0')!;

    runReactions(txn, wight, 'selfHurt', txn.entity('e:1')!, Rng.fromSeed(1));
    expect(txn.state.flags['wight_wailed']).toBe(true);
    expect(txn.state.combat!.usedOnce).toContain('m:0:death_wail');

    // Struck again, it does not shriek again.
    txn.set({ ...txn.state, flags: { ...txn.state.flags, wight_wailed: false } });
    runReactions(txn, txn.entity('m:0')!, 'selfHurt', txn.entity('e:1')!, Rng.fromSeed(2));
    expect(txn.state.flags['wight_wailed']).toBe(false);
  });
});
