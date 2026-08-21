/** The static map file form: CSV grids, assembly, and its inverse. */

import { describe, it, expect } from 'vitest';
import {
  parseCsvGrid,
  serializeCsvGrid,
  assembleStaticMap,
  splitStaticMap,
  sortWorldMaps,
} from './staticmaps.js';
import { compileModule, hashModule } from './compile.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GameModule } from './schema/module.js';

const MINIMAL_PATH = fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url));

function loadMinimal(): Record<string, unknown> {
  return JSON.parse(readFileSync(MINIMAL_PATH, 'utf8')) as Record<string, unknown>;
}

describe('parseCsvGrid', () => {
  it('parses rows of trimmed cells, empty meaning nothing', () => {
    const { cells, issues } = parseCsvGrid('raw_stone, raw_stone ,raw_stone\nraw_stone,,raw_stone\n');
    expect(issues).toEqual([]);
    expect(cells).toEqual([
      ['raw_stone', 'raw_stone', 'raw_stone'],
      ['raw_stone', '', 'raw_stone'],
    ]);
  });

  it('skips comment lines without losing line numbers for later errors', () => {
    const { cells, issues } = parseCsvGrid('# the floor\na,b\n# midway note\nc\n');
    expect(cells).toEqual([['a', 'b'], ['c']]);
    expect(issues).toEqual([
      expect.objectContaining({ code: 'map_ragged_rows', line: 4 }),
    ]);
  });

  it('refuses blank lines rather than guessing what they mean', () => {
    const { issues } = parseCsvGrid('a,b\n\na,b\n');
    expect(issues).toEqual([expect.objectContaining({ code: 'map_blank_line', line: 2 })]);
  });

  it('points at the column of a bad cell', () => {
    const { issues } = parseCsvGrid('raw_stone,Bad Cell,raw_stone\n');
    expect(issues).toEqual([
      expect.objectContaining({ code: 'map_bad_cell', line: 1, col: 11 }),
    ]);
  });

  it('round-trips through serialize', () => {
    const grid = [
      ['raw_stone', '', 'bare_floor'],
      ['', 'bare_floor', ''],
    ];
    expect(parseCsvGrid(serializeCsvGrid(grid)).cells).toEqual(grid);
  });

  it('treats one trailing newline as file termination, not an empty row', () => {
    expect(parseCsvGrid('a\n').cells).toEqual([['a']]);
    expect(parseCsvGrid('a').cells).toEqual([['a']]);
    expect(parseCsvGrid('').cells).toEqual([]);
  });
});

describe('assembleStaticMap / splitStaticMap', () => {
  const manifest = {
    id: 'cell',
    name: 'The Cell',
    entry: 'entry',
    layers: [
      { kind: 'terrain', name: 'base', file: 'base.csv' },
      { kind: 'markers', file: 'markers.csv' },
    ],
  };
  const files = {
    'base.csv': 'raw_stone,raw_stone\nraw_stone,bare_floor\n',
    'markers.csv': ',\n,entry\n',
  };

  it('inlines CSV grids and drops the file field', () => {
    const { entry, issues } = assembleStaticMap(manifest, files);
    expect(issues).toEqual([]);
    expect(entry).toEqual({
      id: 'cell',
      name: 'The Cell',
      entry: 'entry',
      layers: [
        {
          kind: 'terrain',
          name: 'base',
          cells: [
            ['raw_stone', 'raw_stone'],
            ['raw_stone', 'bare_floor'],
          ],
        },
        { kind: 'markers', cells: [['', ''], ['', 'entry']] },
      ],
    });
  });

  it('reports a layer whose file is not in the folder', () => {
    const { issues } = assembleStaticMap(
      { id: 'cell', layers: [{ kind: 'terrain', file: 'missing.csv' }] },
      {},
    );
    expect(issues).toEqual([
      expect.objectContaining({ code: 'map_missing_file', file: 'missing.csv' }),
    ]);
  });

  it('carries CSV errors with the file they came from', () => {
    const { issues } = assembleStaticMap(
      { id: 'cell', layers: [{ kind: 'terrain', file: 'base.csv' }] },
      { 'base.csv': 'a,b\nc\n' },
    );
    expect(issues).toEqual([
      expect.objectContaining({ code: 'map_ragged_rows', file: 'base.csv', line: 2 }),
    ]);
  });

  it('split is the deterministic inverse of assemble', () => {
    const { entry } = assembleStaticMap(manifest, files);
    const split = splitStaticMap(entry!);

    // File names come from layer name, then kind; explicit in the manifest.
    expect(Object.keys(split.files).sort()).toEqual(['base.csv', 'markers.csv']);
    expect(split.files['base.csv']).toBe(files['base.csv']);

    const again = assembleStaticMap(split.manifest, split.files);
    expect(again.issues).toEqual([]);
    expect(again.entry).toEqual(entry);
  });

  it('suffixes colliding layer file names with the layer index', () => {
    const { manifest: out } = splitStaticMap({
      id: 'twin',
      layers: [
        { kind: 'terrain', cells: [['a']] },
        { kind: 'terrain', cells: [['b']] },
      ],
    });
    const names = (out['layers'] as { file: string }[]).map((layer) => layer.file);
    expect(names).toEqual(['terrain.csv', 'terrain1.csv']);
  });

  it('rides unknown manifest fields through untouched', () => {
    const { entry } = assembleStaticMap(
      { id: 'cell', future_field: 42, layers: [{ kind: 'terrain', file: 'base.csv', extra: { note: 'hi' } }] },
      { 'base.csv': 'a\n' },
    );
    expect(entry).toMatchObject({ future_field: 42 });
    expect((entry!['layers'] as unknown[])[0]).toMatchObject({ extra: { note: 'hi' } });
  });
});

describe('world.maps in the compiled document', () => {
  /** A valid map over the minimal module's own terrain ids. */
  const validMap = {
    id: 'test_cell',
    layers: [
      {
        kind: 'terrain',
        cells: [
          ['raw_stone', 'raw_stone', 'raw_stone'],
          ['raw_stone', 'bare_floor', 'raw_stone'],
          ['raw_stone', 'raw_stone', 'raw_stone'],
        ],
      },
      { kind: 'items', cells: [['', '', ''], ['', 'cudgel', ''], ['', '', '']] },
      { kind: 'markers', cells: [['', '', ''], ['', 'entry', ''], ['', '', '']] },
    ],
  };

  function withMaps(maps: unknown[]): Record<string, unknown> {
    const doc = loadMinimal();
    const world = doc['world'] as Record<string, unknown>;
    return { ...doc, world: { ...world, maps } };
  }

  it('compiles and indexes a valid static map', () => {
    const result = compileModule(withMaps([validMap]));
    if (!result.ok) {
      throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
    }
    expect(result.module.ids('world.maps')).toEqual(['test_cell']);
  });

  it('proves every non-empty cell resolves, with a cell-level path', () => {
    const broken = JSON.parse(JSON.stringify(validMap)) as typeof validMap;
    broken.layers[1]!.cells[1]![1] = 'no_such_item';
    const result = compileModule(withMaps([broken]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const dangling = result.errors.find((e) => e.code === 'dangling_ref');
    expect(dangling?.path).toBe('world.maps[0].layers[1].cells[1][1]');
    expect(dangling?.message).toContain('content.items');
  });

  it('rejects a map with no terrain layer, a sparse base, or ragged layers', () => {
    const noTerrain = { id: 'bad', layers: [{ kind: 'markers', cells: [['entry']] }] };
    const sparseBase = { id: 'bad', layers: [{ kind: 'terrain', cells: [['raw_stone', '']] }] };
    const ragged = {
      id: 'bad',
      layers: [
        { kind: 'terrain', cells: [['raw_stone']] },
        { kind: 'markers', cells: [['', '']] },
      ],
    };
    for (const map of [noTerrain, sparseBase, ragged]) {
      expect(compileModule(withMaps([map])).ok).toBe(false);
    }
  });

  it('hashes identically however the maps were stored or ordered', () => {
    const second = { ...JSON.parse(JSON.stringify(validMap)) as typeof validMap, id: 'another' };

    const inline = sortWorldMaps(withMaps([validMap, second]));
    const folderish = sortWorldMaps(withMaps([second, validMap]));
    expect(hashModule(folderish as unknown as GameModule)).toBe(
      hashModule(inline as unknown as GameModule),
    );

    // And a split/assemble round trip changes nothing at all.
    const split = splitStaticMap(validMap);
    const roundTripped = assembleStaticMap(split.manifest, split.files).entry!;
    expect(
      hashModule(sortWorldMaps(withMaps([roundTripped, second])) as unknown as GameModule),
    ).toBe(hashModule(inline as unknown as GameModule));
  });
});
