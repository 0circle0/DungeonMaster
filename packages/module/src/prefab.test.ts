/**
 * Prefabs, measured against the thing they have to replace.
 *
 * `place.py`'s `inn()` is one line over four lookup tables, and an author
 * writing four strings gets an eleven-key point of interest. If a prefab cannot
 * do that, it is a worse way to fill in a form. So the fixture here is that
 * shorthand, expressed as a template, and the tests ask whether it produces
 * what the Python produces.
 */

import { describe, it, expect } from 'vitest';
import {
  expandPrefab,
  reexpand,
  overriddenPaths,
  linkFor,
  checkParams,
  derivePrefab,
} from './prefab.js';
import type { Prefab, StyleTables, InstanceMap, PrefabLink } from './prefab.js';

/** The four tables `place.py` keeps, as a project would hold them. */
const STYLE: StyleTables = {
  roomSizes: {
    small: { width: '9', height: '7' },
    medium: { width: '11', height: '9' },
    large: { width: '15', height: '11' },
  },
  tradePalette: { inn: 'int_timber', smithy: 'int_forge', temple: 'int_temple' },
  kindPool: { settlement: 'generic_settlement', market: 'generic_market' },
};

/** `place.py`'s `inn()`: kind, minutes, trade, size, desc key and services fixed. */
const INN: Prefab = {
  id: 'inn',
  label: 'Inn',
  collection: 'world.pointsOfInterest',
  params: [
    { key: 'id', kind: 'id', required: true },
    { key: 'name', kind: 'string', required: true },
    { key: 'area', kind: 'ref', target: 'world.areas', required: true },
    { key: 'description', kind: 'text', required: true },
    { key: 'size', kind: 'enum', options: ['small', 'medium', 'large'], default: 'medium' },
    { key: 'trade', kind: 'string', default: 'inn' },
  ],
  template: {
    id: '{{id}}',
    name: '{{name}}',
    area: '{{area}}',
    kind: 'settlement',
    description: '{{description}}',
    descriptionKey: 'int_inn',
    travelMinutes: 3,
    services: ['inn'],
    tags: ['inn'],
    // The interior exists only when there is a trade to give it a palette —
    // `poi()` drops `footprint` the same way, making a place you stand *at*.
    map: {
      '@when': 'trade',
      then: {
        '@lookup': ['roomSizes', '{{size}}'],
      },
    },
    palette: { '@when': 'trade', then: { '@lookup': ['tradePalette', '{{trade}}'] } },
  },
};

const FOUR_STRINGS = {
  id: 'barrowgate_rest',
  name: 'The Rest',
  area: 'moor_barrowgate',
  description: 'Four rooms over a taproom, and the taproom is the reason.',
};

describe('expandPrefab', () => {
  it('turns four strings into a whole entry', () => {
    const { entry, issues } = expandPrefab(INN, FOUR_STRINGS, STYLE);
    expect(issues).toEqual([]);
    expect(entry).toEqual({
      id: 'barrowgate_rest',
      name: 'The Rest',
      area: 'moor_barrowgate',
      kind: 'settlement',
      description: 'Four rooms over a taproom, and the taproom is the reason.',
      descriptionKey: 'int_inn',
      travelMinutes: 3,
      services: ['inn'],
      tags: ['inn'],
      map: { width: '11', height: '9' },
      palette: 'int_timber',
    });
  });

  it('uses a default the author did not supply', () => {
    const big = expandPrefab(INN, { ...FOUR_STRINGS, size: 'large' }, STYLE);
    expect(big.entry['map']).toEqual({ width: '15', height: '11' });
  });

  /**
   * The `interior and trade` rule: without a trade there is no palette and no
   * footprint, and the keys are *absent* rather than null — a null would reach
   * the schema and the content hash.
   */
  it('omits a key rather than nulling it', () => {
    const { entry } = expandPrefab(INN, { ...FOUR_STRINGS, trade: '' }, STYLE);
    expect('map' in entry).toBe(false);
    expect('palette' in entry).toBe(false);
  });

  it('keeps a parameter its own type when the whole string is the placeholder', () => {
    const prefab: Prefab = {
      id: 'p', collection: 'content.monsters',
      params: [{ key: 'level', kind: 'number' }, { key: 'tags', kind: 'string' }],
      template: { level: '{{level}}', tags: '{{tags}}', label: 'level {{level}}' },
    };
    const { entry } = expandPrefab(prefab, { level: 7, tags: ['a', 'b'] });
    expect(entry['level']).toBe(7);
    expect(entry['tags']).toEqual(['a', 'b']);
    // Interpolated into a sentence it is text, which is the other thing wanted.
    expect(entry['label']).toBe('level 7');
  });

  it('says what is missing rather than guessing', () => {
    const { issues } = expandPrefab(INN, { id: 'x' }, STYLE);
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['name', 'area', 'description']));
  });

  it('rejects an id the grammar does not allow', () => {
    expect(checkParams(INN, { ...FOUR_STRINGS, id: 'Not An Id' }).map((i) => i.path)).toContain('id');
  });

  it('rejects an enum value that is not offered', () => {
    expect(checkParams(INN, { ...FOUR_STRINGS, size: 'enormous' })[0]?.message).toMatch(/not one of/);
  });

  it('names a lookup that is not in the tables', () => {
    const { issues } = expandPrefab(INN, { ...FOUR_STRINGS, trade: 'glassblower' }, STYLE);
    expect(issues[0]?.message).toMatch(/tradePalette\["glassblower"\] is not in the style tables/);
  });
});

describe('instances', () => {
  const place = (params: Record<string, unknown>, overrides: string[] = []) => {
    const { entry } = expandPrefab(INN, params, STYLE);
    const link: PrefabLink = { id: 'inn', params, overrides };
    return { entry, link };
  };

  /**
   * The link lives beside the entries, not in one. Every collection schema is
   * `.strict()`, so a `$prefab` key on a point of interest is a validation
   * error — and the studio validates exactly the document it is editing.
   */
  it('keeps the entry itself something the schema accepts', () => {
    const { entry } = place(FOUR_STRINGS);
    expect(Object.keys(entry).some((k) => k.startsWith('$'))).toBe(false);
  });

  it('finds the link for an entry, and nothing for one nobody generated', () => {
    const instances: InstanceMap = {
      'world.pointsOfInterest': { barrowgate_rest: { id: 'inn', params: FOUR_STRINGS } },
    };
    expect(linkFor(instances, 'world.pointsOfInterest', 'barrowgate_rest')?.id).toBe('inn');
    expect(linkFor(instances, 'world.pointsOfInterest', 'one_off')).toBeNull();
    expect(linkFor(instances, 'content.monsters', 'barrowgate_rest')).toBeNull();
  });

  /** The first half of the promise: change the prefab, change every instance. */
  it('follows the prefab when the prefab changes', () => {
    const { entry, link } = place(FOUR_STRINGS);
    const changed: Prefab = {
      ...INN,
      template: { ...(INN.template as object), travelMinutes: 5, descriptionKey: 'int_taproom' },
    };
    const next = reexpand(changed, entry, link, STYLE).entry;
    expect(next['travelMinutes']).toBe(5);
    expect(next['descriptionKey']).toBe('int_taproom');
  });

  /** The other half: the one you tuned stays tuned. */
  it('leaves an overridden field alone', () => {
    const { entry, link } = place(FOUR_STRINGS, ['travelMinutes', 'map.width']);
    entry['travelMinutes'] = 12;
    (entry['map'] as Record<string, unknown>)['width'] = '21';

    const changed: Prefab = { ...INN, template: { ...(INN.template as object), travelMinutes: 5 } };
    const next = reexpand(changed, entry, link, STYLE).entry;

    expect(next['travelMinutes'], 'overridden, so the prefab does not win').toBe(12);
    expect(next['map']).toEqual({ width: '21', height: '9' });
    // And everything not overridden did follow.
    expect(next['descriptionKey']).toBe('int_inn');
  });

  it('finds what a person changed by hand', () => {
    const { entry, link } = place(FOUR_STRINGS);
    entry['travelMinutes'] = 12;
    entry['name'] = 'The Rest & Be Thankful';
    expect([...overriddenPaths(INN, entry, link, STYLE)].sort()).toEqual(['name', 'travelMinutes']);
  });

  it('finds nothing when an instance still matches its prefab', () => {
    const { entry, link } = place(FOUR_STRINGS);
    expect(overriddenPaths(INN, entry, link, STYLE)).toEqual([]);
  });

  /**
   * Copying a prefab and changing the copy must not reach the original — the
   * ordinary expectation from every engine that has ever had prefabs.
   */
  it('does not let a copied prefab reach the one it came from', () => {
    const copy: Prefab = { ...INN, id: 'roadhouse', template: { ...(INN.template as object), travelMinutes: 9 } };
    const { entry, link } = place(FOUR_STRINGS);
    const copiedLink: PrefabLink = { id: 'roadhouse', params: FOUR_STRINGS, overrides: [] };

    expect(reexpand(copy, entry, copiedLink, STYLE).entry['travelMinutes']).toBe(9);
    expect(reexpand(INN, entry, link, STYLE).entry['travelMinutes']).toBe(3);
  });
});

/**
 * Nobody designs a template first. They build one place, get it right, and then
 * want thirty more like it — so the entry is the specification, and a prefab
 * derived from it has to expand back to exactly that entry. Linking the
 * original is the same as replacing it with the expansion, so anything less
 * than exact would silently edit the thing it was derived from.
 */
describe('derivePrefab', () => {
  const entry = {
    id: 'millford_village',
    name: 'Millford Village',
    area: 'millford',
    kind: 'settlement',
    services: ['inn', 'market'],
    rumourReach: 1.5,
    position: { x: 6, y: 6 },
  };

  it('expands back to the entry it came from', () => {
    const { prefab, params } = derivePrefab(entry, 'world.pointsOfInterest', 'settlement');
    expect(expandPrefab(prefab, params).entry).toEqual(entry);
  });

  it('parameterises what is this thing, and keeps what is this kind of thing', () => {
    const { prefab } = derivePrefab(entry, 'world.pointsOfInterest', 'settlement');
    expect(prefab.params.map((p) => p.key)).toEqual(['id', 'name']);
    // The pattern stays literal — that is the part worth reusing.
    expect((prefab.template as Record<string, unknown>)['services']).toEqual(['inn', 'market']);
    expect((prefab.template as Record<string, unknown>)['kind']).toBe('settlement');
  });

  it('takes a different set of fields when asked', () => {
    const { prefab, params } = derivePrefab(entry, 'world.pointsOfInterest', 'settlement', [
      'id',
      'name',
      'area',
      'rumourReach',
    ]);
    expect(prefab.params.map((p) => p.key)).toEqual(['id', 'name', 'area', 'rumourReach']);
    expect(params['rumourReach']).toBe(1.5);
    // Still exact: a number parameter comes back a number, not its digits.
    expect(expandPrefab(prefab, params).entry).toEqual(entry);
  });

  it('leaves a field it cannot parameterise alone', () => {
    // `position` is an object; making it a placeholder would stringify it.
    const { prefab } = derivePrefab(entry, 'world.pointsOfInterest', 'settlement', ['id', 'position']);
    expect(prefab.params.map((p) => p.key)).toEqual(['id']);
    expect((prefab.template as Record<string, unknown>)['position']).toEqual({ x: 6, y: 6 });
  });

  it('links the original without changing it', () => {
    const { prefab, params } = derivePrefab(entry, 'world.pointsOfInterest', 'settlement');
    const link = { id: 'settlement', params, overrides: [] };
    expect(overriddenPaths(prefab, entry, link)).toEqual([]);
    expect(reexpand(prefab, entry, link).entry).toEqual(entry);
  });
});
