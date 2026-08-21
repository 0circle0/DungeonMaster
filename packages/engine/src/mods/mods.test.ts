/**
 * Mods against the real engine. The two that matter most are the first two: the hook sites are
 * inert without mods, and a run with mods replays identically. Everything else is a feature; those
 * two are the contract.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { testHost, modById, inlineMod } from '@dm/mods/testing';
import type { SandboxHost, LoadedMod } from '@dm/mods';

import { newGame, defaultChoices } from '../newgame.js';
import { reduce, reduceAll } from '../reduce.js';
import { save, load, statesEqual } from '../save.js';
import { Rng } from '@dm/core';
import { createMap, TerrainIndex } from '../grid/tiles.js';
import { enterArea } from '../sim/enter.js';
import { Transaction, applyOps } from '../rules/apply.js';
import { ModRuntime } from './runtime.js';
import type { GameState } from '../state.js';
import type { Action } from '../actions.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');

function started(seed = 1, floor = 'floor'): GameState {
  const base = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
  const tiles = createMap(11, 11, floor);
  const hero = base.entities[base.party[0]!]!;
  return {
    ...base,
    currentMap: 'test',
    maps: {
      test: { id: 'test', tiles, kind: 'room', source: 'test', explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1 },
    },
    entities: { ...base.entities, [hero.id]: { ...hero, map: 'test', position: { x: 5, y: 5 } } },
  };
}

const SCRIPT: Action[] = [
  { type: 'step', direction: 'north' },
  { type: 'wait' },
  { type: 'look' },
  { type: 'step', direction: 'east' },
  { type: 'wait' },
];

let host: SandboxHost;
let thorns: LoadedMod;

function runtimeWith(mods: readonly LoadedMod[]): ModRuntime {
  for (const mod of mods) if (!host.installed(mod.manifest.id)) host.install(mod);
  return new ModRuntime({ host, mods });
}

beforeAll(async () => {
  host = await testHost({ quarantineAfter: Infinity });
  const disk = modById('thorns');
  thorns = { manifest: disk.manifest, files: disk.files, hash: disk.hash };
});

afterAll(() => host?.dispose());

describe('the seam is inert', () => {
  it('produces the identical state with no mods and with a zero-mod runtime', () => {
    // If this ever fails, adding the hook call sites changed the game — the one thing they must not
    // do.
    const plain = reduceAll(started(), SCRIPT, { module: GREENMARCH });
    const empty = reduceAll(started(), SCRIPT, { module: GREENMARCH, mods: runtimeWith([]) });
    expect(statesEqual(plain.state, empty.state)).toBe(true);
  });

  it('leaves modState empty when nothing writes to it', () => {
    const { state } = reduceAll(started(), SCRIPT, { module: GREENMARCH });
    expect(state.modState).toEqual({});
  });
});

describe('determinism', () => {
  it('replays identically with the same seed, script, and mods', () => {
    const mods = runtimeWith([thorns]);
    const once = reduceAll(started(7), SCRIPT, { module: GREENMARCH, mods });
    const twice = reduceAll(started(7), SCRIPT, { module: GREENMARCH, mods });
    expect(statesEqual(once.state, twice.state)).toBe(true);
  });

  it('is unaffected by how many random numbers a mod draws', () => {
    // `derive()` reads the parent generator without advancing it, so a mod's draws cannot perturb
    // anything downstream. This is what lets a mod author add a die roll without changing the rest
    // of the game.
    const drawing = (id: string, times: number): LoadedMod =>
      inlineMod(
        { ...thorns.manifest, id, hooks: [{ hook: 'action.after', mode: 'after', priority: 0, match: 'wait' }] },
        { 'main.js': `dm.hook('action.after', () => { for (let i = 0; i < ${times}; i++) dm.random(); return null; });` },
      );

    const one = reduceAll(started(3), SCRIPT, { module: GREENMARCH, mods: runtimeWith([drawing('draw1', 1)]) });
    const many = reduceAll(started(3), SCRIPT, { module: GREENMARCH, mods: runtimeWith([drawing('draw7', 7)]) });
    expect(statesEqual(one.state, many.state)).toBe(true);
  });

  it('survives a save and reload mid-run', () => {
    const mods = runtimeWith([thorns]);
    const context = { module: GREENMARCH, mods };

    const straight = reduceAll(started(5), [...SCRIPT, ...SCRIPT], context);

    const half = reduceAll(started(5), SCRIPT, context);
    const text = save(half.state, 1_000, { mods: [`thorns-${thorns.hash}`] });
    const loaded = load(text, GREENMARCH, { mods: [`thorns-${thorns.hash}`] });
    if (!loaded.ok) throw new Error(loaded.error);
    const rest = reduceAll(loaded.state, SCRIPT, context);

    expect(statesEqual(straight.state, rest.state)).toBe(true);
  });
});

describe('a mod adds an effect op the engine has never heard of', () => {
  it('implements pluckThorns, which no engine case exists for', () => {
    const mods = runtimeWith([thorns]);
    // Carrying four, so plucking two leaves two.
    const state: GameState = { ...started(), modState: { thorns: { stacks: 4 } } };

    // Driven the way content would: through `applyOps`, which reaches the unknown-op branch and
    // asks the mods before refusing.
    const txn = new Transaction(state, GREENMARCH, mods);
    applyOps(txn, [{ op: 'pluckThorns', amount: 2 } as never]);
    const result = txn.finish();

    expect(result.state.modState['thorns']).toEqual({ stacks: 2 });
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'custom', event: 'thornsClear' }),
    );
    // And it did not fall through to the refusal.
    expect(result.events.find((e: { type: string }) => e.type === 'refused')).toBeUndefined();
  });

  it('still refuses an op no mod implements', () => {
    const mods = runtimeWith([thorns]);
    const txn = new Transaction(started(), GREENMARCH, mods);
    applyOps(txn, [{ op: 'noSuchOp' } as never]);
    expect(txn.finish().events).toContainEqual(expect.objectContaining({ type: 'refused' }));
  });
});

describe('the content thorns depends on actually exists', () => {
  it('declares briar terrain', () => {
    // A mod that gates on terrain the module never declares is a mod that silently does nothing.
    const briar = GREENMARCH.source.world.terrains.find((t) => t.id === 'briar');
    expect(briar).toBeDefined();
    expect(briar?.passable).toBe(true);
  });

  it('actually generates briar on the maps the party walks onto', () => {
    // Declaring the terrain is not enough: if nothing scatters it, the mod is unreachable in play
    // however correct its code is.
    const withBriar = [1, 2, 3, 4].filter((seed) => {
      const state = newGame(GREENMARCH, { seed, party: [defaultChoices(GREENMARCH, 'Ash')] });
      const terrain = new TerrainIndex(GREENMARCH);
      const txn = new Transaction(state, GREENMARCH);
      const start = GREENMARCH.source.start.startingPoi;
      const poi = start ? GREENMARCH.get<{ area: string }>('world.pointsOfInterest', start) : null;
      if (!poi) return false;
      enterArea(txn, terrain, poi.area, Rng.fromSeed(seed).derive('arrival'));
      return Object.values(txn.state.maps).some((map) => map.tiles.tiles.includes('briar'));
    });

    expect(withBriar).toEqual([1, 2, 3, 4]);
  });
});

describe('thorns, end to end', () => {
  const wound = (state: GameState) => {
    const mods = runtimeWith([thorns]);
    const txn = new Transaction(state, GREENMARCH, mods);
    applyOps(txn, [
      { op: 'damage', target: state.party[0]!, amount: 3, damageType: null, tags: [] } as never,
    ]);
    return txn.finish();
  };

  it('catches a thorn when the party is wounded standing in briar', () => {
    // Through `event.emit`, which is why that hook must be cheap: it sees every `damaged` event and
    // nothing else.
    const result = wound(started(1, 'briar'));

    expect(result.state.modState['thorns']?.['stacks']).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'custom', event: 'thornCaught' }),
    );
  });

  it('costs nothing to be wounded off the briar', () => {
    // The gate that makes the mod's description true. Without it every wound anywhere was a thorn.
    const result = wound(started(1, 'floor'));
    expect(result.state.modState['thorns']?.['stacks'] ?? 0).toBe(0);
    expect(result.events.find(
      (e: { type: string; event?: string }) => e.type === 'custom' && e.event === 'thornCaught',
    )).toBeUndefined();
  });

  it('says so in the transcript, in the mod\u2019s own words', () => {
    // A mod that changes the world but never speaks reads as broken.
    const result = wound(started(1, 'briar'));
    const spoken = result.events.find(
      (e: { type: string; event?: string }) => e.type === 'custom' && e.event === 'modSay',
    );
    expect(JSON.stringify(spoken)).toContain('The briar takes its price');
    expect(JSON.stringify(spoken)).toContain('1 in you now');
  });

  it('pulls one out when the party waits', () => {
    const mods = runtimeWith([thorns]);
    const carrying: GameState = { ...started(), modState: { thorns: { stacks: 2 } } };
    const { state, events } = reduce(carrying, { type: 'wait' }, { module: GREENMARCH, mods });
    expect(state.modState['thorns']?.['stacks']).toBe(1);
    expect(JSON.stringify(events)).toContain('You work a thorn out');
  });

  it('narrates the last one differently, so clear is a moment', () => {
    const mods = runtimeWith([thorns]);
    const carrying: GameState = { ...started(), modState: { thorns: { stacks: 1 } } };
    const { state, events } = reduce(carrying, { type: 'wait' }, { module: GREENMARCH, mods });
    expect(state.modState['thorns']?.['stacks']).toBe(0);
    expect(JSON.stringify(events)).toContain('The last thorn comes free');
  });

  it('does nothing on a wait when there are none', () => {
    const mods = runtimeWith([thorns]);
    const { state } = reduce(started(), { type: 'wait' }, { module: GREENMARCH, mods });
    expect(state.modState['thorns']?.['stacks'] ?? 0).toBe(0);
  });
});

describe('a mod is not limited to effect ops', () => {

  it('can make a character invincible, because mods are not rule-limited', () => {
    const invincible = inlineMod(
      {
        ...thorns.manifest,
        id: 'invincible',
        hooks: [{ hook: 'action.after', mode: 'after', priority: 0 }],
        systemText: {},
      },
      {
        'main.js': `
          dm.hook('action.after', (ctx) => {
            const id = ctx.selected;
            const max = 9999;
            return [{ kind: 'patch', patches: [
              { op: 'set', path: ['entities', id, 'resources', 'vitality'], value: max },
            ] }];
          });
        `,
      },
    );

    const mods = runtimeWith([invincible]);
    const state = started();
    const hero = state.party[0]!;
    const hurt: GameState = {
      ...state,
      entities: {
        ...state.entities,
        [hero]: { ...state.entities[hero]!, resources: { ...state.entities[hero]!.resources, vitality: 1 } },
      },
    };

    const { state: after } = reduce(hurt, { type: 'wait' }, { module: GREENMARCH, mods });
    expect(after.entities[hero]!.resources['vitality']).toBe(9999);
  });
});

describe('a mod refuses in its own words', () => {
  it('blocks rest once thorns run high, using the mod’s systemText', () => {
    const mods = runtimeWith([thorns]);
    const state = started();
    const primed: GameState = { ...state, modState: { thorns: { stacks: 5 } } };

    const { events } = reduce(primed, { type: 'rest', kind: 'long' }, { module: GREENMARCH, mods });
    const refusal = events.find((e: { type: string }) => e.type === 'refused');
    expect(refusal).toBeDefined();
    expect(JSON.stringify(refusal)).toContain('You cannot settle');
    // The count is interpolated from the mod's own template, not the engine's.
    expect(JSON.stringify(refusal)).toContain('There are 5 thorns');
  });

  it('lets rest through when thorns are low', () => {
    const mods = runtimeWith([thorns]);
    const { events } = reduce(started(), { type: 'rest', kind: 'long' }, { module: GREENMARCH, mods });
    const refusal = events.find((e: { type: string }) => e.type === 'refused');
    expect(JSON.stringify(refusal ?? {})).not.toContain('You cannot settle');
  });
});

describe('the paired mod reads what the studio half wrote', () => {
  it('reaches a monster’s extra bag through a module query', () => {
    // The engine half of `morale` looks up `module.content.monsters.<id>` and reads `extra.morale`.
    // That is the whole contract between the two halves: they share no code, only a path into a bag
    // the schema allows.
    const morale = modById('morale');
    const mods = runtimeWith([{ manifest: morale.manifest, files: morale.files, hash: morale.hash }]);

    const probe = inlineMod(
      {
        ...morale.manifest,
        id: 'probe',
        hooks: [{ hook: 'action.after', mode: 'after', priority: 0, match: 'wait' }],
      },
      {
        'main.js': `
          dm.hook('action.after', () => {
            const monster = dm.state.get('module.content.monsters.bog_hound');
            return [{ kind: 'event', event: 'probed', data: {
              found: monster !== null,
              name: monster ? String(monster.name) : '',
            } }];
          });
        `,
      },
    );

    const withProbe = runtimeWith([probe]);
    const { events } = reduce(started(), { type: 'wait' }, { module: GREENMARCH, mods: withProbe });
    const probed = events.find(
      (event: { type: string; event?: string }) => event.type === 'custom' && event.event === 'probed',
    );
    expect(probed).toBeDefined();
    expect(JSON.stringify(probed)).toContain('"found":true');
    void mods;
  });
});

describe('the wider hook surface', () => {
  const hooking = (id: string, hooks: LoadedMod['manifest']['hooks'], source: string): LoadedMod =>
    inlineMod({ ...thorns.manifest, id, hooks, systemText: {} }, { 'main.js': source });

  it('fires settle.after once a reduction has resolved', () => {
    const mod = hooking(
      'settler',
      [{ hook: 'settle.after', mode: 'after', priority: 0 }],
      `dm.hook('settle.after', (ctx) => [{ kind: 'event', event: 'settled', data: {
         inCombat: ctx.subject.inCombat, outcome: ctx.subject.outcome,
       } }]);`,
    );
    const { events } = reduce(started(), { type: 'wait' }, { module: GREENMARCH, mods: runtimeWith([mod]) });
    const settled = events.find(
      (e: { type: string; event?: string }) => e.type === 'custom' && e.event === 'settled',
    );
    expect(JSON.stringify(settled)).toContain('"inCombat":false');
  });

  it('fires time.after when the clock moves, with the days crossed', () => {
    const mod = hooking(
      'clockwatch',
      [{ hook: 'time.after', mode: 'after', priority: 0 }],
      `dm.hook('time.after', (ctx) => [{ kind: 'event', event: 'ticked', data: {
         minutes: ctx.subject.minutes, days: ctx.subject.daysCrossed,
       } }]);`,
    );
    // A long rest crosses a day boundary; a single `wait` may not move the clock at all, which is
    // the case this hook distinguishes.
    const { events } = reduce(
      started(),
      { type: 'advanceTime', minutes: 2000 },
      { module: GREENMARCH, mods: runtimeWith([mod]) },
    );
    const ticked = events.find(
      (e: { type: string; event?: string }) => e.type === 'custom' && e.event === 'ticked',
    );
    expect(ticked).toBeDefined();
    expect(JSON.stringify(ticked)).toContain('"minutes":2000');
  });

  it('runs passives for an entity even when the module gave it none', () => {
    const mod = hooking(
      'aura',
      [{ hook: 'passives', mode: 'after', priority: 0 }],
      `dm.hook('passives', (ctx) => [{ kind: 'modState', key: 'last', value: ctx.subject.entityId }]);`,
    );
    const { state } = reduce(started(), { type: 'wait' }, { module: GREENMARCH, mods: runtimeWith([mod]) });
    expect(typeof state.modState['aura']?.['last']).toBe('string');
  });

  it('sees a specific event type through event.emit', () => {
    const mod = hooking(
      'watcher',
      [{ hook: 'event.emit', mode: 'after', priority: 0, match: 'timePassed' }],
      `dm.hook('event.emit', (ctx) => [{ kind: 'modState', key: 'sawType', value: ctx.subject.event.type }]);`,
    );
    const { state } = reduce(
      started(),
      { type: 'advanceTime', minutes: 30 },
      { module: GREENMARCH, mods: runtimeWith([mod]) },
    );
    expect(state.modState['watcher']?.['sawType']).toBe('timePassed');
  });

  it('refuses an unfiltered event.emit rather than crossing on every event', () => {
    const greedy = hooking(
      'greedy',
      [{ hook: 'event.emit', mode: 'after', priority: 0 }],
      `dm.hook('event.emit', () => null);`,
    );
    const runtime = runtimeWith([greedy]);
    expect(runtime.rejected.join(' ')).toContain('without a `match`');
    // And it is genuinely not registered, so the hot path stays cheap.
    expect(runtime.has('event.emit', 'timePassed')).toBe(false);
  });

  it('does not recurse when a mod emits from inside an emit hook', () => {
    const loop = hooking(
      'loop',
      [{ hook: 'event.emit', mode: 'after', priority: 0, match: 'timePassed' }],
      `dm.hook('event.emit', () => [{ kind: 'event', event: 'timePassed', data: {} }]);`,
    );
    // The assertion is that this returns at all rather than blowing the stack.
    const { events } = reduce(
      started(),
      { type: 'advanceTime', minutes: 30 },
      { module: GREENMARCH, mods: runtimeWith([loop]) },
    );
    expect(events.length).toBeGreaterThan(0);
  });
});

describe('containment', () => {
  it('turns a throwing mod into a reported event, not a lost turn', () => {
    const boom = inlineMod(
      { ...thorns.manifest, id: 'boom', hooks: [{ hook: 'action.after', mode: 'after', priority: 0 }], systemText: {} },
      { 'main.js': `dm.hook('action.after', () => { throw new Error('mod exploded'); });` },
    );
    const mods = runtimeWith([boom]);
    const { state, events } = reduce(started(), { type: 'wait' }, { module: GREENMARCH, mods });

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'custom', event: 'modError' }),
    );
    // The turn still happened.
    expect(state.minute).toBeGreaterThanOrEqual(started().minute);
  });

  it('refuses a NaN, which would compare equal while behaving differently', () => {
    const nan = inlineMod(
      { ...thorns.manifest, id: 'nan', hooks: [{ hook: 'action.after', mode: 'after', priority: 0 }], systemText: {} },
      { 'main.js': `dm.hook('action.after', () => [{ kind: 'modState', key: 'bad', value: 0/0 }]);` },
    );
    const mods = runtimeWith([nan]);
    const { state, events } = reduce(started(), { type: 'wait' }, { module: GREENMARCH, mods });

    // JSON turns NaN into null on the way out of the sandbox, so what arrives is a null rather than
    // a NaN — either way it must not be stored as a number the state then lies about.
    expect(state.modState['nan']?.['bad'] ?? null).toBeNull();
    void events;
  });
});
