/**
 * Module layering.
 *
 * `extends` lets a pack ship twelve monsters instead of forking an entire game. The base document
 * is loaded first and the patch is merged over it.
 *
 * Collections merge by id, not by position, because that is what an author means: an entry whose id
 * already exists overrides it field by field, and a new id is appended. Positional merging would
 * silently rewrite whichever monster happened to sit at index 3.
 */

import { COLLECTION_PATHS } from './schema/module.js';

/** Deleting an entry is explicit, since a patch cannot express absence. */
export const DELETE_MARKER = '$delete';

interface Identified {
  id?: unknown;
  [key: string]: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Paths whose arrays merge entry-by-entry on `id`.
 *
 * `mods` is in here but is not a collection: it is a single-segment top-level path with no
 * `section.collection` address, it is not indexed, and `collectionAt` cannot reach it. It merges by
 * id for the same reason the collections do — a base pinning a mod and a patch re-pinning it must
 * end up with one entry — and `$delete` then lets a pack drop an inherited mod.
 */
const COLLECTION_SET = new Set<string>([...COLLECTION_PATHS, 'mods']);

/**
 * Merge a patch over a base document.
 *
 * - Collections (`content.monsters` and friends) merge by id.
 * - Other objects merge key by key, recursively.
 * - Other arrays are replaced wholesale, since a bare list has no identity to merge on.
 */
export function mergeModules(base: unknown, patch: unknown): unknown {
  return mergeValue(base, patch, '');
}

function mergeValue(base: unknown, patch: unknown, path: string): unknown {
  if (patch === undefined) return base;

  if (isPlainObject(patch) && patch[DELETE_MARKER] === true) return undefined;

  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, patchValue] of Object.entries(patch)) {
      const childPath = path ? `${path}.${key}` : key;
      const merged = mergeValue(base[key], patchValue, childPath);
      if (merged === undefined) delete out[key];
      else out[key] = merged;
    }
    return out;
  }

  if (Array.isArray(base) && Array.isArray(patch) && COLLECTION_SET.has(path)) {
    return mergeById(base as Identified[], patch as Identified[], path);
  }

  // Scalars, mismatched shapes, and non-collection arrays: the patch wins.
  return patch;
}

function mergeById(base: Identified[], patch: Identified[], path: string): Identified[] {
  const byId = new Map<string, Identified>();
  const order: string[] = [];

  for (const entry of base) {
    const id = typeof entry?.id === 'string' ? entry.id : null;
    if (id === null) continue;
    byId.set(id, entry);
    order.push(id);
  }

  for (const entry of patch) {
    const id = typeof entry?.id === 'string' ? entry.id : null;
    if (id === null) continue;

    if (entry[DELETE_MARKER] === true) {
      byId.delete(id);
      continue;
    }

    const existing = byId.get(id);
    if (existing) {
      byId.set(id, mergeValue(existing, entry, `${path}[]`) as Identified);
    } else {
      byId.set(id, entry);
      order.push(id);
    }
  }

  return order.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
}

/** Parse an `extends` string such as `core_fantasy@1.0.0`. */
export function parseExtends(value: string): { id: string; version: string } | null {
  const match = /^([a-z][a-z0-9_]*)@(\d+\.\d+\.\d+)$/.exec(value);
  if (!match) return null;
  return { id: match[1]!, version: match[2]! };
}

/**
 * Resolve an `extends` chain into a single document. `load` fetches a base by `id@version`. The
 * chain is walked to its root and merged downward, so a pack may itself extend another pack. Cycles
 * are rejected rather than followed.
 */
export function resolveExtends(
  document: Record<string, unknown>,
  load: (identity: string) => Record<string, unknown> | undefined,
  seen: readonly string[] = [],
): { ok: true; document: Record<string, unknown> } | { ok: false; error: string } {
  const extendsValue = document['extends'];
  if (typeof extendsValue !== 'string' || extendsValue === '') {
    return { ok: true, document };
  }

  const parsed = parseExtends(extendsValue);
  if (!parsed) return { ok: false, error: `malformed extends value ${JSON.stringify(extendsValue)}` };

  const identity = `${parsed.id}@${parsed.version}`;
  const self = `${String(document['id'])}@${String(document['version'])}`;

  if (seen.includes(identity)) {
    return { ok: false, error: `extends cycle: ${[...seen, self, identity].join(' -> ')}` };
  }

  const base = load(identity);
  if (!base) return { ok: false, error: `base module ${identity} is not available` };

  const resolvedBase = resolveExtends(base, load, [...seen, self]);
  if (!resolvedBase.ok) return resolvedBase;

  const merged = mergeModules(resolvedBase.document, document) as Record<string, unknown>;
  // The result is a standalone document; keeping `extends` would re-merge on load.
  merged['extends'] = null;
  return { ok: true, document: merged };
}
