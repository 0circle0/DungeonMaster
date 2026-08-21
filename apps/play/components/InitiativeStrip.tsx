'use client';

/** The turn order, while there is one. */

import type { SessionApi } from '../lib/useSession.js';

export function InitiativeStrip({ session }: { session: SessionApi }) {
  const { frame } = session;
  const combat = frame.state.combat;
  if (!combat) return null;

  return (
    <div className="initiative">
      <span className="round">round {combat.round}</span>
      {combat.order.map((id, index) => {
        const combatant = frame.state.entities[id];
        if (!combatant || !combatant.alive) return null;
        const classes = [
          'chip',
          index === combat.turn ? 'active' : '',
          combatant.disposition === 'hostile' ? 'hostile' : '',
        ].filter(Boolean).join(' ');
        return <span key={id} className={classes}>{combatant.name}</span>;
      })}
      <span className="round">move left: {combat.movement}</span>
    </div>
  );
}
