/** The editor's half of the mod contract. */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testHost, inlineMod } from '@dm/mods/testing';
import type { SandboxHost, LoadedMod, ModManifest } from '@dm/mods';
import { createEditorModRuntime } from './modRuntime.js';
import type { ModuleDoc } from './store.js';

let host: SandboxHost;

function editorMod(id: string, source: string, hooks: string[]): LoadedMod {
  const manifest: ModManifest = {
    format: 1,
    id,
    target: 'editor',
    version: '1.0.0',
    hash: '0'.repeat(16),
    meta: { title: id, author: '', description: '', license: '', homepage: '' },
    engine: '^1.0.0',
    dependencies: [],
    loadAfter: [],
    entry: 'main.js',
    hooks: hooks.map((hook) => ({ hook, mode: 'after' as const, priority: 0 })),
    limits: { steps: 2_000_000, memoryBytes: 32 << 20 },
    systemText: {},
  };
  return inlineMod(manifest, { 'main.js': source });
}

const DOC: ModuleDoc = {
  id: 'test',
  version: '1.0.0',
  meta: { title: 'Test' },
  content: { monsters: [{ id: 'hound', name: 'Hound', extra: { morale: 4 } }] },
};

/** The shape `mods/editor/morale_studio` uses, which is the one that matters. */
const MORALE = `
dm.hook('editor.fields', (ctx) => {
  const selection = ctx.selection;
  if (!selection) return null;
  const path = selection.path || [];
  if (path[0] !== 'content' || path[1] !== 'monsters' || path.length < 3) return null;
  return [{ kind: 'fields', fields: [
    { path: ['extra', 'morale'], label: 'Morale', kind: 'number', min: 0, max: 10 },
  ] }];
});
`;

beforeAll(async () => {
  // The studio's host is an editor host; an engine host refuses these mods.
  host = await testHost({ target: 'editor' });
});
afterAll(() => host?.dispose());

describe('editor.fields', () => {
  it('returns the field a mod declares for the selected entry', () => {
    const mod = editorMod('morale_studio', MORALE, ['editor.fields']);
    host.install(mod);
    const runtime = createEditorModRuntime(host, [mod]);

    const fields = runtime.fields(DOC, {
      path: ['content', 'monsters', 0],
      value: (DOC['content'] as { monsters: unknown[] }).monsters[0],
    });

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Morale',
      kind: 'number',
      path: ['extra', 'morale'],
      modId: 'morale_studio',
    });
  });

  it('returns nothing when the selection is not what the mod wants', () => {
    const mod = editorMod('morale_studio2', MORALE, ['editor.fields']);
    host.install(mod);
    const runtime = createEditorModRuntime(host, [mod]);

    expect(runtime.fields(DOC, { path: ['content', 'items', 0], value: {} })).toHaveLength(0);
    expect(runtime.fields(DOC, null)).toHaveLength(0);
  });

  it('ignores a mod that does not declare the hook', () => {
    const mod = editorMod('quiet', MORALE, ['editor.lint']);
    host.install(mod);
    const runtime = createEditorModRuntime(host, [mod]);
    expect(runtime.fields(DOC, { path: ['content', 'monsters', 0], value: {} })).toHaveLength(0);
  });
});
