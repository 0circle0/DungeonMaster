'use client';

/**
 * What a save has to write, which is almost never very much.
 *
 * The studio holds a world assembled in memory because everything it does is
 * cross-referential — a quest names a point of interest, a dialogue names an
 * npc, and no view of one file could answer any of it. But the *storage* is the
 * project files, and an edit touches one of them. This is the piece in between:
 * given the document now and the document as it was last written, work out which
 * files differ.
 *
 * ## Why references and not paths
 *
 * `setAt` copies only the spine of the path it edits and leaves every untouched
 * subtree as the same object. That is not incidental — `ValidationIndex` keys a
 * `WeakMap` on raw entry objects and its whole performance story depends on it,
 * so it is an invariant somebody maintains. Which means a reference comparison
 * over the collections finds exactly the entries that moved, in one pass of
 * pointer equality and no serialization.
 *
 * It also means this is correct for things path-tracking could never handle:
 * `undo` and `redo` restore older documents that share structure with the
 * current one, and a rename fans out across every entry that referred to the old
 * id. Neither can tell you what it touched; both diff correctly.
 *
 * ## What is recomputed rather than diffed
 *
 * The manifest and `shell.json` are recomputed and compared as text. Naming
 * every entry costs a regex apiece and no serializing, and the two files
 * together are 124 KB on Aurendel — so "did a collection gain a key, did a
 * non-collection value move" stops being a reference comparison somebody has to
 * get exactly right and becomes a string equality that cannot be wrong.
 */

import {
  liftMaps,
  manifestFor,
  shellFor,
  serializeProjectValue,
  entryFileText,
  splitStaticMap,
  linkFor,
  isPrefabRecipe,
  PROJECT_MANIFEST,
} from '@dm/module';
import type { ProjectManifest, Prefab, StyleTables } from '@dm/module';
import type { WorldAuthoring, FileChange } from '@dm/library';

/**
 * The document as it was last written, and enough about it to diff the next one.
 *
 * `doc` is the *lifted* document — maps already out — so the arrays compared
 * here are the same objects the store holds. Lifting is a shallow spread of
 * `world`, so every collection array survives it by reference.
 */
export interface ProjectSnapshot {
  readonly doc: Record<string, unknown>;
  readonly manifest: ProjectManifest;
  readonly manifestText: string;
  readonly shellText: string;
  readonly authoring: WorldAuthoring;
  readonly maps: ReadonlyMap<string, Record<string, unknown>>;
  /** Path to byte length, so `storedBytes` is kept by delta rather than by scan. */
  readonly sizes: ReadonlyMap<string, number>;
  /**
   * Linked entries whose file is **not** a recipe, as `collection\u0000id`.
   *
   * These are the only links `prefabs/instances.json` has to carry: a recipe
   * file names its own prefab, so recording it again in a sidecar is the same
   * fact in two places — which is how the shipped example ended up with prefabs
   * pointing at nothing in the first place.
   *
   * Carried in the snapshot rather than recomputed because a save visits only
   * the entries that moved; the first one visits all of them, so the set starts
   * complete and stays that way.
   */
  readonly literal: ReadonlySet<string>;
}

const linkKey = (collection: string, id: string): string => `${collection}\u0000${id}`;

export interface ProjectDiff {
  readonly change: FileChange;
  readonly snapshot: ProjectSnapshot;
  readonly storedBytes: number;
}

const AUTHORING_PREFIX = 'project/';

/**
 * Prefabs whose expansion may have moved.
 *
 * A recipe file is not the entry — it is an instruction for building one — so
 * when a prefab changes, every entry stored as one of its recipes now expands to
 * something other than what is on screen. Those entries have to be rewritten
 * even though the document did not touch them, or the next load produces a
 * different world than the author was looking at.
 *
 * A changed style table can move any lookup in any template, so it dirties all
 * of them rather than trying to work out which.
 */
function dirtyPrefabs(
  next: readonly Prefab[],
  nextStyle: StyleTables,
  previous: ProjectSnapshot | null,
): ReadonlySet<string> {
  const dirty = new Set<string>();
  if (!previous) return dirty;

  if (previous.authoring.style !== nextStyle) {
    for (const prefab of next) dirty.add(prefab.id);
    return dirty;
  }

  const before = new Map(previous.authoring.prefabs.map((prefab) => [prefab.id, prefab]));
  for (const prefab of next) {
    if (before.get(prefab.id) !== prefab) dirty.add(prefab.id);
  }
  return dirty;
}

/** Names to entries, walked exactly the way the splitter walks them. */
function byName(
  names: readonly string[],
  entries: readonly unknown[],
): Map<string, unknown> {
  const out = new Map<string, unknown>();
  let cursor = 0;
  entries.forEach((entry) => {
    const name = names[cursor++];
    if (name !== undefined) out.set(name, entry);
  });
  return out;
}

function idOf(entry: unknown): string | null {
  const id = (entry as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id : null;
}

export function diffProject(
  next: { doc: Record<string, unknown>; authoring: WorldAuthoring },
  previous: ProjectSnapshot | null,
): ProjectDiff {
  const put: Record<string, string> = {};
  const remove: string[] = [];
  const sizes = new Map(previous?.sizes ?? []);
  const literal = new Set(previous?.literal ?? []);

  const write = (path: string, text: string): void => {
    put[path] = text;
    sizes.set(path, text.length);
  };
  const drop = (path: string): void => {
    remove.push(path);
    sizes.delete(path);
  };

  // Maps first, always. `COLLECTION_PATHS` counts `world.maps`, so a manifest
  // built from the assembled document names `project/world/maps/*.json` — files
  // no bundle contains and no unpack would know what to do with.
  const { document: doc, maps } = liftMaps(next.doc);

  const manifest = manifestFor(doc);
  const manifestText = serializeProjectValue(manifest);
  if (manifestText !== previous?.manifestText) write(PROJECT_MANIFEST, manifestText);

  const shellText = serializeProjectValue(shellFor(doc));
  if (shellText !== previous?.shellText) write(`${AUTHORING_PREFIX}shell.json`, shellText);

  // --- entries -------------------------------------------------------------

  const { prefabs, style, instances } = next.authoring;
  const dirty = dirtyPrefabs(prefabs, style, previous);

  const sections = new Set([
    ...Object.keys(manifest.sections),
    ...Object.keys(previous?.manifest.sections ?? {}),
  ]);

  for (const section of sections) {
    const plan = manifest.sections[section]?.collections ?? {};
    const was = previous?.manifest.sections[section]?.collections ?? {};

    for (const name of new Set([...Object.keys(plan), ...Object.keys(was)])) {
      const collection = `${section}.${name}`;
      const dir = `${AUTHORING_PREFIX}${section}/${name}`;

      const entries = ((doc[section] as Record<string, unknown> | undefined)?.[name] ?? []) as readonly unknown[];
      const names = plan[name] ?? [];
      const oldNames = was[name] ?? [];
      const oldEntries = ((previous?.doc[section] as Record<string, unknown> | undefined)?.[name] ?? []) as readonly unknown[];
      const before = byName(oldNames, oldEntries);

      // The same array object, named the same way, with no prefab moving under
      // it: nothing here can have changed, and a document has eighty of these.
      const sameArray = previous != null
        && entries === ((previous.doc[section] as Record<string, unknown> | undefined)?.[name]);
      const sameNames = oldNames.length === names.length
        && oldNames.every((name, i) => name === names[i]);
      if (sameArray && sameNames && dirty.size === 0) continue;

      let cursor = 0;
      entries.forEach((entry) => {
        const file = names[cursor++];
        if (file === undefined) return;

        const id = idOf(entry);
        const link = id ? linkFor(instances, collection, id) : null;
        // A prefab that moved rewrites its entries even though the document did
        // not touch them: the recipe on disk now expands to something else.
        const forced = link !== null && dirty.has(link.id);
        if (!forced && before.get(file) === entry) return;

        const text = entryFileText(entry, link, prefabs, style);
        write(`${dir}/${file}`, text);

        // Whether this entry ended up describing its own provenance decides
        // whether the sidecar has to.
        if (link && id) {
          const key = linkKey(collection, id);
          if (isPrefabRecipe(JSON.parse(text))) literal.delete(key);
          else literal.add(key);
        }
      });

      const kept = new Set(names);
      const live = new Set<string>();
      entries.forEach((entry) => { const id = idOf(entry); if (id) live.add(id); });
      for (const [name_, entry] of before) {
        const id = idOf(entry);
        if (id && !live.has(id)) literal.delete(linkKey(collection, id));
        void name_;
      }
      for (const stale of oldNames) {
        if (!kept.has(stale)) drop(`${dir}/${stale}`);
      }
    }
  }

  // --- static maps ---------------------------------------------------------

  // Folder-granular on purpose: a layer's CSV filename comes from its `name`,
  // then its `kind`, then its index, so renaming a layer orphans a file that no
  // per-file comparison would notice. A folder is a few kilobytes; rewriting one
  // whole is both cheaper to reason about and correct by construction.
  const mapsById = new Map<string, Record<string, unknown>>();
  for (const entry of maps) mapsById.set(entry['id'] as string, entry);

  const folderOf = (id: string): string[] =>
    [...sizes.keys()].filter((path) => path.startsWith(`maps/${id}/`));

  for (const [id, entry] of mapsById) {
    if (previous?.maps.get(id) === entry) continue;
    for (const path of folderOf(id)) drop(path);

    const { manifest: mapManifest, files: layers } = splitStaticMap(entry);
    write(`maps/${id}/map.json`, `${JSON.stringify(mapManifest, null, 2)}\n`);
    for (const [file, text] of Object.entries(layers)) write(`maps/${id}/${file}`, text);
  }

  for (const id of previous?.maps.keys() ?? []) {
    if (!mapsById.has(id)) for (const path of folderOf(id)) drop(path);
  }

  // --- authoring -----------------------------------------------------------

  const prefabPath = (id: string): string => `${AUTHORING_PREFIX}prefabs/${id}.json`;
  const beforePrefabs = new Map((previous?.authoring.prefabs ?? []).map((prefab) => [prefab.id, prefab]));
  for (const prefab of prefabs) {
    if (beforePrefabs.get(prefab.id) === prefab) continue;
    write(prefabPath(prefab.id), `${JSON.stringify(prefab, null, 2)}\n`);
  }
  const live = new Set(prefabs.map((prefab) => prefab.id));
  for (const id of beforePrefabs.keys()) if (!live.has(id)) drop(prefabPath(id));

  // Guarded on non-empty, mirroring `bundleModule`: a project that grows files
  // it does not need is a tree the repository no longer matches.
  const sidecar = (path: string, value: object, had: object | undefined): void => {
    const full = `${AUTHORING_PREFIX}${path}`;
    if (Object.keys(value).length === 0) {
      if (had && Object.keys(had).length > 0) drop(full);
      return;
    }
    const text = `${JSON.stringify(value, null, 2)}\n`;
    if (sizes.get(full) === text.length && previous && value === had) return;
    write(full, text);
  };
  sidecar('style.json', style, previous?.authoring.style);
  sidecar('contract.json', next.authoring.contract, previous?.authoring.contract);

  const storedBytes = [...sizes.values()].reduce((total, size) => total + size, 0);

  return {
    change: { put, remove, ...(previous ? {} : { sweep: true }) },
    snapshot: {
      doc,
      manifest,
      manifestText,
      shellText,
      authoring: next.authoring,
      maps: mapsById,
      sizes,
      literal,
    },
    storedBytes,
  };
}

/**
 * The snapshot of a world that was just read, without re-deriving its files.
 *
 * Without this the first save after opening a world has no previous to compare
 * against, so it rewrites every record — 2,858 of them for Aurendel, all with
 * the bytes they already had. The files are right there; describing them costs
 * a manifest and a walk.
 */
export function snapshotFrom(
  doc: Record<string, unknown>,
  authoring: WorldAuthoring,
  files: Readonly<Record<string, string>>,
): ProjectSnapshot {
  const { document: lifted, maps } = liftMaps(doc);
  const sizes = new Map<string, number>();
  for (const [path, text] of Object.entries(files)) sizes.set(path, text.length);

  // A linked entry needs the sidecar only when its own file does not say so.
  const literal = new Set<string>();
  for (const [collection, byId] of Object.entries(authoring.instances)) {
    const [section, name] = collection.split('.') as [string, string];
    for (const id of Object.keys(byId)) {
      const text = files[`${AUTHORING_PREFIX}${section}/${name}/${id}.json`];
      if (text === undefined) continue;
      try {
        if (!isPrefabRecipe(JSON.parse(text))) literal.add(linkKey(collection, id));
      } catch {
        // An unreadable file is not evidence either way, and the join already
        // reported it.
      }
    }
  }

  const mapsById = new Map<string, Record<string, unknown>>();
  for (const entry of maps) mapsById.set(entry['id'] as string, entry);

  return {
    doc: lifted,
    manifest: manifestFor(lifted),
    manifestText: files[PROJECT_MANIFEST] ?? '',
    shellText: files[`${AUTHORING_PREFIX}shell.json`] ?? '',
    authoring,
    maps: mapsById,
    sizes,
    literal,
  };
}
