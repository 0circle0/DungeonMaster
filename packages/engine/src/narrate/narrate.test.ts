/** The narrator — the layer that turns events into sentences. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from '../newgame.js';
import { narrate, formatRoll } from './narrate.js';
import { narrateFrom, interpolate, list, count } from './grammar.js';
import { grammarOf } from './systemText.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');

/** A party built the way a new game builds one. */
const start = () => newGame(GREENMARCH, { seed: 7, party: [defaultChoices(GREENMARCH, 'Ash')] });

describe('narrator', () => {
  it('renders a roll with its arithmetic', () => {
    expect(formatRoll(GREENMARCH, {
      notation: '1d20', dice: [14], natural: 14, modifier: 3, total: 17,
      against: 12, outcome: 'success', swing: null,
    })).toBe('17 (14+3) vs 12');
  });

  it('marks advantage in the line', () => {
    expect(formatRoll(GREENMARCH, {
      notation: '2d20kh1', dice: [8, 17], natural: 17, modifier: 0, total: 17,
      against: 12, outcome: 'success', swing: 'advantage',
    })).toContain('[advantage]');
  });

  it('narrates combat with the numbers visible', () => {
    const state = start();
    const lines = narrate({ module: GREENMARCH, state, seed: 1 }, [
      {
        type: 'attacked', attacker: state.selected, target: state.selected, ability: 'strike',
        roll: { notation: '1d20', dice: [16], natural: 16, modifier: 2, total: 18, against: 11, outcome: 'success', swing: null },
      },
    ]);
    expect(lines[0]!.text).toContain('18 (16+2) vs 11');
    expect(lines[0]!.kind).toBe('combat');
  });

  it('stays silent about bookkeeping', () => {
    const state = start();
    const lines = narrate({ module: GREENMARCH, state, seed: 1 }, [
      { type: 'timePassed', minutes: 10, totalMinute: 500 },
      { type: 'resourceChanged', entity: state.selected, resource: 'hp', from: 8, to: 7 },
    ]);
    expect(lines).toHaveLength(0);
  });

  it('explains why a gate refused', () => {
    const state = start();
    const lines = narrate({ module: GREENMARCH, state, seed: 1 }, [
      { type: 'gateBlocked', gate: 'mill_door', missing: [{ text: 'the brass key' }] },
    ]);
    expect(lines[0]!.text).toContain('brass key');
  });

  // A place must read the same way every time it is described.
  it('gives the same phrasing for the same scene within a run', () => {
    const a = narrateFrom(GREENMARCH, 'millford_desc', 42, { sceneKey: 'millford' });
    const b = narrateFrom(GREENMARCH, 'millford_desc', 42, { sceneKey: 'millford' });
    expect(a).toBe(b);
    expect(a).not.toBe('');
  });

  it('phrases it differently in another run', () => {
    const variants = new Set(
      Array.from({ length: 30 }, (_, seed) => narrateFrom(GREENMARCH, 'millford_desc', seed, { sceneKey: 'millford' })),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('returns nothing for a pool that does not exist', () => {
    expect(narrateFrom(GREENMARCH, 'no_such_pool', 1)).toBe('');
  });

  it('interpolates placeholders and leaves unknown ones visible', () => {
    expect(interpolate('You see {what}.', { what: 'a hound' })).toBe('You see a hound.');
    expect(interpolate('You see {what}.', {})).toBe('You see {what}.');
  });

  // The words come from the module; only where they go is the engine's.
  it('makes readable lists and counts', () => {
    const grammar = grammarOf(GREENMARCH);
    expect(list(grammar, ['a', 'b', 'c'])).toBe('a, b and c');
    expect(list(grammar, ['a', 'b'], grammar.or)).toBe('a or b');
    expect(count(grammar, 1, 'hound', 'hounds')).toBe('one hound');
    expect(count(grammar, 3, 'hound', 'hounds')).toBe('three hounds');
    expect(count(grammar, 20, 'hound', 'hounds')).toBe('20 hounds');
  });
});
