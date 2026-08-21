/** Turning a diagnostic's path into one the editor can act on. */

import { COLLECTIONS } from '@/lib/schema';

/** The same path with any id turned into its index, or null if the id names nothing. */
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
    // `Number.parseInt` stops at the first non-digit, so `3rd_barrow` would read as index 3.
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
