'use client';

/** Roads out of this area, edited from one end. */

import { useState } from 'react';
import type { ModuleStore } from '@/lib/store';
import { getAt } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

interface Road {
  to: string;
  travelMinutes?: number;
  oneWay?: boolean;
  gate?: string;
  [key: string]: unknown;
}

export function Roads(props: { store: ModuleStore; areaIndex: number }) {
  const { store, areaIndex } = props;
  const areas = (getAt(store.doc, ['world', 'areas']) ?? []) as Record<string, unknown>[];
  const area = areas[areaIndex];
  const [adding, setAdding] = useState('');
  if (!area) return null;

  const id = String(area['id'] ?? '');
  const roads = (area['connections'] ?? []) as Road[];
  const indexOf = (areaId: string) => areas.findIndex((entry) => String(entry['id']) === areaId);
  const roadsOf = (i: number) => ((areas[i]?.['connections'] ?? []) as Road[]);

  /** Every edit here is one undo step, because a road is one thing. */
  const edit = (
    changes: { path: (string | number)[]; value: unknown }[],
    removals: (string | number)[][] = [],
  ) => {
    if (changes.length > 0) store.setMany(changes);
    for (const path of removals) store.remove(path);
  };

  const add = (to: string) => {
    const far = indexOf(to);
    if (!to || far < 0 || roads.some((road) => road.to === to)) return;
    edit([
      { path: ['world', 'areas', areaIndex, 'connections', roads.length], value: { to, travelMinutes: 10 } },
      { path: ['world', 'areas', far, 'connections', roadsOf(far).length], value: { to: id, travelMinutes: 10 } },
    ]);
    setAdding('');
  };

  const remove = (road: Road, i: number) => {
    const far = indexOf(road.to);
    const back = far >= 0 ? roadsOf(far).findIndex((entry) => entry.to === id) : -1;
    // Far end first, so the two removals stay independent.
    const paths: (string | number)[][] = [];
    if (far >= 0 && back >= 0) paths.push(['world', 'areas', far, 'connections', back]);
    paths.push(['world', 'areas', areaIndex, 'connections', i]);
    edit([], paths);
  };

  const setMinutes = (road: Road, i: number, minutes: number) => {
    const far = indexOf(road.to);
    const back = far >= 0 ? roadsOf(far).findIndex((entry) => entry.to === id) : -1;
    const changes = [{ path: ['world', 'areas', areaIndex, 'connections', i, 'travelMinutes'], value: minutes }];
    if (back >= 0) {
      changes.push({ path: ['world', 'areas', far, 'connections', back, 'travelMinutes'], value: minutes });
    }
    edit(changes);
  };

  const setOneWay = (road: Road, i: number, oneWay: boolean) => {
    const far = indexOf(road.to);
    const back = far >= 0 ? roadsOf(far).findIndex((entry) => entry.to === id) : -1;
    if (oneWay) {
      // A one-way road is this end only: marking it one-way removes the return entry.
      store.setMany([{ path: ['world', 'areas', areaIndex, 'connections', i, 'oneWay'], value: true }]);
      if (back >= 0) store.remove(['world', 'areas', far, 'connections', back]);
      return;
    }
    const minutes = road.travelMinutes ?? 10;
    store.setMany([
      { path: ['world', 'areas', areaIndex, 'connections', i, 'oneWay'], value: false },
      ...(back < 0
        ? [{ path: ['world', 'areas', far, 'connections', roadsOf(far).length], value: { to: id, travelMinutes: minutes } }]
        : []),
    ]);
  };

  const elsewhere = areas
    .map((entry) => String(entry['id']))
    .filter((other) => other !== id && !roads.some((road) => road.to === other));

  return (
    <div className={styles.roads}>
      <div className={styles.prefabHead}>
        Roads
        <code>{roads.length}</code>
      </div>

      {roads.length === 0 ? (
        <p className={styles.prefabNote}>Nowhere to walk from here.</p>
      ) : (
        <table className={styles.roadTable}>
          <tbody>
            {roads.map((road, i) => {
              const far = indexOf(road.to);
              const returns = far >= 0 && roadsOf(far).some((entry) => entry.to === id);
              return (
                <tr key={`${road.to}:${i}`}>
                  <td>
                    <code>{road.to}</code>
                    {far < 0 && <span className={styles.roadBad}> no such area</span>}
                  </td>
                  <td>
                    <input
                      className="input narrow"
                      type="number"
                      value={road.travelMinutes ?? ''}
                      onChange={(e) => setMinutes(road, i, Number(e.target.value))}
                      title="Travel time, kept the same in both directions"
                    />
                    <span className={styles.roadUnit}>min</span>
                  </td>
                  <td>
                    <label className={styles.roadOneWay} title="No road back from there">
                      <input
                        type="checkbox"
                        checked={road.oneWay === true || (far >= 0 && !returns)}
                        onChange={(e) => setOneWay(road, i, e.target.checked)}
                      />
                      one-way
                    </label>
                  </td>
                  <td>
                    <button className="btn tiny" onClick={() => remove(road, i)} title="Remove both ends">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {elsewhere.length > 0 && (
        <div className={styles.roadAdd}>
          <select className="input" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">— add a road to —</option>
            {elsewhere.map((other) => (
              <option key={other} value={other}>
                {other}
              </option>
            ))}
          </select>
          <button className="btn tiny primary" disabled={!adding} onClick={() => add(adding)}>
            Add
          </button>
          <span className={styles.prefabNote}>Both ends, in one step.</span>
        </div>
      )}
    </div>
  );
}
