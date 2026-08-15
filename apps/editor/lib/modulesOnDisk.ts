/**
 * Reading bundled modules from the repository's `modules/` directory.
 *
 * Server-side only: used by the studio page for its starter document and by
 * the template API route. Never import this from a client component.
 */

import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { readAssembledModule, listModules } from '@dm/module/load';
import { splitStaticMap } from '@dm/module';

const MODULES_DIR = join(process.cwd(), '..', '..', 'modules');

/** Directory names under `modules/` that contain a module.json. */
export function listModuleNames(): string[] {
  return listModules(MODULES_DIR);
}

/**
 * The assembled module document, or null when the name is not a bundled module.
 *
 * Static map folders are inlined into `world.maps`, so the studio edits one
 * document; `extends` is deliberately *not* resolved — the raw authored doc is
 * the editor's source of truth, and baking a base module into it would corrupt
 * every save. Map-folder errors surface as a throw: a bundled module that
 * fails assembly is fixed on disk, not around.
 */
export function readModuleByName(name: string): Record<string, unknown> | null {
  if (!listModuleNames().includes(name)) return null;
  const assembled = readAssembledModule(join(MODULES_DIR, name));
  if (assembled.issues.length > 0) {
    const first = assembled.issues[0];
    throw new Error(`${name}: ${first.file}:${first.line}:${first.col} ${first.message}`);
  }
  return assembled.doc;
}

/**
 * Write one static map back to its folder: `maps/<mapId>/` under the module.
 *
 * The editor's first and only write path. The entry arrives assembled (cells
 * inline) and is split back into `map.json` plus one CSV per layer; stale CSVs
 * from a deleted or renamed layer are removed so the folder always equals the
 * entry. Both names are validated by the caller against the id grammar, so no
 * path built here can leave the modules directory.
 */
export function writeStaticMap(
  name: string,
  mapId: string,
  entry: Record<string, unknown>,
): { written: string[] } {
  if (!listModuleNames().includes(name)) throw new Error(`no bundled module "${name}"`);

  const dir = join(MODULES_DIR, name, 'maps', mapId);
  mkdirSync(dir, { recursive: true });

  const { manifest, files } = splitStaticMap(entry);
  const written: string[] = [];

  writeFileSync(join(dir, 'map.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  written.push(`maps/${mapId}/map.json`);

  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(dir, file), text);
    written.push(`maps/${mapId}/${file}`);
  }

  // A layer that no longer exists must not leave its CSV behind to confuse the
  // next assembly.
  const keep = new Set(['map.json', ...Object.keys(files)]);
  for (const existing of readdirSync(dir)) {
    if (!keep.has(existing) && existing.endsWith('.csv')) unlinkSync(join(dir, existing));
  }

  return { written };
}

/** Delete a static map folder outright. */
export function deleteStaticMap(name: string, mapId: string): boolean {
  if (!listModuleNames().includes(name)) return false;
  const dir = join(MODULES_DIR, name, 'maps', mapId);
  if (!existsSync(dir)) return false;
  for (const file of readdirSync(dir)) unlinkSync(join(dir, file));
  rmdirSync(dir);
  return true;
}
