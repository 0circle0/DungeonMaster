/**
 * A module as a directory of files, and back again.
 *
 * `module.json` is what the engine loads and what a player receives, and at
 * Aurendel's size it is a hundred thousand lines. That is fine for a machine
 * and hopeless for the two things people actually do with a repository: read a
 * diff, and put two hands on the same world. Renaming one point of interest
 * shows up as a change to a file called `module.json`, and nothing about the
 * line numbers says which of the five hundred and ninety-seven moved.
 *
 * So a module may also exist as `project/`: one file per entry, named for its
 * id, plus everything that is not a collection in one `shell.json`, plus a
 * manifest. `module.json` becomes a build artifact — the same relationship
 * `maps/<id>/` already has with `world.maps`, which is why this file follows
 * `staticmaps.ts` and is pure for the same reason: the studio needs both
 * directions in the browser.
 *
 * ## Order is recorded, not recovered
 *
 * Two things would otherwise be lost, and both were found by trying it before
 * designing it. A directory comes back in filesystem order, so the manifest
 * records the filenames of each collection in document order. And JavaScript
 * objects keep insertion order, so the manifest records key order too — the
 * generators write the root keys in schema order and a rebuilt document has to
 * agree, or every build is a diff.
 *
 * Nothing here decides *whether* a module uses this form. A `project/` on disk
 * means it does; that policy, and the filesystem, live in `bin/project.ts`.
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
 * How every file in a project is written.
 *
 * Exported because the studio writes one entry file at a time and a second
 * spelling of this would be a byte-identity bug nobody would find until a
 * rebuilt `module.json` stopped matching the one in git.
 */
export function serializeProjectValue(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * A filename for an entry.
 *
 * Ids are `[a-z][a-z0-9_]*`, so they are already safe and already unique — the
 * compiler rejects a duplicate. An entry without one still needs a home, and
 * gets its index; the manifest records whatever was chosen either way, so
 * nothing downstream has to reproduce this rule.
 *
 * `taken` is per collection and must be filled in document order: the `_2`
 * suffix a collision gets depends on how many earlier entries claimed the base.
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
 * The one pass that decides names, used by both halves of a split.
 *
 * `forEach` skips array holes, so the names it produces line up with the
 * entries it visited and *not* with `entries[i]`. Both callers therefore walk
 * `entries.forEach` and take names from a cursor rather than indexing by `i` —
 * see `filesFor`. Holes are not reachable from JSON, but the two passes have to
 * agree by construction rather than by luck.
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
      // Absent stays absent: `narrative.lore` is `.optional()` rather than
      // defaulted so a module that does not use it does not carry it, and a
      // rebuilt document that grew an empty array would not be the same file.
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
 * This is the half the studio needs on every save: names and order are a pure
 * function of the document and cost a regex per entry, while the other half is
 * thirteen megabytes of `JSON.stringify`. Splitting them is what lets a save
 * write one file instead of two thousand eight hundred.
 *
 * Give it a document with `world.maps` still inlined and it will name map files
 * `bundleModule` never writes — always `liftMaps` first.
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
 * The document with its collections lifted out — everything `shell.json` holds.
 *
 * The caller's document is not modified: sections are copied one level deep.
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
 * Every entry file, given the manifest that named them.
 *
 * Walks `entries.forEach` and takes each name from a cursor, mirroring
 * `collectionNames` exactly. Indexing `names[i]` instead would misalign every
 * entry after an array hole, because only one of the two passes would skip it.
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
 * Put a document back together.
 *
 * `files` is every file under `project/` except the manifest, by relative path.
 * Anything missing or unparseable is an issue rather than a throw: a project is
 * a directory people edit by hand, and the useful answer names the file.
 */
export function joinProject(
  manifest: ProjectManifest,
  files: Readonly<Record<string, string>>,
  /**
   * What recipes expand against. Absent means a module that does not use them,
   * which is every module that existed before they did — an entry file is read
   * as an entry and nothing changes.
   *
   * This is the one place the authoring sidecar becomes a *build input*, and
   * only for the files that ask: `AUTHORING_PATHS` still describes what a save
   * must not sweep away, and a collection can hold recipes and literal entries
   * side by side while it is being converted.
   */
  authoring: { readonly prefabs?: readonly Prefab[]; readonly style?: StyleTables } = {},
): { document: Record<string, unknown>; issues: readonly JoinIssue[]; links: InstanceMap } {
  const issues: JoinIssue[] = [];
  const prefabs = authoring.prefabs ?? [];
  // Provenance, recovered rather than remembered. A recipe file *is* the record
  // that an entry came from a prefab — it names one and carries the parameters —
  // so expanding it and dropping that on the floor is how a project ends up with
  // prefabs nothing points at. Aurendel has 767 of these and no sidecar at all.
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
        // `overrides` are deliberately not recorded here. A recipe's overrides
        // are the *shallowest* differing path and the inspector needs leaves, so
        // `recomputeInstances` derives them from the entry it can see. Half a
        // link remembered and half observed is the split the sidecar already
        // documents.
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
 * One rule, no modes. It is the same rule `bin/compress-project.ts` follows, and
 * the verify step is the whole of it — `asRecipe` never throws but a recipe is
 * not guaranteed to rebuild what it was made from:
 *
 *   - `expandRecipe` builds in the *template's* key order and `setPath` appends
 *     a genuinely new key at the end, so no set of overrides can reproduce an
 *     arbitrary key order;
 *   - an override whose value is `undefined` — a key the template emits and the
 *     entry lacks — is dropped by `JSON.stringify`, so the expansion comes back
 *     with a key the entry never had.
 *
 * Both produce a file that quietly expands into something else on the next load.
 * So: try it, expand it again, and keep the literal entry unless the two agree.
 * The worst case is a file that did not get smaller.
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

  // Expanded from the *text*, not from the recipe object it came from. An
  // override whose value is `undefined` still sits in the in-memory recipe and
  // still suppresses the template's key, so checking that copy says the round
  // trip works; `JSON.stringify` then drops it on the way to the file and the
  // key comes back on the next load. The stored bytes are the only honest input.
  const { entry: rebuilt } = expandRecipe(JSON.parse(text) as PrefabRecipe, prefabs, style);
  return JSON.stringify(rebuilt) === JSON.stringify(entry) ? text : serializeProjectValue(entry);
}

/**
 * Files a project keeps that no document produces.
 *
 * A project holds two kinds of thing. Most of it is *derived*: split the
 * document and you get the same files back, so anything not in that set is
 * stale and should go. Prefabs and the style tables are not — they are the
 * authored source that entries were generated *from*, and a save that tidied
 * them away because the document did not mention them would delete the work.
 *
 * `joinProject` never reads them: it reads exactly what the manifest names.
 *
 * `contract.json` belongs here for the same reason and was missing: it is read
 * by the editor, by `npm run validate` and by the Rules panel, and none of that
 * put it on this list — so the first save of a project that had one would have
 * swept it away. Nothing had hit it only because no project has a contract yet.
 */
export const AUTHORING_PATHS = ['prefabs/', 'style.json', 'contract.json'] as const;

export function isAuthoringFile(path: string): boolean {
  return AUTHORING_PATHS.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix,
  );
}

/** Every path a split project writes, manifest included. Handy for cleanup. */
export function projectFiles(split: SplitProject): readonly string[] {
  return ['project.json', ...Object.keys(split.files)].sort();
}
