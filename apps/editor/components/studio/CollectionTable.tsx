/**
 * A collection as a sortable, filterable table in the viewport. Row click
 * selects the entry into the inspector; the table stays visible so moving
 * between entries is one click, not a navigation.
 */

import { useMemo, useState } from 'react';
import type { Diagnostic } from '@dm/module';
import { collectionAt } from '@/lib/schema';
import type { Selection } from '@/app/studio/selection';
import styles from '@/app/studio/studio.module.css';

export function CollectionTable(props: {
  path: string;
  entries: readonly Record<string, unknown>[];
  errors: readonly Diagnostic[];
  selection: Selection;
  onSelect: (index: number) => void;
  onAdd: () => void;
}) {
  const [filter, setFilter] = useState('');
  const info = collectionAt(props.path);

  const errorsByIndex = useMemo(() => {
    const out = new Map<number, number>();
    const prefix = `${props.path}.`;
    for (const issue of props.errors) {
      if (!issue.path.startsWith(prefix)) continue;
      const index = Number.parseInt(issue.path.slice(prefix.length), 10);
      if (Number.isInteger(index)) out.set(index, (out.get(index) ?? 0) + 1);
    }
    return out;
  }, [props.errors, props.path]);

  if (!info) return <p className={styles.treeEmpty}>Unknown collection.</p>;

  const needle = filter.toLowerCase();
  const visible = props.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) =>
      needle === ''
        ? true
        : `${String(entry['id'] ?? '')} ${String(entry['name'] ?? '')}`.toLowerCase().includes(needle),
    );

  const selectedIndex =
    props.selection.kind === 'item' && props.selection.path === props.path ? props.selection.index : -1;

  return (
    <div>
      <div className={styles.tableTools}>
        <h2 className={styles.tableTitle}>
          {info.label}
          <span className={styles.tablePath}>{info.path}</span>
        </h2>
        <input
          className="input narrow"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn primary" onClick={props.onAdd}>
          + New
        </button>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Id</th>
            <th>Problems</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ entry, index }) => (
            <tr
              key={index}
              className={index === selectedIndex ? styles.rowActive : ''}
              onClick={() => props.onSelect(index)}
            >
              <td>{String(entry['name'] ?? entry['id'] ?? `#${index}`)}</td>
              <td className={styles.cellId}>{String(entry['id'] ?? '')}</td>
              <td>
                {errorsByIndex.has(index) ? (
                  <span className={styles.cellErr}>{errorsByIndex.get(index)}</span>
                ) : (
                  ''
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 && <p className={styles.treeEmpty}>No {info.label.toLowerCase()} yet.</p>}
    </div>
  );
}
