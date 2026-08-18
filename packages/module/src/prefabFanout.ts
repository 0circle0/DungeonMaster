/**
 * What changing a prefab would do to the things placed from it.
 *
 * The value of a linked instance is that editing `inn` updates thirty-six inns.
 * The danger is exactly the same sentence. An author who cannot see the second
 * half before it happens learns not to touch prefabs, which costs more than the
 * link was worth.
 *
 * So a change is planned first: which instances move, which fields change in
 * each, and which are left alone because somebody overrode them. Then it is
 * applied, or not.
 */

import { reexpand } from './prefab.js';
import type { Prefab, PrefabLink, InstanceMap, StyleTables } from './prefab.js';

export interface FieldChange {
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
}

export interface InstanceChange {
  readonly collection: string;
  readonly id: string;
  readonly index: number;
  readonly changes: readonly FieldChange[];
  /** Paths the prefab wanted to change and could not, because they are theirs. */
  readonly kept: readonly string[];
  readonly entry: Record<string, unknown>;
}

export interface FanoutPlan {
  readonly prefab: string;
  /** Instances whose entry would actually change. */
  readonly changed: readonly InstanceChange[];
  /** Instances that follow this prefab but come out identical. */
  readonly unchanged: number;
  readonly problems: readonly string[];
}

function entriesOf(doc: Record<string, unknown>, collection: string): Record<string, unknown>[] {
  const [section, name] = collection.split('.') as [string, string];
  const container = doc[section];
  if (typeof container !== 'object' || container === null) return [];
  const list = (container as Record<string, unknown>)[name];
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

/** Every leaf that differs, as a flat list of paths. */
function diff(before: unknown, after: unknown, path: string, out: FieldChange[]): void {
  const objects =
    typeof before === 'object' && before !== null && !Array.isArray(before) &&
    typeof after === 'object' && after !== null && !Array.isArray(after);

  if (objects) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      diff(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        out,
      );
    }
    return;
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ path, from: before, to: after });
}

/**
 * Work out what editing this prefab would do, without doing it.
 *
 * `prefab` is the *new* definition; the instances are read from the document as
 * it stands. Nothing is written.
 */
export function planFanout(
  prefab: Prefab,
  doc: Record<string, unknown>,
  instances: InstanceMap,
  style: StyleTables = {},
): FanoutPlan {
  const changed: InstanceChange[] = [];
  const problems: string[] = [];
  let unchanged = 0;

  for (const [collection, links] of Object.entries(instances)) {
    const entries = entriesOf(doc, collection);

    for (const [id, link] of Object.entries(links as Record<string, PrefabLink>)) {
      if (link.id !== prefab.id) continue;

      const index = entries.findIndex((entry) => entry['id'] === id);
      if (index < 0) continue;
      const before = entries[index]!;

      const { entry: after, issues } = reexpand(prefab, before, link, style);
      for (const issue of issues) problems.push(`${id}: ${issue.message}`);

      const changes: FieldChange[] = [];
      diff(before, after, '', changes);
      if (changes.length === 0) {
        unchanged += 1;
        continue;
      }

      // What the prefab wanted and did not get. Worth showing: it is the
      // difference between "this did nothing" and "this was already yours".
      const kept = (link.overrides ?? []).filter((path) => {
        const naive = reexpand(prefab, before, { ...link, overrides: [] }, style).entry;
        const held: FieldChange[] = [];
        diff(before, naive, '', held);
        return held.some((change) => change.path === path);
      });

      changed.push({ collection, id, index, changes, kept, entry: after });
    }
  }

  return { prefab: prefab.id, changed, unchanged, problems };
}

/** The edits a plan makes, ready for the editor's batched `setMany`. */
export function fanoutEdits(
  plan: FanoutPlan,
): readonly { path: (string | number)[]; value: unknown }[] {
  return plan.changed.map((change) => ({
    path: [...change.collection.split('.'), change.index],
    value: change.entry,
  }));
}
