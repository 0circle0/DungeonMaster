'use client';

/**
 * What the party can do right now, as buttons.
 *
 * Straight from `@dm/play`'s `affordances` — the same list the terminal prints
 * as its hint line. A blocked entry renders disabled with its reason in the
 * tooltip, because a bare absence teaches the player nothing.
 */

import { useMemo } from 'react';
import { affordances } from '@dm/play';
import type { SessionApi } from '../lib/useSession.js';

export function ContextBar({ session }: { session: SessionApi }) {
  const { module, terrain, frame, dispatchAction } = session;

  const offered = useMemo(
    () => affordances({ module, state: frame.state, terrain }),
    [module, frame.state, terrain],
  );

  if (offered.length === 0) return null;

  return (
    <div className="context-bar">
      {offered.map((entry) => (
        <button
          key={entry.id}
          className={`btn ${entry.weight >= 85 && !entry.blocked ? 'primary' : ''}`}
          disabled={entry.blocked !== undefined}
          title={entry.blocked ?? undefined}
          onClick={() => dispatchAction(entry.action)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
