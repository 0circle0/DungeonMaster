/**
 * Editing many entries at once.
 *
 * Every operation here returns the edits it *would* make rather than a new
 * document, for the same reason `planRename` does: an author asked to trust a
 * change to forty things wants to see the count first, and a preview is the
 * difference between a tool used once and a tool used daily.
 *
 * The edits are `(path, value)` pairs so the store can fold them through
 * `setAtMany`, which is the contract that keeps validation fast — see the note
 * there. Building a new document by cloning and mutating would give all 597
 * points of interest fresh identities and put a second back on every keystroke,
 * and nothing would fail.
 */

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

/**
 * Set one field on every selected entry.
 *
 * Entries that already hold the value are left out of the plan entirely, so
 * the count is what will change rather than what was selected — "set 40, 3
 * changed" is a more useful thing to be told than "set 40".
 */
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

/**
 * Add or remove a tag across a selection.
 *
 * Tags are how a module says what optional content belongs to what — the
 * Python linter reads chain membership straight off them — so adding one to
 * fifteen quests is a real operation rather than a convenience.
 */
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

/**
 * Replace text in one field across a selection.
 *
 * Scoped to a named field rather than the whole entry on purpose. A find and
 * replace that swept every string in a monster would rewrite its id and its
 * references along with its description, and the two are not the same kind of
 * change: one is prose, the other is `planRename`'s job.
 */
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

/**
 * Move one entry within its collection.
 *
 * Order is not decoration: `narrative.textGrammar` is emitted sorted so a diff
 * is a function of content, and a collection's order is the order the format
 * preserves. There has been no way to change it in the editor at all.
 */
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

  // One edit for the whole list: moving an entry renumbers everything between
  // the two positions, so a per-entry plan would be the same write in pieces.
  return {
    edits: [{ path: collection.split('.'), value: next }],
    changed: Math.abs(clamped - from) + 1,
    summary: `move ${String(entries[from]?.['id'] ?? from)} to position ${clamped + 1}`,
  };
}
