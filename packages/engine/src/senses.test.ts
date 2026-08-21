/** What the engine can perceive, pinned at the boundaries. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce } from './reduce.js';
import { Transaction } from './rules/apply.js';
import { statesEqual } from './save.js';
import { nearestHostile } from './rules/combat/targeting.js';
import { witnessesOf } from './sim/deeds.js';
import { describeSurroundings } from './narrate/narrate.js';
import {
  sensesOf, rangeOf, signalAt, markStrength, perceive, emissionOf, senseReport,
} from './sim/senses.js';
import { speedOf } from './rules/combat/targeting.js';
import { narrate } from './narrate/narrate.js';
import { simulatePerception } from './analysis.js';
import { TerrainIndex, MapBuilder } from './grid/tiles.js';
import { hasLineOfSight } from './grid/fov.js';
import type { GameState, Entity } from './state.js';
import { compileModule } from '@dm/module';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');
const ctx = { module: GREENMARCH };
const terrain = new TerrainIndex(GREENMARCH);

const HERO = { x: 2, y: 4 };

/** A long open corridor, wide enough to place a creature past every threshold that matters. */
function field(
  monsters: { at: { x: number; y: number }; id?: string; statblock?: string }[] = [],
  options: { module?: CompiledModule; wall?: number } = {},
): GameState {
  const module = options.module ?? GREENMARCH;
  const floor = module.source.id === 'minimal' ? 'bare_floor' : 'floor';
  const base = newGame(module, { seed: 7, party: [defaultChoices(module, 'Ash')] });
  const hero = base.entities[base.party[0]!]!;

  const builder = new MapBuilder(40, 9, floor);
  if (options.wall !== undefined) {
    for (let y = 0; y < 9; y += 1) builder.set(options.wall, y, 'wall');
  }

  const entities: Record<string, Entity> = {
    ...base.entities,
    [hero.id]: { ...hero, map: 'field', position: HERO },
  };
  monsters.forEach((entry, i) => {
    const id = entry.id ?? `m:${i}`;
    const statblock = entry.statblock ?? (module.source.id === 'minimal' ? 'husk' : 'bog_hound');
    entities[id] = { ...spawnMonster(module, id, statblock), map: 'field', position: entry.at };
  });

  return {
    ...base,
    currentMap: 'field',
    maps: {
      field: {
        id: 'field', tiles: builder.freeze(), kind: 'room', source: 'field',
        explored: [], gates: {}, exits: {}, items: {}, marks: {},
      traps: {}, rooms: [], depth: 1,
      },
    },
    entities,
  };
}

/** Combat entry is decided during `settle`, which every action runs through. */
const settle = (state: GameState) => reduce(state, { type: 'wait', minutes: 0 }, ctx).state;

describe('the awareness boundary', () => {
  // 12 tiles is the engine's only perception constant, a bare literal in turn.ts and deeds.ts.
  it('starts combat at exactly twelve tiles', () => {
    const state = settle(field([{ at: { x: HERO.x + 12, y: HERO.y } }]));
    expect(state.combat).not.toBeNull();
  });

  it('does not start combat at thirteen', () => {
    const state = settle(field([{ at: { x: HERO.x + 13, y: HERO.y } }]));
    expect(state.combat).toBeNull();
  });

  it('measures the gap by the movement metric, so diagonals reach as far', () => {
    // Chebyshev: twelve tiles diagonally is the same distance as twelve across.
    const state = settle(field([{ at: { x: HERO.x + 12, y: HERO.y + 4 } }]));
    expect(state.combat).not.toBeNull();
  });

  it('needs a clear line, whatever the gap', () => {
    const state = settle(field([{ at: { x: HERO.x + 6, y: HERO.y } }], { wall: HERO.x + 3 }));
    expect(state.combat).toBeNull();
  });

  it('enrols only what noticed, not everything on the map', () => {
    const state = settle(field([
      { at: { x: HERO.x + 3, y: HERO.y } },
      { at: { x: HERO.x + 20, y: HERO.y } },
    ]));
    expect(state.combat!.order).toContain('m:0');
    expect(state.combat!.order).not.toContain('m:1');
  });

  it('is symmetric — a fight ends when the same test stops holding', () => {
    const started = settle(field([{ at: { x: HERO.x + 3, y: HERO.y } }]));
    expect(started.combat).not.toBeNull();

    // Pull them apart past the threshold, and wall the gap.
    const builder = new MapBuilder(40, 9, 'floor');
    for (let y = 0; y < 9; y += 1) builder.set(HERO.x + 10, y, 'wall');

    const separated: GameState = {
      ...started,
      maps: { ...started.maps, field: { ...started.maps['field']!, tiles: builder.freeze() } },
      entities: {
        ...started.entities,
        'm:0': { ...started.entities['m:0']!, position: { x: HERO.x + 20, y: HERO.y } },
      },
    };

    // Losing them starts a count rather than ending the fight; greenmarch's hounds give it three rounds.
    let state = reduce(separated, { type: 'wait', minutes: 0 }, ctx).state;
    expect(state.combat).not.toBeNull();

    let events: ReturnType<typeof reduce>['events'] = [];
    for (let guard = 0; guard < 40 && state.combat; guard += 1) {
      const step = reduce(state, { type: 'endTurn' }, ctx);
      state = step.state;
      events = step.events;
    }

    expect(state.combat).toBeNull();
    expect(events.find((e) => e.type === 'combatEnded')).toMatchObject({ outcome: 'fled' });
  });
});

describe('who a creature will attack', () => {
  const targeting = (state: GameState) => ({ module: GREENMARCH, state, terrain });

  it('has no range limit of its own today', () => {
    const state = field([{ at: { x: HERO.x + 14, y: HERO.y } }]);
    const hound = state.entities['m:0']!;
    expect(nearestHostile(targeting(state), hound)?.id).toBe('e:1');
  });

  it('still requires a clear line', () => {
    const state = field([{ at: { x: HERO.x + 6, y: HERO.y } }], { wall: HERO.x + 3 });
    expect(nearestHostile(targeting(state), state.entities['m:0']!)).toBeNull();
  });

  it('takes the nearest, breaking ties by id', () => {
    const state = field([
      { id: 'm:far', at: { x: HERO.x + 8, y: HERO.y } },
      { id: 'm:near', at: { x: HERO.x + 2, y: HERO.y } },
    ]);
    const hero = state.entities['e:1']!;
    expect(nearestHostile(targeting(state), hero)?.id).toBe('m:near');
  });
});

describe('who witnessed it', () => {
  /** `witnessesOf` reports non-party onlookers, before the identification roll. */
  function onlookerAt(x: number, wall?: number): string[] {
    const options = wall === undefined ? {} : { wall };
    const state = field([{ id: 'w:1', at: { x, y: HERO.y } }], options);
    const txn = new Transaction(state, GREENMARCH);
    return witnessesOf(txn, terrain, txn.entity('e:1')!);
  }

  it('sees a deed twelve tiles away', () => {
    expect(onlookerAt(HERO.x + 12)).toEqual(['w:1']);
  });

  it('does not see it at thirteen', () => {
    expect(onlookerAt(HERO.x + 13)).toEqual([]);
  });

  it('does not see it through a wall', () => {
    expect(onlookerAt(HERO.x + 6, HERO.x + 3)).toEqual([]);
  });

  it('honours an explicit radius over the sense', () => {
    const state = field([{ id: 'w:1', at: { x: HERO.x + 5, y: HERO.y } }]);
    const txn = new Transaction(state, GREENMARCH);
    expect(witnessesOf(txn, terrain, txn.entity('e:1')!, 4)).toEqual([]);
    expect(witnessesOf(txn, terrain, txn.entity('e:1')!, 5)).toEqual(['w:1']);
  });

  /** With sight not required, `radius: 0` means everyone here. */
  describe('when the module says sight is not required', () => {
    function blindWitness(radius: number, distance: number): string[] {
      const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
        narrative: { memory: { witness: Record<string, unknown> } };
      };
      doc.narrative.memory.witness['requiresLineOfSight'] = false;
      doc.narrative.memory.witness['radius'] = radius;
      const compiled = compileModule(doc);
      if (!compiled.ok) throw new Error('fixture failed');

      const state = field([{ id: 'w:1', at: { x: HERO.x + distance, y: HERO.y } }]);
      const txn = new Transaction(state, compiled.module);
      return witnessesOf(txn, new TerrainIndex(compiled.module), txn.entity('e:1')!);
    }

    it('counts everyone present at radius zero', () => {
      expect(blindWitness(0, 30)).toEqual(['w:1']);
    });

    it('still honours a radius the module actually declares', () => {
      expect(blindWitness(4, 3)).toEqual(['w:1']);
      expect(blindWitness(4, 5)).toEqual([]);
    });
  });
});

describe('what the party is told is around them', () => {
  const scene = (x: number) => {
    const state = field([{ at: { x, y: HERO.y } }]);
    return describeSurroundings({ module: GREENMARCH, state, seed: 1 })
      .map((line) => line.text)
      .join(' ')
      .toLowerCase();
  };

  it('mentions a creature as far off as the party can see', () => {
    expect(scene(HERO.x + 12)).toContain('hound');
  });

  it('says nothing about one beyond that', () => {
    expect(scene(HERO.x + 13)).not.toContain('hound');
  });
});

describe('line of sight itself', () => {
  it('is symmetric, whichever end asks', () => {
    const state = field([], { wall: 10 });
    const tiles = state.maps['field']!.tiles;
    const a = { x: 4, y: 4 };
    const b = { x: 16, y: 4 };
    expect(hasLineOfSight(tiles, terrain, a, b)).toBe(hasLineOfSight(tiles, terrain, b, a));
    expect(hasLineOfSight(tiles, terrain, a, b)).toBe(false);
  });

  it('does not let a creature standing in a doorway block itself', () => {
    // Both endpoints are exempt from the opacity test, so standing on an opaque tile does not blind you.
    const builder = new MapBuilder(9, 3, 'floor');
    builder.set(4, 1, 'reeds');
    const tiles = builder.freeze();
    expect(hasLineOfSight(tiles, terrain, { x: 4, y: 1 }, { x: 7, y: 1 })).toBe(true);
  });
});

describe('the alien ruleset perceives the same way', () => {
  const alien = { module: MINIMAL };

  it('starts combat at twelve and not thirteen', () => {
    const near = reduce(
      field([{ at: { x: HERO.x + 12, y: HERO.y } }], { module: MINIMAL }),
      { type: 'wait', minutes: 0 },
      alien,
    ).state;
    const far = reduce(
      field([{ at: { x: HERO.x + 13, y: HERO.y } }], { module: MINIMAL }),
      { type: 'wait', minutes: 0 },
      alien,
    ).state;

    expect(near.combat).not.toBeNull();
    expect(far.combat).toBeNull();
  });
});

describe('a declared sense reproduces the constant it replaced', () => {
  // greenmarch declares sight with nothing but a name; every other field defaults.
  it('resolves a bare declaration to twelve tiles', () => {
    const sight = sensesOf(GREENMARCH).find((sense) => sense.id === 'sight')!;
    expect(sight.range).toBe(12);
    expect(sight.falloff).toBe('cliff');
    // Sight remembers nothing and leaves nothing.
    expect(sight.lingerMinutes).toBe(0);
    expect(sight.rememberMinutes).toBe(0);
  });

  it('converts every declared range into tiles once', () => {
    const senses = sensesOf(GREENMARCH);
    expect(senses.map((sense) => sense.id)).toEqual(['sight', 'hearing', 'smell', 'tracks']);
    // Tracks reach two tiles: you have to be standing over them to read them.
    expect(senses.map((sense) => sense.range)).toEqual([12, 24, 25, 2]);
  });

  it('gives a module that declares nothing the same reach, unnamed', () => {
    expect(MINIMAL.all('rules.senses')).toEqual([]);

    const implicit = sensesOf(MINIMAL);
    expect(implicit).toHaveLength(1);
    // Unnamed on purpose: naming it would put a game concept in the engine.
    expect(implicit[0]!.id).toBe('');
    expect(implicit[0]!.range).toBe(12);
  });

  it('lets a creature overrule the default with its own', () => {
    const state = field([{ at: { x: HERO.x + 3, y: HERO.y } }]);
    const context = { module: GREENMARCH, state, terrain };
    const hound = state.entities['m:0']!;
    const sight = sensesOf(GREENMARCH)[0]!;

    // The statblock says nothing about sight, so it sees as far as anything.
    expect(rangeOf(context, hound, sight)).toBe(12);
  });
});

/** A sense can be shut off, and a sense can be the kind that does not care. */
describe('a sense that has been closed', () => {
  /** Greenmarch where `dazzled` shuts sight, and optionally sight shrugs it off. */
  function dazzling(sightIgnores: boolean): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { conditions: Record<string, unknown>[]; senses: Record<string, unknown>[] };
    };
    doc.rules.conditions.push({ id: 'dazzled', name: 'Dazzled', suppressesSenses: ['sight'] });
    if (sightIgnores) {
      doc.rules.senses.find((sense) => sense['id'] === 'sight')!['ignores'] = ['dazzled'];
    }
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  /** How far the hero sees, given a module and the conditions they are under. */
  function reach(module: CompiledModule, conditions: string[]): number {
    const state = field([{ at: { x: HERO.x + 3, y: HERO.y } }], { module });
    const hero = state.entities['e:1']!;
    const under: Entity = {
      ...hero,
      conditions: conditions.map((condition) => ({
        condition, remaining: null, magnitude: null, source: null,
      })),
    };
    const context = { module, state, terrain: new TerrainIndex(module) };
    const sight = sensesOf(module).find((sense) => sense.id === 'sight')!;
    return rangeOf(context, under, sight);
  }

  it('reaches nothing at all', () => {
    const module = dazzling(false);
    expect(reach(module, [])).toBeGreaterThan(0);
    expect(reach(module, ['dazzled'])).toBe(0);
  });

  it('leaves the creature\'s other senses alone', () => {
    const module = dazzling(false);
    const state = field([], { module });
    const under: Entity = {
      ...state.entities['e:1']!,
      conditions: [{ condition: 'dazzled', remaining: null, magnitude: null, source: null }],
    };
    const context = { module, state, terrain: new TerrainIndex(module) };
    const hearing = sensesOf(module).find((sense) => sense.id === 'hearing')!;
    expect(rangeOf(context, under, hearing)).toBeGreaterThan(0);
  });

  // What `ignores` buys.
  it('works through it when the sense ignores that condition', () => {
    const module = dazzling(true);
    expect(reach(module, ['dazzled'])).toBeGreaterThan(0);
  });

  // Suppression follows `implies`, like everything else a condition carries.
  it('follows a condition that only implies the suppressing one', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { conditions: Record<string, unknown>[] };
    };
    doc.rules.conditions.push(
      { id: 'dazzled', name: 'Dazzled', suppressesSenses: ['sight'] },
      { id: 'flashbanged', name: 'Flashbanged', implies: ['dazzled'] },
    );
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    expect(reach(compiled.module, ['flashbanged'])).toBe(0);
  });
});

describe('hearing', () => {
  const hearing = () => sensesOf(GREENMARCH).find((sense) => sense.id === 'hearing')!;
  const listener = (state: GameState) => ({ module: GREENMARCH, state, terrain });

  it('fades with distance rather than stopping at an edge', () => {
    const state = field([{ at: { x: HERO.x + 4, y: HERO.y } }]);
    const context = listener(state);
    const hound = state.entities['m:0']!;
    const hero = state.entities['e:1']!;

    const near = signalAt(context, hearing(), hound, hero.position, 1);
    const far = signalAt(
      context,
      hearing(),
      { ...hound, position: { x: HERO.x + 18, y: HERO.y } },
      hero.position,
      1,
    );

    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('passes a reed bed, which sight does not', () => {
    // greenmarch's reeds are opaque but passable: you cannot see through them and they muffle nothing.
    const builder = new MapBuilder(20, 5, 'floor');
    for (let y = 0; y < 5; y += 1) builder.set(6, y, 'reeds');

    const base = field([{ at: { x: 10, y: 2 } }]);
    const state: GameState = {
      ...base,
      maps: { field: { ...base.maps['field']!, tiles: builder.freeze() } },
      entities: {
        ...base.entities,
        'e:1': { ...base.entities['e:1']!, position: { x: 2, y: 2 } },
      },
    };

    const context = listener(state);
    const hound = state.entities['m:0']!;
    const hero = state.entities['e:1']!;
    const sight = sensesOf(GREENMARCH).find((sense) => sense.id === 'sight')!;

    expect(signalAt(context, sight, hound, hero.position, 1)).toBe(0);
    expect(signalAt(context, hearing(), hound, hero.position, 1)).toBeGreaterThan(0);
  });

  it('stops at stone', () => {
    const state = field([{ at: { x: HERO.x + 6, y: HERO.y } }], { wall: HERO.x + 3 });
    const context = listener(state);
    expect(signalAt(context, hearing(), state.entities['m:0']!, HERO, 1)).toBe(0);
  });

  it('is not loud enough to start a fight from across the marsh', () => {
    // Audible at twenty tiles, but below the aggro threshold — noticing is separate from attacking.
    const state = settle(field([{ at: { x: HERO.x + 20, y: HERO.y } }]));
    expect(state.combat).toBeNull();
  });
});

describe('smell', () => {
  const smell = () => sensesOf(GREENMARCH).find((sense) => sense.id === 'smell')!;

  it('turns a corner that sight and sound cannot', () => {
    // A wall with one gap in it.
    const builder = new MapBuilder(20, 9, 'floor');
    for (let y = 0; y < 9; y += 1) builder.set(6, y, 'wall');
    builder.set(6, 8, 'floor');

    const base = field([{ at: { x: 10, y: 1 } }]);
    const state: GameState = {
      ...base,
      maps: { field: { ...base.maps['field']!, tiles: builder.freeze() } },
      entities: {
        ...base.entities,
        'e:1': { ...base.entities['e:1']!, position: { x: 2, y: 1 } },
      },
    };

    const context = { module: GREENMARCH, state, terrain };
    const hound = state.entities['m:0']!;
    const hero = state.entities['e:1']!;
    const sight = sensesOf(GREENMARCH).find((sense) => sense.id === 'sight')!;

    expect(signalAt(context, sight, hound, hero.position, 1)).toBe(0);
    expect(signalAt(context, smell(), hound, hero.position, 1)).toBeGreaterThan(0);
  });

  it('does not seep through solid stone', () => {
    const builder = new MapBuilder(20, 9, 'floor');
    for (let y = 0; y < 9; y += 1) builder.set(6, y, 'wall');

    const base = field([{ at: { x: 10, y: 4 } }]);
    const state: GameState = {
      ...base,
      maps: { field: { ...base.maps['field']!, tiles: builder.freeze() } },
    };

    const context = { module: GREENMARCH, state, terrain };
    expect(signalAt(context, smell(), state.entities['m:0']!, HERO, 1)).toBe(0);
  });
});

describe('the trail a creature leaves', () => {
  it('marks each tile it walks across', () => {
    let state = field();
    for (const direction of ['east', 'east', 'east'] as const) {
      state = reduce(state, { type: 'step', direction }, ctx).state;
    }

    const marks = state.maps['field']!.marks;
    const tiles = Object.keys(marks).map(Number);
    expect(tiles.length).toBeGreaterThanOrEqual(3);

    // Only senses that linger leave anything: sight and hearing do not, and both a scent and a print do.
    const left = Object.values(marks).flat();
    expect(new Set(left.map((mark) => mark.sense))).toEqual(new Set(['smell', 'tracks']));
    expect(left.every((mark) => mark.by === 'e:1')).toBe(true);
  });

  it('goes cold with age and is gone when it should be', () => {
    const smell = sensesOf(GREENMARCH).find((sense) => sense.id === 'smell')!;
    const mark = { sense: 'smell', by: 'e:1', at: 100, strength: 1 };

    expect(markStrength(smell, mark, 100)).toBe(1);
    expect(markStrength(smell, mark, 145)).toBeCloseTo(0.5);
    expect(markStrength(smell, mark, 100 + smell.lingerMinutes)).toBe(0);
    expect(markStrength(smell, mark, 100 + smell.lingerMinutes + 500)).toBe(0);
  });

  it('is swept away once it is cold', () => {
    let state = field();
    state = reduce(state, { type: 'step', direction: 'east' }, ctx).state;
    expect(Object.keys(state.maps['field']!.marks).length).toBeGreaterThan(0);

    // A day passes.
    state = reduce(state, { type: 'advanceTime', minutes: 1500 }, ctx).state;
    expect(state.maps['field']!.marks).toEqual({});
  });

  it('does not grow without bound when ground is walked over again', () => {
    let state = field();
    for (let i = 0; i < 12; i += 1) {
      const direction = i % 2 === 0 ? 'east' : 'west';
      state = reduce(state, { type: 'step', direction }, ctx).state;
    }

    const cap = GREENMARCH.source.rules.perception.maxMarksPerTile;
    for (const marks of Object.values(state.maps['field']!.marks)) {
      const perSense = new Map<string, number>();
      for (const mark of marks) perSense.set(mark.sense, (perSense.get(mark.sense) ?? 0) + 1);
      for (const count of perSense.values()) expect(count).toBe(1);
      expect(marks.length).toBeLessThanOrEqual(cap * perSense.size);
    }
  });

  it('keeps only the freshest few traces when a crowd crosses one tile', () => {
    const walkers = Array.from({ length: 9 }, (_, i) => ({
      id: `m:${i}`, at: { x: HERO.x + 6, y: HERO.y + 2 },
    }));
    let state = field(walkers);

    // March them all across the same tile, one after another.
    const crossing = { x: HERO.x + 6, y: HERO.y };
    for (const walker of walkers) {
      const mover = state.entities[walker.id]!;
      state = reduce(
        { ...state, entities: { ...state.entities, [walker.id]: { ...mover, position: { x: crossing.x, y: crossing.y + 1 } } } },
        { type: 'wait', minutes: 1 },
        ctx,
      ).state;
    }

    const cap = GREENMARCH.source.rules.perception.maxMarksPerTile;
    for (const marks of Object.values(state.maps['field']!.marks)) {
      const perSense = new Map<string, number>();
      for (const mark of marks) perSense.set(mark.sense, (perSense.get(mark.sense) ?? 0) + 1);
      for (const count of perSense.values()) expect(count).toBeLessThanOrEqual(cap);

      // What survived is a total order, oldest first, which makes the truncation reproducible.
      const ordered = [...marks].sort((a, b) =>
        a.at - b.at || (a.sense < b.sense ? -1 : a.sense > b.sense ? 1 : 0)
        || (a.by < b.by ? -1 : a.by > b.by ? 1 : 0) || a.strength - b.strength);
      expect(marks).toEqual(ordered);
    }
  });
});

describe('a ruleset with no senses leaves no trace of the machinery', () => {
  it('lays no marks and remembers nothing, however far it walks', () => {
    let state = field([], { module: MINIMAL });
    for (let i = 0; i < 8; i += 1) {
      state = reduce(state, { type: 'step', direction: 'east' }, { module: MINIMAL }).state;
    }

    expect(state.maps['field']!.marks).toEqual({});
    for (const entity of Object.values(state.entities)) {
      expect(entity.alerts).toEqual([]);
      expect(entity.stance).toBeNull();
    }
  });
});

describe('a creature acts on what it noticed', () => {
  it('walks toward a noise it has no way of seeing', () => {
    const builder = new MapBuilder(30, 9, 'floor');
    for (let y = 0; y < 8; y += 1) builder.set(9, y, 'wall');

    const base = field([{ at: { x: 16, y: 1 } }]);
    let state: GameState = {
      ...base,
      maps: { field: { ...base.maps['field']!, tiles: builder.freeze() } },
      entities: {
        ...base.entities,
        'e:1': { ...base.entities['e:1']!, position: { x: 3, y: 1 } },
      },
    };

    const sight = sensesOf(GREENMARCH).find((sense) => sense.id === 'sight')!;
    const context = { module: GREENMARCH, state, terrain };
    expect(signalAt(context, sight, state.entities['m:0']!, { x: 3, y: 1 }, 1)).toBe(0);

    const before = state.entities['m:0']!.position.x;

    // Let the party make some noise and time pass.
    for (let i = 0; i < 6; i += 1) {
      state = reduce(state, { type: 'wait', minutes: 3 }, ctx).state;
    }

    const hound = state.entities['m:0']!;
    expect(hound.alerts.length).toBeGreaterThan(0);
    expect(hound.position.x).toBeLessThan(before);
  });

  it('follows a trail to where the party went, not where it is', () => {
    // The party walks east, then doubles back west.
    let state = field();
    for (let i = 0; i < 6; i += 1) {
      state = reduce(state, { type: 'step', direction: 'east' }, ctx).state;
    }

    const trailEnd = state.entities['e:1']!.position;
    expect(trailEnd.x).toBeGreaterThan(HERO.x);

    const marks = Object.values(state.maps['field']!.marks).flat();
    expect(marks.some((mark) => mark.sense === 'smell')).toBe(true);

    // A hound arrives well after the party has gone, out of sight of them.
    const arrived: GameState = {
      ...state,
      entities: {
        ...state.entities,
        'e:1': { ...state.entities['e:1']!, map: 'elsewhere' },
        'h:1': { ...spawnMonster(GREENMARCH, 'h:1', 'bog_hound'), map: 'field', position: { x: HERO.x, y: HERO.y + 3 } },
      },
    };

    const context = { module: GREENMARCH, state: arrived, terrain };
    const smell = sensesOf(GREENMARCH).find((sense) => sense.id === 'smell')!;
    const found = perceive(context, arrived.entities['h:1']!)
      .filter((percept) => percept.sense === smell.id);

    // It can smell where they went even with them gone from the map entirely.
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((percept) => percept.fresh === false)).toBe(true);
    expect(found[0]!.of).toBe('e:1');
  });

  it('gives up when the lead comes to nothing', () => {
    const state = field([{ at: { x: HERO.x + 4, y: HERO.y } }]);
    const stale: GameState = {
      ...state,
      entities: {
        ...state.entities,
        // Standing on the spot it was curious about, with nothing there.
        'm:0': {
          ...state.entities['m:0']!,
          position: { x: 20, y: 4 },
          alerts: [
            { sense: 'hearing', of: 'e:1', at: { x: 20, y: 4 }, minute: state.minute, strength: 0.9 },
          ],
        },
        'e:1': { ...state.entities['e:1']!, map: 'elsewhere' },
      },
    };

    const { state: next, events } = reduce(stale, { type: 'advanceTime', minutes: 1 }, ctx);
    expect(next.entities['m:0']!.alerts).toEqual([]);
    expect(events.some((e) => e.type === 'custom' && e.event === 'lostInterest')).toBe(true);
  });

  it('forgets on its own once the memory has aged out', () => {
    const state = field([{ at: { x: 20, y: 4 } }]);
    const remembering: GameState = {
      ...state,
      entities: {
        ...state.entities,
        'm:0': {
          ...state.entities['m:0']!,
          alerts: [
            { sense: 'hearing', of: 'e:1', at: { x: 30, y: 4 }, minute: state.minute, strength: 0.9 },
          ],
        },
        'e:1': { ...state.entities['e:1']!, map: 'elsewhere' },
      },
    };

    // greenmarch gives hearing a thirty minute memory.
    const { state: next } = reduce(remembering, { type: 'advanceTime', minutes: 45 }, ctx);
    expect(next.entities['m:0']!.alerts).toEqual([]);
  });

  it('replays identically, trail and all', () => {
    const script = [
      { type: 'step', direction: 'east' },
      { type: 'wait', minutes: 5 },
      { type: 'step', direction: 'south' },
      { type: 'advanceTime', minutes: 30 },
    ] as const;

    const run = () => {
      let state = field([{ at: { x: 14, y: 4 } }]);
      for (const action of script) state = reduce(state, action, ctx).state;
      return state;
    };

    expect(statesEqual(run(), run())).toBe(true);
  });
});

describe('how you move decides what hears you', () => {
  /** How strongly a hound perceives the party at a fixed distance. */
  function heard(stance: string | null): number {
    const base = field([{ at: { x: 20, y: 4 } }]);
    const state: GameState = {
      ...base,
      entities: {
        ...base.entities,
        'e:1': { ...base.entities['e:1']!, stance },
      },
    };
    const context = { module: GREENMARCH, state, terrain };
    const hearing = sensesOf(GREENMARCH).find((sense) => sense.id === 'hearing')!;
    return signalAt(context, hearing, state.entities['m:0']!, HERO, emissionOf(GREENMARCH, state.entities['e:1']!, hearing));
  }

  it('gets quieter the more carefully you go', () => {
    expect(heard('sneak')).toBeLessThan(heard('walk'));
    expect(heard('walk')).toBeLessThan(heard('dash'));
  });

  it('never makes you truly silent', () => {
    // A skill lowers emission but never to silence.
    expect(heard('sneak')).toBeGreaterThan(0);
  });

  it('falls back to the module default when a creature has chosen none', () => {
    expect(heard(null)).toBe(heard('walk'));
  });

  it('costs you speed to creep and buys speed to run', () => {
    const state = field();
    const hero = state.entities['e:1']!;
    const walking = speedOf(GREENMARCH, { ...hero, stance: 'walk' });
    expect(speedOf(GREENMARCH, { ...hero, stance: 'sneak' })).toBeLessThan(walking);
    expect(speedOf(GREENMARCH, { ...hero, stance: 'dash' })).toBeGreaterThan(walking);
  });

  it('is set through the reducer for the whole party at once', () => {
    const { state, events } = reduce(field(), { type: 'setStance', stance: 'sneak' }, ctx);
    expect(state.entities['e:1']!.stance).toBe('sneak');
    expect(events.some((e) => e.type === 'custom' && e.event === 'stanceChanged')).toBe(true);
  });

  it('refuses a way of moving the module never declared', () => {
    const { events } = reduce(field(), { type: 'setStance', stance: 'somersault' }, ctx);
    expect(events.find((e) => e.type === 'refused')).toMatchObject({ action: 'setStance' });
  });

  it('lets a careful party pass where a noisy one is caught', () => {
    const start = field([{ at: { x: 18, y: 7 } }]);

    const creep = (stance: string) => {
      let state: GameState = {
        ...start,
        entities: { ...start.entities, 'e:1': { ...start.entities['e:1']!, stance } },
      };
      for (let i = 0; i < 4; i += 1) {
        state = reduce(state, { type: 'wait', minutes: 2 }, ctx).state;
      }
      return state.entities['m:0']!.alerts.length;
    };

    expect(creep('sneak')).toBe(0);
    expect(creep('dash')).toBeGreaterThan(0);
  });
});

describe('the party has senses of its own', () => {
  it('is told what reaches it, and told once', () => {
    const state = field([{ at: { x: 18, y: 4 } }]);

    const first = reduce(state, { type: 'wait', minutes: 1 }, ctx);
    const noticed = first.events.filter((e) => e.type === 'custom' && e.event === 'noticed');
    expect(noticed.length).toBeGreaterThan(0);

    // The same creature, still there, is not announced again every turn.
    const again = reduce(first.state, { type: 'wait', minutes: 1 }, ctx);
    expect(again.events.filter((e) => e.type === 'custom' && e.event === 'noticed')).toHaveLength(0);
  });

  it('reads as authored prose rather than as a readout', () => {
    const state = field([{ at: { x: 18, y: 4 } }]);
    const { state: next, events } = reduce(state, { type: 'wait', minutes: 1 }, ctx);

    const lines = narrate({ module: GREENMARCH, state: next, seed: 3 }, events)
      .map((line) => line.text)
      .join(' ');

    // greenmarch writes these; the engine only decides that something reached them and how strongly.
    expect(lines).toMatch(/reeds|splash|smell|musk|sour|water|sound/i);
    expect(lines).not.toContain('hearing');
  });

  it('never names what it cannot see', () => {
    // A hound investigating out of sight is not announced to the party.
    const builder = new MapBuilder(30, 9, 'floor');
    for (let y = 0; y < 9; y += 1) builder.set(10, y, 'wall');

    const base = field([{ at: { x: 20, y: 4 } }]);
    const split: GameState = {
      ...base,
      maps: { field: { ...base.maps['field']!, tiles: builder.freeze() } },
    };

    const { state: next, events } = reduce(split, { type: 'wait', minutes: 5 }, ctx);
    const lines = narrate({ module: GREENMARCH, state: next, seed: 3 }, events)
      .map((line) => line.text)
      .join(' ');

    expect(lines).not.toContain('Bog Hound');
  });
});

describe('the editor preview and play agree', () => {
  it('draws the same signal the engine would resolve', () => {
    const preview = simulatePerception(GREENMARCH, {
      layout: Array.from({ length: 9 }, (_, y) =>
        Array.from({ length: 20 }, (_, x) => (x === 10 && y !== 4 ? 'wall' : 'floor'))),
      source: { x: 3, y: 4 },
    });

    expect(preview.senses.map((sense) => sense.id)).toEqual(['sight', 'hearing', 'smell', 'tracks']);

    // Rebuild the same sketch as a real game state and ask the engine directly.
    const builder = new MapBuilder(20, 9, 'floor');
    for (let y = 0; y < 9; y += 1) if (y !== 4) builder.set(10, y, 'wall');

    const base = field();
    const state: GameState = {
      ...base,
      maps: { field: { ...base.maps['field']!, tiles: builder.freeze() } },
      entities: { ...base.entities, 'e:1': { ...base.entities['e:1']!, position: { x: 3, y: 4 } } },
    };
    const context = { module: GREENMARCH, state, terrain };
    const hearing = sensesOf(GREENMARCH).find((sense) => sense.id === 'hearing')!;

    for (const at of [{ x: 15, y: 4 }, { x: 15, y: 1 }, { x: 6, y: 4 }]) {
      const cell = preview.cells.find((entry) => entry.x === at.x && entry.y === at.y)!;
      const observer = { ...state.entities['e:1']!, id: 'listener', position: at };
      const live = signalAt(
        { ...context, state: { ...state, entities: { ...state.entities, listener: observer } } },
        hearing,
        observer,
        { x: 3, y: 4 },
        1,
      );
      expect(cell.signals['hearing'], `${at.x},${at.y}`).toBeCloseTo(live, 6);
    }
  });

  it('shows a doorway carrying sound that the wall beside it stops', () => {
    const layout = Array.from({ length: 9 }, (_, y) =>
      Array.from({ length: 20 }, (_, x) => (x === 10 && y !== 4 ? 'wall' : 'floor')));

    const preview = simulatePerception(GREENMARCH, { layout, source: { x: 3, y: 4 } });
    const through = preview.cells.find((c) => c.x === 15 && c.y === 4)!;
    const blocked = preview.cells.find((c) => c.x === 15 && c.y === 0)!;

    expect(through.signals['hearing']).toBeGreaterThan(0);
    expect(blocked.signals['hearing']).toBe(0);
    // And scent gets round the corner to where sound could not reach.
    expect(blocked.signals['smell']).toBeGreaterThan(0);
  });

  it('reflects the stance an author picks', () => {
    const layout = [Array.from({ length: 20 }, () => 'floor')];
    const at = (stance: string, sense: string) => {
      const preview = simulatePerception(GREENMARCH, { layout, source: { x: 0, y: 0 }, stance });
      return preview.cells.find((c) => c.x === 10 && c.y === 0)!.signals[sense]!;
    };

    expect(at('sneak', 'hearing')).toBeLessThan(at('walk', 'hearing'));
    expect(at('walk', 'hearing')).toBeLessThan(at('dash', 'hearing'));

    // Smell too: greenmarch declares that dashing stirs up more scent and sneaking leaves less.
    expect(at('sneak', 'smell')).toBeCloseTo(at('walk', 'smell') * 0.6, 10);
    expect(at('dash', 'smell')).toBeCloseTo(at('walk', 'smell') * 1.4, 10);
  });
});

/** Stopping to use a sense on purpose. */
describe('using a sense deliberately', () => {
  /** The party having heard something east of them, which has since moved off. */
  function heardSomething(): GameState {
    const state = field();
    return {
      ...state,
      entities: {
        ...state.entities,
        'e:1': {
          ...state.entities['e:1']!,
          alerts: [
            { sense: 'hearing', of: 'm:0', at: { x: 20, y: 4 }, minute: state.minute, strength: 0.8 },
          ],
        },
      },
    };
  }

  it('reports what this sense has to say, and which way it lies', () => {
    const state = heardSomething();
    const readings = senseReport({ module: GREENMARCH, state, terrain }, state.entities['e:1']!, 'hearing');
    expect(readings.length).toBeGreaterThan(0);
    expect(readings[0]!.direction).toBe('direction.east');
  });

  it('reports nothing when there is nothing out there', () => {
    const empty = field();
    for (const sense of ['hearing', 'smell']) {
      expect(
        senseReport({ module: GREENMARCH, state: empty, terrain }, empty.entities['e:1']!, sense),
        sense,
      ).toEqual([]);
    }
  });

  it('ages a held reading as the clock moves on', () => {
    const state = heardSomething();
    const later: GameState = { ...state, minute: state.minute + 12 };

    const readings = senseReport(
      { module: GREENMARCH, state: later, terrain },
      later.entities['e:1']!,
      'hearing',
    );
    const held = readings.find((reading) => reading.direction === 'direction.east')!;
    expect(held.age).toBe(12);
    expect(held.fresh).toBe(false);
  });

  it('still speaks the second and third time it is asked', () => {
    let state = heardSomething();
    const context = { module: GREENMARCH, terrain };

    for (const attempt of [1, 2, 3]) {
      const result = reduce(state, { type: 'sense', sense: 'hearing' }, context);
      const lines = narrate({ module: GREENMARCH, state: result.state, seed: 1 }, result.events);
      expect(lines.length, `attempt ${attempt}`).toBeGreaterThan(0);
      state = result.state;
    }
  });

  it('says so out loud when there is nothing to report', () => {
    const state = field();
    const result = reduce(state, { type: 'sense', sense: 'hearing' }, { module: GREENMARCH, terrain });
    const lines = narrate({ module: GREENMARCH, state: result.state, seed: 1 }, result.events);

    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).not.toBe('');
  });

  it('costs the minute it takes', () => {
    const state = field();
    const result = reduce(state, { type: 'sense', sense: 'hearing' }, { module: GREENMARCH, terrain });
    expect(result.state.minute - state.minute).toBe(1);
  });

  it('refuses a sense the module does not declare', () => {
    const state = field();
    const result = reduce(state, { type: 'sense', sense: 'echolocation' }, { module: GREENMARCH, terrain });
    expect(result.events.some((event) => event.type === 'refused')).toBe(true);
    expect(result.state.minute).toBe(state.minute);
  });
});

describe('a smell has to get to you', () => {
  /** A state with the trace settled at `minute`. */
  const settled = (state: GameState, id: string, minute: number): GameState => ({
    ...state,
    entities: { ...state.entities, [id]: { ...state.entities[id]!, since: minute } },
  });

  /** The party, freshly arrived, and a hound that has been here for ever. */
  const justArrived = (gap: number): GameState => {
    const base = field([{ at: { x: HERO.x + gap, y: HERO.y } }]);
    return settled(base, base.party[0]!, base.minute);
  };

  const smell = () => sensesOf(GREENMARCH).find((sense) => sense.id === 'smell')!;

  it('is not there the moment you walk in', () => {
    const state = justArrived(12);
    const hound = state.entities['m:0']!;
    const hero = state.entities[state.party[0]!]!;
    expect(signalAt({ module: GREENMARCH, state, terrain }, smell(), hound, hero.position, 1,
      { since: hero.since })).toBe(0);
  });

  it('arrives once it has had the minutes to cross the gap', () => {
    // Greenmarch scent creeps a little over a tile a minute, so twelve tiles is ten minutes away.
    const state = justArrived(12);
    const hound = state.entities['m:0']!;
    const hero = state.entities[state.party[0]!]!;
    const context = (minute: number) => ({ module: GREENMARCH, state: { ...state, minute }, terrain });

    const early = signalAt(context(state.minute + 4), smell(), hound, hero.position, 1, { since: hero.since });
    const later = signalAt(context(state.minute + 20), smell(), hound, hero.position, 1, { since: hero.since });

    expect(early).toBe(0);
    expect(later).toBeGreaterThan(0);
  });

  it('reaches what is close before what is far', () => {
    const base = field([
      { id: 'm:near', at: { x: HERO.x + 3, y: HERO.y } },
      { id: 'm:far', at: { x: HERO.x + 18, y: HERO.y } },
    ]);
    const state = settled(base, base.party[0]!, base.minute);
    const hero = state.entities[state.party[0]!]!;
    const context = { module: GREENMARCH, state: { ...state, minute: state.minute + 5 }, terrain };

    expect(signalAt(context, smell(), state.entities['m:near']!, hero.position, 1, { since: hero.since }))
      .toBeGreaterThan(0);
    expect(signalAt(context, smell(), state.entities['m:far']!, hero.position, 1, { since: hero.since }))
      .toBe(0);
  });

  it('leaves the party unsmelled through a whole walk in, and then catches up', () => {
    let state = settled(field([{ at: { x: HERO.x + 10, y: HERO.y } }]), 'm:0', 0);
    state = settled(state, state.party[0]!, state.minute);
    const context = () => ({ module: GREENMARCH, state, terrain });
    const smelled = () => perceive(context(), state.entities['m:0']!).some((p) => p.sense === 'smell');

    expect(smelled()).toBe(false);
    state = reduce(state, { type: 'wait', minutes: 30 }, ctx).state;
    expect(smelled()).toBe(true);
  });
});

describe('nearer is never worse', () => {
  /** Of two creatures with the same nose, the closer one smells at least as much. */
  it('smells a thing more strongly the closer it is', () => {
    const base = field([
      { id: 'm:near', at: { x: HERO.x + 3, y: HERO.y } },
      { id: 'm:far', at: { x: HERO.x + 14, y: HERO.y } },
    ]);
    // Long settled, so the scent has reached both and neither is waiting.
    const state: GameState = { ...base, minute: base.minute + 240 };
    const context = { module: GREENMARCH, state, terrain };

    const smelled = (id: string) => perceive(context, state.entities[id]!)
      .filter((p) => p.sense === 'smell')
      .reduce((most, p) => Math.max(most, p.strength), 0);

    expect(smelled('m:near')).toBeGreaterThan(0);
    expect(smelled('m:near')).toBeGreaterThan(smelled('m:far'));
  });

  it('leaves a live nose alone when a creature will not read the ground', () => {
    // `followsTrails: false` gates traces only.
    const base = field([{ id: 'm:0', at: { x: HERO.x + 3, y: HERO.y } }]);
    const state: GameState = { ...base, minute: base.minute + 240 };
    const context = { module: GREENMARCH, state, terrain };

    const live = perceive(context, state.entities['m:0']!)
      .filter((p) => p.sense === 'smell' && p.fresh);
    expect(live.length).toBeGreaterThan(0);
  });
});

describe('a sound does not', () => {
  it('arrives the instant it is made, however far across the room', () => {
    // Hearing does not spread, so there is nothing to wait for: it is heard now or not at all.
    const base = field([{ at: { x: HERO.x + 20, y: HERO.y } }]);
    const state = { ...base, entities: { ...base.entities,
      [base.party[0]!]: { ...base.entities[base.party[0]!]!, since: base.minute } } };
    const hearing = sensesOf(GREENMARCH).find((sense) => sense.id === 'hearing')!;
    const hero = state.entities[state.party[0]!]!;

    expect(signalAt({ module: GREENMARCH, state, terrain }, hearing, state.entities['m:0']!,
      hero.position, 1, { since: hero.since })).toBeGreaterThan(0);
  });

  it('never arrives at all from beyond its range, however long anyone waits', () => {
    // Greenmarch hearing reaches 24 tiles.
    const base = field([{ at: { x: HERO.x + 30, y: HERO.y } }]);
    const hearing = sensesOf(GREENMARCH).find((sense) => sense.id === 'hearing')!;
    const hero = base.entities[base.party[0]!]!;

    for (const minute of [base.minute, base.minute + 60, base.minute + 600]) {
      expect(signalAt({ module: GREENMARCH, state: { ...base, minute }, terrain },
        hearing, base.entities['m:0']!, hero.position, 1, { since: base.minute })).toBe(0);
    }
  });
});
