/**
 * What the engine can perceive, pinned exactly as it behaves today.
 *
 * This file exists to be written *before* perception is refactored. Sight is
 * currently the expression `hasLineOfSight(...) && distance(...) <= 12`, spelled
 * out in four separate places that do not agree with each other, and the point
 * of these tests is to record each one at its exact boundary — including the
 * inconsistencies — so that extracting them into one declared sense can be
 * proven to change nothing.
 *
 * Where a test pins behaviour that is arguably wrong, it says so. Those are the
 * assertions expected to move later, deliberately and one at a time.
 */

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

/**
 * A long open corridor.
 *
 * Wide enough to place a creature past every threshold that matters — the arena
 * in `combat.test.ts` is 15×15, which cannot express a gap of 13 tiles, and that
 * is exactly the gap these tests need.
 */
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
  // 12 tiles is the engine's only perception constant. It appears as a bare
  // literal in turn.ts and again in deeds.ts, and nothing declares it.
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

    // Pull them apart past the threshold. Escape is judged at the top of a
    // round, so the fight ends the next time the order comes round.
    const separated: GameState = {
      ...started,
      entities: {
        ...started.entities,
        'm:0': { ...started.entities['m:0']!, position: { x: HERO.x + 20, y: HERO.y } },
      },
    };
    const { state: next, events } = reduce(separated, { type: 'wait', minutes: 0 }, ctx);
    expect(next.combat).toBeNull();
    expect(events.find((e) => e.type === 'combatEnded')).toMatchObject({ outcome: 'fled' });
  });
});

describe('who a creature will attack', () => {
  const targeting = (state: GameState) => ({ module: GREENMARCH, state, terrain });

  // Pinned as-is, and it disagrees with combat entry: `nearestHostile` applies
  // no distance cap at all, so a creature already in a fight will target
  // something it could never have noticed. Expected to change.
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

  // Twelve tiles is greenmarch's own sight: `defaultRange: 60` at five units to
  // the tile. It is not an engine constant, and the note that used to stand
  // here saying the engine floored `witness.radius` at 12 was describing a
  // different branch — the one below, for modules that switch sight off.
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

  /**
   * With sight not required, `radius: 0` means everyone here.
   *
   * The engine used to floor it at twelve tiles, so a module that turned line
   * of sight off and left the radius at its schema default silently got a
   * twelve-tile circle instead of the whole place — and no way to ask for the
   * whole place at all.
   */
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
  // Was a third, unrelated radius of 10. Prose now uses the character's own
  // declared sight, so what you are told about and what starts a fight are the
  // same reach — which is the point of folding sight in beside the rest.
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
    // Both endpoints are exempt from the opacity test, so standing on an opaque
    // tile does not blind you.
    const builder = new MapBuilder(9, 3, 'floor');
    builder.set(4, 1, 'reeds');
    const tiles = builder.freeze();
    expect(hasLineOfSight(tiles, terrain, { x: 4, y: 1 }, { x: 7, y: 1 })).toBe(true);
  });
});

describe('the alien ruleset perceives the same way', () => {
  // minimal declares no senses, no sizes, and no perception of any kind. It
  // must keep behaving exactly like greenmarch does here — that equivalence is
  // what proves perception is engine behaviour and not content.
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
  // The whole compatibility argument in one test. greenmarch declares sight
  // with nothing but a name; every other field defaults. The schema's
  // `defaultRange` of 60 module units, at the fallback tile size of 5, is
  // twelve tiles — the literal the engine used to carry.
  it('resolves a bare declaration to twelve tiles', () => {
    const sight = sensesOf(GREENMARCH).find((sense) => sense.id === 'sight')!;
    expect(sight.range).toBe(12);
    expect(sight.falloff).toBe('cliff');
    // Sight remembers nothing and leaves nothing: what you can still see needs
    // no memory, and being seen leaves no trace where you stood.
    expect(sight.lingerMinutes).toBe(0);
    expect(sight.rememberMinutes).toBe(0);
  });

  it('converts every declared range into tiles once', () => {
    const senses = sensesOf(GREENMARCH);
    expect(senses.map((sense) => sense.id)).toEqual(['sight', 'hearing', 'smell']);
    expect(senses.map((sense) => sense.range)).toEqual([12, 24, 25]);
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

/**
 * A sense can be shut off, and a sense can be the kind that does not care.
 *
 * `senses[].ignores` shipped for a long time on its own, which made it an
 * exception to a rule nobody had written: no condition suppressed a sense, so
 * ignoring one bought nothing. Both halves are now read together.
 */
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

  // The whole point of `ignores`, and what it never bought before.
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
    // greenmarch's reeds are opaque but passable: you cannot see through them
    // and they muffle nothing.
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
    // Audible at twenty tiles, but nowhere near the aggro threshold — the whole
    // point of separating noticing from attacking.
    const state = settle(field([{ at: { x: HERO.x + 20, y: HERO.y } }]));
    expect(state.combat).toBeNull();
  });
});

describe('smell', () => {
  const smell = () => sensesOf(GREENMARCH).find((sense) => sense.id === 'smell')!;

  it('turns a corner that sight and sound cannot', () => {
    // A wall with one gap in it. Straight senses are blocked; scent goes round.
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

    // Only senses that linger leave anything: sight and hearing do not.
    const left = Object.values(marks).flat();
    expect(new Set(left.map((mark) => mark.sense))).toEqual(new Set(['smell']));
    expect(left.every((mark) => mark.by === 'e:1')).toBe(true);
  });

  it('goes cold with age and is gone when it should be', () => {
    const smell = sensesOf(GREENMARCH).find((sense) => sense.id === 'smell')!;
    const mark = { sense: 'smell', by: 'e:1', at: 100, strength: 1 };

    expect(markStrength(smell, mark, 100)).toBe(1);
    expect(markStrength(smell, mark, 145)).toBeCloseTo(0.5);
    // Exactly zero at the declared span, by an integer comparison on minutes —
    // so "faded" and "pruned" can never disagree by an epsilon.
    expect(markStrength(smell, mark, 100 + smell.lingerMinutes)).toBe(0);
    expect(markStrength(smell, mark, 100 + smell.lingerMinutes + 500)).toBe(0);
  });

  it('is swept away once it is cold', () => {
    let state = field();
    state = reduce(state, { type: 'step', direction: 'east' }, ctx).state;
    expect(Object.keys(state.maps['field']!.marks).length).toBeGreaterThan(0);

    // A day passes. Nothing that old is still worth smelling.
    state = reduce(state, { type: 'advanceTime', minutes: 1500 }, ctx).state;
    expect(state.maps['field']!.marks).toEqual({});
  });

  it('does not grow without bound when ground is walked over again', () => {
    let state = field();
    for (let i = 0; i < 12; i += 1) {
      const direction = i % 2 === 0 ? 'east' : 'west';
      state = reduce(state, { type: 'step', direction }, ctx).state;
    }

    // Two tiles paced between, one trace each — not twelve stacked up.
    for (const marks of Object.values(state.maps['field']!.marks)) {
      expect(marks.length).toBeLessThanOrEqual(1);
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
    // A wall with a gap at the bottom. The hound cannot see the party at all,
    // but sound carries through the gap and around it.
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
    // The party walks east, then doubles back west. A nose says east.
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
    // A skill should be an advantage, not a win condition.
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

    // greenmarch writes these; the engine only decides that something reached
    // them and how strongly.
    expect(lines).toMatch(/reeds|splash|smell|musk|sour|water|sound/i);
    expect(lines).not.toContain('hearing');
  });

  it('never names what it cannot see', () => {
    // A hound investigating out of sight is the party's problem to discover,
    // not something the narrator hands them.
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

    expect(preview.senses.map((sense) => sense.id)).toEqual(['sight', 'hearing', 'smell']);

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

    // Smell too: greenmarch declares that dashing stirs up more scent and
    // sneaking leaves less, so the stance dropdown moves this sense as well.
    // The multipliers come from the stance's own `emits` table, not the engine.
    expect(at('sneak', 'smell')).toBeCloseTo(at('walk', 'smell') * 0.6, 10);
    expect(at('dash', 'smell')).toBeCloseTo(at('walk', 'smell') * 1.4, 10);
  });
});

/**
 * Stopping to use a sense on purpose.
 *
 * `listen` and `smell` used to be the same one-minute `wait`, and the only
 * thing that ever spoke was the *moment of noticing* — which fires once, for a
 * new alert. Asking again a minute later was silence, and a command that says
 * nothing reads as a command that does not work.
 */
describe('using a sense deliberately', () => {
  /**
   * The party having heard something east of them, which has since moved off.
   *
   * Nothing is on the map to be perceived now, so everything reported comes
   * from what the party *remembers* — which is precisely the case the old code
   * had no way to speak about.
   */
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

  // How long ago it was is the difference between "something is there" and
  // "something was there", so the reading carries it.
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

  // The whole bug: `perceiveAll` announces a *new* alert once, and the alert
  // then persists for half an hour — so asking again used to be silence.
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
