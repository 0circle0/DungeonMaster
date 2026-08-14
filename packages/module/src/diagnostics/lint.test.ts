import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lintModule } from './lint.js';
import { parseJsonWithSource, JsonSyntaxError } from './source.js';
import { editDistance, closest } from './suggest.js';

const GREENMARCH = readFileSync(
  fileURLToPath(new URL('../../../../modules/greenmarch/module.json', import.meta.url)),
  'utf8',
);

const find = (text: string, code: string) =>
  lintModule(text).diagnostics.find((d) => d.code === code);

describe('a valid module', () => {
  it('passes with no errors', () => {
    const result = lintModule(GREENMARCH);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      throw new Error(`unexpected errors:\n${errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
    }
    expect(result.ok).toBe(true);
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
    // `ref` carries an `else`, and `cond` carries `then`/`else` — companions,
    // not operators, and neither should be reported.
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

  it('errors on a place whose area does not exist', () => {
    const document = JSON.parse(GREENMARCH) as Record<string, unknown>;
    const world = document['world'] as Record<string, unknown>;
    (world['pointsOfInterest'] as Record<string, unknown>[])[0]!['area'] = 'nowhere';

    const diagnostic = lintModule(document).diagnostics.find((d) => d.code === 'orphan_poi')!;
    expect(diagnostic.severity).toBe('error');
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
