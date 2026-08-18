/**
 * Turning a diagnostic's path into one the editor can act on.
 *
 * A path names an entry two ways in practice. Our own checks count — the
 * compiler and the rules both emit `content.monsters.3` — while a mod names
 * what it means: `content.monsters.grave_hound`. Both are right. An index is
 * what the document literally is; an id is the only part of it that survives
 * something being inserted above.
 *
 * Only one of them could be clicked. A diagnostic carrying an id fell through
 * every branch of the resolver and opened the raw JSON, which is the answer
 * "somewhere in this document" to the question "where". Every mod diagnostic
 * did this, and on aurendel that is 127 of the 130 rows.
 *
 * So ids are resolved here, once, against the document — used both to open the
 * entry and to mark the field inside it, because the two disagreeing would be
 * its own kind of confusing.
 */

import { COLLECTIONS } from '@/lib/schema';

/**
 * The same path with any id turned into its index, or null if the id names
 * nothing. A path that already counts comes back untouched.
 */
export function withEntryIndex(doc: unknown, path: string): string | null {
  const found = splitEntryPath(doc, path);
  if (!found) return path;
  if (found.index < 0) return null;
  return [found.collection, found.index, ...found.rest].join('.');
}

export interface EntryPath {
  readonly collection: string;
  /** -1 when the id matched nothing. */
  readonly index: number;
  /** Whatever the path said after the entry. */
  readonly rest: readonly string[];
}

/** Split a path into its collection, the entry it names, and the rest. */
export function splitEntryPath(doc: unknown, path: string): EntryPath | null {
  for (const collection of COLLECTIONS) {
    if (!path.startsWith(`${collection.path}.`)) continue;
    const [head, ...rest] = path.slice(collection.path.length + 1).split('.');
    if (head === undefined) return null;

    const counted = Number.parseInt(head, 10);
    // `Number.parseInt` stops at the first non-digit, so an id beginning with
    // one — `3rd_barrow` — would otherwise read as index 3 and open whatever
    // happens to be there.
    if (/^\d+$/.test(head) && Number.isInteger(counted)) {
      return { collection: collection.path, index: counted, rest };
    }

    const entries = entriesAt(doc, collection.path);
    const index = entries.findIndex((entry) => String(entry?.['id'] ?? '') === head);
    return { collection: collection.path, index, rest };
  }
  return null;
}

function entriesAt(doc: unknown, path: string): Record<string, unknown>[] {
  let node: unknown = doc;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return [];
    node = (node as Record<string, unknown>)[segment];
  }
  return Array.isArray(node) ? (node as Record<string, unknown>[]) : [];
}
