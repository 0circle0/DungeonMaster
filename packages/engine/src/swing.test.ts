/**
 * Which way the dice lean.
 *
 * `check` has always known how to roll `2d20kh1`, the roll event has always
 * carried a `swing`, and system text has always had a fragment to narrate one.
 * Nothing ever passed one. This is the first half of closing that: the rule
 * for reconciling several swings into one, owned by `check` so that no caller
 * can forget to apply it.
 *
 * Nothing declares a swing yet, so the second half of the point is that none
 * of this changes a single roll.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { reduceAll } from './reduce.js';
import { statesEqual } from './save.js';
import { check, resolveSwing } from './rules/check.js';
import type { Swing } from './rules/check.js';
import type { Action } from './actions.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');

/** Greenmarch with a different opinion about what several swings mean. */
function stacking(mode: 'cancel' | 'net'): CompiledModule {
  const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
    rules: { resolution: Record<string, unknown> };
  };
  doc.rules.resolution['swingStacking'] = mode;
  const compiled = compileModule(doc);
  if (!compiled.ok) throw new Error('fixture failed to compile');
  return compiled.module;
}

const CANCEL = stacking('cancel');
const NET = stacking('net');

describe('resolveSwing', () => {
  it('passes a bare swing straight through', () => {
    expect(resolveSwing(CANCEL, 'advantage')).toBe('advantage');
    expect(resolveSwing(CANCEL, 'disadvantage')).toBe('disadvantage');
    expect(resolveSwing(CANCEL, null)).toBeNull();
    expect(resolveSwing(CANCEL, undefined)).toBeNull();
  });

  it('reads an empty or all null list as no swing at all', () => {
    expect(resolveSwing(CANCEL, [])).toBeNull();
    expect(resolveSwing(CANCEL, [null, null])).toBeNull();
  });

  it('does not stack a swing past one, whichever policy is in force', () => {
    const three: Swing[] = ['advantage', 'advantage', 'advantage'];
    expect(resolveSwing(CANCEL, three)).toBe('advantage');
    expect(resolveSwing(NET, three)).toBe('advantage');
  });

  // The difference between the two policies is entirely here.
  it('cancels one against one', () => {
    expect(resolveSwing(CANCEL, ['advantage', 'disadvantage'])).toBeNull();
    expect(resolveSwing(NET, ['advantage', 'disadvantage'])).toBeNull();
  });

  it('cancels many against one, or counts them, as the module says', () => {
    const lopsided: Swing[] = ['advantage', 'advantage', 'disadvantage'];
    // `cancel`: one disadvantage is enough to leave nothing.
    expect(resolveSwing(CANCEL, lopsided)).toBeNull();
    // `net`: two against one still swings up.
    expect(resolveSwing(NET, lopsided)).toBe('advantage');
    expect(resolveSwing(NET, ['disadvantage', 'disadvantage', 'advantage'])).toBe('disadvantage');
  });

  it('ignores the nulls mixed in among real swings', () => {
    expect(resolveSwing(CANCEL, [null, 'disadvantage', null])).toBe('disadvantage');
    expect(resolveSwing(NET, [null, 'advantage', null])).toBe('advantage');
  });

  it('defaults to cancelling', () => {
    expect(GREENMARCH.source.rules.resolution.swingStacking).toBe('cancel');
  });
});

describe('a resolved swing reaches the dice', () => {
  const rolled = (swing: Swing | readonly Swing[]): string =>
    check(CANCEL, Rng.fromSeed(3), { difficulty: 10, swing }).notation;

  it('picks the notation the module declared', () => {
    expect(rolled('advantage')).toBe('2d20kh1');
    expect(rolled('disadvantage')).toBe('2d20kl1');
    expect(rolled(null)).toBe('1d20');
  });

  // The cancellation has to happen before the notation is chosen, or a
  // cancelled pair would still consume two dice and shift every later roll.
  it('rolls one die when a pair cancels', () => {
    expect(rolled(['advantage', 'disadvantage'])).toBe('1d20');
  });

  it('reports what it settled on, not what it was handed', () => {
    const record = check(CANCEL, Rng.fromSeed(3), {
      difficulty: 10,
      swing: ['advantage', 'disadvantage'],
    });
    expect(record.swing).toBeNull();
  });
});

/**
 * The whole safety argument for this slice.
 *
 * `2d20kh1` draws twice where `1d20` draws once, and a reduce threads one
 * generator, so a swing shifts every later roll in the same action. That is
 * fine as long as nothing declares one yet -- and nothing does.
 */
describe('nothing declared, nothing changed', () => {
  it('replays a run of actions identically', () => {
    const script: Action[] = [
      { type: 'step', direction: 'north' },
      { type: 'look' },
      { type: 'step', direction: 'east' },
      { type: 'search' },
      { type: 'step', direction: 'south' },
    ];
    const start = newGame(GREENMARCH, { seed: 11, party: [defaultChoices(GREENMARCH, 'Ash')] });
    const once = reduceAll(start, script, { module: GREENMARCH });
    const twice = reduceAll(start, script, { module: GREENMARCH });
    expect(statesEqual(once.state, twice.state)).toBe(true);
  });
});
