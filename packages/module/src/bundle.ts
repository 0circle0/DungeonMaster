/**
 * A whole module as a flat map of paths to text, and back.
 *
 * `project.ts` turns a document into entry files and `staticmaps.ts` turns one `world.maps` entry
 * into a folder. What a repository holds is both, side by side, and this composes the two. Pure for
 * the same reason both halves are: the studio has no filesystem.
 *
 * One thing a round trip does not carry: a `#` comment in a map's CSV layer. `parseCsvGrid` drops
 * those by design, so an export re-writes such a layer without its annotations. Three of
 * greenmarch's thirty-four layers are affected.
 *
 * The asymmetry it resolves: a module read from disk has its maps inlined into `world.maps` by
 * `assembleMapFolders`, while the module on disk has no `world.maps` key. Without this, exporting
 * from the studio would produce files the repository does not have.
 */

import { splitProject, joinProject, isAuthoringFile } from './project.js';
import type { JoinIssue } from './project.js';
import { INSTANCES_FILE } from './prefab.js';
import type { Prefab, StyleTables, InstanceMap } from './prefab.js';
import type { Contract } from './diagnostics/rules.js';
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
 * Everything a project holds that no document produces: `prefabs`, `style`, `instances` and
 * `contract`.
 */
export interface BundleAuthoring {
  readonly prefabs: readonly Prefab[];
  readonly style: StyleTables;
  readonly instances: InstanceMap;
  readonly contract: Contract;
}

/**
 * `world.maps` out of a document, because the repository does not store it there. Anything that
 * names project files has to see the on-disk form, or it invents `project/world/maps/*.json`.
 * Exported so the studio's incremental writer lifts them exactly as this does.
 */
export function liftMaps(document: Record<string, unknown>): {
  readonly document: Record<string, unknown>;
  readonly maps: readonly Record<string, unknown>[];
} {
  const world = document['world'];
  const held = world && typeof world === 'object' && !Array.isArray(world)
    ? (world as Record<string, unknown>)['maps']
    : undefined;
  if (!Array.isArray(held)) return { document, maps: [] };

  const maps = held.filter((entry): entry is Record<string, unknown> => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const id = (entry as Record<string, unknown>)['id'];
    return typeof id === 'string' && id !== '';
  });

  const { maps: _lifted, ...restOfWorld } = world as Record<string, unknown>;
  return { document: { ...document, world: restOfWorld }, maps };
}

/**
 * An assembled document → every file a repository would hold for it. Paths are module-relative and
 * match the repository: `project/…` for entries, `maps/<id>/…` for static maps. `module.json` is
 * absent — it is the build output of `npm run project -- build`.
 */
export function bundleModule(
  document: Record<string, unknown>,
  authoring: Partial<BundleAuthoring> = {},
): { files: Record<string, string> } {
  const files: Record<string, string> = {};

  // Carried through rather than derived: no document produces a prefab, and a compressed project
  // cannot be rebuilt without them.
  for (const prefab of authoring.prefabs ?? []) {
    files[`project/prefabs/${prefab.id}.json`] = `${JSON.stringify(prefab, null, 2)}\n`;
  }
  // Each guarded on non-empty, or a project grows files it does not need and `npm run project --
  // unpack` produces a tree git does not match.
  if (authoring.style && Object.keys(authoring.style).length > 0) {
    files['project/style.json'] = `${JSON.stringify(authoring.style, null, 2)}\n`;
  }
  if (authoring.instances && Object.keys(authoring.instances).length > 0) {
    files[`project/${INSTANCES_FILE}`] = `${JSON.stringify(authoring.instances, null, 2)}\n`;
  }
  if (authoring.contract && Object.keys(authoring.contract).length > 0) {
    files['project/contract.json'] = `${JSON.stringify(authoring.contract, null, 2)}\n`;
  }

  // Maps come out first, because the document handed to `splitProject` must be the one the
  // repository stores — the one with no `world.maps` key.
  const { document: forProject, maps } = liftMaps(document);
  for (const entry of maps) {
    const id = entry['id'] as string;
    const { manifest, files: layers } = splitStaticMap(entry);
    files[`maps/${id}/map.json`] = `${JSON.stringify(manifest, null, 2)}\n`;
    for (const [name, text] of Object.entries(layers)) files[`maps/${id}/${name}`] = text;
  }

  const split = splitProject(forProject);
  files[PROJECT_MANIFEST] = `${JSON.stringify(split.manifest, null, 2)}\n`;
  for (const [path, text] of Object.entries(split.files)) files[`project/${path}`] = text;

  return { files };
}

/**
 * The authoring files back out of a bundle, the inverse of what {@link bundleModule} writes.
 *
 * Parses are guarded: a project is a directory people edit by hand, so a broken `style.json` is an
 * issue naming the file rather than an exception out of a loader.
 *
 * Prefabs are read in sorted path order, so a bundle read twice produces the same list.
 */
export function authoringFromFiles(files: Readonly<Record<string, string>>): {
  prefabs: readonly Prefab[];
  style: StyleTables;
  instances: InstanceMap;
  contract: Contract;
  issues: readonly BundleIssue[];
} {
  const issues: BundleIssue[] = [];
  const prefabs: Prefab[] = [];
  let style: StyleTables = {};
  let instances: InstanceMap = {};
  let contract: Contract = {};

  const parse = <T>(path: string, text: string, fallback: T): T => {
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      issues.push({ file: path, code: 'bundle_bad_authoring', message: (err as Error).message });
      return fallback;
    }
  };

  for (const path of Object.keys(files).sort()) {
    if (!path.startsWith('project/')) continue;
    const inner = path.slice('project/'.length);
    if (!isAuthoringFile(inner)) continue;

    const text = files[path]!;
    if (inner === 'style.json') style = parse(path, text, style);
    else if (inner === 'contract.json') contract = parse(path, text, contract);
    else if (inner === INSTANCES_FILE) instances = parse(path, text, instances);
    else if (inner.startsWith('prefabs/')) {
      const prefab = parse<Prefab | null>(path, text, null);
      if (prefab) prefabs.push(prefab);
    }
  }

  return { prefabs, style, instances, contract, issues };
}

/**
 * Every file back into the assembled document the studio and engine expect. The inverse of {@link
 * bundleModule}, maps inlined again, so a round trip through a bundle lands on the document it
 * started from.
 */
export function unbundleModule(files: Readonly<Record<string, string>>): {
  document: Record<string, unknown> | null;
  authoring: BundleAuthoring;
  issues: readonly BundleIssue[];
} {
  const issues: BundleIssue[] = [];
  const { prefabs, style, instances, contract, issues: authoringIssues } = authoringFromFiles(files);
  for (const issue of authoringIssues) issues.push(issue);
  const authoring: BundleAuthoring = { prefabs, style, instances, contract };

  const manifestText = files[PROJECT_MANIFEST];
  if (manifestText === undefined) {
    return {
      document: null,
      authoring,
      issues: [...issues, { file: PROJECT_MANIFEST, code: 'bundle_no_manifest', message: 'no project manifest' }],
    };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (err) {
    return {
      document: null,
      authoring,
      issues: [...issues, { file: PROJECT_MANIFEST, code: 'bundle_bad_manifest', message: (err as Error).message }],
    };
  }

  const entries: Record<string, string> = {};
  const mapFiles = new Map<string, Record<string, string>>();

  for (const [path, text] of Object.entries(files)) {
    if (path === PROJECT_MANIFEST) continue;
    if (path.startsWith('project/')) {
      const inner = path.slice('project/'.length);
      // Authoring files are build inputs for a compressed project, not entries;
      // `authoringFromFiles` has already read them.
      if (isAuthoringFile(inner)) continue;
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
  // Sorted so a bundle read twice produces the same document whatever order the paths arrived in: a
  // `Map` keeps insertion order, and a file map does not promise one.
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

  // What the recipes said, under what the sidecar said. A link recovered from a recipe is the file
  // speaking for itself; `instances.json` carries only the remainder — links whose entry had to be
  // written literally.
  const links = joined.links;
  const merged: Record<string, Record<string, (typeof instances)[string][string]>> = {};
  for (const [collection, byId] of Object.entries(links)) merged[collection] = { ...byId };
  for (const [collection, byId] of Object.entries(instances)) {
    merged[collection] = { ...(merged[collection] ?? {}), ...byId };
  }

  return { document, authoring: { ...authoring, instances: merged }, issues };
}

function asBundleIssue(issue: JoinIssue): BundleIssue {
  return { file: `project/${issue.file}`, code: issue.code, message: issue.message };
}

function asMapIssue(folder: string, issue: AssembleIssue): BundleIssue {
  return { file: `maps/${folder}/${issue.file}`, code: issue.code, message: issue.message };
}
