/** The save envelope: lineage and the mod set. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadModuleFrom } from '@dm/module/load';
import type { CompiledModule } from '@dm/module';

import { newGame, defaultChoices } from './newgame.js';
import { save, load, statesEqual } from './save.js';
import type { SaveFile } from './save.js';
import { SAVE_VERSION } from './state.js';
import type { GameState } from './state.js';

const GREENMARCH: CompiledModule = loadModuleFrom(
  fileURLToPath(new URL('../../../modules/greenmarch', import.meta.url)),
);

const started = (): GameState =>
  newGame(GREENMARCH, { seed: 1, party: [defaultChoices(GREENMARCH, 'Ash')] });

const parse = (text: string): SaveFile => JSON.parse(text) as SaveFile;

/** The same state, as if the module had been edited under it. */
const under = (state: GameState, hash: string, version = '0.1.0'): GameState => ({
  ...state,
  module: { ...state.module, hash, version },
});

describe('lineage', () => {
  it('starts with the build the save was first written under', () => {
    const file = parse(save(started(), 1_000));
    expect(file.lineage).toEqual([
      { hash: GREENMARCH.hash, version: '0.1.0', at: 1_000 },
    ]);
  });

  it('does not grow when the module has not changed', () => {
    const first = parse(save(started(), 1_000));
    const second = parse(save(started(), 2_000, { previous: first }));
    expect(second.lineage).toHaveLength(1);
    expect(second.lineage?.[0]?.at).toBe(1_000);
  });

  it('appends when the module hash changes, keeping the earlier one', () => {
    const first = parse(save(started(), 1_000));
    const edited = under(started(), 'ffffffffffffffff', '0.2.0');
    const second = parse(save(edited, 2_000, { previous: first }));

    expect(second.lineage).toEqual([
      { hash: GREENMARCH.hash, version: '0.1.0', at: 1_000 },
      { hash: 'ffffffffffffffff', version: '0.2.0', at: 2_000 },
    ]);
  });

  it('keeps every build across three saves, oldest first', () => {
    const a = parse(save(started(), 1_000));
    const b = parse(save(under(started(), 'a'.repeat(16), '0.2.0'), 2_000, { previous: a }));
    const c = parse(save(under(started(), 'b'.repeat(16), '0.3.0'), 3_000, { previous: b }));

    expect(c.lineage?.map((entry) => entry.version)).toEqual(['0.1.0', '0.2.0', '0.3.0']);
  });

  it('carries forward through a load, so the chain is not restarted', () => {
    const first = parse(save(started(), 1_000));
    const loaded = load(JSON.stringify(first), GREENMARCH);
    if (!loaded.ok) throw new Error(loaded.error);

    // `load` hands the envelope back precisely so `save` can be given it.
    const again = parse(save(under(loaded.state, 'c'.repeat(16)), 2_000, { previous: loaded.file }));
    expect(again.lineage).toHaveLength(2);
  });
});

describe('the mod set', () => {
  it('is recorded, sorted, so one set has one spelling', () => {
    const file = parse(save(started(), 1_000, { mods: ['b-' + '1'.repeat(16), 'a-' + '0'.repeat(16)] }));
    expect(file.mods).toEqual(['a-' + '0'.repeat(16), 'b-' + '1'.repeat(16)]);
  });

  it('warns when a save was played with a mod that is not active now', () => {
    const text = save(started(), 1_000, { mods: ['thorns-' + '0'.repeat(16)] });
    const result = load(text, GREENMARCH, { mods: [] });
    if (!result.ok) throw new Error(result.error);

    expect(result.warnings.join(' ')).toContain('thorns-' + '0'.repeat(16));
    expect(result.warnings.join(' ')).toContain('not active now');
  });

  it('warns when a mod is active now but was not when the save was made', () => {
    const text = save(started(), 1_000, { mods: [] });
    const result = load(text, GREENMARCH, { mods: ['thorns-' + '0'.repeat(16)] });
    if (!result.ok) throw new Error(result.error);
    expect(result.warnings.join(' ')).toContain('is active now but was not when this save was made');
  });

  it('says nothing when the mod set is unchanged', () => {
    const mods = ['thorns-' + '0'.repeat(16)];
    const result = load(save(started(), 1_000, { mods }), GREENMARCH, { mods });
    if (!result.ok) throw new Error(result.error);
    expect(result.warnings).toEqual([]);
  });
});

describe('migration to version 8', () => {
  it('gives an older save an empty mod bag and equals a fresh one', () => {
    const fresh = started();

    const { modState: _dropped, ...older } = fresh;
    const legacy = JSON.stringify({
      saveVersion: 7,
      savedAt: 1_000,
      state: { ...older, saveVersion: 7 },
    });

    const result = load(legacy, GREENMARCH);
    if (!result.ok) throw new Error(result.error);

    expect(result.state.modState).toEqual({});
    expect(result.state.saveVersion).toBe(SAVE_VERSION);
    expect(statesEqual(result.state, fresh)).toBe(true);
    expect(result.warnings.join(' ')).toContain('migrated save from version 7');
  });

  it('loads a pre-lineage envelope without inventing one', () => {
    const legacy = JSON.stringify({ saveVersion: SAVE_VERSION, savedAt: 1, state: started() });
    const result = load(legacy, GREENMARCH);
    if (!result.ok) throw new Error(result.error);
    expect(result.file.lineage).toBeUndefined();
  });
});
