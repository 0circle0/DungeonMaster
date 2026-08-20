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
  INSTANCES_FILE,
} from '@dm/module';
import type { ProjectManifest, Prefab, StyleTables, InstanceMap, PrefabLink } from '@dm/module';
import type { WorldAuthoring, FileChange } from '@dm/library';

/**
 * What a string costs to store, which is not how long it is.
 *
 * `sizes` feeds `storedBytes`, and that number is shown to the author and
 * compared against a quota. `text.length` counts UTF-16 code units, so every
 * em dash in a world was being undercounted by two thirds and every emoji by
 * half.
 */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

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
  /** `prefabs/instances.json` as it was written, so it is not rewritten unchanged. */
  readonly instancesText: string;
  /**
   * Every link by value, as `collection\u0000id` → signature.
   *
   * An entry's file text has three inputs — the entry, its prefab, and its link
   * — and only the first two were being watched. Linking an existing entry to a
   * prefab that has not itself changed moves no object the diff looks at, so
   * the save wrote nothing and the link was gone on reload.
   *
   * By value and not by reference, because `recomputeInstances` rebuilds the
   * whole map and every `PrefabLink` in it on every single save: reference
   * comparison here would report that all 767 of Aurendel's links moved, every
   * time, and rewrite their entries.
   */
  readonly linkSigs: ReadonlyMap<string, string>;
}

/** A link reduced to something comparable. Key order is fixed here, not inherited. */
function linkSig(link: PrefabLink): string {
  return JSON.stringify([link.id, link.params, link.overrides ?? []]);
}

/** Every link in an instance map, by value. */
function linkSigsOf(instances: InstanceMap): Map<string, string> {
  const sigs = new Map<string, string>();
  for (const [collection, byId] of Object.entries(instances)) {
    for (const [id, link] of Object.entries(byId)) sigs.set(linkKey(collection, id), linkSig(link));
  }
  return sigs;
}

/** Not a character an id or a collection name can hold, so the join is reversible. */
const LINK_SEP = '\u0000';
const linkKey = (collection: string, id: string): string => `${collection}${LINK_SEP}${id}`;

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
    sizes.set(path, utf8Length(text));
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

  // Links that are not what they were — including ones that have appeared and
  // ones that have gone. An entry whose link moved has to be rewritten even
  // though the entry itself did not: it is the difference between a recipe file
  // and a literal one.
  const linkSigs = linkSigsOf(instances);
  const movedLinks = new Set<string>();
  for (const [key, sig] of linkSigs) {
    if (previous?.linkSigs.get(key) !== sig) movedLinks.add(key);
  }
  for (const key of previous?.linkSigs.keys() ?? []) {
    if (!linkSigs.has(key)) movedLinks.add(key);
  }
  // Which collections that touches, so the whole-collection fast path below can
  // stay a fast path.
  const movedIn = new Set<string>();
  for (const key of movedLinks) movedIn.add(key.slice(0, key.indexOf(LINK_SEP)));

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
      if (sameArray && sameNames && dirty.size === 0 && !movedIn.has(collection)) continue;

      let cursor = 0;
      entries.forEach((entry) => {
        const file = names[cursor++];
        if (file === undefined) return;

        const id = idOf(entry);
        const link = id ? linkFor(instances, collection, id) : null;
        // A prefab that moved rewrites its entries even though the document did
        // not touch them: the recipe on disk now expands to something else.
        // Three inputs decide this file's text: the entry, the prefab behind it
        // and the link itself. The entry is compared by reference below; the
        // other two have to be asked about, or linking an entry to a prefab
        // that did not itself change writes nothing at all.
        const forced = (link !== null && dirty.has(link.id))
          || (id !== null && movedLinks.has(linkKey(collection, id)));
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

  /**
   * The links that have nowhere else to live.
   *
   * `literal` has been maintained on every save since this file was written and
   * read by nothing: the sidecar it exists to describe was never emitted, so a
   * link whose entry could not be expressed as a recipe was simply lost on the
   * next open. Recipe-backed entries stay out of it — the file names its own
   * prefab, and recording it twice is how the shipped example ended up with
   * prefabs pointing at nothing.
   *
   * Compared as text, like the manifest and the shell, because this object is
   * rebuilt every save and a reference test would rewrite it every save.
   */
  const remainder: Record<string, Record<string, PrefabLink>> = {};
  for (const key of literal) {
    const cut = key.indexOf(LINK_SEP);
    const collection = key.slice(0, cut);
    const link = linkFor(instances, collection, key.slice(cut + 1));
    if (link) (remainder[collection] ??= {})[key.slice(cut + 1)] = link;
  }
  const instancesPath = `${AUTHORING_PREFIX}${INSTANCES_FILE}`;
  const instancesText = Object.keys(remainder).length > 0 ? serializeProjectValue(remainder) : '';
  if (instancesText !== (previous?.instancesText ?? '')) {
    if (instancesText) write(instancesPath, instancesText);
    else drop(instancesPath);
  }

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
      instancesText,
      linkSigs,
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
  for (const [path, text] of Object.entries(files)) sizes.set(path, utf8Length(text));

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
    instancesText: files[`${AUTHORING_PREFIX}${INSTANCES_FILE}`] ?? '',
    // Seeded from what was read, so the first save rewrites an entry only if
    // its link has actually moved since. `authoring.instances` here is the
    // merged map the join produced — recipe-recovered links included — which is
    // exactly what the next diff will be handed.
    linkSigs: linkSigsOf(authoring.instances),
    authoring,
    maps: mapsById,
    sizes,
    literal,
  };
}
