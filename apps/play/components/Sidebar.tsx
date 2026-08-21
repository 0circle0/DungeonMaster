'use client';

/** The right-hand column: who you are, what you are doing, where you can go, and what the glyphs mean. */

import { useMemo } from 'react';
import { currentObjective } from '@dm/engine';
import { partyView, waysFromHere, mapView, legend, duration } from '@dm/play';
import type { SessionApi } from '../lib/useSession.js';
import { toneVar } from '../lib/tones.js';

export function Sidebar({ session }: { session: SessionApi }) {
  const { module, terrain, frame, dispatchAction } = session;

  const party = useMemo(() => partyView(module, frame.state), [module, frame.state]);
  const doing = useMemo(() => currentObjective(module, frame.state), [module, frame.state]);
  const ways = useMemo(
    () => waysFromHere(module, frame.state, terrain),
    [module, frame.state, terrain],
  );
  const keys = useMemo(() => {
    const view = mapView(module, frame.state, terrain, { viewport: { width: 41, height: 25 } });
    return view ? legend(module, view) : [];
  }, [module, frame.state, terrain]);

  return (
    <div className="sidebar">
      <div className="pane">
        <h3>Party</h3>
        {party.map((member) => (
          <button
            key={member.id}
            className={`roster-row ${member.selected ? 'selected' : ''}`}
            onClick={() => dispatchAction({ type: 'select', entity: member.id })}
          >
            <span className={`name ${member.alive ? '' : 'fallen'}`}>{member.name}</span>
            <span className="lvl">L{member.level}</span>
            {member.alive && member.vital ? (
              <span className={`meter ${member.vital.band}`}>
                <i style={{ width: `${(member.vital.current / Math.max(1, member.vital.max)) * 100}%` }} />
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {doing && (
        <div className="pane">
          <h3>Doing</h3>
          <div className="objective">
            <span className="marker">▸</span>
            {doing.objective.description}
            {doing.objective.count > 1 && (
              <span className="count">{doing.objective.progress}/{doing.objective.count}</span>
            )}
          </div>
        </div>
      )}

      {(ways.places.length > 0 || ways.roads.length > 0 || ways.frontier) && (
        <div className="pane">
          <h3>Ways from here</h3>
          {ways.places.map((place) => (
            <button
              key={place.poi}
              className="exit-row"
              disabled={false}
              title={place.barred ? `barred — ${place.requires.join(', ')}` : undefined}
              onClick={() => dispatchAction(place.action)}
            >
              <span className="verb">enter</span>
              <span>
                {place.name}
                {place.barred && place.requires.length > 0 && (
                  <span className="why">needs {place.requires.join(', ')}</span>
                )}
              </span>
              <span className="time">{duration(place.travelMinutes)}</span>
            </button>
          ))}
          {ways.roads.map((road) => (
            <button
              key={road.area}
              className="exit-row"
              title={road.barred ? `barred — ${road.requires.join(', ')}` : undefined}
              onClick={() => dispatchAction(road.action)}
            >
              <span className="verb">travel</span>
              <span>
                {road.name}
                {road.barred && road.requires.length > 0 && (
                  <span className="why">needs {road.requires.join(', ')}</span>
                )}
              </span>
              <span className="time">{duration(road.travelMinutes)}</span>
            </button>
          ))}
          {ways.frontier && (
            <button className="exit-row" onClick={() => dispatchAction(ways.frontier!.action)}>
              <span className="verb">explore</span>
              <span>unexplored ground {ways.frontier.direction}</span>
              <span className="time">{ways.frontier.tiles} tiles</span>
            </button>
          )}
        </div>
      )}

      {keys.length > 0 && (
        <div className="pane">
          <h3>Map</h3>
          <div className="legend-grid">
            {keys.map((entry) => (
              <div key={`${entry.glyph}:${entry.name}`}>
                <b
                  className={`g ${entry.selected ? 'selected-glyph' : ''}`}
                  style={entry.selected ? undefined : { color: toneVar(entry.tone) }}
                >
                  {entry.glyph}
                </b>
                {' '}
                <span>{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
