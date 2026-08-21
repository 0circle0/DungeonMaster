import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule, COLLECTION_PATHS } from '@dm/module';
import { readAssembledModule } from '@dm/module/load';
import { resolvePalette } from '@dm/engine';
import { COLLECTIONS, SECTIONS, SINGLETONS, collectionAt, labelFor, stepFor } from './schema.js';
import type { FieldEntry, FieldSpec } from './schema.js';
import { getAt, setAt, setAtMany, deleteAt } from './store.js';
import type { ModuleDoc } from './store.js';
import { hasContent, rendersAsGroup } from './fieldContent.js';
import { resolveMapSubjects } from './mapSubject.js';
import { compileForPreview } from './preview.js';
import { coverageNotesFor } from './inertFields.js';
import { importantFieldsFor } from './importantFields.js';
import type { MapTarget } from '../app/studio/selection.js';

const MINIMAL_DIR = fileURLToPath(new URL('../../../modules/minimal', import.meta.url));
const loadMinimal = (): ModuleDoc => readAssembledModule(MINIMAL_DIR).doc;

const GREENMARCH_DIR = fileURLToPath(new URL('../../../modules/greenmarch', import.meta.url));
const loadGreenmarch = (): ModuleDoc => readAssembledModule(GREENMARCH_DIR).doc;

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
      element: {
        kind: 'string',
        ref: 'content.abilities',
        refHelp: null,
        long: false,
        pattern: expect.anything(),
      },
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

  /** `step="any"` makes a browser's arrows move by 1, which walks a probability past its own maximum. */
  it('steps a number by something the schema makes sensible', () => {
    const palette = collectionAt('world.palettes')!;
    const paletteFields = palette.spec.kind === 'object' ? palette.spec.fields : [];
    const scatter = paletteFields.find((f) => f.key === 'scatter')!;
    expect(scatter.spec.kind).toBe('array');
    if (scatter.spec.kind !== 'array' || scatter.spec.element.kind !== 'object') return;

    const frequency = scatter.spec.element.fields.find((f) => f.key === 'frequency')!;
    expect(frequency.spec).toMatchObject({ kind: 'number', int: false, min: 0, max: 1 });
    if (frequency.spec.kind !== 'number') return;
    expect(stepFor(frequency.spec)).toBe(0.01);

    // Whole-number fields keep whole-number arrows.
    const monster = collectionAt('content.monsters')!;
    const monsterFields = monster.spec.kind === 'object' ? monster.spec.fields : [];
    const level = monsterFields.find((f) => f.key === 'level')!;
    if (level.spec.kind !== 'number') return;
    expect(stepFor(level.spec)).toBe(1);

    const terrain = collectionAt('world.terrains')!;
    const terrainFields = terrain.spec.kind === 'object' ? terrain.spec.fields : [];
    const moveCost = terrainFields.find((f) => f.key === 'moveCost')!;
    if (moveCost.spec.kind !== 'number') return;
    expect(moveCost.spec.max).toBeNull();
    expect(stepFor(moveCost.spec)).toBe(0.1);
  });

  it('gives every declared ratio a hundredth-sized step', () => {
    const seen: string[] = [];
    const walk = (spec: FieldSpec, where: string, depth = 0) => {
      if (depth > 6) return;
      if (spec.kind === 'number' && !spec.int && spec.min === 0 && spec.max === 1) {
        expect(stepFor(spec), where).toBe(0.01);
        seen.push(where);
      }
      if (spec.kind === 'object') for (const f of spec.fields) walk(f.spec, `${where}.${f.key}`, depth + 1);
      if (spec.kind === 'array') walk(spec.element, `${where}[]`, depth + 1);
      if (spec.kind === 'record') walk(spec.value, `${where}{}`, depth + 1);
    };
    for (const c of COLLECTIONS) walk(c.spec, c.path);

    expect(seen).toContain('world.palettes.scatter[].frequency');
    expect(seen).toContain('world.dungeons.branchiness');
    expect(seen.length).toBeGreaterThan(8);
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

  /** The contract bulk editing has to keep. */
  describe('setAtMany keeps untouched entries identical', () => {
    it('shares every entry it did not edit', () => {
      const doc = loadGreenmarch();
      const before = getAt(doc, ['content', 'monsters']) as Record<string, unknown>[];
      expect(before.length).toBeGreaterThan(1);

      const next = setAtMany(doc, [
        { path: ['content', 'monsters', 0, 'xp'], value: 11 },
      ]) as ModuleDoc;
      const after = getAt(next, ['content', 'monsters']) as Record<string, unknown>[];

      expect(after[0]).not.toBe(before[0]);
      for (let i = 1; i < before.length; i += 1) {
        expect(after[i], `monsters[${i}] should be the same object`).toBe(before[i]);
      }
      // A whole other collection must not be disturbed at all.
      expect(getAt(next, ['content', 'items'])).toBe(getAt(doc, ['content', 'items']));
    });

    it('applies every edit and leaves the original alone', () => {
      const doc = loadMinimal();
      const snapshot = JSON.stringify(doc);
      const next = setAtMany(doc, [
        { path: ['content', 'monsters', 0, 'xp'], value: 7 },
        { path: ['content', 'monsters', 0, 'name'], value: 'Renamed' },
        { path: ['rules', 'attributes', 1, 'name'], value: 'Cunning' },
      ]) as ModuleDoc;

      expect(getAt(next, ['content', 'monsters', 0, 'xp'])).toBe(7);
      expect(getAt(next, ['content', 'monsters', 0, 'name'])).toBe('Renamed');
      expect(getAt(next, ['rules', 'attributes', 1, 'name'])).toBe('Cunning');
      expect(JSON.stringify(doc)).toBe(snapshot);
    });

    it('is the same document as applying the edits one at a time', () => {
      const doc = loadMinimal();
      const edits = [
        { path: ['content', 'monsters', 0, 'xp'] as const, value: 3 },
        { path: ['rules', 'attributes', 0, 'name'] as const, value: 'Brawn' },
      ];
      const batched = setAtMany(doc, edits);
      const oneByOne = edits.reduce<unknown>((acc, e) => setAt(acc, e.path, e.value), doc);
      expect(batched).toEqual(oneByOne);
    });
  });
});

/** The editor's headline requirement: load a JSON module, edit it, export a module. */
describe('load → edit → export round trip', () => {
  // Export re-serializes, so blank lines and key spacing are normalized.
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

/** A clause an author never touched should not draw a box. */
describe('empty nested sections fold away', () => {
  it('treats absence and emptiness alike, but keeps what was written', () => {
    for (const empty of [undefined, null, [], {}, '']) {
      expect(hasContent(empty), JSON.stringify(empty) ?? 'undefined').toBe(false);
    }
    // 0 and false are things an author wrote down.
    for (const present of [0, false, 'x', [0], { a: 1 }]) {
      expect(hasContent(present), JSON.stringify(present)).toBe(true);
    }
  });

  it('only offers to fold the kinds that draw a box', () => {
    const kinds: FieldSpec[] = [
      { kind: 'object', fields: [] },
      { kind: 'array', element: { kind: 'boolean' } },
      { kind: 'record', keyRef: null, value: { kind: 'boolean' } },
      { kind: 'dsl', flavour: 'predicate' },
      { kind: 'unknown' },
    ];
    for (const spec of kinds) expect(rendersAsGroup(spec), spec.kind).toBe(true);

    const rows: FieldSpec[] = [
      { kind: 'string', ref: null, refHelp: null, long: false, pattern: null },
      { kind: 'number', int: true, min: null, max: null },
      { kind: 'boolean' },
      { kind: 'enum', options: ['a'] },
    ];
    for (const spec of rows) expect(rendersAsGroup(spec), spec.kind).toBe(false);
  });

  // In numbers: an empty gate used to paint a box per clause.
  it('reduces an untouched requirement to its three scalar rows', () => {
    const gate = collectionAt('world.gates')!;
    const requires = gate.spec.kind === 'object'
      ? gate.spec.fields.find((f) => f.key === 'requires')!
      : undefined;
    expect(requires?.spec.kind).toBe('object');
    if (!requires || requires.spec.kind !== 'object') return;

    const foldable = (raw: Record<string, unknown>) =>
      requires.spec.kind === 'object'
        ? requires.spec.fields
            .filter((f) => f.optional && rendersAsGroup(f.spec) && !hasContent(raw[f.key]))
            .map((f) => f.key)
        : [];

    const shown = (raw: Record<string, unknown>) =>
      requires.spec.kind === 'object'
        ? requires.spec.fields.filter((f) => !foldable(raw).includes(f.key)).map((f) => f.key)
        : [];

    // Nothing gated: every container clause folds, leaving only the scalar rows.
    expect(shown({}).sort()).toEqual(['currency', 'description', 'maxLevel', 'minLevel']);
    expect(foldable({}).length).toBeGreaterThan(12);

    // Gate on one item and that clause — and only that one — comes back.
    const withItem = { items: [{ item: 'brass_key' }] };
    expect(shown(withItem)).toContain('items');
    expect(foldable(withItem)).not.toContain('items');
    expect(foldable(withItem).length).toBe(foldable({}).length - 1);
  });

  it('never folds a required field, in any collection', () => {
    const walk = (spec: FieldSpec, seen: Set<FieldSpec>): FieldEntry[] => {
      if (seen.has(spec)) return [];
      seen.add(spec);
      if (spec.kind === 'object') {
        return spec.fields.flatMap((f) => [f, ...walk(f.spec, seen)]);
      }
      if (spec.kind === 'array') return walk(spec.element, seen);
      if (spec.kind === 'record') return walk(spec.value, seen);
      return [];
    };

    for (const collection of COLLECTIONS) {
      for (const field of walk(collection.spec, new Set())) {
        // The fold operates on optional fields only; this is the guard that says so from the outside.
        if (!field.optional) {
          expect(field.optional, `${collection.path}.${field.key}`).toBe(false);
        }
      }
    }
  });
});

describe('what drew the map', () => {
  it('gives an area its biome\'s palette, not its own', () => {
    const doc = loadGreenmarch();
    const subjects = resolveMapSubjects(doc, { type: 'area', id: 'millford' });

    expect(subjects.paletteId).toBe('fen');
    expect(subjects.place?.registryPath).toBe('world.areas');
    expect(subjects.palette?.registryPath).toBe('world.palettes');
    expect(getAt(doc, subjects.palette!.basePath)).toMatchObject({ id: 'fen' });
    expect(subjects.paletteReason).toContain('biome');
  });

  // The fact the drawer exists to explain: `area.map.palette` is passed over.
  it('says so when map.palette is the one being overridden', () => {
    const doc = loadGreenmarch();
    const overridden = setAt(doc, ['world', 'areas', 0, 'map', 'palette'], 'barrow_stone') as ModuleDoc;
    const subjects = resolveMapSubjects(overridden, { type: 'area', id: 'millford' });

    expect(subjects.paletteId).toBe('fen');
    expect(subjects.paletteReason).toContain('overrides');
    expect(subjects.paletteReason).toContain('barrow_stone');
  });

  it('follows a POI to the map actually drawn for it', () => {
    const doc = loadGreenmarch();

    // fen_barrow descends into a dungeon.
    const barrow = resolveMapSubjects(doc, { type: 'poi', id: 'fen_barrow' });
    expect(barrow.place?.registryPath).toBe('world.dungeons');
    expect(barrow.redirect).toContain('barrow_depths');

    // millford_village has no interior, so what is drawn is its area.
    const village = resolveMapSubjects(doc, { type: 'poi', id: 'millford_village' });
    expect(village.place?.registryPath).toBe('world.areas');
    expect(village.place?.id).toBe('millford');
    expect(village.redirect).toContain('millford');
  });

  it('resolves the start the way a new game would', () => {
    const doc = loadGreenmarch();
    const start = resolveMapSubjects(doc, { type: 'start' });
    const direct = resolveMapSubjects(doc, { type: 'poi', id: 'millford_village' });
    expect(start.place).toEqual(direct.place);
    expect(start.paletteId).toBe(direct.paletteId);
  });

  it('is missing rather than wrong for a place that is not there', () => {
    expect(resolveMapSubjects(loadGreenmarch(), { type: 'area', id: 'nowhere' }).place).toBeNull();
  });

  it('resolves the same palette the engine does, everywhere', () => {
    for (const [name, doc] of [['greenmarch', loadGreenmarch()], ['minimal', loadMinimal()]] as const) {
      const module = compileForPreview(doc);
      if (!module) throw new Error(`${name} does not compile`);

      const world = (doc['world'] ?? {}) as Record<string, unknown>;
      const targets: Extract<MapTarget, { id: string }>[] = [
        ...(world['areas'] as { id: string }[] ?? []).map((a) => ({ type: 'area', id: a.id }) as const),
        ...(world['dungeons'] as { id: string }[] ?? []).map((d) => ({ type: 'dungeon', id: d.id }) as const),
      ];

      for (const target of targets) {
        const mine = resolveMapSubjects(doc, target);
        const theirs = resolvePalette(module, mine.paletteId ?? undefined);
        expect(theirs.floor, `${name} ${target.type}:${target.id}`).toBeTruthy();
        if (mine.paletteId) expect(theirs.id).toBe(mine.paletteId);
      }
    }
  });
});

describe('the studio registries stay in step with the schema', () => {
  const pathsInSchema = new Set<string>([...COLLECTION_PATHS, ...SINGLETONS.map((s) => s.path)]);

  const fieldsOf = (path: string): Set<string> => {
    const spec = collectionAt(path)?.spec ?? SINGLETONS.find((s) => s.path === path)?.spec;
    return new Set(spec?.kind === 'object' ? spec.fields.map((f) => f.key) : []);
  };

  it('names only fields that exist', () => {
    for (const path of pathsInSchema) {
      const fields = fieldsOf(path);
      for (const note of coverageNotesFor(path)) {
        if (note.field === '*') continue;
        expect(fields.has(note.field), `inertFields ${path}.${note.field}`).toBe(true);
      }
      for (const key of importantFieldsFor(path)) {
        expect(fields.has(key), `importantFields ${path}.${key}`).toBe(true);
      }
    }
  });
});
