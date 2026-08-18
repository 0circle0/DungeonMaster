/**
 * "What points at this?"
 *
 * Shown beside every entry. The question it answers is the one asked before
 * deleting or renaming anything, and the alternative is grepping the JSON.
 *
 * An entry nothing references is called out rather than left blank — a loot
 * table no creature drops is invisible work, and the only way to notice is to
 * be told.
 */

'use client';

import { useDeferredValue, useMemo } from 'react';
import { buildReferenceIndex, referencesTo } from '@dm/module';
import type { ModuleDoc } from '@/lib/store';
import { REACHED_INDIRECTLY } from '@/lib/reachability';


export function UsedBy({
  doc,
  collection,
  id,
  onOpen,
}: {
  doc: ModuleDoc;
  collection: string;
  id: string;
  onOpen: (collection: string, index: number) => void;
}) {
  // Rebuilding per entry would be wasteful; the index covers the whole module.
  //
  // Deferred, because building it walks the schema alongside the whole document
  // — ~23 ms on a large module, on every keystroke, for a panel nobody is
  // looking at while they type. `useDeferredValue` lets the field they *are*
  // looking at paint first and rebuilds this behind it.
  const deferredDoc = useDeferredValue(doc);
  const index = useMemo(() => buildReferenceIndex(deferredDoc), [deferredDoc]);
  const references = useMemo(() => referencesTo(index, collection, id), [index, collection, id]);

  if (!id) return null;

  if (references.length === 0) {
    if (REACHED_INDIRECTLY.has(collection)) return null;
    return (
      <div className="usedby">
        <div className="usedby-head">Used by</div>
        <p className="usedby-orphan">
          Nothing references this. It will never appear in play unless something points at it.
        </p>
      </div>
    );
  }

  // Group by the entry doing the referencing, so one monster with three
  // references to this item reads as one row rather than three.
  const grouped = new Map<string, { label: string; collection: string; index: number; fields: string[] }>();
  for (const reference of references) {
    const key = `${reference.fromCollection}:${reference.fromIndex}`;
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.fields.includes(reference.field)) existing.fields.push(reference.field);
    } else {
      grouped.set(key, {
        label: reference.fromLabel,
        collection: reference.fromCollection,
        index: reference.fromIndex,
        fields: [reference.field],
      });
    }
  }

  return (
    <div className="usedby">
      <div className="usedby-head">
        Used by <span className="usedby-count">{grouped.size}</span>
      </div>
      <div className="usedby-list">
        {[...grouped.values()].map((entry) => (
          <button
            key={`${entry.collection}:${entry.index}`}
            className="usedby-item"
            onClick={() => onOpen(entry.collection, entry.index)}
          >
            <span className="usedby-label">{entry.label}</span>
            <code className="usedby-where">{entry.collection.split('.')[1]}</code>
            <span className="usedby-fields">{entry.fields.join(', ')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
