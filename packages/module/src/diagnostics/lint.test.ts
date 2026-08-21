import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lintModule } from './lint.js';
import { readAssembledModule } from '../load.js';
import { parseJsonWithSource, JsonSyntaxError } from './source.js';
import { editDistance, closest } from './suggest.js';

const GREENMARCH = readFileSync(
  fileURLToPath(new URL('../../../../modules/greenmarch/module.json', import.meta.url)),
  'utf8',
);

const ASSEMBLED = readAssembledModule(
  fileURLToPath(new URL('../../../../modules/greenmarch', import.meta.url)),
).doc;

const MINIMAL = readFileSync(
  fileURLToPath(new URL('../../../../modules/minimal/module.json', import.meta.url)),
  'utf8',
);

const find = (text: string, code: string) =>
  lintModule(text).diagnostics.find((d) => d.code === code);

describe('a valid module', () => {
  it('passes with no errors', () => {
    const result = lintModule(GREENMARCH, { assembled: ASSEMBLED });
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      throw new Error(`unexpected errors:\n${errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
    }
    expect(result.ok).toBe(true);
  });

  it('accepts a dungeon-only module with no areas', () => {
    const result = lintModule(MINIMAL);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      throw new Error(`unexpected errors:\n${errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
    }
    expect(result.ok).toBe(true);
  });
});

describe('start configuration', () => {
  it('errors when no starting location is set', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const start = document['start'] as Record<string, unknown>;
    delete start['startingPoi'];
    delete start['startingArea'];
    delete start['startingDungeon'];
    const diagnostic = find(JSON.stringify(document), 'no_start_location');
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.severity).toBe('error');
    expect(diagnostic!.path).toBe('start');
  });

  it('errors when the world has no areas and no starting dungeon', () => {
    const document = JSON.parse(MINIMAL) as Record<string, unknown>;
    const start = document['start'] as Record<string, unknown>;
    delete start['startingDungeon'];
    const diagnostic = find(JSON.stringify(document), 'empty_world');
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.severity).toBe('error');
  });

  it('suggests the live objective kinds when a removed one is used', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const narrative = document['narrative'] as Record<string, unknown>;
    const quests = narrative['quests'] as Record<string, unknown>[];
    const objectives = quests[0]!['objectives'] as Record<string, unknown>[];
    objectives[0]!['kind'] = 'deliver';
    const diagnostic = find(JSON.stringify(document), 'invalid_value');
    expect(diagnostic).toBeDefined();
  });
});

// "Is a missing { or a fgte instead of gte" — the two cases named directly.
describe('JSON syntax errors', () => {
  it('reports a missing closing brace at the line the object opened', () => {
    const broken = '{\n  "id": "x",\n  "meta": {\n    "title": "T"\n}\n';
    const result = lintModule(broken);

    expect(result.ok).toBe(false);
    const diagnostic = result.diagnostics[0]!;
    expect(diagnostic.code).toBe('json_syntax');
    expect(diagnostic.message).toMatch(/never closed/);
    expect(diagnostic.hint).toMatch(/add a matching \}/);
    expect(diagnostic.position!.line).toBe(1);
  });

  it('reports a trailing comma, which JSON.parse describes uselessly', () => {
    const diagnostic = find('{\n  "a": 1,\n}\n', 'json_syntax')!;
    expect(diagnostic.message).toMatch(/trailing comma/);
    expect(diagnostic.position!.line).toBe(3);
  });

  it('reports single quotes with the fix', () => {
    const diagnostic = find("{\n  'a': 1\n}\n", 'json_syntax')!;
    expect(diagnostic.message).toMatch(/double quotes/);
  });

  it('reports a missing comma between properties', () => {
    const diagnostic = find('{\n  "a": 1\n  "b": 2\n}\n', 'json_syntax')!;
    expect(diagnostic.message).toMatch(/expected "," or "\}"/);
    expect(diagnostic.hint).toMatch(/comma/);
  });

  it('explains that comments are not JSON', () => {
    const diagnostic = find('{\n  // a note\n  "a": 1\n}\n', 'json_syntax')!;
    expect(diagnostic.message).toMatch(/comments are not allowed/);
    expect(diagnostic.position!.line).toBe(2);
  });

  it('reports an unquoted value', () => {
    const diagnostic = find('{\n  "a": hello\n}\n', 'json_syntax')!;
    expect(diagnostic.message).toMatch(/not valid JSON/);
    expect(diagnostic.hint).toMatch(/double quotes/);
  });

  it('prints the offending line with a caret', () => {
    const diagnostic = find('{\n  "a": 1,\n}\n', 'json_syntax')!;
    expect(diagnostic.excerpt).toContain('|');
    expect(diagnostic.excerpt).toContain('^');
  });

  it('reports only the syntax error, since nothing else can run', () => {
    expect(lintModule('{ "a": 1,}').diagnostics).toHaveLength(1);
  });
});

describe('DSL operator typos', () => {
  // The exact example: fgte instead of gte.
  it('catches fgte and suggests gte', () => {
    const document = {
      content: { abilities: [{ id: 'a', name: 'A', when: { fgte: [1, 2] } }] },
    };
    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'dsl_unknown_operator')!;

    expect(diagnostic).toBeDefined();
    expect(diagnostic.message).toContain('"fgte" is not a valid predicate operator');
    expect(diagnostic.hint).toBe('did you mean "gte"?');
    expect(diagnostic.path).toContain('when.fgte');
  });

  it('suggests corrections for effect operators', () => {
    const document = { content: { abilities: [{ id: 'a', onUse: [{ damge: {} }] }] } };
    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'dsl_unknown_operator')!;
    expect(diagnostic.hint).toBe('did you mean "damage"?');
  });

  it('suggests corrections for expression operators', () => {
    const document = { rules: { attributes: [{ id: 'a', modifier: { flor: 1 } }] } };
    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'dsl_unknown_operator')!;
    expect(diagnostic.hint).toBe('did you mean "floor"?');
  });

  it('finds a typo nested several levels deep', () => {
    const document = {
      content: {
        abilities: [
          { id: 'a', onUse: [{ if: { when: true, then: [{ damage: { target: 'x', amount: { mul: [{ rol: '1d6' }, 2] } } }] } }] },
        ],
      },
    };
    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'dsl_unknown_operator')!;
    expect(diagnostic.hint).toBe('did you mean "roll"?');
  });

  it('lists the options when nothing is close enough to guess', () => {
    const document = { content: { abilities: [{ id: 'a', when: { xyzzy: 1 } }] } };
    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'dsl_unknown_operator')!;
    expect(diagnostic.hint).toMatch(/valid predicate operators/);
  });

  it('flags a node carrying two operators', () => {
    const document = { content: { abilities: [{ id: 'a', when: { gte: [1, 2], lte: [3, 4] } }] } };
    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'dsl_ambiguous')!;
    expect(diagnostic.message).toMatch(/more than one operator/);
  });

  it('accepts an operator with its legitimate companion keys', () => {
    const document = {
      rules: {
        attributes: [
          { id: 'a', modifier: { cond: { gte: [{ ref: 'value', else: 0 }, 10] }, then: 1, else: 0 } },
        ],
      },
    };
    expect(lintModule(document).diagnostics.some((d) => d.code === 'dsl_unknown_operator')).toBe(false);
  });
});

describe('misspelled properties', () => {
  it('suggests the correct property name', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const monsters = (document['content'] as Record<string, unknown>)['monsters'] as Record<string, unknown>[];
    monsters[0]!['descriptorz'] = [];

    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'unknown_property')!;
    expect(diagnostic.message).toContain('"descriptorz" is not a recognised property');
    expect(diagnostic.hint).toBe('did you mean "descriptors"?');
  });

  it('reports a missing required property', () => {
    const diagnostic = lintModule({ id: 'x', version: '1.0.0' }).diagnostics.find(
      (d) => d.code === 'missing_property',
    )!;
    expect(diagnostic).toBeDefined();
  });

  it('suggests a valid enum value', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const items = (document['content'] as Record<string, unknown>)['items'] as Record<string, unknown>[];
    items[0]!['kind'] = 'wepon';

    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'invalid_value')!;
    expect(diagnostic.hint).toBe('did you mean "weapon"?');
  });
});

describe('line numbers', () => {
  it('points a schema error at the line it occurs on', () => {
    const broken = GREENMARCH.replace('"id": "bog_hound"', '"id": "bog_hound", "descriptorz": []');
    const diagnostic = find(broken, 'unknown_property')!;

    expect(diagnostic.position).not.toBeNull();
    // The reported line must actually contain the offending text.
    const line = broken.split('\n')[diagnostic.position!.line - 1]!;
    expect(line).toContain('descriptorz');
  });

  it('points a dangling reference at its line and suggests a real id', () => {
    const broken = GREENMARCH.replace('"loot": "fen_scavenge"', '"loot": "fen_scavange"');
    const diagnostic = find(broken, 'dangling_ref')!;

    expect(diagnostic.hint).toBe('did you mean "fen_scavenge"?');
    const line = broken.split('\n')[diagnostic.position!.line - 1]!;
    expect(line).toContain('fen_scavange');
  });
});

describe('semantic checks', () => {
  it('warns about an area nothing connects to', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const world = document['world'] as Record<string, unknown>;
    (world['areas'] as Record<string, unknown>[]).push({
      id: 'lost_vale',
      name: 'Lost Vale',
      biome: 'greenmarch',
      connections: [],
    });

    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'unreachable_area')!;
    expect(diagnostic.message).toContain('lost_vale');
    expect(diagnostic.hint).toMatch(/players will never see it/);
  });

  it('warns about a gate nothing can open', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const world = document['world'] as Record<string, unknown>;
    (world['gates'] as Record<string, unknown>[]).push({ id: 'sealed', name: 'Sealed Door' });

    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'impassable_gate')!;
    expect(diagnostic.hint).toMatch(/unreachable/);
  });

  it('warns about a quest that can never be started', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const narrative = document['narrative'] as Record<string, unknown>;
    (narrative['quests'] as Record<string, unknown>[]).push({
      id: 'orphan_quest',
      name: 'Orphan',
      objectives: [{ id: 'o', kind: 'kill', target: 'bog_hound' }],
      stages: [],
    });

    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'unobtainable_quest')!;
    expect(diagnostic.message).toContain('orphan_quest');
  });

  it('accepts a quest that only a trigger starts', () => {
    // The fifth way in, and the only one that does not name the quest in a field the pass can see.
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const narrative = document['narrative'] as Record<string, unknown>;
    (narrative['quests'] as Record<string, unknown>[]).push({
      id: 'found_it_yourself',
      name: 'Found It Yourself',
      objectives: [{ id: 'o', kind: 'kill', target: 'bog_hound' }],
      stages: [],
    });

    const poi = (document['world'] as Record<string, unknown>)['pointsOfInterest'] as Record<string, unknown>[];
    poi[0]!['triggers'] = [{
      id: 'walked_in', mode: 'once', on: 'enter',
      effects: [{ emit: { event: 'startQuest', data: { quest: 'found_it_yourself' } } }],
    }];

    const warned = lintModule(document).diagnostics
      .filter((d) => d.code === 'unobtainable_quest')
      .map((d) => d.message);
    expect(warned.join(' ')).not.toContain('found_it_yourself');
  });

  it('warns about a clue nothing can teach', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const narrative = document['narrative'] as Record<string, unknown>;
    narrative['lore'] = [
      { id: 'never_told', name: 'Something nobody says.' },
      { id: 'told_by_vess', name: 'Something she mentions.' },
    ];

    const dialogue = (narrative['dialogues'] as Record<string, unknown>[])[0]!;
    const node = (dialogue['nodes'] as Record<string, unknown>[])[0]!;
    const option = (node['options'] as Record<string, unknown>[])[0]!;
    option['effects'] = [{ learnLore: { entry: 'told_by_vess' } }];

    const codes = lintModule(document).diagnostics.filter((d) => d.code === 'unlearnable_lore');
    expect(codes).toHaveLength(1);
    expect(codes[0]!.message).toContain('never_told');
  });

  it('errors on a place whose area does not exist', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const world = document['world'] as Record<string, unknown>;
    (world['pointsOfInterest'] as Record<string, unknown>[])[0]!['area'] = 'nowhere';

    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'orphan_poi')!;
    expect(diagnostic.severity).toBe('error');
  });

  it('warns when a cavern authors locks or branchiness', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const world = document['world'] as Record<string, unknown>;
    const caves = (world['dungeons'] as Record<string, unknown>[]).find(
      (d) => d['id'] === 'fen_caves',
    )!;
    caves['lockedDoorChance'] = 0.5;
    caves['branchiness'] = 0.3;

    const diagnostics = lintModule(document).diagnostics;
    const locks = diagnostics.find((d) => d.code === 'dungeon_locks_unusable')!;
    expect(locks.severity).toBe('warning');
    expect(locks.message).toContain('fen_caves');
    expect(diagnostics.some((d) => d.code === 'dungeon_caverns_templates')).toBe(true);
  });

  it('stays quiet about a cavern that authors neither', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const diagnostics = lintModule(document).diagnostics;
    expect(diagnostics.some((d) => d.code === 'dungeon_locks_unusable')).toBe(false);
    expect(diagnostics.some((d) => d.code === 'dungeon_caverns_templates')).toBe(false);
  });
});

describe('static map checks', () => {
  /** The assembled doc, which carries greenmarch's real `world.maps` entries. */
  const assembled = () => JSON.parse(JSON.stringify(ASSEMBLED)) as Record<string, unknown>;
  const mapsOf = (doc: Record<string, unknown>) =>
    ((doc['world'] as Record<string, unknown>)['maps']) as Record<string, unknown>[];
  const codesOf = (doc: Record<string, unknown>) =>
    lintModule(doc).diagnostics.map((d) => d.code);

  it('the shipped maps lint clean', () => {
    const codes = codesOf(assembled());
    for (const code of [
      'map_entry_missing', 'map_entry_impassable', 'map_door_missing',
      'map_door_on_edge', 'map_gate_off_door', 'map_disconnected_floor',
      'dungeon_degree_unsatisfiable',
    ]) {
      expect(codes, code).not.toContain(code);
    }
  });

  it('errors when an arrival map loses its entry marker', () => {
    const doc = assembled();
    const mill = mapsOf(doc).find((m) => m['id'] === 'mill_interior')!;
    mill['layers'] = (mill['layers'] as Record<string, unknown>[])
      .filter((layer) => layer['kind'] !== 'markers');
    expect(codesOf(doc)).toContain('map_entry_missing');
  });

  it('errors when the entry marker stands in a wall', () => {
    const doc = assembled();
    const mill = mapsOf(doc).find((m) => m['id'] === 'mill_interior')!;
    const terrain = (mill['layers'] as Record<string, unknown>[])
      .find((layer) => layer['kind'] === 'terrain')!;
    (terrain['cells'] as string[][])[7]![5] = 'wall';
    expect(codesOf(doc)).toContain('map_entry_impassable');
  });

  it('errors when a room-template map has no doors, or doors off the edge', () => {
    const doc = assembled();
    const cell = mapsOf(doc).find((m) => m['id'] === 'barrow_deep_cell')!;
    const markers = (cell['layers'] as Record<string, unknown>[])
      .find((layer) => layer['kind'] === 'markers')!;
    const cells = markers['cells'] as string[][];
    cells[8]![4] = '';
    expect(codesOf(doc)).toContain('map_door_missing');

    cells[4]![4] = 'door';
    expect(codesOf(doc)).toContain('map_door_on_edge');
  });

  it('warns about a gate buried in solid wall', () => {
    const doc = assembled();
    const cell = mapsOf(doc).find((m) => m['id'] === 'barrow_deep_cell')!;
    const gates = (cell['layers'] as Record<string, unknown>[])
      .find((layer) => layer['kind'] === 'gates')!;
    (gates['cells'] as string[][])[0]![0] = 'barrow_ward';
    expect(codesOf(doc)).toContain('map_gate_off_door');
  });

  it('warns about floor no route reaches', () => {
    const doc = assembled();
    const mill = mapsOf(doc).find((m) => m['id'] === 'mill_interior')!;
    const terrain = (mill['layers'] as Record<string, unknown>[])
      .find((layer) => layer['kind'] === 'terrain')!;
    // Wall the store room's doorway shut: its floor becomes a sealed pocket.
    (terrain['cells'] as string[][])[3]![6] = 'wall';
    expect(codesOf(doc)).toContain('map_disconnected_floor');
  });

  it('says so when a static dungeon authors generator knobs', () => {
    const doc = assembled();
    ((doc['world'] as Record<string, unknown>)['dungeons'] as Record<string, unknown>[]).push({
      id: 'fixed', name: 'Fixed', biome: 'greenmarch',
      staticMap: 'mill_interior', roomCount: '9',
    });
    const found = lintModule(doc).diagnostics.find((d) => d.code === 'dungeon_static_fields_ignored');
    expect(found?.severity).toBe('info');
    expect(found?.message).toContain('roomCount');
  });

  it('warns when every drawable template caps maxExits at 1', () => {
    const doc = assembled();
    for (const template of (doc['world'] as Record<string, unknown>)['roomTemplates'] as Record<string, unknown>[]) {
      template['maxExits'] = 1;
      template['minExits'] = 1;
    }
    expect(codesOf(doc)).toContain('dungeon_degree_unsatisfiable');
  });
});

describe('ordering', () => {
  it('puts errors before warnings', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const world = document['world'] as Record<string, unknown>;
    (world['gates'] as Record<string, unknown>[]).push({ id: 'sealed', name: 'Sealed' });
    (world['pointsOfInterest'] as Record<string, unknown>[])[0]!['area'] = 'nowhere';

    const severities = lintModule(document).diagnostics.map((d) => d.severity);
    expect(severities.indexOf('error')).toBeLessThan(severities.indexOf('warning'));
  });
});

describe('source positions', () => {
  it('records a span for every value', () => {
    const parsed = parseJsonWithSource('{\n  "a": {\n    "b": [1, 2]\n  }\n}');
    expect(parsed.spans.get('a.b')!.start.line).toBe(3);
    expect(parsed.spans.get('a.b.1')!.start.line).toBe(3);
  });

  it('parses the same values as JSON.parse', () => {
    expect(parseJsonWithSource(GREENMARCH).value).toEqual(JSON.parse(GREENMARCH));
  });

  it('handles escapes and unicode', () => {
    const parsed = parseJsonWithSource('{"s": "a\\"b\\n\\u0041"}');
    expect((parsed.value as { s: string }).s).toBe('a"b\nA');
  });

  it('throws a positioned error', () => {
    expect(() => parseJsonWithSource('{"a": }')).toThrow(JsonSyntaxError);
  });
});

describe('suggestions', () => {
  it('measures edit distance including transposition', () => {
    expect(editDistance('gte', 'gte')).toBe(0);
    expect(editDistance('fgte', 'gte')).toBe(1);
    expect(editDistance('gte', 'gt')).toBe(1);
    // Transposition counts as one edit, not two.
    expect(editDistance('teh', 'the')).toBe(1);
  });

  it('finds the nearest candidate', () => {
    expect(closest('fgte', ['gte', 'lte', 'eq'])).toBe('gte');
    expect(closest('damge', ['damage', 'heal'])).toBe('damage');
    expect(closest('Damage', ['damage'])).toBe('damage');
  });

  // A wrong suggestion sends the author to the wrong place.
  it('declines to guess when nothing is close', () => {
    expect(closest('xyzzy', ['gte', 'lte', 'eq'])).toBeNull();
  });
});
