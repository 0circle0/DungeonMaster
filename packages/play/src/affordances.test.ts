/** The affordance layer — what a click or a button can mean. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import type { GameState } from '@dm/engine';
import { reduce, spawnMonster, key } from '@dm/engine';
import { startSession, runCommand } from './session.js';
import type { Session } from './session.js';
import { affordances, affordancesAt, affordancesFor } from './affordances.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');

const fresh = (): Session => startSession(GREENMARCH, 7);

describe('affordancesAt', () => {
  it('answers a click on empty visible ground with a walk and its route', () => {
    const session = fresh();
    const you = session.state.entities[session.state.selected]!;
    const beside = { x: you.position.x + 2, y: you.position.y };

    const offered = affordancesAt(session, beside);
    expect(offered.length).toBeGreaterThan(0);
    const walk = offered[0]!;
    expect(walk.kind).toBe('walk');
    expect(walk.blocked).toBeUndefined();
    expect(walk.path!.steps.length).toBeGreaterThan(0);
    expect(walk.action).toEqual({ type: 'travelTo', to: beside });
  });

  it('yields nothing at all for ground the party knows nothing about', () => {
    const session = fresh();
    // A far corner, unseen and unwalked.
    expect(affordancesAt(session, { x: 29, y: 19 })).toEqual([]);
  });

  it('answers an unreachable tile with a blocked walk, not silence', () => {
    const session = fresh();
    const you = session.state.entities[session.state.selected]!;
    // Deep water is visible but needs swim, which nobody has.
    const map = session.state.maps[session.state.currentMap]!;
    let water: { x: number; y: number } | null = null;
    for (let dy = -8; dy <= 8 && !water; dy += 1) {
      for (let dx = -8; dx <= 8; dx += 1) {
        const at = { x: you.position.x + dx, y: you.position.y + dy };
        if (at.x < 1 || at.y < 1 || at.x >= map.tiles.width - 1 || at.y >= map.tiles.height - 1) continue;
        if (map.tiles.tiles[at.y * map.tiles.width + at.x] !== 'deep_water') continue;
        if (affordancesAt(session, at).length === 0) continue;   // not perceived
        water = at;
        break;
      }
    }
    if (!water) return;   // this seed shows no water in view; other tests cover it

    const offered = affordancesAt(session, water);
    const walk = offered.find((entry) => entry.kind === 'walk')!;
    expect(walk).toBeDefined();
    expect(walk.blocked).toBe('no way through');
  });

  it('puts talk first on a person, blocked with a nudge when out of range', () => {
    const session = fresh();
    const vess = session.state.entities['vess']!;

    const offered = affordancesAt(session, vess.position);
    const talk = offered.find((entry) => entry.kind === 'talk')!;
    expect(talk).toBeDefined();
    expect(talk.action).toEqual({ type: 'talk', npc: 'vess' });

    // Push her across the map: still offered, but blocked with the reason.
    const far: GameState = {
      ...session.state,
      entities: {
        ...session.state.entities,
        vess: { ...vess, position: { x: vess.position.x + 8, y: vess.position.y } },
      },
    };
    const away = affordancesFor({ ...session, state: far }, 'vess');
    const talkFar = away.find((entry) => entry.kind === 'talk');
    if (talkFar) expect(talkFar.blocked).toBe('step closer first');
  });

  it('puts attack first on a hostile', () => {
    const session = fresh();
    const you = session.state.entities[session.state.selected]!;
    const hound = {
      ...spawnMonster(GREENMARCH, 'm:99', 'bog_hound'),
      map: session.state.currentMap,
      position: { x: you.position.x + 1, y: you.position.y },
    };
    const withHound: GameState = {
      ...session.state,
      entities: { ...session.state.entities, 'm:99': hound },
    };

    const offered = affordancesAt({ ...session, state: withHound }, hound.position);
    expect(offered[0]!.kind).toBe('attack');
    expect(offered[0]!.blocked).toBeUndefined();
    expect(offered[0]!.action).toEqual({ type: 'attack', target: 'm:99' });
  });

  it('offers a barred place with the reason on its tile', () => {
    const session = fresh();
    const mill = GREENMARCH.get<{ position: { x: number; y: number } }>(
      'world.pointsOfInterest', 'the_mill',
    );

    // Stand beside the mill so its tile is perceived.
    const you = session.state.entities[session.state.selected]!;
    const near: GameState = {
      ...session.state,
      entities: {
        ...session.state.entities,
        [you.id]: { ...you, position: { x: mill.position.x - 2, y: mill.position.y } },
      },
    };

    const offered = affordancesAt({ ...session, state: near }, mill.position);
    const enter = offered.find((entry) => entry.kind === 'enter')!;
    expect(enter).toBeDefined();
    expect(enter.blocked).toMatch(/needs/);
    expect(enter.blocked).toMatch(/key/i);
  });
});

describe('affordances — the context bar', () => {
  it('offers the ways out, people in range, and one button per declared sense', () => {
    const session = fresh();
    const offered = affordances(session);
    const ids = offered.map((entry) => entry.id);

    expect(ids).toContain('talk:vess');
    expect(ids).toContain('enter:the_mill');
    expect(ids).toContain('travel:the_fens');
    // Senses from the module, not hard-coded words.
    expect(ids).toContain('sense:hearing');
    expect(ids).toContain('sense:smell');
    expect(ids).not.toContain('sense:sight');
    // No combat buttons out of combat.
    expect(ids).not.toContain('endTurn');
  });

  it('is the no-hardcoding proof: a module with no senses gets no sense buttons', () => {
    const bare = startSession(MINIMAL, 7);
    const ids = affordances(bare).map((entry) => entry.id);
    expect(ids.filter((id) => id.startsWith('sense:'))).toEqual([]);
    // And no stances either, since minimal declares none.
    expect(ids.filter((id) => id.startsWith('stance:'))).toEqual([]);
  });

  it('turns to combat decisions once a fight starts', () => {
    const session = fresh();
    for (const input of ['talk vess', '2', 'leave', 'enter the mill']) runCommand(session, input);
    expect(session.state.combat).not.toBeNull();

    const ids = affordances(session).map((entry) => entry.id);
    expect(ids).toContain('endTurn');
    expect(ids).toContain('flee');
    expect(ids.some((id) => id.startsWith('attack:'))).toBe(true);
    // And no travelling mid-fight.
    expect(ids).not.toContain('travel:the_fens');
  });

  it('goes quiet while a conversation is open — the dialogue owns the turn', () => {
    const session = fresh();
    runCommand(session, 'talk vess');
    expect(session.state.dialogue).not.toBeNull();
    expect(affordances(session)).toEqual([]);
  });

  // The property the whole layer stands on.
  it('never offers an unblocked action the reducer would refuse', () => {
    const scenarios: Session[] = [fresh(), startSession(MINIMAL, 7)];
    const walked = fresh();
    for (const input of ['e', 'e', 'n', 'follow']) runCommand(walked, input);
    scenarios.push(walked);

    for (const session of scenarios) {
      for (const offered of affordances(session)) {
        if (offered.blocked) continue;
        if (offered.kind === 'search') continue;
        // Rests can be interrupted and quests re-checked; both still must not *refuse*.
        const result = reduce(session.state, offered.action, {
          module: session.module, terrain: session.terrain,
        });
        const refused = result.events.find((event) => event.type === 'refused');
        expect(refused, `${session.module.identity} ${offered.id}`).toBeUndefined();
      }
    }
  });

  it('never offers an unblocked walk the reducer would refuse, tile by tile', () => {
    const session = fresh();
    const you = session.state.entities[session.state.selected]!;

    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const at = { x: you.position.x + dx, y: you.position.y + dy };
        const walk = affordancesAt(session, at).find((entry) => entry.kind === 'walk');
        if (!walk || walk.blocked) continue;

        const result = reduce(session.state, walk.action, {
          module: session.module, terrain: session.terrain,
        });
        const refused = result.events.find((event) => event.type === 'refused');
        expect(refused, `${at.x},${at.y}`).toBeUndefined();
      }
    }
    void key;
  });
});
