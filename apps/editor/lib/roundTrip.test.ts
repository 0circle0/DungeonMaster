/** The whole path, on the world we ship. */

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
import { recomputeInstancesFor } from './worldStore';

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
    expect(Object.values(back).filter((text) => text.includes('"@prefab"')).length).toBe(767);
    expect(Object.keys(back).filter((path) => path.startsWith('project/prefabs/')).length).toBe(44);
  });

  it('opens to the document the player is shipped, with its links intact', async () => {
    const meta = await createWorldFromFiles(shipped(), {
      title: 'Aurendel', filename: 'aurendel.module.json', facts: factsFor({}, null),
    });

    const { document, authoring, issues } = unbundleModule(await readWorldFiles(meta.key));
    expect(issues).toEqual([]);

    const played = JSON.parse(gunzipSync(readFileSync(PLAYED)).toString('utf8')) as { doc: unknown };
    expect(JSON.stringify(document)).toBe(JSON.stringify(played.doc));

    // The links: 44 prefabs that point at something.
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

    const { snapshot } = diffProject({ doc, authoring: opened.authoring }, null);
    const before = await readWorldFiles(meta.key);

    const areas = (doc['world'] as Record<string, unknown[]>)['areas'];
    const target = areas.findIndex((area) => typeof (area as { dangerLevel?: unknown }).dangerLevel === 'number');
    expect(target).toBeGreaterThanOrEqual(0);
    const id = (areas[target] as { id: string }).id;

    const next = setAt(doc, ['world', 'areas', target, 'dangerLevel'], 3) as Record<string, unknown>;
    const { change, storedBytes } = diffProject({ doc: next, authoring: opened.authoring }, snapshot);

    // One file.
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

  /** Linking, on the world we ship, through the store. */
  it('keeps a link made against a prefab that was already stored', async () => {
    const files = shipped();
    const opened = unbundleModule(files);
    const doc = opened.document!;
    const meta = await createWorldFromFiles(files, {
      title: 'Aurendel', filename: 'aurendel.module.json', facts: factsFor(doc),
    });
    const snapshot = snapshotFrom(doc, opened.authoring, files);

    const collection = 'world.pointsOfInterest';
    const prefab = opened.authoring.prefabs.find((candidate) => candidate.collection === collection);
    const linkedAlready = opened.authoring.instances[collection] ?? {};
    const [, listName] = collection.split('.');
    const pois = (doc['world'] as Record<string, { id: string }[]>)[listName ?? ''] ?? [];
    const target = pois.find((poi) => !(poi.id in linkedAlready));
    if (!prefab || !target) throw new Error('aurendel has no unlinked point of interest to link');

    const authoring = {
      ...opened.authoring,
      instances: {
        ...opened.authoring.instances,
        [collection]: { ...linkedAlready, [target.id]: { id: prefab.id, params: { id: target.id } } },
      },
    };

    const { change, storedBytes } = diffProject({ doc, authoring }, snapshot);
    // The entry it links, and nothing else in the world.
    expect(Object.keys(change.put)).toContain(`project/${collection.replace('.', '/')}/${target.id}.json`);

    await writeWorldFiles(
      meta.key,
      change,
      { facts: factsFor(doc), title: meta.title, storedBytes },
      meta,
    );

    const reopened = unbundleModule(await readWorldFiles(meta.key));
    expect(reopened.authoring.instances[collection]?.[target.id]).toBeDefined();
    expect(JSON.stringify(reopened.document)).toBe(JSON.stringify(doc));
  });

  /** The same claim, through what autosave actually calls. */
  it('writes nothing on an idle save through the path autosave takes', () => {
    const files = shipped();
    const opened = unbundleModule(files);
    const seeded = snapshotFrom(opened.document!, opened.authoring, files);

    const written = recomputeInstancesFor(opened.document!, opened.authoring);
    const { change } = diffProject({ doc: opened.document!, authoring: written }, seeded);

    expect(Object.keys(change.put)).toEqual([]);
    expect(change.remove).toEqual([]);
  });

  it('seeds from the files it read, so the first save is a diff and not a rewrite', () => {
    const files = shipped();
    const opened = unbundleModule(files);
    const seeded = snapshotFrom(opened.document!, opened.authoring, files);

    const idle = diffProject({ doc: opened.document!, authoring: opened.authoring }, seeded);
    expect(Object.keys(idle.change.put)).toEqual([]);
    expect(idle.change.remove).toEqual([]);
    expect(idle.change.sweep).toBeUndefined();
  });

  it('leaves instances.json out when every link is in a recipe', () => {
    // The sidecar is the remainder, not the record.
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
