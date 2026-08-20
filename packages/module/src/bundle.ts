/**
 * A whole module as a flat map of paths to text, and back.
 *
 * `project.ts` turns a document into entry files, and `staticmaps.ts` turns one
 * `world.maps` entry into a folder. Neither is the whole module: what a
 * repository holds is *both*, side by side, and what a person wants out of the
 * studio is that same pair — the thing they can drop into git.
 *
 * So this composes the two, and nothing else. It is pure for the same reason
 * both halves are: the studio has no filesystem, and the CLI would rather share
 * one implementation than keep a second one in step.
 *
 * One thing a round trip does not carry: a `#` comment in a map's CSV layer.
 * `parseCsvGrid` drops those by design, so they are not in the grid and nothing
 * downstream could put them back — an export re-writes such a layer without its
 * annotations. Three of greenmarch's thirty-four layers are affected and none
 * of aurendel's, because those are written programmatically.
 *
 * The asymmetry it exists to resolve: a module *read* from disk has its maps
 * inlined into `world.maps` by `assembleMapFolders`, while the module *on* disk
 * has no `world.maps` key at all. The studio only ever sees the assembled form,
 * so without this, exporting from the studio would produce fourteen files the
 * repository does not have and a `module.json` that no longer matches it.
 */

import { splitProject, joinProject, isAuthoringFile } from './project.js';
import type { JoinIssue } from './project.js';
import type { Prefab, StyleTables } from './prefab.js';
import { splitStaticMap, assembleStaticMap, sortWorldMaps } from './staticmaps.js';
import type { AssembleIssue } from './staticmaps.js';

/** Where the manifest lives inside a bundle, mirroring `project/` on disk. */
export const PROJECT_MANIFEST = 'project/project.json';

export interface BundleIssue {
  readonly file: string;
  readonly code: string;
  readonly message: string;
}

/**
 * An assembled document → every file a repository would hold for it.
 *
 * Paths are module-relative and match the repository exactly: `project/…` for
 * entries, `maps/<id>/…` for static maps. `module.json` is deliberately absent —
 * it is the build output, and `npm run project -- build` is what produces it.
 */
export function bundleModule(
  document: Record<string, unknown>,
  authoring: { readonly prefabs?: readonly Prefab[]; readonly style?: StyleTables } = {},
): { files: Record<string, string> } {
  const files: Record<string, string> = {};

  // Carried through rather than derived: no document produces a prefab, and a
  // compressed project cannot be rebuilt without them.
  for (const prefab of authoring.prefabs ?? []) {
    files[`project/prefabs/${prefab.id}.json`] = `${JSON.stringify(prefab, null, 2)}\n`;
  }
  if (authoring.style && Object.keys(authoring.style).length > 0) {
    files['project/style.json'] = `${JSON.stringify(authoring.style, null, 2)}\n`;
  }

  // Maps come out first, because the document handed to `splitProject` must be
  // the one the repository stores — the one with no `world.maps` key.
  const world = document['world'];
  const maps = world && typeof world === 'object' && !Array.isArray(world)
    ? (world as Record<string, unknown>)['maps']
    : undefined;

  let forProject = document;

  if (Array.isArray(maps)) {
    for (const entry of maps) {
      if (!entry || typeof entry !== 'object') continue;
      const id = (entry as Record<string, unknown>)['id'];
      if (typeof id !== 'string' || id === '') continue;

      const { manifest, files: layers } = splitStaticMap(entry as Record<string, unknown>);
      files[`maps/${id}/map.json`] = `${JSON.stringify(manifest, null, 2)}\n`;
      for (const [name, text] of Object.entries(layers)) files[`maps/${id}/${name}`] = text;
    }

    const { maps: _lifted, ...restOfWorld } = world as Record<string, unknown>;
    forProject = { ...document, world: restOfWorld };
  }

  const split = splitProject(forProject);
  files[PROJECT_MANIFEST] = `${JSON.stringify(split.manifest, null, 2)}\n`;
  for (const [path, text] of Object.entries(split.files)) files[`project/${path}`] = text;

  return { files };
}

/**
 * Every file back into the assembled document the studio and engine expect.
 *
 * The inverse of {@link bundleModule}, maps inlined again — so a round trip
 * through a bundle lands on the same document it started from, which is the
 * only property that makes the export worth offering.
 */
export function unbundleModule(files: Readonly<Record<string, string>>): {
  document: Record<string, unknown> | null;
  issues: readonly BundleIssue[];
} {
  const issues: BundleIssue[] = [];

  const manifestText = files[PROJECT_MANIFEST];
  if (manifestText === undefined) {
    return {
      document: null,
      issues: [{ file: PROJECT_MANIFEST, code: 'bundle_no_manifest', message: 'no project manifest' }],
    };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (err) {
    return {
      document: null,
      issues: [{ file: PROJECT_MANIFEST, code: 'bundle_bad_manifest', message: (err as Error).message }],
    };
  }

  const entries: Record<string, string> = {};
  const mapFiles = new Map<string, Record<string, string>>();
  const prefabs: Prefab[] = [];
  let style: StyleTables = {};

  for (const [path, text] of Object.entries(files)) {
    if (path === PROJECT_MANIFEST) continue;
    if (path.startsWith('project/')) {
      const inner = path.slice('project/'.length);
      // Authoring files are build inputs for a compressed project, not entries.
      if (isAuthoringFile(inner)) {
        if (inner === 'style.json') style = JSON.parse(text) as StyleTables;
        else if (inner.startsWith('prefabs/') && !inner.endsWith('instances.json')) {
          prefabs.push(JSON.parse(text) as Prefab);
        }
        continue;
      }
      entries[inner] = text;
      continue;
    }
    if (!path.startsWith('maps/')) continue;

    const [, folder, ...rest] = path.split('/');
    if (!folder || rest.length !== 1) continue;
    const held = mapFiles.get(folder) ?? {};
    held[rest[0]!] = text;
    mapFiles.set(folder, held);
  }

  const joined = joinProject(manifest as Parameters<typeof joinProject>[0], entries, { prefabs, style });
  for (const issue of joined.issues) issues.push(asBundleIssue(issue));

  const assembled: Record<string, unknown>[] = [];
  // Sorted so a bundle read twice produces the same document whatever order the
  // paths arrived in — a `Map` keeps insertion order, and a file map does not
  // promise one.
  for (const folder of [...mapFiles.keys()].sort()) {
    const held = mapFiles.get(folder)!;
    const manifestFile = held['map.json'];
    if (manifestFile === undefined) {
      issues.push({ file: `maps/${folder}/map.json`, code: 'map_no_manifest', message: 'no map manifest' });
      continue;
    }

    let mapManifest: unknown;
    try {
      mapManifest = JSON.parse(manifestFile);
    } catch (err) {
      issues.push({ file: `maps/${folder}/map.json`, code: 'map_bad_manifest', message: (err as Error).message });
      continue;
    }

    const { entry, issues: mapIssues } = assembleStaticMap(mapManifest, held);
    for (const issue of mapIssues) issues.push(asMapIssue(folder, issue));
    if (entry) assembled.push(entry);
  }

  let document = joined.document;
  if (assembled.length > 0) {
    const world = (document['world'] ?? {}) as Record<string, unknown>;
    document = sortWorldMaps({ ...document, world: { ...world, maps: assembled } });
  }

  return { document, issues };
}

function asBundleIssue(issue: JoinIssue): BundleIssue {
  return { file: `project/${issue.file}`, code: issue.code, message: issue.message };
}

function asMapIssue(folder: string, issue: AssembleIssue): BundleIssue {
  return { file: `maps/${folder}/${issue.file}`, code: issue.code, message: issue.message };
}
