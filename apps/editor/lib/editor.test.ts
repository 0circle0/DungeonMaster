import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileModule, COLLECTION_PATHS } from '@dm/module';
import { COLLECTIONS, SECTIONS, SINGLETONS, collectionAt, labelFor } from './schema.js';
import { getAt, setAt, deleteAt } from './store.js';
import type { ModuleDoc } from './store.js';

const MINIMAL_PATH = fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url));
const RAW = readFileSync(MINIMAL_PATH, 'utf8');
const loadMinimal = () => JSON.parse(RAW) as ModuleDoc;

describe('schema-driven navigation', () => {
  // The editor's coverage claim: every collection in the format is reachable.
  it('exposes every collection the module format defines', () => {
    expect(COLLECTIONS.map((c) => c.path).sort()).toEqual([...COLLECTION_PATHS].sort());
  });

  it('groups collections under the four sections, leaving none orphaned', () => {
    const grouped = SECTIONS.flatMap((s) => s.collections.map((c) => c.path));
    expect(grouped.sort()).toEqual([...COLLECTION_PATHS].sort());
  });

  it('derives a form spec for every collection', () => {
    for (const collection of COLLECTIONS) {
      expect(collection.spec.kind, `${collection.path} should be an object form`).toBe('object');
      if (collection.spec.kind !== 'object') continue;
      expect(collection.spec.fields.length, `${collection.path} has no fields`).toBeGreaterThan(0);
      // Every entry is addressed by id, so the list pane always has a label.
      expect(collection.spec.fields.some((f) => f.key === 'id')).toBe(true);
    }
  });

  it('exposes the singleton sections that are not lists', () => {
    expect(SINGLETONS.map((s) => s.path)).toContain('start');
    expect(SINGLETONS.map((s) => s.path)).toContain('rules.resolution');
  });
});

describe('describeSchema', () => {
  const monster = collectionAt('content.monsters')!;
  const fields = monster.spec.kind === 'object' ? monster.spec.fields : [];
  const field = (key: string) => fields.find((f) => f.key === key)!;

  // Turning ref markers into dropdowns is what makes dangling references
  // nearly unauthorable, so it has to survive schema changes.
  it('marks reference fields with their target collection', () => {
    expect(field('loot').spec).toMatchObject({ kind: 'string', ref: 'content.lootTables' });
    expect(field('faction').spec).toMatchObject({ kind: 'string', ref: 'content.factions' });
  });

  it('marks reference-keyed records', () => {
    expect(field('attributes').spec).toMatchObject({ kind: 'record', keyRef: 'rules.attributes' });
  });

  it('marks arrays of references', () => {
    expect(field('abilities').spec).toEqual({
      kind: 'array',
      element: { kind: 'string', ref: 'content.abilities', long: false, pattern: expect.anything() },
    });
  });

  it('recognises numbers with their bounds', () => {
    expect(field('level').spec).toMatchObject({ kind: 'number', int: true, min: 0 });
  });

  it('routes DSL fields to the JSON editor with the right flavour', () => {
    const ability = collectionAt('content.abilities')!;
    const abilityFields = ability.spec.kind === 'object' ? ability.spec.fields : [];
    const onUse = abilityFields.find((f) => f.key === 'onUse')!;
    expect(onUse.spec).toMatchObject({ kind: 'array', element: { kind: 'dsl', flavour: 'effect' } });

    // The raw-predicate escape hatch is still a JSON field.
    const when = abilityFields.find((f) => f.key === 'when')!;
    expect(when.spec).toMatchObject({ kind: 'dsl', flavour: 'predicate' });
  });

  // Gating is structured rather than raw predicate JSON, so the editor renders
  // a real form for it — dropdowns of quests, items, skills and factions.
  it('renders requirements as a structured gate form, not JSON', () => {
    const ability = collectionAt('content.abilities')!;
    const abilityFields = ability.spec.kind === 'object' ? ability.spec.fields : [];
    const requires = abilityFields.find((f) => f.key === 'requires')!;

    expect(requires.spec.kind).toBe('object');
    if (requires.spec.kind !== 'object') return;

    const keys = requires.spec.fields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(['minLevel', 'skills', 'items', 'quests', 'factions', 'memories', 'without', 'anyOf']),
    );

    // Each clause list points at a real collection, so it becomes a dropdown.
    const items = requires.spec.fields.find((f) => f.key === 'items')!;
    expect(items.spec.kind).toBe('array');
    if (items.spec.kind !== 'array' || items.spec.element.kind !== 'object') return;
    const itemRef = items.spec.element.fields.find((f) => f.key === 'item')!;
    expect(itemRef.spec).toMatchObject({ kind: 'string', ref: 'content.items' });
  });

  it('recognises enums', () => {
    const item = collectionAt('content.items')!;
    const itemFields = item.spec.kind === 'object' ? item.spec.fields : [];
    const kind = itemFields.find((f) => f.key === 'kind')!;
    expect(kind.spec.kind).toBe('enum');
    if (kind.spec.kind === 'enum') expect(kind.spec.options).toContain('weapon');
  });

  it('separates optional fields from required ones', () => {
    expect(field('id').optional).toBe(false);
    expect(field('loot').optional).toBe(true);
  });

  it('humanises keys for labels', () => {
    expect(labelFor('lootTables')).toBe('Loot Tables');
    expect(labelFor('restoreOnLongRest')).toBe('Restore On Long Rest');
  });
});

describe('immutable editing', () => {
  it('reads nested paths', () => {
    const doc = loadMinimal();
    expect(getAt(doc, ['content', 'monsters', 0, 'name'])).toBe('Husk');
    expect(getAt(doc, ['nope', 'missing'])).toBeUndefined();
  });

  it('sets without mutating the original', () => {
    const doc = loadMinimal();
    const before = JSON.stringify(doc);
    const next = setAt(doc, ['content', 'monsters', 0, 'xp'], 99) as ModuleDoc;

    expect(getAt(next, ['content', 'monsters', 0, 'xp'])).toBe(99);
    expect(JSON.stringify(doc)).toBe(before);
    // Untouched siblings survive.
    expect(getAt(next, ['content', 'monsters', 0, 'name'])).toBe('Husk');
    expect(getAt(next, ['rules', 'attributes', 0, 'id'])).toBe('vigor');
  });

  it('creates intermediate containers of the right type', () => {
    const built = setAt({}, ['a', 'b', 0, 'c'], 1) as Record<string, unknown>;
    expect(built).toEqual({ a: { b: [{ c: 1 }] } });
  });

  it('deletes keys and splices array entries', () => {
    const doc = loadMinimal();
    const withoutLoot = deleteAt(doc, ['content', 'monsters', 0, 'loot']) as ModuleDoc;
    expect(getAt(withoutLoot, ['content', 'monsters', 0, 'loot'])).toBeUndefined();

    const spliced = deleteAt(doc, ['rules', 'attributes', 0]) as ModuleDoc;
    expect((getAt(spliced, ['rules', 'attributes']) as unknown[]).length).toBe(1);
    expect(getAt(spliced, ['rules', 'attributes', 0, 'id'])).toBe('wits');
  });
});

/**
 * The editor's headline requirement: load a JSON module, edit it, export a
 * module. Export must be the authored document, not a compiled expansion —
 * otherwise every save would bloat the file with schema defaults.
 */
describe('load → edit → export round trip', () => {
  // Export re-serializes, so blank lines and key spacing are normalized. What
  // must survive exactly is the content: no field added, dropped, or reordered.
  it('exports the same content when nothing was edited', () => {
    const doc = loadMinimal();
    const exported = JSON.parse(`${JSON.stringify(doc, null, 2)}\n`) as ModuleDoc;
    expect(exported).toEqual(loadMinimal());
    expect(Object.keys(exported)).toEqual(Object.keys(loadMinimal()));
  });

  it('keeps the exported document free of injected schema defaults', () => {
    const doc = loadMinimal();
    const edited = setAt(doc, ['content', 'monsters', 0, 'xp'], 42) as ModuleDoc;

    const compiled = compileModule(edited);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    // The compiler fills `stackable`; the authored document must not gain it.
    expect(compiled.module.get<{ stackable: boolean }>('content.items', 'cudgel').stackable).toBe(false);
    expect(getAt(edited, ['content', 'items', 0, 'stackable'])).toBeUndefined();
  });

  it('an edited module still compiles and reflects the edit', () => {
    const doc = loadMinimal();
    const edited = setAt(doc, ['content', 'monsters', 0, 'xp'], 42) as ModuleDoc;
    const compiled = compileModule(edited);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.module.get<{ xp: number }>('content.monsters', 'husk').xp).toBe(42);
  });

  it('surfaces a dangling reference the moment it is introduced', () => {
    const doc = loadMinimal();
    const broken = setAt(doc, ['content', 'monsters', 0, 'loot'], 'ghost_table') as ModuleDoc;

    const result = compileModule(broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('dangling_ref');
    // The path is what the problems panel shows and navigates by.
    expect(result.errors[0].path).toBe('content.monsters[0].loot');
  });

  it('adding a new entry through the editor produces something that compiles', () => {
    const doc = loadMinimal();
    const monsters = getAt(doc, ['content', 'monsters']) as unknown[];
    const added = setAt(doc, ['content', 'monsters', monsters.length], {
      id: 'new_monster',
      name: 'Untitled',
      attributes: { vigor: 5, wits: 5 },
    }) as ModuleDoc;

    const result = compileModule(added);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.module.has('content.monsters', 'new_monster')).toBe(true);
  });
});
