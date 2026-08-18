/**
 * Content nothing points at.
 *
 * The other half of the reference graph, and the half that finds work nobody
 * remembers doing: a loot table written three sessions ago that no creature
 * drops, an item no shop stocks, a gate hung on nothing. None of it is an
 * error — the module compiles and plays — which is exactly why it accumulates.
 *
 * The collections excluded here are the ones legitimately reached without a
 * static reference, and the list is shared with the used-by panel rather than
 * written twice: a condition is named inside a DSL string, an ancestry is
 * chosen at character creation, an area is reached by walking. Reporting those
 * would train an author to ignore the view, which costs more than the view is
 * worth.
 */

'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { buildReferenceIndex, findOrphans } from '@dm/module';
import { REACHED_INDIRECTLY, placesItself } from '@/lib/reachability';
import type { ModuleDoc } from '@/lib/store';
import { labelFor } from '@/lib/schema';

export function OrphansView(props: {
  doc: ModuleDoc;
  onOpen: (collection: string, index: number) => void;
}) {
  // The same walk `UsedBy` does, and the same reason for deferring it: it reads
  // the whole document, and nothing here needs to be current mid-keystroke.
  const doc = useDeferredValue(props.doc);
  const [showAll, setShowAll] = useState(false);

  const orphans = useMemo(() => {
    const index = buildReferenceIndex(doc);
    const found = findOrphans(doc, index, showAll ? [] : [...REACHED_INDIRECTLY.keys()]);
    if (showAll) return found;

    // An NPC naming its own home is on the map; nothing pointing at it is not a
    // problem, it is the wrong question. See `lib/reachability.ts`.
    return found.filter((orphan) => {
      const [section, name] = orphan.collection.split('.') as [string, string];
      const entries = (doc[section] as Record<string, unknown> | undefined)?.[name];
      const entry = Array.isArray(entries) ? (entries[orphan.index] as Record<string, unknown>) : undefined;
      return !entry || !placesItself(orphan.collection, entry);
    });
  }, [doc, showAll]);

  const byCollection = useMemo(() => {
    const out = new Map<string, typeof orphans>();
    for (const orphan of orphans) {
      const list = out.get(orphan.collection) ?? [];
      list.push(orphan);
      out.set(orphan.collection, list);
    }
    return [...out.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [orphans]);

  return (
    <div className="orphans">
      <div className="pane-head">
        <h2 className="pane-title">
          Unreferenced
          <code className="pane-path">{orphans.length} entries</code>
        </h2>
        <label className="checkbox">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>include what the engine reaches indirectly</span>
        </label>
      </div>

      <p className="hint">
        Nothing in the module points at these. That is not an error — content can be reached by a DSL
        string, by a generator, or by the player choosing it — but it is where forgotten work collects.
        {!showAll
          ? ' Content the engine reaches without a reference is hidden, so what is left is worth looking at.'
          : ' Showing everything, including what the engine reaches indirectly — most of this is fine.'}
      </p>

      {orphans.length === 0 && <p className="empty">Everything is referenced by something.</p>}

      {byCollection.map(([collection, entries]) => (
        <div key={collection} className="group">
          <div className="group-head">
            <span className="group-label">{labelFor(collection.split('.')[1] ?? collection)}</span>
            <span className="count">{entries.length}</span>
          </div>
          <div className="usedby-list">
            {entries.map((orphan) => (
              <button
                key={`${orphan.collection}:${orphan.index}`}
                className="usedby-item"
                onClick={() => props.onOpen(orphan.collection, orphan.index)}
              >
                <span className="usedby-label">{orphan.label}</span>
                <code className="usedby-where">{orphan.id}</code>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
