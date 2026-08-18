/**
 * The gate the project format has to pass.
 *
 * A module split into files and rejoined must be *byte-identical* to what it
 * was. Not equivalent, not semantically the same — the same file, because the
 * whole point is that `module.json` becomes a build artifact and a build whose
 * output drifts is a build nobody will run twice.
 *
 * This was not achievable until recently: Python wrote `—` where
 * JavaScript writes the character, and `0.0` where JavaScript writes `0`, so
 * the strongest available test was JavaScript against itself. Aligning the
 * generators made the real version possible, which is why it is asserted here
 * against the files on disk rather than against a re-serialized copy.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { splitProject, joinProject } from './project.js';
import { compileModule, hashModule } from './compile.js';
import { gameModuleSchema } from './schema/module.js';

const MODULES = ['minimal', 'core_fantasy', 'greenmarch', 'aurendel'] as const;

const raw = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../modules/${name}/module.json`, import.meta.url)), 'utf8');

describe('splitProject / joinProject', () => {
  it.each(MODULES)('rebuilds %s byte for byte', (name) => {
    const text = raw(name);
    const doc = JSON.parse(text) as Record<string, unknown>;

    const split = splitProject(doc);
    const { document, issues } = joinProject(split.manifest, split.files);

    expect(issues).toEqual([]);
    expect(`${JSON.stringify(document, null, 2)}\n`).toBe(text);
  });

  it('does not touch the document it is given', () => {
    const doc = JSON.parse(raw('greenmarch')) as Record<string, unknown>;
    const before = JSON.stringify(doc);
    splitProject(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('writes one file per entry, named for its id', () => {
    const doc = JSON.parse(raw('greenmarch')) as Record<string, unknown>;
    const split = splitProject(doc);

    const monsters = (doc['content'] as Record<string, Record<string, unknown>[]>)['monsters'] ?? [];
    for (const monster of monsters) {
      expect(Object.keys(split.files)).toContain(`content/monsters/${String(monster['id'])}.json`);
    }
    // And a file really is just that entry, so a diff names the thing.
    const first = monsters[0]!;
    expect(JSON.parse(split.files[`content/monsters/${String(first['id'])}.json`]!)).toEqual(first);
  });

  /**
   * The finding from the spike: rejoining from directory order is not the same
   * document. It is the reason a manifest exists at all, so it is pinned.
   */
  it('needs the manifest, because sorted filenames are a different order', () => {
    const doc = JSON.parse(raw('aurendel')) as Record<string, unknown>;
    const split = splitProject(doc);

    const areas = split.manifest.sections['world']?.collections['areas'] ?? [];
    expect(areas.length).toBeGreaterThan(50);
    expect([...areas], 'if these matched, the manifest would be redundant').not.toEqual(
      [...areas].sort(),
    );
  });

  it('keeps an absent optional collection absent', () => {
    // `narrative.lore` is `.optional()` rather than `.default([])` so a module
    // that does not use it does not carry it — and a rebuild that grew an empty
    // array would change that module's content hash.
    const doc = { id: 'x', narrative: { quests: [] } } as Record<string, unknown>;
    const split = splitProject(doc);
    const { document } = joinProject(split.manifest, split.files);
    expect(Object.keys(document['narrative'] as object)).toEqual(['quests']);
  });

  it('survives an entry with no usable id', () => {
    const doc = { content: { monsters: [{ name: 'nameless' }, { id: 'ok' }] } };
    const split = splitProject(doc);
    const { document, issues } = joinProject(split.manifest, split.files);
    expect(issues).toEqual([]);
    expect(document).toEqual(doc);
  });

  describe('reports rather than throws', () => {
    it('names a file that is missing', () => {
      const doc = JSON.parse(raw('minimal')) as Record<string, unknown>;
      const split = splitProject(doc);
      const files = { ...split.files };
      const victim = Object.keys(files).find((f) => f.startsWith('rules/'))!;
      delete files[victim];

      const { issues } = joinProject(split.manifest, files);
      expect(issues.map((i) => i.file)).toContain(victim);
      expect(issues[0]?.code).toBe('project_missing_file');
    });

    it('names a file that does not parse', () => {
      const doc = JSON.parse(raw('minimal')) as Record<string, unknown>;
      const split = splitProject(doc);
      const victim = Object.keys(split.files).find((f) => f.endsWith('.json') && f !== 'shell.json')!;

      const { issues } = joinProject(split.manifest, { ...split.files, [victim]: '{ nope' });
      expect(issues[0]?.code).toBe('project_bad_json');
      expect(issues[0]?.file).toBe(victim);
    });
  });
});

/** What the format is for: the rebuilt module still is the module. */
describe('a rebuilt module is the same module', () => {
  it.each(MODULES)('compiles %s to the same content hash', (name) => {
    const doc = JSON.parse(raw(name)) as Record<string, unknown>;
    const split = splitProject(doc);
    const { document } = joinProject(split.manifest, split.files);

    const before = gameModuleSchema.safeParse(doc);
    const after = gameModuleSchema.safeParse(document);
    expect(before.success && after.success).toBe(true);
    if (!before.success || !after.success) return;
    expect(hashModule(after.data)).toBe(hashModule(before.data));

    // A module whose maps live in `maps/<id>/` folders has references the raw
    // document cannot resolve on its own — assembly is what inlines them — so
    // only the two without folders compile straight from the file.
    if (name === 'minimal' || name === 'core_fantasy') {
      expect(compileModule(document).ok).toBe(true);
    }
  });
});
