/**
 * List all module events in one table, grouped by kind and filterable by text.
 */

'use client';

import { useMemo, useState } from 'react';
import type { ModuleDoc } from '@/lib/store';
import { collectEvents } from '@/lib/events';
import type { GameEvent } from '@/lib/events';

const KINDS: { id: GameEvent['kind'] | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trigger', label: 'Triggers' },
  { id: 'reaction', label: 'Reactions' },
  { id: 'gate', label: 'Gates' },
  { id: 'quest', label: 'Quests' },
  { id: 'dialogue', label: 'Dialogue' },
  { id: 'item', label: 'Items' },
  { id: 'condition', label: 'Conditions' },
];

/** Distinguish repeating event modes with a color hint. */
const MODE_CLASS: Record<string, string> = {
  once: 'mode-once',
  everyEntry: 'mode-every',
  untilComplete: 'mode-until',
  loop: 'mode-loop',
  restart: 'mode-restart',
};

export function EventsView({
  doc,
  onOpen,
}: {
  doc: ModuleDoc;
  onOpen: (collection: string, index: number) => void;
}) {
  const [kind, setKind] = useState<GameEvent['kind'] | 'all'>('all');
  const [query, setQuery] = useState('');

  const events = useMemo(() => collectEvents(doc), [doc]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: events.length };
    for (const event of events) out[event.kind] = (out[event.kind] ?? 0) + 1;
    return out;
  }, [events]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (kind !== 'all' && event.kind !== kind) return false;
      if (needle === '') return true;
      return [event.when, event.where, event.who, ...event.what, ...event.why]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [events, kind, query]);

  return (
    <div className="events">
      <div className="pane-head">
        <h2 className="pane-title">
          Events
          <code className="pane-path">when · where · who · what · why</code>
        </h2>
      </div>

      <p className="hint">
        Everything in this module that can fire, in one place. {events.length} in total.
      </p>

      <div className="events-filters">
        {KINDS.map((entry) => (
          <button
            key={entry.id}
            className={`chip-button ${kind === entry.id ? 'active' : ''}`}
            onClick={() => setKind(entry.id)}
          >
            {entry.label} <span className="chip-count">{counts[entry.id] ?? 0}</span>
          </button>
        ))}
        <input
          className="input narrow"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <table className="events-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Where</th>
            <th>Who</th>
            <th>What</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((event) => (
            <tr key={event.key} onClick={() => onOpen(event.source.collection, event.source.index)}>
              <td className="col-when">
                <span className="event-when">{event.when}</span>
                {event.mode && (
                  <span className={`event-mode ${MODE_CLASS[event.mode] ?? ''}`}>{event.mode}</span>
                )}
                {event.chance !== null && (
                  <span className="event-chance">{Math.round(event.chance * 100)}%</span>
                )}
              </td>
              <td className="col-where">{event.where}</td>
              <td className="col-who">{event.who}</td>
              <td className="col-what">
                {event.what.length === 0 ? (
                  // Empty effects are usually a bug in the definition.
                  <em className="event-nothing">nothing</em>
                ) : (
                  event.what.map((entry, i) => (
                    <span className="event-effect" key={i}>
                      {entry}
                    </span>
                  ))
                )}
                {event.remembered === true && <span className="event-remembered" title="Recorded in the world">remembered</span>}
              </td>
              <td className="col-why">
                {event.why.length === 0 ? (
                  <em className="event-always">always</em>
                ) : (
                  event.why.map((entry, i) => (
                    <span className="event-gate" key={i}>
                      {entry}
                    </span>
                  ))
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {visible.length === 0 && <p className="empty">Nothing matches.</p>}
    </div>
  );
}
