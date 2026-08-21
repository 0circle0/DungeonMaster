'use client';

/** What a save has to write, which is almost never very much. */

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

/** What a string costs to store, which is not its length. */
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

/** The document as it was last written, and enough about it to diff the next one. */
export interface ProjectSnapshot {
  readonly doc: Record<string, unknown>;
  readonly manifest: ProjectManifest;
  readonly manifestText: string;
  readonly shellText: string;
  readonly authoring: WorldAuthoring;
  readonly maps: ReadonlyMap<string, Record<string, unknown>>;
  /** Path to byte length, so `storedBytes` is kept by delta rather than by scan. */
  readonly sizes: ReadonlyMap<string, number>;
  /** Linked entries whose file is not a recipe, as `collection\u0000id`. */
  readonly literal: ReadonlySet<string>;
  /** `prefabs/instances.json` as it was written, so it is not rewritten unchanged. */
  readonly instancesText: string;
  /** Every link by value, as `collection\u0000id` → signature. */
  readonly linkSigs: ReadonlyMap<string, string>;
}

/** A link reduced to something comparable. */
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

/** Prefabs whose expansion may have moved after a style or prefab change. */
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

  // Maps first, always.
  const { document: doc, maps } = liftMaps(next.doc);

  const manifest = manifestFor(doc);
  const manifestText = serializeProjectValue(manifest);
  if (manifestText !== previous?.manifestText) write(PROJECT_MANIFEST, manifestText);

  const shellText = serializeProjectValue(shellFor(doc));
  if (shellText !== previous?.shellText) write(`${AUTHORING_PREFIX}shell.json`, shellText);

  // --- entries -------------------------------------------------------------

  const { prefabs, style, instances } = next.authoring;
  const dirty = dirtyPrefabs(prefabs, style, previous);

  // Links that are not what they were, including ones that have appeared and gone.
  const linkSigs = linkSigsOf(instances);
  const movedLinks = new Set<string>();
  for (const [key, sig] of linkSigs) {
    if (previous?.linkSigs.get(key) !== sig) movedLinks.add(key);
  }
  for (const key of previous?.linkSigs.keys() ?? []) {
    if (!linkSigs.has(key)) movedLinks.add(key);
  }
  // Which collections that touches, so the whole-collection fast path below stays a fast path.
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

      // The same array object, named the same way, with no prefab moving under it.
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
        // A prefab that moved rewrites its entries: the recipe on disk expands to something else.
        const forced = (link !== null && dirty.has(link.id))
          || (id !== null && movedLinks.has(linkKey(collection, id)));
        if (!forced && before.get(file) === entry) return;

        const text = entryFileText(entry, link, prefabs, style);
        write(`${dir}/${file}`, text);

        // Whether this entry ended up describing its own provenance decides whether the sidecar has to.
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

  // Folder-granular: a layer's CSV filename comes from its name, then kind, then index.
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

  // Guarded on non-empty, mirroring `bundleModule`.
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

  /** The links that have nowhere else to live. */
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

/** The snapshot of a world that was just read, without re-deriving its files. */
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
        // An unreadable file is not evidence either way, and the join already reported it.
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
    // Seeded from what was read, so the first save rewrites an entry only if its link has moved since.
    linkSigs: linkSigsOf(authoring.instances),
    authoring,
    maps: mapsById,
    sizes,
    literal,
  };
}
