/** Editing many entries at once. */

import type { Path } from './store';

export interface BulkEdit {
  readonly path: Path;
  readonly value: unknown;
}

export interface BulkPlan {
  /** What to write, ready for `store.setMany`. */
  readonly edits: readonly BulkEdit[];
  /** How many entries actually change — not how many were selected. */
  readonly changed: number;
  /** One line describing what will happen, for the button and the undo label. */
  readonly summary: string;
}

const EMPTY: BulkPlan = { edits: [], changed: 0, summary: 'nothing to change' };

/** The path to one entry's field, e.g. `content.monsters.12.level`. */
function fieldPath(collection: string, index: number, field: string): Path {
  return [...collection.split('.'), index, ...field.split('.')];
}

function readField(entry: Record<string, unknown>, field: string): unknown {
  let current: unknown = entry;
  for (const segment of field.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Set one field on every selected entry. */
export function planSetField(
  entries: readonly Record<string, unknown>[],
  collection: string,
  selected: readonly number[],
  field: string,
  value: unknown,
): BulkPlan {
  if (!field.trim()) return EMPTY;
  const edits: BulkEdit[] = [];

  for (const index of selected) {
    const entry = entries[index];
    if (!entry) continue;
    if (readField(entry, field) === value) continue;
    edits.push({ path: fieldPath(collection, index, field), value });
  }

  return {
    edits,
    changed: edits.length,
    summary: `set ${field} on ${edits.length} ${edits.length === 1 ? 'entry' : 'entries'}`,
  };
}

/** Add or remove a tag across a selection. */
export function planTag(
  entries: readonly Record<string, unknown>[],
  collection: string,
  selected: readonly number[],
  tag: string,
  action: 'add' | 'remove',
): BulkPlan {
  const wanted = tag.trim();
  if (!wanted) return EMPTY;
  const edits: BulkEdit[] = [];

  for (const index of selected) {
    const entry = entries[index];
    if (!entry) continue;
    const current = Array.isArray(entry['tags']) ? (entry['tags'] as unknown[]).map(String) : [];
    const has = current.includes(wanted);

    if (action === 'add' && !has) {
      edits.push({ path: fieldPath(collection, index, 'tags'), value: [...current, wanted] });
    } else if (action === 'remove' && has) {
      edits.push({
        path: fieldPath(collection, index, 'tags'),
        value: current.filter((t) => t !== wanted),
      });
    }
  }

  return {
    edits,
    changed: edits.length,
    summary: `${action === 'add' ? 'add' : 'remove'} tag "${wanted}" ${
      action === 'add' ? 'to' : 'from'
    } ${edits.length} ${edits.length === 1 ? 'entry' : 'entries'}`,
  };
}

/** Replace text in one field across a selection. */
export function planReplace(
  entries: readonly Record<string, unknown>[],
  collection: string,
  selected: readonly number[],
  field: string,
  find: string,
  replaceWith: string,
): BulkPlan {
  if (!field.trim() || find === '') return EMPTY;
  const edits: BulkEdit[] = [];

  for (const index of selected) {
    const entry = entries[index];
    if (!entry) continue;
    const current = readField(entry, field);
    if (typeof current !== 'string' || !current.includes(find)) continue;
    edits.push({ path: fieldPath(collection, index, field), value: current.split(find).join(replaceWith) });
  }

  return {
    edits,
    changed: edits.length,
    summary: `replace in ${field} across ${edits.length} ${edits.length === 1 ? 'entry' : 'entries'}`,
  };
}

/** Move one entry within its collection. */
export function planMove(
  entries: readonly Record<string, unknown>[],
  collection: string,
  from: number,
  to: number,
): BulkPlan {
  const clamped = Math.max(0, Math.min(entries.length - 1, to));
  if (from === clamped || !entries[from]) return EMPTY;

  const next = [...entries];
  const [moved] = next.splice(from, 1);
  next.splice(clamped, 0, moved);

  // One edit for the whole list: a move renumbers everything between the two positions.
  return {
    edits: [{ path: collection.split('.'), value: next }],
    changed: Math.abs(clamped - from) + 1,
    summary: `move ${String(entries[from]?.['id'] ?? from)} to position ${clamped + 1}`,
  };
}
