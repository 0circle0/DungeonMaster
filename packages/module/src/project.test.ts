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
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Prefab, StyleTables } from './prefab.js';
import { splitProject, joinProject, isAuthoringFile } from './project.js';
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

  /**
   * The gate for a project that is actually committed.
   *
   * The test above proves the round trip on a document held in memory. This
   * one proves it on the files in the repository: `modules/greenmarch/project`
   * is the authored form, `modules/greenmarch/module.json` is its build
   * output, and both are committed. Two representations of one world drift
   * unless something checks — that is the hazard `modules/aurendel/src/readme.md`
   * spells out for the generators, and committing a project takes it on.
   *
   * Any module that grows a `project/` is covered automatically, which is the
   * point: adopting the format opts you into the check, rather than into a
   * checklist somebody has to remember.
   */
  it.each(MODULES)('%s: a committed project still builds its module.json', (name) => {
    const dir = fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url));
    const projectDir = join(dir, 'project');
    if (!existsSync(projectDir)) return;

    const files: Record<string, string> = {};
    const walk = (current: string): void => {
      for (const entry of readdirSync(current)) {
        const path = join(current, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.json')) {
          files[relative(projectDir, path).split('\\').join('/')] = readFileSync(path, 'utf8');
        }
      }
    };
    walk(projectDir);

    const manifestText = files['project.json'];
    expect(manifestText, `${name}/project has no project.json`).toBeDefined();
    delete files['project.json'];

    // Prefabs and style tables describe how the world is authored rather than
    // what it contains, so they are still not *entries* — but a compressed
    // project's entry files are recipes, and a recipe cannot expand without
    // them. They come out of the entry set and go in as build inputs.
    const prefabs: Prefab[] = [];
    let style: StyleTables = {};
    for (const path of Object.keys(files)) {
      if (!isAuthoringFile(path)) continue;
      if (path === 'style.json') style = JSON.parse(files[path]!) as StyleTables;
      else if (path.startsWith('prefabs/') && !path.endsWith('instances.json')) {
        prefabs.push(JSON.parse(files[path]!) as Prefab);
      }
      delete files[path];
    }

    const { document, issues } = joinProject(
      JSON.parse(manifestText!) as ReturnType<typeof splitProject>['manifest'],
      files,
      { prefabs, style },
    );
    expect(issues).toEqual([]);
    expect(`${JSON.stringify(document, null, 2)}\n`).toBe(raw(name));
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

/**
 * A project holds two kinds of file, and confusing them deletes work.
 *
 * Most of it is derived — split the document and the same files come back, so
 * anything outside that set is stale. Prefabs and the style tables are not:
 * they are what entries were generated *from*, and the document never mentions
 * them. A save that swept up everything it did not recognise would take them.
 */
describe('authored files are not derived files', () => {
  it('knows which is which', () => {
    expect(isAuthoringFile('prefabs/inn.json')).toBe(true);
    expect(isAuthoringFile('prefabs/instances.json')).toBe(true);
    expect(isAuthoringFile('style.json')).toBe(true);
    // Read by the editor, the CLI and the Rules panel, and once absent from
    // this list — which made the first save of a project with one delete it.
    expect(isAuthoringFile('contract.json')).toBe(true);

    expect(isAuthoringFile('shell.json')).toBe(false);
    expect(isAuthoringFile('content/monsters/bog_hound.json')).toBe(false);
    // Not a prefix match on a name that merely starts the same way.
    expect(isAuthoringFile('prefabsomething.json')).toBe(false);
  });

  it('never produces an authored path when splitting', () => {
    const doc = JSON.parse(raw('greenmarch')) as Record<string, unknown>;
    const split = splitProject(doc);
    expect(Object.keys(split.files).filter(isAuthoringFile)).toEqual([]);
  });

  it('ignores one when rejoining, rather than mistaking it for an entry', () => {
    const doc = JSON.parse(raw('minimal')) as Record<string, unknown>;
    const split = splitProject(doc);
    const withPrefabs = {
      ...split.files,
      'prefabs/inn.json': '{"id":"inn"}',
      'style.json': '{"roomSizes":{}}',
    };
    const { document, issues } = joinProject(split.manifest, withPrefabs);
    expect(issues).toEqual([]);
    expect(document).toEqual(JSON.parse(raw('minimal')));
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
