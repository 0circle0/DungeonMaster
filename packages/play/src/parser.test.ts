/**
 * The verb parser, and the session it drives.
 *
 * Typing is the widest input surface either front end has: the browser command
 * bar and its completions both run on `parse`, so a verb that stops resolving
 * is a feature that silently disappears. Several tests below carry the bug they
 * were written for — verb shadowing and noun scoring are the two places this
 * has gone wrong in practice.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import type { GameState } from '@dm/engine';
import { statesEqual } from '@dm/engine';
import { parse, resolveNoun } from './parser.js';
import { startSession, runCommand } from './session.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');

function session(module = GREENMARCH, seed = 7) {
  return startSession(module, seed);
}

const ctx = (state: GameState) => ({ module: GREENMARCH, state });

describe('parser', () => {
  const base = session();

  it('reads a bare direction as a step', () => {
    const result = parse('n', ctx(base.state));
    expect(result).toMatchObject({ kind: 'action', action: { type: 'step', direction: 'north' } });
  });

  it('accepts long and short direction spellings', () => {
    for (const input of ['north', 'n', 'go north', 'walk north']) {
      const result = parse(input, ctx(base.state));
      expect(result, input).toMatchObject({ action: { type: 'step', direction: 'north' } });
    }
  });

  it('ignores filler words', () => {
    // "to" and "the" are stripped, so this is still a step north.
    expect(parse('go to the north', ctx(base.state)))
      .toMatchObject({ action: { type: 'step', direction: 'north' } });
    expect(parse('accept the mill door', ctx(base.state)))
      .toMatchObject({ action: { type: 'acceptQuest', quest: 'the_mill_door' } });
  });

  it('refuses a target that is not present, and says so', () => {
    const result = parse('attack the bog hound', ctx(base.state));
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('no bog hound here');
  });

  // A bare rejection teaches the player nothing.
  it('says what is missing rather than "I do not understand"', () => {
    const result = parse('attack', ctx(base.state));
    expect(result).toMatchObject({ kind: 'error', message: 'Attack what?' });
  });

  it('names the verb it did not recognise', () => {
    const result = parse('flumox the goblin', ctx(base.state));
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('flumox');
  });

  // `go` lists "walk" and is declared first, so it won the word outright and
  // the stance verb it shadowed could never be reached.
  it('reads a bare "walk" as the pace, not an unfinished move', () => {
    expect(parse('walk', ctx(base.state)))
      .toMatchObject({ action: { type: 'setStance', stance: 'walk' } });
    // And with a direction it is still a step.
    expect(parse('walk north', ctx(base.state)))
      .toMatchObject({ action: { type: 'step', direction: 'north' } });
  });

  // Matching only the first word made every multi-word spelling unreachable.
  it('matches a two-word verb before the one-word verb inside it', () => {
    expect(parse('look for', ctx(base.state))).toMatchObject({ action: { type: 'search' } });
    expect(parse('look', ctx(base.state))).toMatchObject({ action: { type: 'look' } });
  });

  it('sends listen and smell to the senses the module declares', () => {
    expect(parse('listen', ctx(base.state)))
      .toMatchObject({ action: { type: 'sense', sense: 'hearing' } });
    for (const input of ['smell', 'sniff', 'scent']) {
      expect(parse(input, ctx(base.state)), input)
        .toMatchObject({ action: { type: 'sense', sense: 'smell' } });
    }
  });

  it('says what senses exist when asked for one that does not', () => {
    // minimal declares no senses at all.
    const bare = session(MINIMAL);
    const result = parse('listen', { module: MINIMAL, state: bare.state });
    expect(result.kind).toBe('error');
  });

  it('reads look with a target', () => {
    expect(parse('look at the mill', ctx(base.state)))
      .toMatchObject({ action: { type: 'look', at: 'mill' } });
  });

  it('toggles the party walking together', () => {
    expect(parse('follow', ctx(base.state)))
      .toMatchObject({ action: { type: 'setFollow', follow: true } });
    expect(parse('follow off', ctx(base.state)))
      .toMatchObject({ action: { type: 'setFollow', follow: false } });
    expect(parse('scatter', ctx(base.state)))
      .toMatchObject({ action: { type: 'setFollow', follow: false } });
  });

  it('routes shell commands away from the engine', () => {
    for (const [input, kind] of [['map', 'map'], ['help', 'help'], ['i', 'inventory'], ['quit', 'quit']] as const) {
      const result = parse(input, ctx(base.state));
      expect(result).toMatchObject({ kind: 'meta', meta: { kind } });
    }
  });

  it('resolves quests and areas by name', () => {
    expect(parse('accept the mill door', ctx(base.state)))
      .toMatchObject({ action: { type: 'acceptQuest', quest: 'the_mill_door' } });
    expect(parse('travel the fens', ctx(base.state)))
      .toMatchObject({ action: { type: 'travelToArea', area: 'the_fens' } });
  });

  it('splits an ability from its target', () => {
    const state = base.state;
    const withRally: GameState = {
      ...state,
      entities: {
        ...state.entities,
        [state.selected]: { ...state.entities[state.selected]!, abilities: ['strike', 'rally'] },
      },
    };
    expect(parse('cast rally', ctx(withRally))).toMatchObject({ action: { type: 'useAbility', ability: 'rally' } });
  });

  describe('noun resolution', () => {
    const candidates = [
      { value: 'a', name: 'Bog Hound' },
      { value: 'b', name: 'Barrow Wight' },
      { value: 'c', name: 'Vess the Miller' },
    ];

    it('matches on any word of a name', () => {
      expect(resolveNoun('hound', candidates)).toEqual({ ok: true, value: 'a' });
      expect(resolveNoun('vess', candidates)).toEqual({ ok: true, value: 'c' });
    });

    // `enter the mill` walked into Millford Village: "Millford" *starts with*
    // "mill" and scored above "The Old Mill", which only *contained* it —
    // the whole-word rung sat below the substring rung and was unreachable.
    it('prefers a whole word to the start of a longer one', () => {
      const places = [
        { value: 'millford_village', name: 'Millford Village' },
        { value: 'the_mill', name: 'The Old Mill' },
      ];
      expect(resolveNoun('mill', places)).toEqual({ ok: true, value: 'the_mill' });
      expect(resolveNoun('millford', places)).toEqual({ ok: true, value: 'millford_village' });
      expect(resolveNoun('village', places)).toEqual({ ok: true, value: 'millford_village' });
    });

    it('sends "enter the mill" to the mill', () => {
      expect(parse('enter the mill', ctx(base.state)))
        .toMatchObject({ action: { type: 'enter', target: 'the_mill' } });
    });

    it('prefers an exact match', () => {
      expect(resolveNoun('bog hound', candidates)).toEqual({ ok: true, value: 'a' });
    });

    // Silently picking one is how a player loses a turn attacking the wrong thing.
    it('reports ambiguity rather than guessing', () => {
      const result = resolveNoun('b', [
        { value: 'a', name: 'Bog Hound' },
        { value: 'b', name: 'Barrow Wight' },
      ]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toMatch(/Which do you mean/);
    });

    it('says so when nothing matches', () => {
      const result = resolveNoun('dragon', candidates);
      expect(result.ok).toBe(false);
    });
  });
});

describe('a bare attack', () => {
  it('picks the obvious enemy when there is one', () => {
    const play = session();
    const hero = play.state.entities[play.state.party[0]!]!;
    const beast = {
      ...Object.values(play.state.entities).find((e) => e.kind === 'character')!,
      id: 'x:1',
      name: 'Bog Hound',
      kind: 'monster' as const,
      disposition: 'hostile' as const,
      position: { x: hero.position.x + 1, y: hero.position.y },
    };
    const state = { ...play.state, entities: { ...play.state.entities, 'x:1': beast } };

    expect(parse('attack', { module: GREENMARCH, state }))
      .toMatchObject({ kind: 'action', action: { type: 'attack', target: 'x:1' } });
  });

  it('still asks when nothing is hostile', () => {
    expect(parse('attack', ctx(session().state)))
      .toMatchObject({ kind: 'error', message: 'Attack what?' });
  });
});

describe('a session, driven by typed commands', () => {
  it('starts the party somewhere real, with prose', () => {
    const play = session();
    expect(play.state.currentMap).not.toBe('');
    expect(play.transcript.length).toBeGreaterThan(0);
    expect(play.state.entities[play.state.selected]!.map).toBe(play.state.currentMap);
  });

  it('moves the party when a direction parses', () => {
    const play = session();
    const before = play.state.entities[play.state.selected]!.position;
    const result = runCommand(play, 'east');
    const after = play.state.entities[play.state.selected]!.position;

    expect(result.kind).not.toBe('error');
    expect(after.x !== before.x || after.y !== before.y).toBe(true);
  });

  it('reports a bad command without changing anything', () => {
    const play = session();
    const before = JSON.stringify(play.state);
    const result = runCommand(play, 'frobnicate');
    expect(result.kind).toBe('error');
    expect(JSON.stringify(play.state)).toBe(before);
  });

  // The property the whole engine rests on, exercised through the typed path.
  it('replays identically from the same seed', () => {
    const script = ['look', 'east', 'south', 'wait', 'search', 'rest'];
    const a = session(GREENMARCH, 999);
    const b = session(GREENMARCH, 999);
    for (const input of script) {
      runCommand(a, input);
      runCommand(b, input);
    }
    expect(statesEqual(a.state, b.state)).toBe(true);
  });

  it('plays minimal too, with its alien ruleset', () => {
    const play = startSession(MINIMAL, 3);
    expect(play.state.currentMap).toContain('dungeon:');
    for (const input of ['look', 'east', 'wait', 'map']) runCommand(play, input);
    expect(play.state.outcome === 'playing' || play.state.outcome === 'defeat').toBe(true);
  });
});
