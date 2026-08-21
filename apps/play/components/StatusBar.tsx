'use client';

/** How the selected character is doing, pinned along the bottom. */

import { useMemo } from 'react';
import { statusView } from '@dm/play';
import type { SessionApi } from '../lib/useSession.js';

export function StatusBar({ session }: { session: SessionApi }) {
  const { module, frame } = session;
  const view = useMemo(() => statusView(module, frame.state), [module, frame.state]);
  if (!view) return null;

  const turnName = view.combat?.turnOf
    ? frame.state.entities[view.combat.turnOf]?.name ?? ''
    : '';

  return (
    <div className="status-bar">
      <span className="who">{view.name}</span>
      <span className="chip">L{view.level}</span>
      {view.resources.map((pool) => (
        <span className="pool" key={pool.id}>
          <span className="label">{pool.name}</span>
          {pool.vital ? (
            <span className={`meter ${pool.band}`}>
              <i style={{ width: `${pool.max > 0 ? (pool.current / pool.max) * 100 : 0}%` }} />
            </span>
          ) : null}
          <span>{pool.current}/{pool.max}</span>
        </span>
      ))}
      {view.stance && <span className="chip">{view.stance.name.toLowerCase()}</span>}
      {view.conditions.map((condition) => (
        <span className="chip condition" key={condition}>{condition}</span>
      ))}
      {view.combat && (
        <span className="chip combat">
          ⚔ round {view.combat.round}{turnName ? ` — ${turnName}'s turn` : ''}
        </span>
      )}
      <span className="clock">{view.clock.text}</span>
    </div>
  );
}
