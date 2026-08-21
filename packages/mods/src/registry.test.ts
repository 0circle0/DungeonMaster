/** Resolution and ordering. */

import { describe, it, expect } from 'vitest';

import { resolveMods, activeModIdentities } from './registry.js';
import type { ModDeclaration } from './registry.js';
import type { LoadedMod } from './sandbox/host.js';
import type { ModManifest } from './schema/manifest.js';

function modOf(id: string, overrides: Partial<ModManifest> = {}, hash = 'a'.repeat(16)): LoadedMod {
  const manifest: ModManifest = {
    format: 1,
    id,
    target: 'engine',
    version: '1.0.0',
    hash,
    meta: { title: id, author: '', description: '', license: '', homepage: '' },
    engine: '^1.0.0',
    dependencies: [],
    loadAfter: [],
    entry: 'main.js',
    hooks: [{ hook: 'action.before', mode: 'after', priority: 0 }],
    limits: { steps: 2_000_000, memoryBytes: 32 << 20 },
    systemText: {},
    ...overrides,
  };
  return { manifest, files: { 'main.js': '' }, hash };
}

function declare(id: string, overrides: Partial<ModDeclaration> = {}): ModDeclaration {
  return { id, hash: 'a'.repeat(16), target: 'engine', required: false, note: '', ...overrides };
}

const on = () => true;

describe('required mods', () => {
  it('blocks play when a required mod is missing, and says whose words to trust', () => {
    const result = resolveMods(
      [declare('thorns', { required: true, note: 'The barrow needs it.' })],
      [],
      on,
      'engine',
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([{ id: 'thorns', hash: 'a'.repeat(16), note: 'The barrow needs it.' }]);
    expect(result.issues[0]?.message).toContain('The barrow needs it.');
  });

  it('does not block for a missing optional mod', () => {
    const result = resolveMods([declare('thorns')], [], on, 'engine');
    expect(result.ok).toBe(true);
    expect(result.active).toEqual([]);
  });

  it('forces a required mod on even when the player switched it off', () => {
    const result = resolveMods([declare('thorns', { required: true })], [modOf('thorns')], () => false, 'engine');
    expect(result.active.map((m) => m.manifest.id)).toEqual(['thorns']);
    expect(result.disabled).toEqual([]);
  });

  it('honours the toggle for an optional mod', () => {
    const result = resolveMods([declare('thorns')], [modOf('thorns')], () => false, 'engine');
    expect(result.active).toEqual([]);
    expect(result.disabled).toEqual(['thorns']);
  });
});

describe('hash drift', () => {
  it('warns and loads anyway, because the hash is author-editable', () => {
    const installed = modOf('thorns', {}, 'b'.repeat(16));
    const result = resolveMods([declare('thorns', { required: true })], [installed], on, 'engine');

    expect(result.ok).toBe(true);
    expect(result.active.map((m) => m.manifest.id)).toEqual(['thorns']);
    expect(result.drifted).toEqual([
      { id: 'thorns', want: 'a'.repeat(16), found: 'b'.repeat(16), note: '' },
    ]);
    expect(result.issues.find((i) => i.code === 'mod_hash_drift')?.severity).toBe('warning');
  });

  it('prefers the exact pinned build when several versions are installed', () => {
    const older = modOf('thorns', {}, 'a'.repeat(16));
    const newer = modOf('thorns', {}, 'b'.repeat(16));
    const result = resolveMods([declare('thorns')], [newer, older], on, 'engine');
    expect(result.active[0]?.hash).toBe('a'.repeat(16));
    expect(result.drifted).toEqual([]);
  });
});

describe('ordering is the same on every machine', () => {
  it('follows the order the game declares, not the order mods were found', () => {
    const declared = [declare('c'), declare('a'), declare('b')];
    const installed = [modOf('a'), modOf('b'), modOf('c')];

    const forwards = resolveMods(declared, installed, on, 'engine');
    const backwards = resolveMods(declared, [...installed].reverse(), on, 'engine');

    expect(forwards.active.map((m) => m.manifest.id)).toEqual(['c', 'a', 'b']);
    expect(backwards.active.map((m) => m.manifest.id)).toEqual(['c', 'a', 'b']);
  });

  it('is stable across shuffles of the installed list', () => {
    const declared = ['a', 'b', 'c', 'd', 'e'].map((id) => declare(id));
    const installed = ['a', 'b', 'c', 'd', 'e'].map((id) => modOf(id));
    const expected = resolveMods(declared, installed, on, 'engine').active.map((m) => m.manifest.id);

    for (let seed = 0; seed < 10; seed++) {
      const shuffled = [...installed.slice(seed % 5), ...installed.slice(0, seed % 5)];
      const actual = resolveMods(declared, shuffled, on, 'engine').active.map((m) => m.manifest.id);
      expect(actual).toEqual(expected);
    }
  });

  it('respects loadAfter without disturbing anything it does not have to', () => {
    const declared = [declare('a'), declare('b'), declare('c')];
    const installed = [modOf('a', { loadAfter: ['c'] }), modOf('b'), modOf('c')];
    const result = resolveMods(declared, installed, on, 'engine');

    const order = result.active.map((m) => m.manifest.id);
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
    expect(order).toEqual(['b', 'c', 'a']);
  });

  it('ignores a loadAfter naming a mod that is not active', () => {
    const result = resolveMods([declare('a')], [modOf('a', { loadAfter: ['nowhere'] })], on, 'engine');
    expect(result.ok).toBe(true);
    expect(result.active.map((m) => m.manifest.id)).toEqual(['a']);
  });

  it('reports a loadAfter cycle by name rather than looping', () => {
    const declared = [declare('a'), declare('b')];
    const installed = [modOf('a', { loadAfter: ['b'] }), modOf('b', { loadAfter: ['a'] })];
    const result = resolveMods(declared, installed, on, 'engine');

    expect(result.ok).toBe(false);
    const cycle = result.issues.find((i) => i.code === 'mod_load_cycle');
    expect(cycle?.message).toContain('a');
    expect(cycle?.message).toContain('b');
  });
});

describe('two mods replacing the same hook', () => {
  const replacing = (id: string, priority: number) =>
    modOf(id, { hooks: [{ hook: 'action.before', mode: 'replace', priority, match: 'rest' }] });

  it('gives it to the higher priority, and reports the loser', () => {
    const result = resolveMods(
      [declare('a'), declare('b')],
      [replacing('a', 0), replacing('b', 10)],
      on,
      'engine',
    );
    expect(result.ok).toBe(true);
    expect(result.shadowed).toEqual([{ id: 'a', hook: 'action.before', by: 'b' }]);
  });

  it('breaks a priority tie on declaration order', () => {
    const result = resolveMods(
      [declare('a'), declare('b')],
      [replacing('a', 0), replacing('b', 0)],
      on,
      'engine',
    );
    expect(result.shadowed).toEqual([{ id: 'b', hook: 'action.before', by: 'a' }]);
  });

  it('refuses when the game requires both, rather than picking one silently', () => {
    const result = resolveMods(
      [declare('a', { required: true }), declare('b', { required: true })],
      [replacing('a', 0), replacing('b', 0)],
      on,
      'engine',
    );
    expect(result.ok).toBe(false);
    expect(result.issues.find((i) => i.code === 'mod_replace_conflict')?.message).toMatch(/both/);
  });
});

describe('targets and dependencies', () => {
  it('ignores mods meant for the other host', () => {
    const editorMod = modOf('studio', { target: 'editor' });
    const result = resolveMods([declare('studio', { target: 'editor' })], [editorMod], on, 'engine');
    expect(result.active).toEqual([]);
  });

  it('reports a dependency that is not active', () => {
    const result = resolveMods(
      [declare('a', { required: true })],
      [modOf('a', { dependencies: [{ id: 'b' }] })],
      on,
      'engine',
    );
    expect(result.ok).toBe(false);
    expect(result.issues.find((i) => i.code === 'mod_dependency_missing')?.message).toContain('b');
  });
});

describe('activeModIdentities', () => {
  it('is sorted, so a save records one canonical mod set', () => {
    const ids = activeModIdentities([modOf('c'), modOf('a'), modOf('b')]);
    expect(ids).toEqual([`a-${'a'.repeat(16)}`, `b-${'a'.repeat(16)}`, `c-${'a'.repeat(16)}`]);
  });
});
