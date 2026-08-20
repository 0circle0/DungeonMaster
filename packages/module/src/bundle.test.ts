/**
 * A module out to files and back.
 *
 * The property that matters is the same one `project.test.ts` holds for the
 * document alone, extended to the pair a repository actually stores: an
 * assembled module — maps inlined, which is the only form the studio ever sees
 * — must survive a trip out to files and back unchanged.
 *
 * Aurendel is the case worth testing. It has fourteen static map folders and no
 * `world.maps` key on disk, so it is the module where getting this wrong is
 * invisible until somebody's export stops matching the repository.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readAssembledModule } from './load.js';
import { bundleModule, unbundleModule, PROJECT_MANIFEST } from './bundle.js';
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
    // Not merely *a* valid split — the same paths and the same bytes that are
    // committed, or an export would rewrite half the tree on its first use.
    //
    // A compressed project is the other exception, and a larger one. The
    // repository stores Aurendel's entries as recipes; `bundleModule` works
    // from a document, which records nothing about which prefab made an entry,
    // so it writes them literally. Both rebuild the same module — the round
    // trip above proves it — but the bytes differ, so those files are compared
    // as the entries they stand for. Making an export preserve compression
    // needs the instance links, and that is its own change.
    //
    // This makes canonical formatting a repository convention rather than a
    // format rule: `joinProject` parses whatever valid JSON it is handed, so a
    // hand-edited entry can drift and still build correctly. Three did, from
    // `json.dumps` escaping an em dash. Nothing was wrong with them; they just
    // made an export a diff. Re-running the export is the fix.
    //
    // CSV layers are the one exception, and it is the format's rather than
    // this file's: `parseCsvGrid` treats a `#` line as a comment and drops it,
    // so a comment is not in the parsed grid and nothing downstream could put
    // it back. Three of greenmarch's thirty-four layers are hand-annotated that
    // way. They are compared as grids, which is the whole of what they mean —
    // and the consequence, that a studio export drops such comments, is stated
    // in `bundle.ts` rather than hidden here.
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
    // The other direction of the same claim: nothing on disk is missing from a
    // bundle. Authoring files are the documented exception — they describe how
    // a world is made rather than what it contains, and no document produces
    // them.
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

    // Authoring files ride along only when handed in, which the studio does and
    // a bare document cannot.
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
