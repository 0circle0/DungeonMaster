/** Keeping the instance sidecar in step with the document. */

import { overriddenPaths } from './prefab.js';
import type { Prefab, PrefabLink, InstanceMap, StyleTables } from './prefab.js';

/** The instance map, brought up to date with the document. */
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
      // An entry that is gone, or a prefab that is, keeps no link.
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
