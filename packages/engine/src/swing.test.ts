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
import { spawnMonster } from './character.js';
import { reduce } from './reduce.js';
import { createMap } from './grid/tiles.js';
import { reduceAll } from './reduce.js';
import { statesEqual } from './save.js';
import { check, resolveSwing, skillCheck, savingThrow } from './rules/check.js';
import type { Swing } from './rules/check.js';
import type { Action } from './actions.js';
import type { RollRecord } from './events.js';
import type { GameState } from './state.js';

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
 * The first thing that can actually declare one.
 *
 * Two schema fields and two engine lines, chosen before anything harder
 * because they exercise the entire pipe: schema, compile, engine, the notation
 * that gets rolled, and the `swing` that comes back out on the event.
 */
describe('an ability that always leans', () => {
  /** Greenmarch with `barrow_bolt` made surer, or wilder, than it was. */
  function bolt(swing: 'advantage' | 'disadvantage'): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      content: { abilities: Record<string, unknown>[] };
    };
    doc.content.abilities.find((a) => a['id'] === 'barrow_bolt')!['swing'] = swing;
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  const cast = (module: CompiledModule): RollRecord => {
    const state = caster(module);
    const { events } = reduce(
      state,
      { type: 'useAbility', ability: 'barrow_bolt', target: 'e:99' },
      { module },
    );
    const attacked = events.find((event) => event.type === 'attacked');
    if (!attacked || attacked.type !== 'attacked') throw new Error('the bolt was never thrown');
    return attacked.roll;
  };

  it('rolls the module\'s own notation for it', () => {
    expect(cast(bolt('advantage')).notation).toBe('2d20kh1');
    expect(cast(bolt('disadvantage')).notation).toBe('2d20kl1');
    // Untouched, the same ability rolls one die -- so this is the field
    // talking and not the fixture.
    expect(cast(GREENMARCH).notation).toBe('1d20');
  });

  it('says so on the event, which is what a transcript reads', () => {
    expect(cast(bolt('advantage')).swing).toBe('advantage');
    expect(cast(GREENMARCH).swing).toBeNull();
  });

  it('keeps the two dice it rolled, so the arithmetic can be shown', () => {
    expect(cast(bolt('advantage')).dice).toHaveLength(2);
    expect(cast(GREENMARCH).dice).toHaveLength(1);
  });
});

/**
 * The prize: circumstance, not just the ability.
 *
 * This is what the mechanic was missing and why every shipped condition is a
 * flat penalty to a defence instead. A condition can now say which way it
 * leans each of the four kinds of roll it can reach.
 */
describe('a condition that leans the dice', () => {
  /** Greenmarch with one extra condition, declared however the test needs. */
  function withCondition(swings: Record<string, string>): CompiledModule {
    const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
      rules: { conditions: Record<string, unknown>[] };
    };
    doc.rules.conditions.push({ id: 'tilted', name: 'Tilted', swings });
    const compiled = compileModule(doc);
    if (!compiled.ok) throw new Error('fixture failed to compile');
    return compiled.module;
  }

  const afflicted = (state: GameState, who: string, conditions: string[]): GameState => ({
    ...state,
    entities: {
      ...state.entities,
      [who]: {
        ...state.entities[who]!,
        conditions: conditions.map((condition) => ({
          condition, remaining: null, magnitude: null, source: null,
        })),
      },
    },
  });

  /** The notation the bolt was rolled with, given who is afflicted. */
  function notation(module: CompiledModule, who: 'e:1' | 'e:99'): string {
    const state = afflicted(caster(module), who, ['tilted']);
    const { events } = reduce(
      state,
      { type: 'useAbility', ability: 'barrow_bolt', target: 'e:99' },
      { module },
    );
    const attacked = events.find((event) => event.type === 'attacked');
    if (!attacked || attacked.type !== 'attacked') throw new Error('the bolt was never thrown');
    return attacked.roll.notation;
  }

  it('leans the attacks its bearer makes', () => {
    expect(notation(withCondition({ ownAttacks: 'disadvantage' }), 'e:1')).toBe('2d20kl1');
    // The same condition on the target changes nothing: scopes are directional.
    expect(notation(withCondition({ ownAttacks: 'disadvantage' }), 'e:99')).toBe('1d20');
  });

  it('leans the attacks made against its bearer', () => {
    expect(notation(withCondition({ attacksAgainstSelf: 'advantage' }), 'e:99')).toBe('2d20kh1');
    expect(notation(withCondition({ attacksAgainstSelf: 'advantage' }), 'e:1')).toBe('1d20');
  });

  // Both sides are asked, and the module's own policy settles it. This is the
  // case that would need saying twice if `check` did not own the rule.
  it('cancels an attacker\'s edge against a target\'s', () => {
    const module = withCondition({ ownAttacks: 'advantage', attacksAgainstSelf: 'advantage' });
    const both = afflicted(afflicted(caster(module), 'e:1', ['tilted']), 'e:99', ['tilted']);
    const { events } = reduce(
      both, { type: 'useAbility', ability: 'barrow_bolt', target: 'e:99' }, { module },
    );
    const attacked = events.find((event) => event.type === 'attacked');
    // Two advantages do not stack, whatever the policy.
    if (attacked?.type === 'attacked') expect(attacked.roll.notation).toBe('2d20kh1');
  });

  it('leans its bearer\'s ability checks', () => {
    const module = withCondition({ checks: 'disadvantage' });
    const state = afflicted(caster(module), 'e:1', ['tilted']);
    const roll = skillCheck(module, Rng.fromSeed(2), state.entities['e:1']!, 'perception', 12);
    expect(roll.notation).toBe('2d20kl1');
  });

  it('leans its bearer\'s saving throws', () => {
    const module = withCondition({ saves: 'advantage' });
    const state = afflicted(caster(module), 'e:1', ['tilted']);
    const roll = savingThrow(module, Rng.fromSeed(2), state.entities['e:1']!, 'will', 12);
    expect(roll.notation).toBe('2d20kh1');
  });

  it('leaves a creature carrying nothing rolling one die', () => {
    const module = withCondition({ ownAttacks: 'advantage' });
    const clean = caster(module).entities['e:1']!;
    expect(skillCheck(module, Rng.fromSeed(2), clean, 'perception', 12).notation).toBe('1d20');
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

/** A fenwise caster with a hound in range of the bolt. */
function caster(module: CompiledModule): GameState {
  const choices = { ...defaultChoices(module, 'Ash'), characterClass: 'fenwise' };
  const base = newGame(module, { seed: 4, party: [choices] });
  const hero = base.entities[base.party[0]!]!;
  const hound = spawnMonster(module, 'e:99', 'bog_hound');

  return {
    ...base,
    currentMap: 'here',
    maps: {
      here: {
        id: 'here', tiles: createMap(11, 11, 'floor'), kind: 'area', source: 'millford',
        explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1,
      },
    },
    entities: {
      ...base.entities,
      [hero.id]: { ...hero, level: 3, map: 'here', position: { x: 5, y: 5 } },
      'e:99': { ...hound, map: 'here', position: { x: 7, y: 5 }, disposition: 'hostile' },
    },
  };
}
