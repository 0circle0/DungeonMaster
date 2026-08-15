/**
 * Loading a module from disk — the one place filesystem policy lives.
 *
 * Historically every consumer (CLI, validate, both web apps) carried its own
 * copy of "read `<dir>/module.json`", which meant a change to what a module
 * *is* on disk had five places to miss. A module is now a directory: the
 * `module.json` document plus any number of static map folders under `maps/`,
 * each assembled into the document's `world.maps` before compilation.
 *
 * This file is Node-only and is published as the `@dm/module/load` subpath —
 * deliberately not exported from the package index, which browser code
 * bundles. A client import of this file is a build error, and that is the
 * guard, not a convention.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { compileModule, formatIssues } from './compile.js';
import type { CompiledModule } from './compile.js';
import { resolveExtends } from './merge.js';
import { assembleStaticMap, sortWorldMaps } from './staticmaps.js';

/** A problem in a static map folder, positioned in the file it came from. */
export interface MapFileIssue {
  /** Path relative to the module directory, e.g. `maps/mill_interior/terrain.csv`. */
  readonly file: string;
  readonly line: number;
  readonly col: number;
  readonly code: string;
  readonly message: string;
}

export interface AssembledModule {
  /** The document with every map folder inlined into `world.maps`, sorted by id. */
  readonly doc: Record<string, unknown>;
  /** The module directory the document was read from. */
  readonly dir: string;
  /** Map-folder problems; all are errors. Empty when the folders are clean. */
  readonly issues: readonly MapFileIssue[];
}

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`cannot read ${path}: ${(err as Error).message}`);
  }
}

/** Accept a module directory or a direct path to its JSON. */
export function resolveModulePath(input: string): string {
  const target = resolve(input);
  if (existsSync(target) && !target.endsWith('.json')) {
    const candidate = join(target, 'module.json');
    if (existsSync(candidate)) return candidate;
  }
  if (!existsSync(target)) throw new Error(`no such module: ${input}`);
  return target;
}

/**
 * Read a module directory and inline its `maps/` folders into `world.maps`.
 *
 * Folder discovery is sorted bytewise and the result re-sorted by map id, so
 * the assembled document — and therefore the module hash — never depends on
 * what order a filesystem happened to list entries in. A module with no
 * `maps/` directory assembles to exactly its `module.json`, byte for byte.
 */
export function readAssembledModule(input: string): AssembledModule {
  const path = resolveModulePath(input);
  const dir = dirname(path);
  const doc = readJson(path);
  const issues: MapFileIssue[] = [];

  const mapsDir = join(dir, 'maps');
  const entries: Record<string, unknown>[] = [];

  if (existsSync(mapsDir) && statSync(mapsDir).isDirectory()) {
    for (const folder of readdirSync(mapsDir).sort()) {
      const folderDir = join(mapsDir, folder);
      const manifestPath = join(folderDir, 'map.json');
      if (!statSync(folderDir).isDirectory() || !existsSync(manifestPath)) continue;

      const at = (file: string) => `maps/${folder}/${file}`;

      let manifest: Record<string, unknown>;
      try {
        manifest = readJson(manifestPath);
      } catch (err) {
        issues.push({
          file: at('map.json'),
          line: 1,
          col: 1,
          code: 'map_bad_manifest',
          message: (err as Error).message,
        });
        continue;
      }

      // The folder name is the map's address for the editor's save endpoint;
      // letting it drift from the manifest id would make "which folder do I
      // write" a guess.
      if (manifest['id'] !== folder) {
        issues.push({
          file: at('map.json'),
          line: 1,
          col: 1,
          code: 'map_bad_manifest',
          message: `manifest id ${JSON.stringify(manifest['id'])} must match the folder name ${JSON.stringify(folder)}`,
        });
      }

      const files: Record<string, string> = {};
      for (const file of readdirSync(folderDir).sort()) {
        if (file === 'map.json' || !statSync(join(folderDir, file)).isFile()) continue;
        files[file] = readFileSync(join(folderDir, file), 'utf8');
      }

      const assembled = assembleStaticMap(manifest, files);
      for (const issue of assembled.issues) {
        issues.push({ ...issue, file: at(issue.file) });
      }
      if (assembled.entry) entries.push(assembled.entry);
    }
  }

  if (entries.length === 0) return { doc, dir, issues };

  const world =
    doc['world'] !== null && typeof doc['world'] === 'object' && !Array.isArray(doc['world'])
      ? (doc['world'] as Record<string, unknown>)
      : {};
  const inline = Array.isArray(world['maps']) ? (world['maps'] as unknown[]) : [];
  const merged = { ...doc, world: { ...world, maps: [...inline, ...entries] } };
  return { doc: sortWorldMaps(merged), dir, issues };
}

export function formatMapIssues(issues: readonly MapFileIssue[]): string {
  return issues
    .map((issue) => `  ${issue.file}:${issue.line}:${issue.col} ${issue.message} [${issue.code}]`)
    .join('\n');
}

/**
 * Find `extends` bases among sibling module directories — each assembled the
 * same way, so a base module's map folders merge like any other content.
 */
export function siblingLoader(modulesRoot: string) {
  return (identity: string): Record<string, unknown> | undefined => {
    if (!existsSync(modulesRoot)) return undefined;
    for (const entry of readdirSync(modulesRoot).sort()) {
      const candidate = join(modulesRoot, entry, 'module.json');
      if (!existsSync(candidate)) continue;
      const doc = readJson(candidate);
      if (`${String(doc['id'])}@${String(doc['version'])}` !== identity) continue;
      const assembled = readAssembledModule(join(modulesRoot, entry));
      if (assembled.issues.length > 0) {
        throw new Error(
          `base module ${identity} has map errors:\n${formatMapIssues(assembled.issues)}`,
        );
      }
      return assembled.doc;
    }
    return undefined;
  };
}

/** Load, assemble, resolve `extends`, and compile — or throw with the reasons. */
export function loadModuleFrom(input: string): CompiledModule {
  const assembled = readAssembledModule(input);
  if (assembled.issues.length > 0) {
    throw new Error(
      `${basename(assembled.dir)} has map errors:\n${formatMapIssues(assembled.issues)}`,
    );
  }

  const resolved = resolveExtends(assembled.doc, siblingLoader(dirname(assembled.dir)));
  if (!resolved.ok) throw new Error(resolved.error);

  const result = compileModule(sortWorldMaps(resolved.document));
  if (!result.ok) throw new Error(`module failed to compile:\n${formatIssues(result.errors)}`);
  return result.module;
}

/** Module directories under a root: anything holding a `module.json`. */
export function listModules(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => existsSync(join(root, entry, 'module.json')))
    .sort();
}
