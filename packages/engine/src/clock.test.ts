/** The clock, the calendar, and what the world is like right now. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { reduce } from './reduce.js';
import { buildScope } from './stats.js';
import { phaseOf, dateOf, layerOf } from './sim/clock.js';
import type { GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');
const ctx = { module: GREENMARCH };

describe('the phase of the day', () => {
  // greenmarch: dawn 05:00, day 08:00, dusk 19:00, night 21:00.
  it('names the phase the clock has reached', () => {
    const at = (hour: number, minute = 0) => phaseOf(GREENMARCH, hour * 60 + minute)?.id;
    expect(at(5)).toBe('dawn');
    expect(at(7, 59)).toBe('dawn');
    expect(at(8)).toBe('day');
    expect(at(18)).toBe('day');
    expect(at(19)).toBe('dusk');
    expect(at(21)).toBe('night');
    expect(at(23, 59)).toBe('night');
  });

  it('wraps: the small hours are the previous night, not nothing', () => {
    expect(phaseOf(GREENMARCH, 2 * 60)?.id).toBe('night');
    expect(phaseOf(GREENMARCH, 0)?.id).toBe('night');
  });

  it('keeps counting across days', () => {
    const threeDaysAndNoon = 3 * 1440 + 12 * 60;
    expect(phaseOf(GREENMARCH, threeDaysAndNoon)?.id).toBe('day');
  });

  it('has none at all underground — a barrow has no dusk', () => {
    expect(phaseOf(GREENMARCH, 12 * 60, 'underworld')).toBeNull();
  });

  it('has none in a module that declares no phases', () => {
    expect(phaseOf(MINIMAL, 12 * 60)).toBeNull();
  });
});

describe('the calendar', () => {
  it('counts days when the module names no months', () => {
    // greenmarch declares no month names.
    const date = dateOf(GREENMARCH, 5 * 1440 + 90);
    expect(date.day).toBe(6);
    expect(date.monthName).toBeNull();
    expect(date.hour).toBe(1);
    expect(date.minute).toBe(30);
  });

  it('reads as a date once a module has months', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { time: Record<string, unknown> };
    };
    doc.world.time['daysPerMonth'] = 10;
    doc.world.time['monthNames'] = ['Firstmelt', 'Highsun', 'Fallow'];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    // Day 12 of a ten-day month is the second of the second month.
    const date = dateOf(compiled.module, 11 * 1440);
    expect(date).toMatchObject({ day: 12, dayOfMonth: 2, month: 2, monthName: 'Highsun', year: 1 });

    // And the year turns once the months run out.
    const later = dateOf(compiled.module, 35 * 1440);
    expect(later.year).toBe(2);
  });
});

describe('which layer the party is on', () => {
  it('is underworld inside a dungeon, whatever the area says', () => {
    expect(layerOf(GREENMARCH, { kind: 'dungeon' })).toBe('underworld');
  });

  it('takes the area\'s own layer', () => {
    expect(layerOf(GREENMARCH, { kind: 'area', area: 'millford' })).toBe('overworld');
  });

  it('falls back to the biome when the area declares none', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { areas: Record<string, unknown>[]; biomes: Record<string, unknown>[] };
    };
    delete doc.world.areas.find((a) => a['id'] === 'millford')!['layer'];
    doc.world.biomes.find((b) => b['id'] === 'greenmarch')!['layer'] = 'underworld';
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    expect(layerOf(compiled.module, { kind: 'area', area: 'millford' })).toBe('underworld');
  });
});

describe('content can ask what time it is', () => {
  it('puts the phase and the date in scope', () => {
    const state = newGame(GREENMARCH, { seed: 1, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const scope = buildScope(GREENMARCH, state, state.entities[state.party[0]!]!);
    const world = scope['world'] as Record<string, unknown>;

    // The game opens at 08:00.
    expect(world['phase']).toBe('day');
    expect(world['hour']).toBe(8);
    expect(world['day']).toBe(1);
  });

  it('reports no phase underground, so night-only content stays put', () => {
    const base = newGame(GREENMARCH, { seed: 1, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const below: GameState = {
      ...base,
      location: { kind: 'dungeon', dungeon: 'barrow_depths', room: '' },
    };
    const scope = buildScope(GREENMARCH, below, below.entities[below.party[0]!]!);
    expect((scope['world'] as Record<string, unknown>)['phase']).toBeNull();
  });
});

describe('a one-way road', () => {
  /** greenmarch, with the road out of the fens marked one-way. */
  function withCliff(): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { areas: { id: string; connections: Record<string, unknown>[] }[] };
    };
    const millford = doc.world.areas.find((a) => a.id === 'millford')!;
    const road = millford.connections.find((c) => c['to'] === 'the_fens')!;
    road['oneWay'] = true;
    // The toll would refuse before the one-way rule is reached.
    delete road['gate'];
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  it('lets you go down, and not back up', () => {
    const module = withCliff();
    const context = { module };
    const base = newGame(module, { seed: 2, party: [defaultChoices(module, 'Ash')] });

    const down = reduce(base, { type: 'travelToArea', area: 'the_fens' }, context);
    expect(down.state.location).toMatchObject({ area: 'the_fens' });

    const up = reduce(down.state, { type: 'travelToArea', area: 'millford' }, context);
    expect(up.state.location).toMatchObject({ area: 'the_fens' });
    expect(up.events).toContainEqual(
      expect.objectContaining({ type: 'refused', reason: { key: 'refused.travel.noWayUp' } }),
    );
  });
});

describe('an area that gates itself', () => {
  it('refuses the road, and says what it would take', () => {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      world: { areas: Record<string, unknown>[] };
    };
    const fens = doc.world.areas.find((a) => a['id'] === 'the_fens')!;
    fens['requires'] = { description: 'the wardens to name you', minLevel: 5 };
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const context = { module: compiled.module };
    const base = newGame(compiled.module, { seed: 2, party: [defaultChoices(compiled.module, 'Ash')] });
    // Enough coin for the ferry, so the refusal that lands is the area's.
    const funded: GameState = { ...base, purse: 100 };

    const { state, events } = reduce(funded, { type: 'travelToArea', area: 'the_fens' }, context);
    expect(state.location).toMatchObject({ area: 'millford' });
    const refusal = events.find((e) => e.type === 'refused');
    expect(refusal).toBeDefined();
    if (refusal?.type === 'refused') expect(refusal.reason).toMatchObject({ key: 'refused.travel.notYet' });
  });
});

describe('the wilds are not empty', () => {
  it('rolls the area\'s own table on arrival', () => {
    let met = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
      const funded: GameState = { ...base, purse: 100 };
      const { state } = reduce(funded, { type: 'travelToArea', area: 'the_fens' }, ctx);
      if (Object.values(state.entities).some((e) => e.disposition === 'hostile' && e.alive)) met += 1;
    }
    expect(met).toBeGreaterThan(0);
  });

  it('leaves a settlement alone — danger 0 means quiet', () => {
    // Millford declares `dangerLevel: 0` and no tables; nothing should arrive.
    for (let seed = 0; seed < 20; seed += 1) {
      const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
      const out = reduce({ ...base, purse: 100 }, { type: 'travelToArea', area: 'the_fens' }, ctx).state;
      const cleared: GameState = {
        ...out,
        entities: Object.fromEntries(
          Object.entries(out.entities).filter(([, e]) => e.disposition !== 'hostile'),
        ),
      };
      const back = reduce(cleared, { type: 'travelToArea', area: 'millford' }, ctx).state;
      expect(Object.values(back.entities).some((e) => e.disposition === 'hostile')).toBe(false);
    }
  });
});

describe('walking out to a place takes time', () => {
  it('charges the minutes the exit label has always printed', () => {
    const base = newGame(GREENMARCH, { seed: 3, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const hero = base.entities[base.party[0]!]!;
    const keyed: GameState = {
      ...base,
      purse: 100,
      entities: {
        ...base.entities,
        [hero.id]: { ...hero, inventory: [...hero.inventory, { item: 'brass_key', quantity: 1 }] },
      },
    };

    // Out and back, so the party is standing on a map.
    const out = reduce(keyed, { type: 'travelToArea', area: 'the_fens' }, ctx).state;
    const home = reduce(out, { type: 'travelToArea', area: 'millford' }, ctx).state;

    // The mill is twenty minutes off.
    const before = home.minute;
    const { state: arrived } = reduce(home, { type: 'enter', target: 'the_mill' }, ctx);
    expect(arrived.minute - before).toBeGreaterThanOrEqual(20);
  });
});
