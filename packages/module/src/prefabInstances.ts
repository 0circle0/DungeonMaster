/**
 * Keeping the instance sidecar in step with the document.
 *
 * Half of a link is authored and half is derived, and the distinction is the
 * whole point: `params` are what somebody typed when they placed the entry and
 * are carried through untouched, while `overrides` are recomputed every time,
 * because "a field I changed by hand" is not a thing to remember — it is a
 * thing to observe. An override is whatever differs from what the prefab
 * produces *now*, so the inspector shows the truth rather than a record of one.
 *
 * Pure, and separate from any storage: this used to live beside the code that
 * wrote files, which made it look like filesystem policy when it is really the
 * behaviour behind a panel. The studio runs it in the browser now.
 */

import { overriddenPaths } from './prefab.js';
import type { Prefab, PrefabLink, InstanceMap, StyleTables } from './prefab.js';

/**
 * The instance map, brought up to date with the document.
 *
 * Returns null when there are no prefabs, so a world that does not use them
 * never grows the sidecar.
 */
export function recomputeInstances(
  doc: Record<string, unknown>,
  prefabs: readonly Prefab[],
  instances: InstanceMap,
  style: StyleTables = {},
): InstanceMap | null {
  if (prefabs.length === 0) return null;

  const byId = new Map(prefabs.map((prefab) => [prefab.id, prefab]));
  const out: Record<string, Record<string, PrefabLink>> = {};

  for (const [collection, links] of Object.entries(instances)) {
    const [section, listName] = collection.split('.') as [string, string];
    const entries = (doc[section] as Record<string, unknown> | undefined)?.[listName];
    if (!Array.isArray(entries)) continue;

    for (const [id, link] of Object.entries(links)) {
      const entry = (entries as Record<string, unknown>[]).find((e) => e['id'] === id);
      const prefab = byId.get(link.id);
      // An entry that is gone, or a prefab that is, keeps no link: the first
      // has nothing to describe and the second can never be followed again.
      if (!entry || !prefab) continue;

      (out[collection] ??= {})[id] = {
        id: link.id,
        params: link.params,
        overrides: [...overriddenPaths(prefab, entry, link, style)],
      };
    }
  }

  return out;
}
