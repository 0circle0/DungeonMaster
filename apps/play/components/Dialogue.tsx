'use client';

/**
 * A conversation: the numbered replies as a clickable list.
 *
 * Locked options stay visible, greyed, with the module's own hint — knowing
 * what would unlock a reply is content, not chrome. Leave always works,
 * because a conversation with no exit was one of the bugs that sent this
 * project to the browser.
 */

import { useMemo } from 'react';
import { Rng } from '@dm/core';
import { Transaction, visibleOptions } from '@dm/engine';
import type { SessionApi } from '../lib/useSession.js';

export function Dialogue({ session }: { session: SessionApi }) {
  const { module, frame, dispatchAction } = session;

  const options = useMemo(() => {
    if (!frame.state.dialogue) return [];
    const actor = frame.state.entities[frame.state.selected];
    if (!actor) return [];
    const txn = new Transaction(frame.state, module);
    return visibleOptions(txn, actor, Rng.fromState(frame.state.rng));
  }, [module, frame.state]);

  if (!frame.state.dialogue) return null;

  const speaker = frame.state.entities[frame.state.dialogue.npc];

  return (
    <div className="dialogue">
      {speaker && <div className="say">Talking to {speaker.name}.</div>}
      {options.map((option, index) => (
        <button
          key={option.id}
          className="dialogue-option"
          disabled={option.locked}
          onClick={() => dispatchAction({ type: 'choose', option: option.id })}
        >
          <span className="num">{index + 1}.</span>
          {option.text}
          {option.locked && option.hint && <span className="hint">{option.hint}</span>}
        </button>
      ))}
      <button
        className="dialogue-option"
        onClick={() => dispatchAction({ type: 'leave' })}
      >
        <span className="num">·</span>
        Leave the conversation
      </button>
    </div>
  );
}
