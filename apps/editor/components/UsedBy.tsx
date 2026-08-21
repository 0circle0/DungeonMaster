/** Show which entries reference this item. */

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
  // Build the reference index once per document and defer the expensive recomputation.
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

  // Group references by the source entry so one entity with multiple links reads as one row.
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
