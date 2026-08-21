/** Renaming an id has to move every reference or none. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '../compile.js';
import { readAssembledModule } from '../load.js';
import { planRename, applyRename } from './rename.js';

/** Assembled, which is what the editor holds: static maps live in folders. */
const load = (name: string): Record<string, unknown> =>
  readAssembledModule(fileURLToPath(new URL(`../../../../modules/${name}`, import.meta.url))).doc;

/** Every id in a collection, for checking one moved and the rest did not. */
const ids = (doc: unknown, collection: string): string[] => {
  const [section, name] = collection.split('.') as [string, string];
  const list = ((doc as Record<string, Record<string, unknown>>)[section] ?? {})[name];
  return Array.isArray(list) ? list.map((e) => (e as { id: string }).id) : [];
};

describe('planRename', () => {
  it('refuses a name the id grammar does not allow', () => {
    const doc = load('greenmarch');
    const plan = planRename(doc, 'content.monsters', ids(doc, 'content.monsters')[0]!, 'Not An Id');
    expect(plan.problems.join(' ')).toMatch(/not a valid id/);
    expect(plan.edits).toEqual([]);
  });

  it('refuses a name already taken', () => {
    const doc = load('greenmarch');
    const [first, second] = ids(doc, 'content.monsters');
    const plan = planRename(doc, 'content.monsters', first!, second!);
    expect(plan.problems.join(' ')).toMatch(/already has an entry/);
  });

  it('refuses to rename something that is not there', () => {
    const doc = load('greenmarch');
    expect(planRename(doc, 'content.monsters', 'no_such_thing', 'fine').problems.length).toBe(1);
  });

  it('always renames the entry itself', () => {
    const doc = load('greenmarch');
    const from = ids(doc, 'content.items')[0]!;
    const plan = planRename(doc, 'content.items', from, 'renamed_thing');
    expect(plan.edits.some((e) => e.path.endsWith('.id') && e.kind === 'value')).toBe(true);
  });
});

describe('applyRename', () => {
  it('moves one id and leaves the rest of the collection alone', () => {
    const doc = load('greenmarch');
    const before = ids(doc, 'content.items');
    const from = before[0]!;

    const plan = planRename(doc, 'content.items', from, 'renamed_thing');
    const next = applyRename(doc, plan);
    const after = ids(next, 'content.items');

    expect(after[0]).toBe('renamed_thing');
    expect(after.slice(1)).toEqual(before.slice(1));
    // And the original document is untouched.
    expect(ids(doc, 'content.items')[0]).toBe(from);
  });

  /** After a rename the module must still compile. */
  it.each(['minimal', 'greenmarch', 'aurendel'])(
    'leaves %s compiling cleanly after renaming every monster',
    (name) => {
      let doc: unknown = load(name);
      const originals = ids(doc, 'content.monsters');
      expect(originals.length).toBeGreaterThan(0);

      originals.forEach((from, i) => {
        const plan = planRename(doc, 'content.monsters', from, `renamed_${i}`);
        expect(plan.problems, `${name}: ${from}`).toEqual([]);
        doc = applyRename(doc, plan);
      });

      expect(ids(doc, 'content.monsters')).toEqual(originals.map((_, i) => `renamed_${i}`));
      const compiled = compileModule(doc);
      if (!compiled.ok) {
        expect(compiled.errors.slice(0, 3)).toEqual([]);
      }
      expect(compiled.ok).toBe(true);
    },
  );

  it('follows a reference that lives outside any collection', () => {
    const doc = load('greenmarch');
    const startArea = (doc['start'] as Record<string, unknown>)['startingArea'];
    expect(typeof startArea).toBe('string');

    const plan = planRename(doc, 'world.areas', startArea as string, 'somewhere_else');
    expect(plan.edits.some((e) => e.path === 'start.startingArea')).toBe(true);

    const next = applyRename(doc, plan) as Record<string, Record<string, unknown>>;
    expect(next['start']!['startingArea']).toBe('somewhere_else');
    expect(compileModule(next).ok).toBe(true);
  });

  it('renames a record key rather than writing beside it', () => {
    // A monster's `attributes` is keyed by attribute id.
    const doc = load('greenmarch');
    const attribute = ids(doc, 'rules.attributes')[0]!;
    const plan = planRename(doc, 'rules.attributes', attribute, 'renamed_attr');
    expect(plan.edits.some((e) => e.kind === 'key')).toBe(true);

    const next = applyRename(doc, plan);
    const monsters = (next as Record<string, Record<string, unknown>>)['content']!['monsters'] as
      | Record<string, unknown>[]
      | undefined;
    for (const monster of monsters ?? []) {
      const attrs = monster['attributes'] as Record<string, unknown> | undefined;
      if (!attrs) continue;
      expect(Object.keys(attrs), 'the old key must be gone, not duplicated').not.toContain(attribute);
    }
    expect(compileModule(next).ok).toBe(true);
  });
});

describe('what it will not claim to have fixed', () => {
  it('reports an id used somewhere the schema does not call a reference', () => {
    // Aurendel rather than greenmarch: it is the module with kill objectives.
    const doc = load('aurendel');
    const quests = (doc['narrative'] as Record<string, unknown>)['quests'] as
      | Record<string, unknown>[]
      | undefined;

    // Find a quest objective whose target names a monster.
    const monsters = new Set(ids(doc, 'content.monsters'));
    let targeted: string | null = null;
    for (const quest of quests ?? []) {
      for (const objective of (quest['objectives'] as Record<string, unknown>[] | undefined) ?? []) {
        const target = objective['target'];
        if (typeof target === 'string' && monsters.has(target)) targeted = target;
      }
    }
    expect(targeted, 'a kill objective naming a monster is the case being made').not.toBeNull();

    const plan = planRename(doc, 'content.monsters', targeted!, 'renamed_quarry');
    const mention = plan.mentions.find((m) => m.how === 'exact' && m.path.includes('narrative.quests'));
    expect(mention, 'the objective target must be reported, not silently left behind').toBeDefined();

    // And it really is left behind — a limit, not a bug in the report.
    const next = applyRename(doc, plan);
    expect(compileModule(next).ok).toBe(true);
    expect(JSON.stringify(next)).toContain(`"${targeted}"`);
  });

  it('reports an id embedded in a longer string', () => {
    const doc = load('greenmarch');
    const item = ids(doc, 'content.items')[0]!;
    // Nothing in the plan rewrites these; they exist to be looked at.
    const plan = planRename(doc, 'content.items', item, 'renamed_item');
    for (const mention of plan.mentions) {
      expect(['exact', 'embedded']).toContain(mention.how);
      expect(mention.value).toContain(item);
    }
  });
});
