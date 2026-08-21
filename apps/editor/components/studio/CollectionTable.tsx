/** A collection as a filterable table in the viewport. */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Diagnostic } from '@dm/module';
import { collectionAt } from '@/lib/schema';
import { parseQuery, matchesQuery, QUERY_HELP } from '@/lib/query';
import type { ModuleStore } from '@/lib/store';
import type { Selection } from '@/app/studio/selection';
import { BulkBar } from './BulkBar';
import styles from '@/app/studio/studio.module.css';

export function CollectionTable(props: {
  path: string;
  entries: readonly Record<string, unknown>[];
  errors: readonly Diagnostic[];
  selection: Selection;
  store: ModuleStore;
  onSelect: (index: number) => void;
  onAdd: () => void;
  /** Offered when a prefab in this project makes this kind of entry. */
  onPlace?: (() => void) | undefined;
}) {
  const [filter, setFilter] = useState('');
  /** The selected row, so a jump from elsewhere can bring it into view. */
  const activeRow = useRef<HTMLTableRowElement | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  /** The last row checked, so shift-click has a range to work from. */
  const [anchor, setAnchor] = useState<number | null>(null);
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

  const terms = useMemo(() => parseQuery(filter), [filter]);
  const visible = useMemo(
    () =>
      props.entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => matchesQuery(entry, terms)),
    [props.entries, terms],
  );

  // Changing collection is a different set of rows, so a selection cannot mean anything any more.
  const [lastPath, setLastPath] = useState(props.path);
  if (lastPath !== props.path) {
    setLastPath(props.path);
    setChecked(new Set());
    setAnchor(null);
  }

  const selectedIndex =
    props.selection.kind === 'item' && props.selection.path === props.path ? props.selection.index : -1;
  const visibleIndices = visible.map((v) => v.index);

  /** Bring the selected entry into view when the selection came from somewhere else. */
  const pendingJump = useRef(false);
  useEffect(() => {
    pendingJump.current = selectedIndex >= 0;
  }, [selectedIndex, props.path]);

  useEffect(() => {
    if (!pendingJump.current || selectedIndex < 0) return;
    // Hidden by the filter rather than absent.
    if (selectedIndex < props.entries.length && !visibleIndices.includes(selectedIndex)) {
      setFilter('');
      return;
    }
    pendingJump.current = false;
    activeRow.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedIndex, props.path, props.entries.length, visibleIndices]);

  if (!info) return <p className={styles.treeEmpty}>Unknown collection.</p>;

  const allShown = visibleIndices.length > 0 && visibleIndices.every((i) => checked.has(i));


  const toggle = (index: number, shift: boolean) => {
    const next = new Set(checked);
    if (shift && anchor !== null) {
      // A range over what is shown, not over the underlying indices.
      const from = visibleIndices.indexOf(anchor);
      const to = visibleIndices.indexOf(index);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        for (const i of visibleIndices.slice(lo, hi + 1)) next.add(i);
        setChecked(next);
        return;
      }
    }
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setChecked(next);
    setAnchor(index);
  };

  return (
    <div>
      <div className={styles.tableTools}>
        <h2 className={styles.tableTitle}>
          {info.label}
          <span className={styles.tablePath}>{info.path}</span>
        </h2>
        <input
          className={`input ${styles.queryInput}`}
          placeholder="Filter…"
          title={QUERY_HELP}
          spellCheck={false}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className={styles.tableCount}>
          {visible.length === props.entries.length
            ? `${props.entries.length}`
            : `${visible.length} of ${props.entries.length}`}
        </span>
        <button className="btn primary" onClick={props.onAdd}>
          + New
        </button>
        {props.onPlace && (
          <button className="btn" onClick={props.onPlace} title="Fill in a few fields; the prefab writes the rest">
            + From prefab
          </button>
        )}
      </div>

      {filter !== '' && <p className={styles.queryHelp}>{QUERY_HELP}</p>}

      {checked.size > 0 && (
        <BulkBar
          store={props.store}
          collection={props.path}
          entries={props.entries}
          selected={[...checked].sort((a, b) => a - b)}
          onDone={() => {
            setChecked(new Set());
            setAnchor(null);
          }}
        />
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.cellCheck}>
              <input
                type="checkbox"
                checked={allShown}
                title={allShown ? 'Clear' : 'Select everything shown'}
                onChange={() => {
                  const next = new Set(checked);
                  if (allShown) for (const i of visibleIndices) next.delete(i);
                  else for (const i of visibleIndices) next.add(i);
                  setChecked(next);
                }}
              />
            </th>
            <th>Name</th>
            <th>Id</th>
            <th>Problems</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ entry, index }) => (
            <tr
              key={index}
              ref={index === selectedIndex ? activeRow : undefined}
              className={index === selectedIndex ? styles.rowActive : ''}
              onClick={() => props.onSelect(index)}
            >
              <td className={styles.cellCheck} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checked.has(index)}
                  onChange={() => undefined}
                  onClick={(e) => toggle(index, e.shiftKey)}
                />
              </td>
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
      {visible.length === 0 && (
        <p className={styles.treeEmpty}>
          {props.entries.length === 0
            ? `No ${info.label.toLowerCase()} yet.`
            : `Nothing matches. ${QUERY_HELP}`}
        </p>
      )}
    </div>
  );
}
