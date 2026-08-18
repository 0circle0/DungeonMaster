/**
 * Reading bundled modules from the repository's `modules/` directory.
 *
 * Server-side only: used by the studio page for its starter document and by
 * the template API route. Never import this from a client component.
 */

import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { stableStringify } from '@dm/core';
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

/**
 * Write the whole module back to `modules/<name>/`.
 *
 * The inverse of `readModuleByName`, and it has to be: the studio edits the
 * *assembled* document, with every `maps/<id>/` folder inlined into
 * `world.maps`. Writing that back verbatim would move fourteen maps into
 * `module.json` and leave fourteen stale folders beside it — which is what
 * "Export" has quietly been doing, since it downloads the assembled document
 * rather than the one the repository keeps.
 *
 * So maps go back to folders and `world.maps` is dropped from the document. No
 * shipped module stores maps inline, and the split form is the one that gives a
 * readable diff, which is the whole reason the folders exist.
 *
 * Folders for maps the author deleted are removed, so the directory always
 * equals the document rather than accumulating what used to be true.
 */
export function writeModule(
  name: string,
  doc: Record<string, unknown>,
): { path: string; maps: string[]; unchanged: string[]; removed: string[] } {
  if (!listModuleNames().includes(name)) throw new Error(`no bundled module "${name}"`);

  const world = doc['world'] as Record<string, unknown> | undefined;
  const rawMaps = world?.['maps'];
  const maps = Array.isArray(rawMaps) ? (rawMaps as Record<string, unknown>[]) : [];

  // Maps the author actually changed are the only ones rewritten.
  //
  // Splitting a map back out is lossy in ways that do not matter when you meant
  // to edit it and matter a lot when you did not: `# comments` in the CSVs are
  // dropped, and `map.json`'s hand-compacted layer list comes back expanded. A
  // save that rewrote all fourteen of Aurendel's maps would churn every one of
  // them to change a quest name. So each is compared against what the folder
  // already assembles to, and an unchanged map is left alone.
  const existing = readModuleByName(name);
  const onDisk = new Map<string, unknown>();
  const existingMaps = (existing?.['world'] as Record<string, unknown> | undefined)?.['maps'];
  if (Array.isArray(existingMaps)) {
    for (const entry of existingMaps as Record<string, unknown>[]) {
      if (typeof entry['id'] === 'string') onDisk.set(entry['id'], entry);
    }
  }

  const written: string[] = [];
  const kept: string[] = [];
  for (const entry of maps) {
    const mapId = entry['id'];
    if (typeof mapId !== 'string' || !/^[a-z][a-z0-9_]*$/.test(mapId)) {
      throw new Error(`map id ${JSON.stringify(mapId)} is not a valid id`);
    }
    const before = onDisk.get(mapId);
    if (before !== undefined && stableStringify(before) === stableStringify(entry)) {
      kept.push(mapId);
      continue;
    }
    writeStaticMap(name, mapId, entry);
    written.push(mapId);
  }

  const mapsDir = join(MODULES_DIR, name, 'maps');
  const removed: string[] = [];
  if (existsSync(mapsDir)) {
    for (const folder of readdirSync(mapsDir)) {
      if (written.includes(folder) || kept.includes(folder)) continue;
      if (deleteStaticMap(name, folder)) removed.push(folder);
    }
  }

  // `world.maps` is assembly's doing, not the author's; it does not belong in
  // the file. An empty `world` still goes out as `{}` rather than vanishing,
  // because dropping the key would change the document's shape.
  const out: Record<string, unknown> = { ...doc };
  if (world) {
    const nextWorld = { ...world };
    delete nextWorld['maps'];
    out['world'] = nextWorld;
  }

  const path = join(MODULES_DIR, name, 'module.json');
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  return { path, maps: written, unchanged: kept, removed };
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
