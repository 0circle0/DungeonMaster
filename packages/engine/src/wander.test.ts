/**
 * A world that keeps moving when nobody is looking at it.
 *
 * These pin the four halves of idle behaviour — territory, trails, a leash, and a fight that
 * survives a corner — and pin that a module which asks for none of it behaves exactly as it did
 * before.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce } from './reduce.js';
import { save, load, statesEqual } from './save.js';
import { SAVE_VERSION } from './state.js';
import { temperamentOf, regardFor } from './sim/temperament.js';
import { distance } from './grid/geometry.js';
import { MapBuilder } from './grid/tiles.js';
import type { GameState, Entity } from './state.js';
import type { Position } from './grid/tiles.js';
import type { Action } from './actions.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');
const ctx = { module: GREENMARCH };

const HERO = { x: 2, y: 4 };

/**
 * A long strip of ground with the party at one end. Creatures are placed far enough away that
 * nothing can perceive anything — greenmarch's longest reach is smell at 25 tiles — because a fight
 * starting would take these turns away from the idle path under test.
 */
function strip(
  creatures: { id: string; at: Position; statblock?: string; anchor?: Position }[] = [],
  options: { module?: CompiledModule; floor?: string } = {},
): GameState {
  const module = options.module ?? GREENMARCH;
  const floor = options.floor ?? (module.source.id === 'minimal' ? 'bare_floor' : 'floor');
  const base = newGame(module, { seed: 7, party: [defaultChoices(module, 'Ash')] });
  const hero = base.entities[base.party[0]!]!;

  const entities: Record<string, Entity> = {
    ...base.entities,
    [hero.id]: { ...hero, map: 'strip', position: HERO, anchor: null },
  };

  for (const entry of creatures) {
    const spawned = spawnMonster(module, entry.id, entry.statblock ?? 'bog_hound');
    entities[entry.id] = {
      ...spawned,
      map: 'strip',
      position: entry.at,
      anchor: entry.anchor ?? { ...entry.at },
    };
  }

  return {
    ...base,
    currentMap: 'strip',
    maps: {
      strip: {
        id: 'strip', tiles: new MapBuilder(40, 9, floor).freeze(), kind: 'room', source: 'strip',
        explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1,
      },
    },
    entities,
  };
}

/**
 * Let the clock run, which is the only thing that moves an idle world. In several ticks rather than
 * one long one, because whether a creature stirs is a single roll per tick, and a test that depends
 * on which way one coin flip lands fails for the next person who changes an unrelated seed.
 */
const wait = (state: GameState, minutes: number, module = GREENMARCH): GameState => {
  let held = state;
  for (let tick = 0; tick < 6; tick += 1) {
    held = reduce(held, { type: 'wait', minutes: Math.ceil(minutes / 6) }, { module }).state;
  }
  return held;
};

describe('ground of its own', () => {
  it('records where a creature was put, so it has somewhere to come back to', () => {
    const state = strip([{ id: 'm:0', at: { x: 30, y: 4 } }]);
    expect(state.entities['m:0']!.anchor).toEqual({ x: 30, y: 4 });
    // The party is the one thing with no territory: they are meant to leave.
    expect(state.entities[state.party[0]!]!.anchor).toBeNull();
  });

  it('wanders about it when there is nothing to chase', () => {
    const start = strip([{ id: 'm:0', at: { x: 30, y: 4 } }]);
    const after = wait(start, 30);

    const moved = after.entities['m:0']!.position;
    expect(moved).not.toEqual({ x: 30, y: 4 });

    // But only about it. A hound's roam radius is 90 feet, so eighteen tiles is as far as it goes.
    const roam = temperamentOf(GREENMARCH, after.entities['m:0']!).roamRadius;
    expect(distance(moved, { x: 30, y: 4 })).toBeLessThanOrEqual(roam);
  });

  it('lays a trail while it does, which is what makes tracking worth anything', () => {
    // The party has not moved, so every trace on this map was left by the hound.
    const after = wait(strip([{ id: 'm:0', at: { x: 30, y: 4 } }]), 30);

    const left = Object.values(after.maps['strip']!.marks).flat();
    expect(left.length).toBeGreaterThan(0);
    expect(left.some((mark) => mark.by === 'm:0')).toBe(true);
    expect(new Set(left.map((mark) => mark.sense))).toContain('tracks');
  });

  it('stays put when the module says it has no territory', () => {
    // A wight keeps to its barrow; the real "never moves" case is a shopkeeper, and both come down
    // to a wander speed or a roam radius of zero.
    const start = strip([{ id: 'm:0', at: { x: 30, y: 4 }, statblock: 'barrow_wight' }]);
    const pinned: GameState = {
      ...start,
      entities: {
        ...start.entities,
        'm:0': { ...start.entities['m:0']!, anchor: { x: 30, y: 4 } },
      },
    };

    // Greenmarch's wight roams fifteen feet — three tiles — and rarely.
    const after = wait(pinned, 30);
    expect(distance(after.entities['m:0']!.position, { x: 30, y: 4 })).toBeLessThanOrEqual(3);
  });

  it('walks back when it finds itself somewhere it does not live', () => {
    // Dropped twelve tiles from home with nothing to chase.
    const start = strip([{ id: 'm:0', at: { x: 30, y: 4 }, anchor: { x: 30, y: 4 } }]);
    const strayed: GameState = {
      ...start,
      entities: {
        ...start.entities,
        'm:0': { ...start.entities['m:0']!, position: { x: 8, y: 4 }, anchor: { x: 34, y: 4 } },
      },
    };

    // Twenty-six tiles out against a roam radius of eighteen: genuinely off its own ground, with
    // nothing to chase.
    const after = wait(strayed, 30);
    const closed = distance(after.entities['m:0']!.position, { x: 34, y: 4 });
    expect(closed).toBeLessThan(distance({ x: 8, y: 4 }, { x: 34, y: 4 }));
  });
});

describe('the ground remembers what it is able to', () => {
  it('takes no print on bare stone, however heavily it is walked on', () => {
    // `rubble` is broken stone: greenmarch gives it no tracks at all.
    const stony = strip([{ id: 'm:0', at: { x: 30, y: 4 } }], { floor: 'rubble' });
    const after = wait(stony, 30);

    const left = Object.values(after.maps['strip']!.marks).flat();
    expect(left.some((mark) => mark.sense === 'tracks')).toBe(false);
    // A smell still hangs about, at the reduced strength stone holds it to.
    expect(left.every((mark) => mark.sense !== 'smell' || mark.strength <= 0.6)).toBe(true);
  });

  it('takes a full print on soft ground', () => {
    const soft = strip([{ id: 'm:0', at: { x: 30, y: 4 } }], { floor: 'reeds' });
    const left = Object.values(wait(soft, 30).maps['strip']!.marks).flat();
    expect(left.some((mark) => mark.sense === 'tracks')).toBe(true);
  });
});

describe('a leash, so a chase cannot be trained across a map', () => {
  /** The hound beside the party, but anchored a long way off. */
  const dragged = (leashTiles: number): GameState => {
    const base = strip([{ id: 'm:0', at: { x: HERO.x + 2, y: HERO.y } }]);
    return {
      ...base,
      entities: {
        ...base.entities,
        'm:0': { ...base.entities['m:0']!, anchor: { x: HERO.x + 2 + leashTiles, y: HERO.y } },
      },
    };
  };

  it('still fights what is standing next to it', () => {
    // The leash gates the chase and nothing else: a creature that has given up following is not one
    // that has agreed to be hit.
    const state = wait(dragged(200), 0);
    expect(state.combat).not.toBeNull();
  });

  it('drops a lead that would take it off its ground, rather than following it', () => {
    // A wight investigates twelve tiles from its barrow and no further. Given something to hear
    // twenty tiles away it declines, and forgets rather than re-deciding every turn.
    // Anchored at the far end of the strip, thirty tiles from the party, which is past every sense
    // greenmarch declares — so the only lead it has is the one planted here.
    const base = strip([{ id: 'm:0', at: { x: 32, y: 4 }, statblock: 'barrow_wight' }]);
    const called: GameState = {
      ...base,
      entities: {
        ...base.entities,
        'm:0': {
          ...base.entities['m:0']!,
          anchor: { x: 32, y: 4 },
          alerts: [{ sense: 'hearing', of: base.party[0]!, at: { x: 12, y: 4 }, minute: base.minute, strength: 0.9 }],
        },
      },
    };

    expect(temperamentOf(GREENMARCH, called.entities['m:0']!).investigateRadius).toBe(12);

    const { state: after, events } = reduce(called, { type: 'wait', minutes: 1 }, ctx);

    // The noise it declined to walk to is forgotten. It may still smell the party from here, but
    // that is a lead its `investigates` list does not act on.
    expect(after.entities['m:0']!.alerts).toEqual([]);
    expect(events.some((e) => e.type === 'custom' && e.event === 'lostInterest')).toBe(true);
    expect(after.entities['m:0']!.position).toEqual({ x: 32, y: 4 });
  });

  it('follows a lead that stays on it', () => {
    // The same wight and noise, eight tiles out instead of twenty: the leash is a bound, not a
    // brake.
    const base = strip([{ id: 'm:0', at: { x: 32, y: 4 }, statblock: 'barrow_wight' }]);
    const called: GameState = {
      ...base,
      entities: {
        ...base.entities,
        'm:0': {
          ...base.entities['m:0']!,
          anchor: { x: 32, y: 4 },
          alerts: [{ sense: 'hearing', of: base.party[0]!, at: { x: 24, y: 4 }, minute: base.minute, strength: 0.9 }],
        },
      },
    };

    const after = reduce(called, { type: 'wait', minutes: 4 }, ctx).state;
    const moved = after.entities['m:0']!.position;
    expect(distance(moved, { x: 24, y: 4 })).toBeLessThan(distance({ x: 32, y: 4 }, { x: 24, y: 4 }));
  });
});

describe('what a creature bothers to register', () => {
  it('opposes what it always opposed, by default', () => {
    const state = strip([{ id: 'm:0', at: { x: 30, y: 4 } }]);
    const hound = state.entities['m:0']!;
    const hero = state.entities[state.party[0]!]!;
    expect(regardFor(hound, hero)).toBe('hostile');
    expect(regardFor(hero, hound)).toBe('hostile');
  });

  it('reads two of a kind as standing together', () => {
    const state = strip([
      { id: 'm:0', at: { x: 30, y: 4 } },
      { id: 'm:1', at: { x: 31, y: 4 } },
    ]);
    expect(regardFor(state.entities['m:0']!, state.entities['m:1']!)).toBe('ally');
  });

  it('lets a module say which senses a creature acts on, in the order it trusts them', () => {
    // A hound's nose comes first, and `tracks` is absent from the list it will act on.
    const hound = temperamentOf(GREENMARCH, spawnMonster(GREENMARCH, 'm:0', 'bog_hound'));
    expect(hound.investigates).toEqual(['smell', 'hearing', 'sight']);

    // A wight goes further and reads no ground trace at all.
    const wight = temperamentOf(GREENMARCH, spawnMonster(GREENMARCH, 'm:1', 'barrow_wight'));
    expect(wight.followsTrails).toBe(false);
  });

  it('resolves a creature override on top of the ruleset, field by field', () => {
    // The hound states four speeds and the wight two; whichever a creature leaves out keeps the
    // ruleset's answer rather than resetting to one, which is why the override schema is written
    // longhand.
    const wight = temperamentOf(GREENMARCH, spawnMonster(GREENMARCH, 'm:0', 'barrow_wight'));
    expect(wight.speeds.investigate).toBe(0.5);
    expect(wight.speeds.engage).toBe(GREENMARCH.source.rules.temperament.speeds.engage);
  });
});

describe('a module that asks for none of it', () => {
  it('leaves minimal exactly as still as it always was', () => {
    // `minimal` declares no senses and no temperament. It is the control: if any of this leaked
    // into the engine as a default, this is where it shows.
    const start = strip([{ id: 'm:0', at: { x: 30, y: 4 }, statblock: 'husk' }], { module: MINIMAL });
    const after = wait(start, 120, MINIMAL);

    expect(after.entities['m:0']!.position).toEqual({ x: 30, y: 4 });
    expect(after.maps['strip']!.marks).toEqual({});
  });
});

describe('determinism, with the world moving underneath', () => {
  const script: Action[] = [
    { type: 'wait', minutes: 15 },
    { type: 'step', direction: 'east' },
    { type: 'wait', minutes: 15 },
    { type: 'step', direction: 'east' },
    { type: 'wait', minutes: 30 },
  ];

  const run = (): GameState => {
    let state = strip([
      { id: 'm:0', at: { x: 30, y: 4 } },
      { id: 'm:1', at: { x: 33, y: 6 } },
      { id: 'm:2', at: { x: 27, y: 2 } },
    ]);
    for (const action of script) state = reduce(state, action, ctx).state;
    return state;
  };

  it('produces the same world twice from the same seed', () => {
    // Wandering draws dice per creature per minute. A shared stream, or an unstably trimmed per-
    // tile trace list, would fail here.
    expect(statesEqual(run(), run())).toBe(true);
  });

  it('survives the round trip through a save', () => {
    const state = run();
    expect(Object.keys(state.maps['strip']!.marks).length).toBeGreaterThan(0);

    const result = load(save(state, 1_000), GREENMARCH);
    if (!result.ok) throw new Error(result.error);
    expect(statesEqual(result.state, state)).toBe(true);
  });
});

describe('migration to version 10', () => {
  it('gives every creature the ground it is standing on, and the party none', () => {
    const fresh = strip([{ id: 'm:0', at: { x: 30, y: 4 } }]);

    // A version-9 save is this state with no anchors at all.
    const entities: Record<string, unknown> = {};
    for (const [id, entity] of Object.entries(fresh.entities)) {
      const { anchor: _dropped, ...older } = entity;
      entities[id] = older;
    }
    const legacy = JSON.stringify({
      saveVersion: 9,
      savedAt: 1_000,
      state: { ...fresh, saveVersion: 9, entities },
    });

    const result = load(legacy, GREENMARCH);
    if (!result.ok) throw new Error(result.error);

    // It adopts where it stands: a null anchor would leave every creature in every old save
    // permanently unable to wander.
    expect(result.state.entities['m:0']!.anchor).toEqual({ x: 30, y: 4 });
    expect(result.state.entities[fresh.party[0]!]!.anchor).toBeNull();
    expect(result.state.saveVersion).toBe(SAVE_VERSION);
    expect(statesEqual(result.state, fresh)).toBe(true);
  });
});
