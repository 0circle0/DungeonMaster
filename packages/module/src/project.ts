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
  readonly code: 'project_missing_file' | 'project_bad_json' | 'project_bad_manifest';
  readonly message: string;
}

const SECTIONS = [...new Set(COLLECTION_PATHS.map((path) => path.split('.')[0]!))];

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * A filename for an entry.
 *
 * Ids are `[a-z][a-z0-9_]*`, so they are already safe and already unique — the
 * compiler rejects a duplicate. An entry without one still needs a home, and
 * gets its index; the manifest records whatever was chosen either way, so
 * nothing downstream has to reproduce this rule.
 */
function fileNameFor(entry: unknown, index: number, taken: Set<string>): string {
  const id = (entry as { id?: unknown } | null)?.id;
  const base = typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id) ? id : `entry_${index}`;
  let name = `${base}.json`;
  let n = 2;
  while (taken.has(name)) name = `${base}_${n++}.json`;
  taken.add(name);
  return name;
}

/** Take a document apart. The document is not modified. */
export function splitProject(document: Record<string, unknown>): SplitProject {
  const files: Record<string, string> = {};
  const sections: Record<string, { keyOrder: string[]; collections: Record<string, string[]> }> = {};

  // The shell: the same document with the collections lifted out. Sections are
  // copied one level deep, so the caller's document is untouched.
  const shell: Record<string, unknown> = { ...document };

  for (const section of SECTIONS) {
    const value = document[section];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;

    const container = value as Record<string, unknown>;
    const copy: Record<string, unknown> = { ...container };
    const collections: Record<string, string[]> = {};

    for (const path of COLLECTION_PATHS) {
      const [owner, name] = path.split('.') as [string, string];
      if (owner !== section) continue;

      const entries = container[name];
      // Absent stays absent: `narrative.lore` is `.optional()` rather than
      // defaulted so a module that does not use it does not carry it, and a
      // rebuilt document that grew an empty array would not be the same file.
      if (!Array.isArray(entries)) continue;

      const taken = new Set<string>();
      const names: string[] = [];
      entries.forEach((entry, index) => {
        const file = fileNameFor(entry, index, taken);
        files[`${section}/${name}/${file}`] = serialize(entry);
        names.push(file);
      });
      collections[name] = names;
      delete copy[name];
    }

    shell[section] = copy;
    sections[section] = { keyOrder: Object.keys(container), collections };
  }

  files['shell.json'] = serialize(shell);

  return {
    manifest: { format: PROJECT_FORMAT, keyOrder: Object.keys(document), sections },
    files,
  };
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
): { document: Record<string, unknown>; issues: readonly JoinIssue[] } {
  const issues: JoinIssue[] = [];

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
    return { document: {}, issues };
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
      section[name] = names.map((file) => read(`${key}/${name}/${file}`));
    }
    document[key] = section;
  }

  return { document, issues };
}

/** Every path a split project writes, manifest included. Handy for cleanup. */
export function projectFiles(split: SplitProject): readonly string[] {
  return ['project.json', ...Object.keys(split.files)].sort();
}
