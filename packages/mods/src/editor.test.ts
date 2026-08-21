/** The editor target, and the pairing it exists for. */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';

import { editorDirectivesSchema } from './editor.js';
import { testHost, modById } from './testing.js';
import type { SandboxHost } from './sandbox/host.js';

let host: SandboxHost;

const greenmarch = () =>
  loadModuleFrom(fileURLToPath(new URL('../../../modules/greenmarch', import.meta.url)));

function callEditor(modId: string, hook: string, payload: unknown) {
  const result = host.call({
    mod: modId,
    hook,
    payload: JSON.stringify(payload),
    random: () => 0.5,
    query: () => null,
  });
  if (!result.ok) throw new Error(`${modId} ${hook}: ${result.error}`);
  const parsed = editorDirectivesSchema.safeParse(result.directives);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join('; '));
  return parsed.data;
}

beforeAll(async () => {
  host = await testHost({ target: 'editor', quarantineAfter: Infinity });
  const studio = modById('morale_studio');
  const installed = host.install({ manifest: studio.manifest, files: studio.files, hash: studio.hash });
  if (!installed.ok) throw new Error(installed.issues.join('; '));
});

afterAll(() => host?.dispose());

describe('an editor mod adds fields', () => {
  it('offers a Morale field when a monster is selected', () => {
    const directives = callEditor('morale_studio', 'editor.fields', {
      meta: { id: 'greenmarch', version: '0.1.0', title: 'Greenmarch' },
      selection: { path: ['content', 'monsters', 0], value: { id: 'bog_hound' } },
    });

    const fields = directives.flatMap((d) => (d.kind === 'fields' ? d.fields : []));
    expect(fields).toHaveLength(1);
    // Into `extra`, which is the whole reason no schema change is needed.
    expect(fields[0]?.path).toEqual(['extra', 'morale']);
    expect(fields[0]?.kind).toBe('number');
  });

  it('offers nothing when something else is selected', () => {
    const directives = callEditor('morale_studio', 'editor.fields', {
      meta: { id: 'greenmarch', version: '0.1.0', title: 'Greenmarch' },
      selection: { path: ['content', 'items', 3], value: {} },
    });
    expect(directives.flatMap((d) => (d.kind === 'fields' ? d.fields : []))).toEqual([]);
  });
});

describe('an editor mod adds validation', () => {
  it('notices a monster with no morale', () => {
    const directives = callEditor('morale_studio', 'editor.lint', {
      meta: { id: 'x', version: '1.0.0', title: 'x' },
      doc: { content: { monsters: [{ id: 'bog_hound' }] } },
    });
    const problems = directives.flatMap((d) => (d.kind === 'diagnostics' ? d.diagnostics : []));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.code).toBe('no_morale');
    expect(problems[0]?.message).toContain('bog_hound');
  });

  it('rejects a morale outside its range', () => {
    const directives = callEditor('morale_studio', 'editor.lint', {
      meta: { id: 'x', version: '1.0.0', title: 'x' },
      doc: { content: { monsters: [{ id: 'ogre', extra: { morale: 99 } }] } },
    });
    const problems = directives.flatMap((d) => (d.kind === 'diagnostics' ? d.diagnostics : []));
    expect(problems[0]?.code).toBe('bad_morale');
    expect(problems[0]?.severity).toBe('warning');
  });

  it('says nothing when morale is set sensibly', () => {
    const directives = callEditor('morale_studio', 'editor.lint', {
      meta: { id: 'x', version: '1.0.0', title: 'x' },
      doc: { content: { monsters: [{ id: 'ogre', extra: { morale: 4 } }] } },
    });
    expect(directives.flatMap((d) => (d.kind === 'diagnostics' ? d.diagnostics : []))).toEqual([]);
  });
});

describe('an editor mod runs bulk edits', () => {
  it('lists its commands', () => {
    const directives = callEditor('morale_studio', 'editor.commands', {
      meta: { id: 'x', version: '1.0.0', title: 'x' },
    });
    const commands = directives.flatMap((d) => (d.kind === 'commands' ? d.commands : []));
    expect(commands.map((c) => c.id)).toEqual(['fill']);
  });

  it('patches only the monsters that are missing it', () => {
    const directives = callEditor('morale_studio', 'editor.commands', {
      meta: { id: 'x', version: '1.0.0', title: 'x' },
      run: 'fill',
      doc: {
        content: {
          monsters: [{ id: 'a' }, { id: 'b', extra: { morale: 2 } }, { id: 'c' }],
        },
      },
    });
    const patches = directives.flatMap((d) => (d.kind === 'patch' ? d.patches : []));
    expect(patches.map((p) => p.path)).toEqual([
      ['content', 'monsters', 0, 'extra', 'morale'],
      ['content', 'monsters', 2, 'extra', 'morale'],
    ]);
  });
});

describe('an editor mod draws a panel', () => {
  it('returns a widget tree the host can render', () => {
    const directives = callEditor('morale_studio', 'editor.panel', {
      meta: { id: 'x', version: '1.0.0', title: 'x' },
      doc: { content: { monsters: [{ id: 'a', extra: { morale: 3 } }, { id: 'b' }] } },
      event: null,
    });
    const widget = directives.find((d) => d.kind === 'widget');
    expect(widget).toBeDefined();
    if (widget?.kind !== 'widget' || widget.root.kind !== 'rows') throw new Error('expected rows');

    const table = widget.root.children.find((child) => child.kind === 'table');
    if (table?.kind !== 'table') throw new Error('expected a table');
    expect(table.columns).toEqual(['Monster', 'Morale']);
    expect(table.rows).toEqual([['a', '3'], ['b', '—']]);
  });
});

describe('the pairing costs the format nothing', () => {
  it('still compiles with morale in a monster’s extra bag', () => {
    const module = greenmarch();
    const doc = JSON.parse(JSON.stringify(module.source)) as {
      content: { monsters: { id: string; extra?: Record<string, unknown> }[] };
    };
    const first = doc.content.monsters[0];
    if (!first) throw new Error('greenmarch has no monsters');
    first.extra = { ...(first.extra ?? {}), morale: 4 };

    const result = compileModule(doc);
    expect(result.ok).toBe(true);
  });

  it('changes the module hash, so mod data is real content', () => {
    const module = greenmarch();
    const doc = JSON.parse(JSON.stringify(module.source)) as {
      content: { monsters: { id: string; extra?: Record<string, unknown> }[] };
    };
    const first = doc.content.monsters[0]!;
    const current = first.extra?.['morale'];
    first.extra = { ...(first.extra ?? {}), morale: typeof current === 'number' ? current + 1 : 4 };

    const withMorale = compileModule(doc);
    if (!withMorale.ok) throw new Error('expected success');
    expect(withMorale.module.hash).not.toBe(module.hash);
  });
});
