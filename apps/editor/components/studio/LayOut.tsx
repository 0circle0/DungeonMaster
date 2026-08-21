'use client';

/** Spots for the places in this area that have none. */

import { useState } from 'react';
import { layOut } from '@dm/authoring';
import { getAt } from '@/lib/store';
import type { ModuleStore } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

const DEFAULT_SIZE = { width: 31, height: 21 };

export function LayOut(props: { store: ModuleStore; area: Record<string, unknown> }) {
  const { store, area } = props;
  const [showing, setShowing] = useState(false);

  const areaId = String(area['id'] ?? '');
  const map = (area['map'] ?? {}) as Record<string, unknown>;
  const size = {
    id: areaId,
    width: Number.parseInt(String(map['width'] ?? ''), 10) || DEFAULT_SIZE.width,
    height: Number.parseInt(String(map['height'] ?? ''), 10) || DEFAULT_SIZE.height,
  };

  const pois = (getAt(store.doc, ['world', 'pointsOfInterest']) ?? []) as Record<string, unknown>[];
  const mine = pois
    .map((poi, index) => ({ poi, index }))
    .filter(({ poi }) => String(poi['area'] ?? '') === areaId);
  const unplaced = mine.filter(({ poi }) => poi['position'] === undefined);

  if (mine.length === 0 || unplaced.length === 0) return null;

  const placements = layOut(
    mine.map(({ poi }) => ({
      id: String(poi['id'] ?? ''),
      area: areaId,
      ...(poi['position'] !== undefined
        ? { position: poi['position'] as { x: number; y: number } }
        : {}),
    })),
    [size],
  );
  const byId = new Map(mine.map(({ poi, index }) => [String(poi['id']), { poi, index }]));

  const apply = () => {
    store.setMany(
      placements.flatMap((placement) => {
        const found = byId.get(placement.id);
        if (!found) return [];
        return [{ path: ['world', 'pointsOfInterest', found.index, 'position'], value: placement.position }];
      }),
    );
    setShowing(false);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.prefabHead}>
        Unplaced
        <code>
          {unplaced.length} of {mine.length}
        </code>
      </div>
      <p className={styles.prefabNote}>
        {unplaced.length === 1 ? 'One place here has' : `${unplaced.length} places here have`} no
        spot on the {size.width}×{size.height} map. Anything already placed stays where it is.
      </p>

      {showing && (
        <ul className={styles.layoutList}>
          {placements.map((placement) => (
            <li key={placement.id}>
              <span>{String(byId.get(placement.id)?.poi['name'] ?? placement.id)}</span>
              <code>
                {placement.position.x}, {placement.position.y}
              </code>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.noticeRow}>
        <button className="btn tiny" onClick={() => setShowing((open) => !open)}>
          {showing ? 'Hide' : 'Show where they would go'}
        </button>
        <button className="btn tiny primary" onClick={apply}>
          Place {placements.length}
        </button>
      </div>
    </div>
  );
}
