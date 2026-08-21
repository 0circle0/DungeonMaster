/** Static map files: the CSV-per-layer form and its assembly. */

export interface CsvIssue {
  /** 1-based line in the file as authored, comments counted. */
  readonly line: number;
  /** 1-based column of the offending cell's first character. */
  readonly col: number;
  readonly code: 'map_blank_line' | 'map_ragged_rows' | 'map_bad_cell';
  readonly message: string;
}

export interface AssembleIssue {
  /** The file the problem is in, relative to the map folder. */
  readonly file: string;
  readonly line: number;
  readonly col: number;
  readonly code: CsvIssue['code'] | 'map_missing_file' | 'map_bad_manifest';
  readonly message: string;
}

const CELL = /^[a-z][a-z0-9_]*$/;

/** Parse one CSV layer file into a grid of trimmed cell ids. */
export function parseCsvGrid(text: string): { cells: string[][]; issues: CsvIssue[] } {
  const issues: CsvIssue[] = [];
  const cells: string[][] = [];

  // Strip exactly one trailing newline, so serialize after parse is the identity.
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = body === '' ? [] : body.split('\n');

  let expected: number | null = null;

  lines.forEach((raw, index) => {
    const line = index + 1;
    const stripped = raw.trim();
    if (stripped.startsWith('#')) return;
    if (stripped === '') {
      // A blank line is ambiguous, so it is refused rather than interpreted.
      issues.push({
        line,
        col: 1,
        code: 'map_blank_line',
        message: 'blank line in a map layer; author an empty row as commas',
      });
      return;
    }

    const row: string[] = [];
    let offset = 0;
    for (const piece of raw.split(',')) {
      const cell = piece.trim();
      if (cell !== '' && !CELL.test(cell)) {
        issues.push({
          line,
          col: offset + piece.indexOf(piece.trimStart()) + 1,
          code: 'map_bad_cell',
          message: `${JSON.stringify(cell)} is not an id (lowercase letters, digits, underscores)`,
        });
      }
      row.push(cell);
      offset += piece.length + 1;
    }

    if (expected === null) {
      expected = row.length;
    } else if (row.length !== expected) {
      issues.push({
        line,
        col: 1,
        code: 'map_ragged_rows',
        message: `row has ${row.length} cells; the first row has ${expected}`,
      });
    }
    cells.push(row);
  });

  return { cells, issues };
}

/** The inverse of `parseCsvGrid`: no padding, one row per line, trailing newline. */
export function serializeCsvGrid(cells: readonly (readonly string[])[]): string {
  return cells.map((row) => row.join(',')).join('\n') + '\n';
}

/** Manifest plus CSV texts → an assembled `world.maps` entry. */
export function assembleStaticMap(
  manifest: unknown,
  files: Readonly<Record<string, string>>,
): { entry: Record<string, unknown> | null; issues: AssembleIssue[] } {
  const issues: AssembleIssue[] = [];

  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      entry: null,
      issues: [
        {
          file: 'map.json',
          line: 1,
          col: 1,
          code: 'map_bad_manifest',
          message: 'map.json must be an object',
        },
      ],
    };
  }

  const { layers, ...rest } = manifest as Record<string, unknown>;
  if (!Array.isArray(layers)) {
    return {
      entry: null,
      issues: [
        {
          file: 'map.json',
          line: 1,
          col: 1,
          code: 'map_bad_manifest',
          message: 'map.json needs a "layers" array',
        },
      ],
    };
  }

  const assembled = layers.map((layer) => {
    if (layer === null || typeof layer !== 'object' || Array.isArray(layer)) {
      issues.push({
        file: 'map.json',
        line: 1,
        col: 1,
        code: 'map_bad_manifest',
        message: 'every layer must be an object with "kind" and "file"',
      });
      return layer;
    }
    const { file, ...layerRest } = layer as Record<string, unknown>;
    if (typeof file !== 'string' || !(file in files)) {
      issues.push({
        file: typeof file === 'string' ? file : 'map.json',
        line: 1,
        col: 1,
        code: 'map_missing_file',
        message:
          typeof file === 'string'
            ? `layer file ${JSON.stringify(file)} is not in the map folder`
            : 'every layer needs a "file" naming its CSV',
      });
      return layerRest;
    }
    const parsed = parseCsvGrid(files[file]!);
    for (const issue of parsed.issues) issues.push({ file, ...issue });
    return { ...layerRest, cells: parsed.cells };
  });

  return { entry: { ...rest, layers: assembled }, issues };
}

/** An assembled entry → manifest plus CSV texts, the deterministic inverse. */
export function splitStaticMap(entry: Record<string, unknown>): {
  manifest: Record<string, unknown>;
  files: Record<string, string>;
} {
  const { layers, ...rest } = entry;
  const files: Record<string, string> = {};
  const used = new Set<string>();

  const manifestLayers = (Array.isArray(layers) ? layers : []).map((layer, index) => {
    const { cells, ...layerRest } = (layer ?? {}) as Record<string, unknown>;
    const base =
      typeof layerRest['name'] === 'string'
        ? (layerRest['name'])
        : typeof layerRest['kind'] === 'string'
          ? (layerRest['kind'])
          : `layer${index}`;
    const filename = (used.has(`${base}.csv`) ? `${base}${index}` : base) + '.csv';
    used.add(filename);
    files[filename] = serializeCsvGrid(Array.isArray(cells) ? (cells as string[][]) : []);
    return { ...layerRest, file: filename };
  });

  return { manifest: { ...rest, layers: manifestLayers }, files };
}

/** Normalize `world.maps` to id order. */
export function sortWorldMaps(doc: Record<string, unknown>): Record<string, unknown> {
  const world = doc['world'];
  if (world === null || typeof world !== 'object' || Array.isArray(world)) return doc;
  const maps = (world as Record<string, unknown>)['maps'];
  if (!Array.isArray(maps) || maps.length < 2) return doc;

  const sorted = [...maps].sort((a, b) => {
    const left = String((a as Record<string, unknown>)?.['id'] ?? '');
    const right = String((b as Record<string, unknown>)?.['id'] ?? '');
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { ...doc, world: { ...(world as Record<string, unknown>), maps: sorted } };
}
