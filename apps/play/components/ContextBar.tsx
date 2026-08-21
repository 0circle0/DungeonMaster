'use client';

/**
 * Show the current affordances as action buttons.
 * Blocked actions keep their reason in the tooltip.
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
