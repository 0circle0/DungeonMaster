/**
 * Lore: what the party found out, as opposed to what it was told to do.
 *
 * The properties worth pinning are the ones a front end or a module would
 * otherwise get quietly wrong — that learning twice is silent, that an unknown
 * entry hands out no text, and that `threads` is a closed namespace while
 * `lore` is an open one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Rng } from '@dm/core';
import { fileURLToPath } from 'node:url';
import { compileModule, compileRequirement, evalPredicate } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { newGame, defaultChoices } from './newgame.js';
import { reduceAll } from './reduce.js';
import { statesEqual, save, load } from './save.js';
import { Transaction, applyOps } from './rules/apply.js';
import { loreByThread, looseLore, threadScope } from './sim/lore.js';
import { buildScope, OPEN_NAMESPACES } from './stats.js';
import { narrate } from './narrate/narrate.js';
import type { GameState } from './state.js';
import type { Action } from './actions.js';

/** `evalPredicate` insists on a generator even for predicates that cannot roll. */
const holds = (predicate: Parameters<typeof evalPredicate>[0], scope: ReturnType<typeof buildScope>) =>
  evalPredicate(predicate, { scope, rng: Rng.fromSeed(1), openNamespaces: OPEN_NAMESPACES });

const MINIMAL_PATH = fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url));

/**
 * `minimal` plus a thread, built here rather than shipped in a fixture module.
 *
 * The point of testing against `minimal` is that it declares none of the usual
 * fantasy vocabulary, so nothing here can be passing because greenmarch happens
 * to have a skill or a faction with the right name.
 */
function moduleWithLore(): CompiledModule {
  const doc = JSON.parse(readFileSync(MINIMAL_PATH, 'utf8')) as Record<string, unknown>;
  const narrative = (doc['narrative'] ?? {}) as Record<string, unknown>;

  doc['narrative'] = {
    ...narrative,
    lore: [
      { id: 'tide_turns_late', name: 'The tide only falls that far at the turn of the year.', source: 'a netmender' },
      { id: 'iron_will_not_bite', name: 'Cold iron will not bite it.', source: 'cut into a lintel' },
      { id: 'it_answers_to_a_name', name: 'It answers to an older name than the one on the stone.' },
      { id: 'a_loose_fact', name: 'The well at the crossroads was dug twice.' },
    ],
    loreThreads: [
      {
        id: 'the_drowned_king',
        name: 'The Drowned King',
        description: 'Three people have told you a piece of this and none of them agree it is a story.',
        entries: ['tide_turns_late', 'iron_will_not_bite', 'it_answers_to_a_name'],
      },
    ],
  };

  const result = compileModule(doc);
  if (!result.ok) {
    throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  }
  return result.module;
}

const MODULE = moduleWithLore();

function fresh(): GameState {
  return newGame(MODULE, { seed: 5, party: [defaultChoices(MODULE, 'Ash')] });
}

function learn(state: GameState, ...entries: string[]): GameState {
  const txn = new Transaction(state, MODULE);
  applyOps(txn, entries.map((entry) => ({ op: 'learnLore' as const, entry })), state.party[0]);
  return txn.finish().state;
}

describe('learning lore', () => {
  it('records the world minute it was learned', () => {
    const state = learn({ ...fresh(), minute: 4200 }, 'tide_turns_late');
    expect(state.lore['tide_turns_late']).toBe(4200);
  });

  it('is silent the second time, and keeps the first minute', () => {
    // Content teaches the same clue from several places on purpose, so a party
    // that hears it twice must not see it announced twice.
    const first = learn({ ...fresh(), minute: 100 }, 'tide_turns_late');
    const txn = new Transaction({ ...first, minute: 900 }, MODULE);
    applyOps(txn, [{ op: 'learnLore', entry: 'tide_turns_late' }], first.party[0]);
    const again = txn.finish();

    expect(again.state.lore['tide_turns_late']).toBe(100);
    expect(again.events.some((event) => event.type === 'loreLearned')).toBe(false);
  });

  it('ignores an entry the module does not declare', () => {
    // A typo in a `learnLore` must not put an unlistable id into the journal,
    // where it would render as a clue nobody wrote.
    const state = learn(fresh(), 'no_such_clue');
    expect(state.lore['no_such_clue']).toBeUndefined();
  });

  it('a minute-zero entry still reads as known', () => {
    // The trap `exists` avoids and `test` would fall into: learning something in
    // the first minute of the game stores a 0.
    const state = learn({ ...fresh(), minute: 0 }, 'tide_turns_late');
    const gate = compileRequirement({
      lore: [{ entry: 'tide_turns_late', known: true }],
    } as never);
    expect(holds(gate, buildScope(MODULE, state, state.entities[state.party[0]!]!))).toBe(true);
  });

  it('narrates as a note, in the module\'s words, with the source', () => {
    const before = fresh();
    const txn = new Transaction(before, MODULE);
    applyOps(txn, [{ op: 'learnLore', entry: 'tide_turns_late' }], before.party[0]);
    const { state, events } = txn.finish();

    const lines = narrate({ module: MODULE, state, seed: 1 }, events);
    const note = lines.find((line) => line.kind === 'note');
    expect(note?.text).toContain('turn of the year');
    expect(note?.text).toContain('a netmender');
  });
});

describe('the journal', () => {
  it('lists every thread, including one nothing is known about', () => {
    const view = loreByThread(MODULE, fresh());
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ id: 'the_drowned_king', known: 0, total: 3 });
  });

  it('counts what is known and withholds the rest', () => {
    const state = learn(fresh(), 'tide_turns_late', 'it_answers_to_a_name');
    const thread = loreByThread(MODULE, state)[0]!;

    expect(thread.known).toBe(2);
    expect(thread.total).toBe(3);

    const unknown = thread.entries.find((entry) => entry.id === 'iron_will_not_bite')!;
    expect(unknown.known).toBe(false);
    // The whole point: a front end cannot render a clue the party has not
    // earned, because it is not given one to render.
    expect(unknown.name).toBe('');
    expect(unknown.source).toBe('');
    expect(unknown.learnedAt).toBeNull();
  });

  it('keeps the thread\'s declared order, not the order they were learned in', () => {
    const state = learn(fresh(), 'it_answers_to_a_name', 'tide_turns_late');
    const thread = loreByThread(MODULE, state)[0]!;
    expect(thread.entries.map((entry) => entry.id)).toEqual([
      'tide_turns_late', 'iron_will_not_bite', 'it_answers_to_a_name',
    ]);
  });

  it('shows loose lore only once it is known', () => {
    expect(looseLore(MODULE, fresh())).toHaveLength(0);

    const state = learn(fresh(), 'a_loose_fact');
    const loose = looseLore(MODULE, state);
    expect(loose.map((entry) => entry.id)).toEqual(['a_loose_fact']);
    // Entries that belong to a thread are the thread's to show, not loose.
    expect(looseLore(MODULE, learn(state, 'tide_turns_late')).map((e) => e.id)).toEqual(['a_loose_fact']);
  });
});

describe('reading lore from content', () => {
  const scopeOf = (state: GameState) =>
    buildScope(MODULE, state, state.entities[state.party[0]!]!);

  it('gates both ways', () => {
    const known = compileRequirement({ lore: [{ entry: 'tide_turns_late', known: true }] } as never);
    const unknown = compileRequirement({ lore: [{ entry: 'tide_turns_late', known: false }] } as never);

    const before = scopeOf(fresh());
    const after = scopeOf(learn(fresh(), 'tide_turns_late'));

    expect(holds(known, before)).toBe(false);
    expect(holds(unknown, before)).toBe(true);
    expect(holds(known, after)).toBe(true);
    expect(holds(unknown, after)).toBe(false);
  });

  it('`without.lore` is the rumour-told-once idiom', () => {
    const gate = compileRequirement({ without: { lore: ['tide_turns_late'] } } as never);
    expect(holds(gate, scopeOf(fresh()))).toBe(true);
    expect(holds(gate, scopeOf(learn(fresh(), 'tide_turns_late')))).toBe(false);
  });

  it('counts a thread\'s progress, which is what a "prove yourself" gate reads', () => {
    const state = learn(fresh(), 'tide_turns_late', 'iron_will_not_bite');
    expect(threadScope(MODULE, state)['the_drowned_king']).toEqual({ known: 2, total: 3 });

    const gate = compileRequirement({
      custom: { gte: [{ ref: 'threads.the_drowned_king.known' }, 2] },
    } as never);
    expect(holds(gate, scopeOf(state))).toBe(true);
  });

  it('`lore` is open and `threads` is closed', () => {
    // An unlearned clue is a "not yet"; an unknown thread is a typo. The second
    // has to be loud, which is the whole reason they differ.
    expect(OPEN_NAMESPACES).toContain('lore');
    const scope = scopeOf(fresh());

    expect(holds({ test: { ref: 'lore.tide_turns_late' } }, scope)).toBe(false);
    expect(() => holds({ gte: [{ ref: 'threads.no_such_thread.known' }, 1] }, scope)).toThrow();
  });
});

describe('lore in a save', () => {
  it('survives a round trip', () => {
    const state = learn({ ...fresh(), minute: 300 }, 'tide_turns_late');
    const result = load(save(state, 0), MODULE);
    if ('error' in result) throw new Error(result.error);
    expect(result.state.lore).toEqual({ tide_turns_late: 300 });
  });

  it('migrates a version 8 save to knowing nothing', () => {
    const state = fresh();
    const { lore: _dropped, ...withoutLore } = state;
    const old = JSON.stringify({
      saveVersion: 8,
      savedAt: 0,
      state: { ...withoutLore, saveVersion: 8 },
    });

    const result = load(old, MODULE, { allowModuleDrift: true });
    if ('error' in result) throw new Error(result.error);
    expect(result.state.lore).toEqual({});
  });

  it('replays identically, so learning cannot desync a run', () => {
    const script: readonly Action[] = [{ type: 'wait' }, { type: 'wait' }];
    const seeded = learn(fresh(), 'tide_turns_late', 'a_loose_fact');
    const a = reduceAll(seeded, script, { module: MODULE });
    const b = reduceAll(seeded, script, { module: MODULE });
    expect(statesEqual(a.state, b.state)).toBe(true);
  });
});
