/** A module as a directory of files, and back again. */

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
  /** Path relative to `project/`, to file contents. */
  readonly files: Readonly<Record<string, string>>;
}

export interface JoinIssue {
  readonly file: string;
  readonly code: 'project_missing_file' | 'project_bad_json' | 'project_bad_manifest' | 'project_bad_recipe';
  readonly message: string;
}

const SECTIONS = [...new Set(COLLECTION_PATHS.map((path) => path.split('.')[0]!))];

/** How every file in a project is written. */
export function serializeProjectValue(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** A filename for an entry. */
export function entryFileName(entry: unknown, index: number, taken: Set<string>): string {
  const id = (entry as { id?: unknown } | null)?.id;
  const base = typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id) ? id : `entry_${index}`;
  let name = `${base}.json`;
  let n = 2;
  while (taken.has(name)) name = `${base}_${n++}.json`;
  taken.add(name);
  return name;
}

/** The one pass that decides names, used by both halves of a split. */
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
      // Absent stays absent: `narrative.lore` is `.optional()` rather than defaulted.
      if (!Array.isArray(entries)) continue;
      named.push({ name, entries: entries as readonly unknown[] });
    }
    out.push({ section, container, named });
  }
  return out;
}

/** The manifest alone, without serializing a single entry. */
export function manifestFor(document: Record<string, unknown>): ProjectManifest {
  const sections: Record<string, { keyOrder: string[]; collections: Record<string, string[]> }> = {};

  for (const { section, container, named } of collectionsOf(document)) {
    const collections: Record<string, string[]> = {};
    for (const { name, entries } of named) collections[name] = collectionNames(entries);
    sections[section] = { keyOrder: Object.keys(container), collections };
  }

  return { format: PROJECT_FORMAT, keyOrder: Object.keys(document), sections };
}

/** The document with its collections lifted out — everything `shell.json` holds. */
export function shellFor(document: Record<string, unknown>): Record<string, unknown> {
  const shell: Record<string, unknown> = { ...document };

  for (const { section, container, named } of collectionsOf(document)) {
    const copy: Record<string, unknown> = { ...container };
    for (const { name } of named) delete copy[name];
    shell[section] = copy;
  }

  return shell;
}

/** Every entry file, given the manifest that named them. */
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

/** Take a document apart. */
export function splitProject(document: Record<string, unknown>): SplitProject {
  const manifest = manifestFor(document);
  const files = filesFor(document, manifest);
  files['shell.json'] = serializeProjectValue(shellFor(document));
  return { manifest, files };
}

/** Put a document back together. */
export function joinProject(
  manifest: ProjectManifest,
  files: Readonly<Record<string, string>>,
  /** What recipes expand against. */
  authoring: { readonly prefabs?: readonly Prefab[]; readonly style?: StyleTables } = {},
): { document: Record<string, unknown>; issues: readonly JoinIssue[]; links: InstanceMap } {
  const issues: JoinIssue[] = [];
  const prefabs = authoring.prefabs ?? [];
  // Provenance recovered from a recipe file: the prefab it names and its parameters.
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
        // `overrides` are not recorded here.
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

/** The stored text for one entry: a recipe when one reproduces it, else the entry. */
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

  // Expanded from the text, not from the recipe object it came from.
  const { entry: rebuilt } = expandRecipe(JSON.parse(text) as PrefabRecipe, prefabs, style);
  return JSON.stringify(rebuilt) === JSON.stringify(entry) ? text : serializeProjectValue(entry);
}

/** Files a project keeps that no document produces. */
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
