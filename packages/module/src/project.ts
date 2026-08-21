/**
 * A module as a directory of files, and back again.
 *
 * `module.json` is what the engine loads, and at Aurendel's size it is a hundred thousand lines —
 * hopeless for reading a diff or for two people editing one world.
 *
 * So a module may also exist as `project/`: one file per entry, named for its id, plus everything
 * that is not a collection in one `shell.json`, plus a manifest. `module.json` becomes a build
 * artifact, the same relationship `maps/<id>/` has with `world.maps`. Pure, like `staticmaps.ts`,
 * because the studio needs both directions in the browser.
 *
 * Order is recorded, not recovered
 *
 * A directory comes back in filesystem order, so the manifest records the filenames of each
 * collection in document order. JavaScript objects keep insertion order, so the manifest records
 * key order too — a rebuilt document must agree, or every build is a diff.
 *
 * Nothing here decides whether a module uses this form. A `project/` on disk means it does; that
 * policy and the filesystem live in `bin/project.ts`.
 */

import { COLLECTION_PATHS } from './schema/module.js';
import { isPrefabRecipe, expandRecipe, asRecipe } from './prefab.js';
import type { Prefab, StyleTables, PrefabLink, PrefabRecipe, InstanceMap } from './prefab.js';

export const PROJECT_FORMAT = 1;

/** The file that says how the pieces go back together. */
export interface ProjectManifest {
  readonly format: number;
  /** Root keys, in the order the document had them. */
  readonly keyOrder: readonly string[];
  /** Per section: its own key order, and the file list of each collection. */
  readonly sections: Readonly<
    Record<string, { readonly keyOrder: readonly string[]; readonly collections: Readonly<Record<string, readonly string[]>> }>
  >;
}

export interface SplitProject {
  readonly manifest: ProjectManifest;
  /** Path relative to `project/`, to file contents. Includes `shell.json`. */
  readonly files: Readonly<Record<string, string>>;
}

export interface JoinIssue {
  readonly file: string;
  readonly code: 'project_missing_file' | 'project_bad_json' | 'project_bad_manifest' | 'project_bad_recipe';
  readonly message: string;
}

const SECTIONS = [...new Set(COLLECTION_PATHS.map((path) => path.split('.')[0]!))];

/**
 * How every file in a project is written. Exported because the studio writes one entry file at a
 * time, and a second spelling of this would be a byte-identity bug.
 */
export function serializeProjectValue(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * A filename for an entry.
 *
 * Ids are `[a-z][a-z0-9_]*`, so they are safe and unique — the compiler rejects a duplicate. An
 * entry without one gets its index; the manifest records whatever was chosen, so nothing downstream
 * reproduces this rule.
 *
 * `taken` is per collection and must be filled in document order: the `_2` suffix a collision gets
 * depends on how many earlier entries claimed the base.
 */
export function entryFileName(entry: unknown, index: number, taken: Set<string>): string {
  const id = (entry as { id?: unknown } | null)?.id;
  const base = typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id) ? id : `entry_${index}`;
  let name = `${base}.json`;
  let n = 2;
  while (taken.has(name)) name = `${base}_${n++}.json`;
  taken.add(name);
  return name;
}

/**
 * The one pass that decides names, used by both halves of a split. `forEach` skips array holes, so
 * the names it produces line up with the entries it visited and not with `entries[i]`. Both callers
 * walk `entries.forEach` and take names from a cursor rather than indexing by `i`.
 */
function collectionNames(entries: readonly unknown[]): string[] {
  const taken = new Set<string>();
  const names: string[] = [];
  entries.forEach((entry, index) => { names.push(entryFileName(entry, index, taken)); });
  return names;
}

/** Every `section.collection` this document actually carries, in split order. */
function collectionsOf(document: Record<string, unknown>): {
  section: string;
  container: Record<string, unknown>;
  named: { name: string; entries: readonly unknown[] }[];
}[] {
  const out: {
    section: string;
    container: Record<string, unknown>;
    named: { name: string; entries: readonly unknown[] }[];
  }[] = [];

  for (const section of SECTIONS) {
    const value = document[section];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;

    const container = value as Record<string, unknown>;
    const named: { name: string; entries: readonly unknown[] }[] = [];
    for (const path of COLLECTION_PATHS) {
      const [owner, name] = path.split('.') as [string, string];
      if (owner !== section) continue;

      const entries = container[name];
      // Absent stays absent: `narrative.lore` is `.optional()` rather than defaulted, so a rebuilt
      // document that grew an empty array would not be the same file.
      if (!Array.isArray(entries)) continue;
      named.push({ name, entries: entries as readonly unknown[] });
    }
    out.push({ section, container, named });
  }
  return out;
}

/**
 * The manifest alone, without serializing a single entry.
 *
 * The half the studio needs on every save: names and order are a pure function of the document and
 * cost a regex per entry, while the other half is thirteen megabytes of `JSON.stringify`.
 *
 * Given a document with `world.maps` still inlined it will name map files `bundleModule` never
 * writes — always `liftMaps` first.
 */
export function manifestFor(document: Record<string, unknown>): ProjectManifest {
  const sections: Record<string, { keyOrder: string[]; collections: Record<string, string[]> }> = {};

  for (const { section, container, named } of collectionsOf(document)) {
    const collections: Record<string, string[]> = {};
    for (const { name, entries } of named) collections[name] = collectionNames(entries);
    sections[section] = { keyOrder: Object.keys(container), collections };
  }

  return { format: PROJECT_FORMAT, keyOrder: Object.keys(document), sections };
}

/**
 * The document with its collections lifted out — everything `shell.json` holds. The caller's
 * document is not modified: sections are copied one level deep.
 */
export function shellFor(document: Record<string, unknown>): Record<string, unknown> {
  const shell: Record<string, unknown> = { ...document };

  for (const { section, container, named } of collectionsOf(document)) {
    const copy: Record<string, unknown> = { ...container };
    for (const { name } of named) delete copy[name];
    shell[section] = copy;
  }

  return shell;
}

/**
 * Every entry file, given the manifest that named them. Walks `entries.forEach` and takes each name
 * from a cursor, mirroring `collectionNames`; indexing `names[i]` would misalign every entry after
 * an array hole.
 */
function filesFor(
  document: Record<string, unknown>,
  manifest: ProjectManifest,
): Record<string, string> {
  const files: Record<string, string> = {};

  for (const { section, named } of collectionsOf(document)) {
    for (const { name, entries } of named) {
      const names = manifest.sections[section]?.collections[name] ?? [];
      let cursor = 0;
      entries.forEach((entry) => {
        const file = names[cursor++];
        if (file === undefined) return;
        files[`${section}/${name}/${file}`] = serializeProjectValue(entry);
      });
    }
  }

  return files;
}

/** Take a document apart. The document is not modified. */
export function splitProject(document: Record<string, unknown>): SplitProject {
  const manifest = manifestFor(document);
  const files = filesFor(document, manifest);
  files['shell.json'] = serializeProjectValue(shellFor(document));
  return { manifest, files };
}

/**
 * Put a document back together. `files` is every file under `project/` except the manifest, by
 * relative path. Anything missing or unparseable is an issue rather than a throw, and the issue
 * names the file.
 */
export function joinProject(
  manifest: ProjectManifest,
  files: Readonly<Record<string, string>>,
  /**
   * What recipes expand against. Absent means a module that does not use them, and an entry file is
   * read as an entry.
   *
   * This is the one place the authoring sidecar becomes a build input, and only for the files that
   * ask: a collection can hold recipes and literal entries side by side while it is being
   * converted.
   */
  authoring: { readonly prefabs?: readonly Prefab[]; readonly style?: StyleTables } = {},
): { document: Record<string, unknown>; issues: readonly JoinIssue[]; links: InstanceMap } {
  const issues: JoinIssue[] = [];
  const prefabs = authoring.prefabs ?? [];
  // Provenance, recovered rather than remembered: a recipe file names a prefab and carries the
  // parameters, so expanding it without recording that leaves prefabs nothing points at.
  const links: Record<string, Record<string, PrefabLink>> = {};

  const read = (file: string): unknown => {
    const text = files[file];
    if (text === undefined) {
      issues.push({ file, code: 'project_missing_file', message: `${file} is missing` });
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      issues.push({ file, code: 'project_bad_json', message: `${file}: ${(err as Error).message}` });
      return undefined;
    }
  };

  const shell = read('shell.json');
  if (typeof shell !== 'object' || shell === null) {
    issues.push({ file: 'shell.json', code: 'project_bad_manifest', message: 'shell.json is not an object' });
    return { document: {}, issues, links };
  }
  const base = shell as Record<string, unknown>;

  const document: Record<string, unknown> = {};
  for (const key of manifest.keyOrder) {
    const plan = manifest.sections[key];
    if (!plan) {
      document[key] = base[key];
      continue;
    }

    const container = (base[key] ?? {}) as Record<string, unknown>;
    const section: Record<string, unknown> = {};
    for (const name of plan.keyOrder) {
      const names = plan.collections[name];
      if (!names) {
        section[name] = container[name];
        continue;
      }
      section[name] = names.map((file) => {
        const path = `${key}/${name}/${file}`;
        const parsed = read(path);
        if (!isPrefabRecipe(parsed)) return parsed;

        const { entry, issues: expandIssues } = expandRecipe(parsed, prefabs, authoring.style ?? {});
        for (const issue of expandIssues) {
          issues.push({
            file: path,
            code: 'project_bad_recipe',
            message: `${path}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`,
          });
        }
        // `overrides` are not recorded here. A recipe's overrides are the shallowest differing path
        // and the inspector needs leaves, so `recomputeInstances` derives them from the entry it
        // can see.
        const id = (entry as { id?: unknown } | null)?.id;
        if (entry && typeof id === 'string') {
          (links[`${key}.${name}`] ??= {})[id] = { id: parsed['@prefab'], params: parsed.params };
        }
        return entry ?? undefined;
      });
    }
    document[key] = section;
  }

  return { document, issues, links };
}

/**
 * The stored text for one entry: a recipe when one reproduces it, else the entry.
 *
 * `asRecipe` never throws, but a recipe is not guaranteed to rebuild what it was made from:
 *
 *   - `expandRecipe` builds in the template's key order and `setPath` appends a genuinely new key
 *     at the end, so no set of overrides can reproduce an arbitrary key order;
 *   - an override whose value is `undefined` — a key the template emits and the entry lacks — is
 *     dropped by `JSON.stringify`, so the expansion comes back with a key the entry never had.
 *
 * Both produce a file that quietly expands into something else on the next load. So: try it, expand
 * it again, and keep the literal entry unless the two agree. The worst case is a file that did not
 * get smaller.
 */
export function entryFileText(
  entry: unknown,
  link: PrefabLink | null,
  prefabs: readonly Prefab[],
  style: StyleTables = {},
): string {
  if (!link || entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return serializeProjectValue(entry);
  }

  const prefab = prefabs.find((candidate) => candidate.id === link.id);
  if (!prefab) return serializeProjectValue(entry);

  const text = serializeProjectValue(asRecipe(entry as Record<string, unknown>, prefab, link.params, style));

  // Expanded from the text, not from the recipe object it came from. An override whose value is
  // `undefined` still sits in the in-memory recipe and suppresses the template's key, while
  // `JSON.stringify` drops it on the way to the file. The stored bytes are the only honest input.
  const { entry: rebuilt } = expandRecipe(JSON.parse(text) as PrefabRecipe, prefabs, style);
  return JSON.stringify(rebuilt) === JSON.stringify(entry) ? text : serializeProjectValue(entry);
}

/**
 * Files a project keeps that no document produces.
 *
 * Most of a project is derived: split the document and the same files come back, so anything not in
 * that set is stale. Prefabs and the style tables are not — they are the authored source that
 * entries were generated from.
 *
 * `joinProject` never reads them: it reads exactly what the manifest names.
 *
 * `contract.json` belongs here too: it is read by the editor, by `npm run validate` and by the
 * Rules panel.
 */
export const AUTHORING_PATHS = ['prefabs/', 'style.json', 'contract.json'] as const;

export function isAuthoringFile(path: string): boolean {
  return AUTHORING_PATHS.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix,
  );
}

/** Every path a split project writes, manifest included. */
export function projectFiles(split: SplitProject): readonly string[] {
  return ['project.json', ...Object.keys(split.files)].sort();
}
