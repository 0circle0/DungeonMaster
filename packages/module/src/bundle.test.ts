/**
 * A module out to files and back.
 *
 * The property `project.test.ts` holds for the document alone, extended to the pair a repository
 * stores: an assembled module — maps inlined, the only form the studio sees — must survive a trip
 * out to files and back unchanged.
 *
 * Aurendel is the case worth testing: fourteen static map folders and no `world.maps` key on disk.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readAssembledModule } from './load.js';
import { bundleModule, unbundleModule, liftMaps, PROJECT_MANIFEST } from './bundle.js';
import { parseCsvGrid } from './staticmaps.js';
import { isPrefabRecipe } from './prefab.js';
import { isAuthoringFile } from './project.js';

const MODULES = ['minimal', 'core_fantasy', 'greenmarch', 'aurendel'] as const;

const dirOf = (name: string) => fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url));

describe('bundleModule / unbundleModule', () => {
  it.each(MODULES)('%s: survives a round trip through files', (name) => {
    const { doc } = readAssembledModule(dirOf(name));

    const { files } = bundleModule(doc);
    const { document, issues } = unbundleModule(files);

    expect(issues).toEqual([]);
    expect(document).toEqual(doc);
  });

  it.each(MODULES)('%s: writes the files the repository already holds', (name) => {
    // Not merely a valid split, but the same paths and the same bytes that are committed, or an
    // export would rewrite half the tree on its first use.
    //
    // A compressed project is the exception. The repository stores Aurendel's entries as recipes;
    // `bundleModule` works from a document, which records nothing about which prefab made an entry,
    // so it writes them literally. Both rebuild the same module, so those files are compared as the
    // entries they stand for.
    //
    // That makes canonical formatting a repository convention rather than a format rule:
    // `joinProject` parses whatever valid JSON it is handed, so a hand-edited entry can drift and
    // still build correctly.
    //
    // CSV layers are the format's own exception: `parseCsvGrid` treats a `#` line as a comment and
    // drops it, so a comment is not in the parsed grid and nothing downstream could put it back.
    // Three of greenmarch's thirty-four layers are hand-annotated that way, and are compared as
    // grids.
    const dir = dirOf(name);
    const { files } = bundleModule(readAssembledModule(dir).doc);

    for (const [path, text] of Object.entries(files)) {
      const onDisk = join(dir, path);
      if (!existsSync(onDisk)) continue;

      const committed = readFileSync(onDisk, 'utf8');
      if (path.endsWith('.csv')) {
        expect(parseCsvGrid(text).cells, path).toEqual(parseCsvGrid(committed).cells);
        continue;
      }
      if (isPrefabRecipe(JSON.parse(committed))) continue;
      expect(committed, path).toBe(text);
    }
  });

  it('accounts for every committed project and map file', () => {
    // The other direction: nothing on disk is missing from a bundle. Authoring files are the
    // documented exception, since they describe how a world is made rather than what it contains.
    const dir = dirOf('aurendel');
    const { files } = bundleModule(readAssembledModule(dir).doc);

    const onDisk: string[] = [];
    const walk = (current: string, prefix: string): void => {
      for (const entry of readdirSync(current)) {
        const path = join(current, entry);
        if (statSync(path).isDirectory()) walk(path, `${prefix}${entry}/`);
        else onDisk.push(`${prefix}${entry}`);
      }
    };
    for (const top of ['project', 'maps']) {
      if (existsSync(join(dir, top))) walk(join(dir, top), `${top}/`);
    }

    // Authoring files ride along only when handed in, which the studio does and a bare document
    // cannot.
    const unaccounted = onDisk.filter((path) => !(path in files) && !isAuthoringFile(path.slice('project/'.length)));
    expect(unaccounted).toEqual([]);
    expect(files[PROJECT_MANIFEST]).toBeDefined();
  });

  it('names the file when a manifest is missing rather than throwing', () => {
    const { files } = bundleModule(readAssembledModule(dirOf('minimal')).doc);
    const { [PROJECT_MANIFEST]: _gone, ...rest } = files;

    const { document, issues } = unbundleModule(rest);
    expect(document).toBeNull();
    expect(issues).toEqual([
      { file: PROJECT_MANIFEST, code: 'bundle_no_manifest', message: 'no project manifest' },
    ]);
  });
});

/**
 * The authoring half of a project, which used to fall out on the way through. `bundleModule` wrote
 * prefabs and style tables and nothing else, and `unbundleModule` read prefabs and style as
 * expansion inputs and then dropped them — so a world could go out of the studio as files and come
 * back with no prefabs, no instance map and no contract.
 */
describe('authoring survives a bundle round trip', () => {
  const doc = {
    id: 'x',
    world: { pointsOfInterest: [{ id: 'a', name: 'The Ford', kind: 'settlement' }] },
  };
  const authoring = {
    prefabs: [{
      id: 'inn',
      collection: 'world.pointsOfInterest',
      params: [{ key: 'id', kind: 'string' as const }, { key: 'name', kind: 'string' as const }],
      template: { id: '{{id}}', name: '{{name}}', kind: 'settlement' },
    }],
    style: { inn_variant: { v1: { travelMinutes: 3 } } },
    instances: { 'world.pointsOfInterest': { a: { id: 'inn', params: { id: 'a', name: 'The Ford' } } } },
    contract: { exemptFactions: ['the_quiet'] },
  };

  it('carries prefabs, style, instances and contract both ways', () => {
    const { files } = bundleModule(doc, authoring);
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      'project/prefabs/inn.json',
      'project/style.json',
      'project/prefabs/instances.json',
      'project/contract.json',
    ]));

    const back = unbundleModule(files);
    expect(back.issues).toEqual([]);
    expect(back.document).toEqual(doc);
    expect(back.authoring.prefabs).toEqual(authoring.prefabs);
    expect(back.authoring.style).toEqual(authoring.style);
    expect(back.authoring.instances).toEqual(authoring.instances);
    expect(back.authoring.contract).toEqual(authoring.contract);
  });

  it('writes no authoring file for a world that has none', () => {
    const { files } = bundleModule(doc);
    expect(Object.keys(files).filter((path) => isAuthoringFile(path.slice('project/'.length)))).toEqual([]);
  });

  it('reports a broken authoring file instead of throwing', () => {
    const { files } = bundleModule(doc, authoring);
    const broken = { ...files, 'project/style.json': '{not json' };
    const back = unbundleModule(broken);
    expect(back.issues.map((issue) => issue.code)).toContain('bundle_bad_authoring');
    expect(back.document).not.toBeNull();
  });

  it('recovers links from recipe files with no sidecar at all', () => {
    const { files } = bundleModule(doc, { ...authoring, instances: {} });
    // The entry, rewritten as the recipe it came from — which is what the studio stores once
    // entries are files.
    const recipe = { '@prefab': 'inn', params: { id: 'a', name: 'The Ford' } };
    const asRecipes = {
      ...files,
      'project/world/pointsOfInterest/a.json': `${JSON.stringify(recipe, null, 2)}\n`,
    };

    const back = unbundleModule(asRecipes);
    expect(back.issues).toEqual([]);
    expect(back.document).toEqual(doc);
    expect(back.authoring.instances).toEqual({
      'world.pointsOfInterest': { a: { id: 'inn', params: { id: 'a', name: 'The Ford' } } },
    });
  });
});

/** Maps are not project files, and anything that names files has to know it. */
describe('liftMaps', () => {
  it('takes world.maps out and leaves the rest alone', () => {
    const withMaps = { id: 'x', world: { areas: [{ id: 'a' }], maps: [{ id: 'm', layers: [] }] } };
    const { document, maps } = liftMaps(withMaps);
    expect(maps).toEqual([{ id: 'm', layers: [] }]);
    expect(document).toEqual({ id: 'x', world: { areas: [{ id: 'a' }] } });
    expect(withMaps.world.maps).toHaveLength(1);
  });

  it('passes a document with no maps through untouched', () => {
    const plain = { id: 'x', world: { areas: [] } };
    expect(liftMaps(plain).document).toBe(plain);
    expect(liftMaps(plain).maps).toEqual([]);
  });
});
