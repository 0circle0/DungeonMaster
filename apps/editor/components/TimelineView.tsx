/** Simulate memory spread over time for a chosen deed and witness set. */

'use client';

import { useMemo, useState } from 'react';
import { simulateMemory } from '@dm/module';
import type { ModuleDoc } from '@/lib/store';
import { getAt } from '@/lib/store';

type Row = Record<string, unknown>;

function list(doc: ModuleDoc, path: string): Row[] {
  const value = getAt(doc, path.split('.'));
  return Array.isArray(value) ? (value as Row[]) : [];
}

const DAYS = 180;

export function TimelineView({ doc }: { doc: ModuleDoc }) {
  const deedKinds = list(doc, 'narrative.deedKinds');
  const npcs = list(doc, 'content.npcs');
  // Keep a stable empty memory object so the memo does not recompute forever on unconfigured modules.
  const memory = useMemo(
    () => (getAt(doc, ['narrative', 'memory']) as Row | undefined) ?? {},
    [doc],
  );

  const [deedKind, setDeedKind] = useState(String(deedKinds[0]?.['id'] ?? ''));
  const [witness, setWitness] = useState<string>('');
  const [day, setDay] = useState(0);
  const [seed, setSeed] = useState(1);

  const deed = deedKinds.find((d) => d['id'] === deedKind);
  const severity = Number(deed?.['severity'] ?? 0);

  const result = useMemo(() => {
    if (!deedKind) return null;
    return simulateMemory(
      memory,
      npcs.map((n) => ({
        id: String(n['id']),
        memorySpan: n['memorySpan'] as number | undefined,
        gullibility: n['gullibility'] as number | undefined,
      })),
      {
        kind: deedKind,
        day: 0,
        witnesses: witness ? [witness] : [],
        // Use deed severity as the minimum gossip threshold for the simulation.
        severity: Math.abs(severity),
      },
      { days: DAYS, seed },
    );
  }, [memory, npcs, deedKind, witness, severity, seed]);

  if (deedKinds.length === 0) {
    return (
      <>
        <h2 className="pane-title">Timeline</h2>
        <p className="empty">
          No deed kinds defined yet. Memory needs something to remember — add one under Narrative → Deed Kinds.
        </p>
      </>
    );
  }

  const today = result?.days[Math.min(day, result.days.length - 1)];
  const knownBy = today?.knowers ?? [];
  const mode = String((memory['mode'] as string) ?? 'hybrid');

  return (
    <div className="timeline">
      <div className="pane-head">
        <h2 className="pane-title">
          Timeline
          <code className="pane-path">who knows what, and when</code>
        </h2>
      </div>

      <div className="balance-controls">
        <label>
          Deed
          <select className="input narrow" value={deedKind} onChange={(e) => setDeedKind(e.target.value)}>
            {deedKinds.map((d) => (
              <option key={String(d['id'])} value={String(d['id'])}>
                {String(d['name'] ?? d['id'])}
              </option>
            ))}
          </select>
        </label>
        <label>
          Witnessed by
          <select className="input narrow" value={witness} onChange={(e) => setWitness(e.target.value)}>
            <option value="">nobody</option>
            {npcs.map((n) => (
              <option key={String(n['id'])} value={String(n['id'])}>
                {String(n['name'] ?? n['id'])}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seed
          <input
            className="input narrow"
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
          />
        </label>
        <span className="balance-budget">
          mode <strong>{mode}</strong> · severity <strong>{severity}</strong>
        </span>
      </div>

      <div className="scrubber">
        <input
          type="range"
          min={0}
          max={DAYS - 1}
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
        />
        <span className="scrubber-day">day {day}</span>
      </div>

      {/* Population curve: how many still remember, across the whole window. */}
      <div className="spark">
        {result?.days.map((entry, i) => {
          const height = npcs.length > 0 ? entry.knowers.length / npcs.length : 0;
          return (
            <span
              key={i}
              className={`spark-bar ${i === day ? 'current' : ''}`}
              style={{ height: `${Math.max(2, height * 100)}%` }}
              title={`day ${entry.day}: ${entry.knowers.length} know`}
              onClick={() => setDay(i)}
            />
          );
        })}
      </div>

      <p className="hint">
        {knownBy.length} of {npcs.length} know about this on day {day}.
        {witness === '' && ' Nobody witnessed it, so only forced rules apply.'}
      </p>

      <table className="events-table">
        <thead>
          <tr>
            <th>Who</th>
            <th>Strength</th>
            <th>Heard via</th>
            <th>Distortion</th>
          </tr>
        </thead>
        <tbody>
          {knownBy.map((knower) => {
            const npc = npcs.find((n) => n['id'] === knower.npc);
            return (
              <tr key={knower.npc}>
                <td>{String(npc?.['name'] ?? knower.npc)}</td>
                <td className="num">
                  <span className="bar">
                    <span className="bar-fill" style={{ width: `${knower.strength * 100}%` }} />
                  </span>
                  {(knower.strength * 100).toFixed(0)}%
                </td>
                <td>
                  {knower.hops === 0 ? (
                    <span className="tree-chip">saw it</span>
                  ) : (
                    `${knower.hops} retelling${knower.hops === 1 ? '' : 's'}`
                  )}
                </td>
                <td className="num">
                  {knower.distortion > 0 ? `${(knower.distortion * 100).toFixed(0)}% garbled` : '—'}
                </td>
              </tr>
            );
          })}
          {knownBy.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">
                Nobody knows. {witness === '' ? 'Pick a witness above.' : 'It has faded entirely.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
