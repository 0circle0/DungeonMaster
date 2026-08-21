/**
 * The claim this exists to make: editing one thing writes one file.
 *
 * So these assert counts, not contents. A diff that returned the right bytes for every file in the
 * world would pass a contents test and be exactly the design being replaced.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NO_AUTHORING } from '@dm/library';
import { unbundleModule } from '@dm/module';
import type { Prefab, InstanceMap } from '@dm/module';
import { setAt } from './store';
import { diffProject } from './projectDiff';
import type { ProjectSnapshot } from './projectDiff';

const MINIMAL = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

/** A world already stored: the first diff writes everything, as an import does. */
function stored(doc: Record<string, unknown> = MINIMAL, authoring = NO_AUTHORING) {
  const first = diffProject({ doc, authoring }, null);
  return { snapshot: first.snapshot, first };
}

const paths = (change: { put: Readonly<Record<string, string>> }) => Object.keys(change.put).sort();

describe('diffProject', () => {
  it('writes the whole tree the first time, and sweeps', () => {
    const { first } = stored();
    expect(first.change.sweep).toBe(true);
    expect(paths(first.change).length).toBeGreaterThan(5);
    expect(paths(first.change)).toContain('project/project.json');
    expect(paths(first.change)).toContain('project/shell.json');
  });

  it('writes exactly one file when one entry is edited', () => {
    const { snapshot } = stored();
    const attributes = (MINIMAL['rules'] as Record<string, unknown[]>)['attributes'];
    const id = (attributes[0] as { id: string }).id;

    const next = setAt(MINIMAL, ['rules', 'attributes', 0, 'name'], 'Renamed') as Record<string, unknown>;
    const { change } = diffProject({ doc: next, authoring: NO_AUTHORING }, snapshot);

    expect(paths(change)).toEqual([`project/rules/attributes/${id}.json`]);
    expect(change.remove).toEqual([]);
  });

  it('writes nothing at all when the document has not moved', () => {
    const { snapshot } = stored();
    const { change } = diffProject({ doc: MINIMAL, authoring: NO_AUTHORING }, snapshot);
    expect(paths(change)).toEqual([]);
    expect(change.remove).toEqual([]);
  });

  it('renames a file by writing the new one and dropping the old', () => {
    const { snapshot } = stored();
    const attributes = (MINIMAL['rules'] as Record<string, unknown[]>)['attributes'];
    const was = (attributes[0] as { id: string }).id;

    const next = setAt(MINIMAL, ['rules', 'attributes', 0, 'id'], 'renamed') as Record<string, unknown>;
    const { change } = diffProject({ doc: next, authoring: NO_AUTHORING }, snapshot);

    // The entry, plus the manifest — the file list is the order, so it moved too.
    expect(paths(change)).toEqual(['project/project.json', 'project/rules/attributes/renamed.json']);
    expect(change.remove).toEqual([`project/rules/attributes/${was}.json`]);
  });

  it('writes one file and the manifest when an entry is added', () => {
    const { snapshot } = stored();
    const attributes = (MINIMAL['rules'] as Record<string, unknown[]>)['attributes'];

    const next = setAt(
      MINIMAL,
      ['rules', 'attributes', attributes.length],
      { id: 'luck', name: 'Luck', abbreviation: 'LCK' },
    ) as Record<string, unknown>;
    const { change } = diffProject({ doc: next, authoring: NO_AUTHORING }, snapshot);

    expect(paths(change)).toEqual(['project/project.json', 'project/rules/attributes/luck.json']);
    expect(change.remove).toEqual([]);
  });

  it('drops one file and the manifest when an entry is deleted', () => {
    const { snapshot } = stored();
    const attributes = (MINIMAL['rules'] as Record<string, unknown[]>)['attributes'] as { id: string }[];
    const gone = attributes.at(-1)!.id;

    const rules = MINIMAL['rules'] as Record<string, unknown>;
    const next = { ...MINIMAL, rules: { ...rules, attributes: attributes.slice(0, -1) } };
    const { change } = diffProject({ doc: next, authoring: NO_AUTHORING }, snapshot);

    expect(paths(change)).toEqual(['project/project.json']);
    expect(change.remove).toEqual([`project/rules/attributes/${gone}.json`]);
  });

  it('writes only the manifest when a collection is reordered', () => {
    const { snapshot } = stored();
    const attributes = (MINIMAL['rules'] as Record<string, unknown[]>)['attributes'];
    const rules = MINIMAL['rules'] as Record<string, unknown>;

    // The same entry objects in a different order — every name still maps to the object it named,
    // so no entry file has anything new to say.
    const next = { ...MINIMAL, rules: { ...rules, attributes: [...attributes].reverse() } };
    const { change } = diffProject({ doc: next, authoring: NO_AUTHORING }, snapshot);

    expect(paths(change)).toEqual(['project/project.json']);
    expect(change.remove).toEqual([]);
  });

  it('rewrites every entry a changed prefab is responsible for', () => {
    const poi = { id: 'ford', name: 'The Ford', kind: 'settlement' };
    const doc = { ...MINIMAL, world: { ...(MINIMAL['world'] as object), pointsOfInterest: [poi] } };
    const prefab: Prefab = {
      id: 'inn',
      collection: 'world.pointsOfInterest',
      params: [{ key: 'id', kind: 'string' }, { key: 'name', kind: 'string' }],
      template: { id: '{{id}}', name: '{{name}}', kind: 'settlement' },
    };
    const authoring = {
      ...NO_AUTHORING,
      prefabs: [prefab],
      instances: { 'world.pointsOfInterest': { ford: { id: 'inn', params: { id: 'ford', name: 'The Ford' } } } },
    };

    const { snapshot, first } = stored(doc, authoring);

    // The prefab changes and the document does not. The entry file is a recipe, so it now expands
    // to something other than what is on screen and has to be rewritten.
    const moved: Prefab = { ...prefab, template: { ...prefab.template as object, kind: 'landmark' } };
    const { change } = diffProject({ doc, authoring: { ...authoring, prefabs: [moved] } }, snapshot);

    expect(paths(change)).toContain('project/world/pointsOfInterest/ford.json');
    expect(paths(change)).toContain('project/prefabs/inn.json');

    // What it writes is whatever reproduces the entry on screen — here a recipe that overrides the
    // `kind` the moved template would supply. The invariant is not "a recipe" or "a literal", it is
    // that reading the files back gives the author the world they were looking at.
    const back = unbundleModule({ ...first.change.put, ...change.put });
    expect(back.issues).toEqual([]);
    expect((back.document!['world'] as Record<string, unknown[]>)['pointsOfInterest']).toEqual([poi]);
  });

  it('stores a prefab-backed entry as a recipe', () => {
    const poi = { id: 'ford', name: 'The Ford', kind: 'settlement' };
    const doc = { ...MINIMAL, world: { ...(MINIMAL['world'] as object), pointsOfInterest: [poi] } };
    const authoring = {
      ...NO_AUTHORING,
      prefabs: [{
        id: 'inn',
        collection: 'world.pointsOfInterest',
        params: [{ key: 'id', kind: 'string' as const }, { key: 'name', kind: 'string' as const }],
        template: { id: '{{id}}', name: '{{name}}', kind: 'settlement' },
      }],
      instances: { 'world.pointsOfInterest': { ford: { id: 'inn', params: { id: 'ford', name: 'The Ford' } } } },
    };

    const { first } = stored(doc, authoring);
    expect(JSON.parse(first.change.put['project/world/pointsOfInterest/ford.json']))
      .toEqual({ '@prefab': 'inn', params: { id: 'ford', name: 'The Ford' } });

    // And it comes back as the entry, with its link recovered from the file.
    const back = unbundleModule(first.change.put);
    expect(back.issues).toEqual([]);
    expect((back.document!['world'] as Record<string, unknown[]>)['pointsOfInterest']).toEqual([poi]);
    expect(back.authoring.instances).toEqual(authoring.instances);
  });

  it('rewrites everything when identity is lost, with no special case for it', () => {
    const { snapshot } = stored();
    // What the raw-JSON editor does: parse a fresh copy. Nothing matches by reference, so the
    // ordinary algorithm reports the whole world.
    const foreign = JSON.parse(JSON.stringify(MINIMAL)) as Record<string, unknown>;
    const { change } = diffProject({ doc: foreign, authoring: NO_AUTHORING }, snapshot);

    const everything = diffProject({ doc: MINIMAL, authoring: NO_AUTHORING }, null);
    expect(paths(change)).toEqual(paths(everything.change).filter((p) => p !== 'project/project.json' && p !== 'project/shell.json'));
  });

  it('survives undo, which restores an older document that shares structure', () => {
    const { snapshot } = stored();
    const edited = setAt(MINIMAL, ['rules', 'attributes', 0, 'name'], 'Renamed') as Record<string, unknown>;
    const after = diffProject({ doc: edited, authoring: NO_AUTHORING }, snapshot);

    // Undo hands back the document from before, which is the same object graph.
    const undone = diffProject({ doc: MINIMAL, authoring: NO_AUTHORING }, after.snapshot);
    expect(paths(undone.change)).toEqual(paths(after.change));
  });

  it('keeps the snapshot usable across a run of edits', () => {
    let snapshot: ProjectSnapshot | null = null;
    let doc: Record<string, unknown> = MINIMAL;
    const written: Record<string, string> = {};

    for (const name of ['One', 'Two', 'Three']) {
      const result = diffProject({ doc, authoring: NO_AUTHORING }, snapshot);
      Object.assign(written, result.change.put);
      snapshot = result.snapshot;
      doc = setAt(doc, ['rules', 'attributes', 0, 'name'], name) as Record<string, unknown>;
    }

    const last = diffProject({ doc, authoring: NO_AUTHORING }, snapshot);
    Object.assign(written, last.change.put);

    const { document, issues } = unbundleModule(written);
    expect(issues).toEqual([]);
    expect(((document!['rules'] as Record<string, unknown[]>)['attributes'][0] as { name: string }).name)
      .toBe('Three');
  });

  /**
   * The third input to an entry file.
   *
   * A file's text is decided by the entry, the prefab behind it, and the link between them.
   * Watching only the first two means linking an entry to a prefab that had not itself changed
   * moves nothing the diff looks at: no file is written, and the link is gone on the next open.
   */
  describe('a link is a reason to rewrite an entry', () => {
    const poi = { id: 'ford', name: 'The Ford', kind: 'settlement' };
    const other = { id: 'mill', name: 'The Mill', kind: 'settlement' };
    const doc = { ...MINIMAL, world: { ...(MINIMAL['world'] as object), pointsOfInterest: [poi, other] } };
    const prefab: Prefab = {
      id: 'inn',
      collection: 'world.pointsOfInterest',
      params: [{ key: 'id', kind: 'string' }, { key: 'name', kind: 'string' }],
      template: { id: '{{id}}', name: '{{name}}', kind: 'settlement' },
    };
    const link = (id: string, name: string) => ({ id: 'inn', params: { id, name } });
    const linked = (instances: InstanceMap) => ({ ...NO_AUTHORING, prefabs: [prefab], instances });

    it('writes the entry when it is linked to a prefab that did not change', () => {
      const before = linked({ 'world.pointsOfInterest': { ford: link('ford', 'The Ford') } });
      const { snapshot, first } = stored(doc, before);

      // The prefab is already stored and untouched. Only the second entry's link appears.
      const after = linked({
        'world.pointsOfInterest': { ford: link('ford', 'The Ford'), mill: link('mill', 'The Mill') },
      });
      const { change } = diffProject({ doc, authoring: after }, snapshot);
      expect(paths(change)).toEqual(['project/world/pointsOfInterest/mill.json']);

      const back = unbundleModule({ ...first.change.put, ...change.put });
      expect(back.issues).toEqual([]);
      expect(Object.keys(back.authoring.instances['world.pointsOfInterest'] ?? {}).sort())
        .toEqual(['ford', 'mill']);
    });

    it('writes the entry back as a literal when the link is removed', () => {
      const { snapshot, first } = stored(doc, linked({ 'world.pointsOfInterest': { ford: link('ford', 'The Ford') } }));

      const { change } = diffProject({ doc, authoring: linked({}) }, snapshot);
      expect(paths(change)).toEqual(['project/world/pointsOfInterest/ford.json']);

      const back = unbundleModule({ ...first.change.put, ...change.put });
      expect(back.authoring.instances).toEqual({});
      expect((back.document!['world'] as Record<string, unknown[]>)['pointsOfInterest']).toEqual([poi, other]);
    });

    it('writes nothing when the link map is rebuilt with the same values', () => {
      const instances = { 'world.pointsOfInterest': { ford: link('ford', 'The Ford') } };
      const { snapshot } = stored(doc, linked(instances));

      // `recomputeInstances` returns a brand-new map with brand-new link objects on every save, so
      // this is the ordinary case. Compared by reference, every linked entry in the world would be
      // rewritten every time.
      const rebuilt = linked({ 'world.pointsOfInterest': { ford: link('ford', 'The Ford') } });
      const { change } = diffProject({ doc, authoring: rebuilt }, snapshot);
      expect(paths(change)).toEqual([]);
      expect(change.remove).toEqual([]);
    });
  });

  /**
   * `literal` was maintained on every save and read by nothing: the sidecar it describes was never
   * emitted, so a link whose entry could not be written as a recipe was lost on the next open.
   */
  it('carries a link its entry file cannot express', () => {
    const poi = { id: 'ford', name: 'The Ford', kind: 'landmark' };
    const doc = { ...MINIMAL, world: { ...(MINIMAL['world'] as object), pointsOfInterest: [poi] } };
    // The template cannot produce `kind: landmark` from these params, and an override cannot remove
    // a key, so the file has to be literal.
    const prefab: Prefab = {
      id: 'inn',
      collection: 'world.pointsOfInterest',
      params: [{ key: 'id', kind: 'string' }],
      template: { id: '{{id}}', name: 'The Ford', kind: 'settlement', tags: ['inn'] },
    };
    const authoring = {
      ...NO_AUTHORING,
      prefabs: [prefab],
      instances: { 'world.pointsOfInterest': { ford: { id: 'inn', params: { id: 'ford' } } } },
    };

    const { first } = stored(doc, authoring);
    // The point: the entry could not be a recipe, so the sidecar is the only place its link exists.
    expect(paths(first.change)).toContain('project/prefabs/instances.json');
    const back = unbundleModule(first.change.put);
    expect(back.issues).toEqual([]);
    expect((back.document!['world'] as Record<string, unknown[]>)['pointsOfInterest']).toEqual([poi]);
    expect(back.authoring.instances).toEqual(authoring.instances);
  });
});
