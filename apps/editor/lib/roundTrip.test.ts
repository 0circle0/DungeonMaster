/**
 * The whole path, on the world we actually ship.
 *
 * Every other test here holds one seam still and checks the next. This one does
 * what a person does: take the downloaded project, put it in the store, open it,
 * change one number, and open it again. The assertions are the four claims the
 * design rests on —
 *
 *   1. what arrives is stored as files, verbatim, and nothing is joined on the
 *      way in;
 *   2. opening it rebuilds, byte for byte, the very document the player is
 *      shipped — so the world the studio edits and the world that gets played
 *      are provably the same one;
 *   3. the prefab links come back, all 767 of them, from the recipe files
 *      themselves;
 *   4. editing one integer writes exactly one record.
 *
 * It reads `apps/editor/public/content`, so it is also the test that fails when
 * somebody changes a world and forgets `npm run content`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { unbundleModule } from '@dm/module';
import {
  closeLibrary, DB_NAME, createWorldFromFiles, readWorldFiles, writeWorldFiles, factsFor,
} from '@dm/library';
import { setAt } from './store';
import { diffProject, snapshotFrom } from './projectDiff';

const ARTIFACT = fileURLToPath(new URL('../public/content/aurendel.project.json.gz', import.meta.url));
/** What the player is shipped: the compiled module, from the other artifact. */
const PLAYED = fileURLToPath(new URL('../../play/public/content/aurendel.json.gz', import.meta.url));

const shipped = (): Record<string, string> =>
  (JSON.parse(gunzipSync(readFileSync(ARTIFACT)).toString('utf8')) as { files: Record<string, string> }).files;

beforeEach(async () => {
  await closeLibrary();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

describe.skipIf(!existsSync(ARTIFACT) || !existsSync(PLAYED))('the shipped project, end to end', () => {
  it('stores what was downloaded, file for file', async () => {
    const files = shipped();
    const meta = await createWorldFromFiles(files, {
      title: 'Aurendel', filename: 'aurendel.module.json', facts: factsFor(unbundleModule(files).document!),
    });

    const back = await readWorldFiles(meta.key);
    expect(back).toEqual(files);
    // Recipes still recipes. Nothing was expanded on the way in, so what the
    // author has is the project we build from and not a flattened copy.
    expect(Object.values(back).filter((text) => text.includes('"@prefab"')).length).toBe(767);
    expect(Object.keys(back).filter((path) => path.startsWith('project/prefabs/')).length).toBe(44);
  });

  it('opens to the document the player is shipped, with its links intact', async () => {
    const meta = await createWorldFromFiles(shipped(), {
      title: 'Aurendel', filename: 'aurendel.module.json', facts: factsFor({}, null),
    });

    const { document, authoring, issues } = unbundleModule(await readWorldFiles(meta.key));
    expect(issues).toEqual([]);

    // Not `modules/aurendel/module.json` — that file pairs with `maps/<id>/`
    // folders on disk and has no `world.maps` key at all. The compiled module is
    // the assembled one, which is exactly what the player's artifact carries.
    const played = JSON.parse(gunzipSync(readFileSync(PLAYED)).toString('utf8')) as { doc: unknown };
    expect(JSON.stringify(document)).toBe(JSON.stringify(played.doc));

    // The links the old path threw away. 44 prefabs that point at something.
    const links = Object.values(authoring.instances).reduce((n, byId) => n + Object.keys(byId).length, 0);
    expect(links).toBe(767);
    expect(authoring.prefabs).toHaveLength(44);
  });

  it('writes one record for one changed integer, and nothing else moves', async () => {
    const files = shipped();
    const opened = unbundleModule(files);
    const doc = opened.document!;
    const meta = await createWorldFromFiles(files, {
      title: 'Aurendel', filename: 'aurendel.module.json', facts: factsFor(doc),
    });

    // The snapshot as it stands after an import: the files on disk are what a
    // diff should compare the next document against.
    const { snapshot } = diffProject({ doc, authoring: opened.authoring }, null);
    const before = await readWorldFiles(meta.key);

    const areas = (doc['world'] as Record<string, unknown[]>)['areas'];
    const target = areas.findIndex((area) => typeof (area as { dangerLevel?: unknown }).dangerLevel === 'number');
    expect(target).toBeGreaterThanOrEqual(0);
    const id = (areas[target] as { id: string }).id;

    const next = setAt(doc, ['world', 'areas', target, 'dangerLevel'], 3) as Record<string, unknown>;
    const { change, storedBytes } = diffProject({ doc: next, authoring: opened.authoring }, snapshot);

    // One file. Not the manifest, not the shell, not the other 2,857.
    expect(Object.keys(change.put)).toEqual([`project/world/areas/${id}.json`]);
    expect(change.remove).toEqual([]);

    await writeWorldFiles(
      meta.key,
      change,
      { facts: factsFor(next), title: meta.title, storedBytes },
      meta,
    );

    const after = await readWorldFiles(meta.key);
    expect(Object.keys(after).length).toBe(Object.keys(before).length);
    for (const [path, was] of Object.entries(before)) {
      if (path === `project/world/areas/${id}.json`) continue;
      expect(after[path]).toBe(was);
    }

    // And reopening gives back the edit, through the same join as any other load.
    const reopened = unbundleModule(after).document!;
    const areasAgain = (reopened['world'] as Record<string, unknown[]>)['areas'];
    expect((areasAgain[target] as { dangerLevel: number }).dangerLevel).toBe(3);
  });

  it('seeds from the files it read, so the first save is a diff and not a rewrite', () => {
    // Found in a browser, not here: after an import the snapshot was null, so
    // the first save swept and rewrote all 2,858 records with the bytes they
    // already had. Invisible to a contents check — every file came back equal.
    const files = shipped();
    const opened = unbundleModule(files);
    const seeded = snapshotFrom(opened.document!, opened.authoring, files);

    const idle = diffProject({ doc: opened.document!, authoring: opened.authoring }, seeded);
    expect(Object.keys(idle.change.put)).toEqual([]);
    expect(idle.change.remove).toEqual([]);
    expect(idle.change.sweep).toBeUndefined();
  });

  it('leaves instances.json out when every link is in a recipe', () => {
    // The sidecar is the remainder, not the record. Aurendel's 767 links are all
    // carried by their own entry files, so writing them again would be the same
    // fact in two places — which is the bug that started this.
    const files = shipped();
    const opened = unbundleModule(files);
    expect(files['project/prefabs/instances.json']).toBeUndefined();

    const seeded = snapshotFrom(opened.document!, opened.authoring, files);
    const areas = (opened.document!['world'] as Record<string, unknown[]>)['areas'];
    const id = (areas[0] as { id: string }).id;
    const next = setAt(opened.document!, ['world', 'areas', 0, 'name'], 'Edited') as Record<string, unknown>;

    const { change } = diffProject({ doc: next, authoring: opened.authoring }, seeded);
    expect(Object.keys(change.put)).toEqual([`project/world/areas/${id}.json`]);
  });
});
