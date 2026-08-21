/**
 * Show how far each sense reaches across a simple test layout.
 * The preview uses the engine's own propagation rules.
 */

'use client';

import { useMemo, useState } from 'react';
import { compileModule } from '@dm/module';
import { simulatePerception } from '@dm/engine';
import type { ModuleDoc } from '@/lib/store';
import { getAt } from '@/lib/store';

type Row = Record<string, unknown>;

function list(doc: ModuleDoc, path: string): Row[] {
  const value = getAt(doc, path.split('.'));
  return Array.isArray(value) ? (value as Row[]) : [];
}

/** Simple map layout used to distinguish sight, sound, and scent propagation. */
const SKETCH_WIDTH = 25;
const SKETCH_HEIGHT = 13;
const WALL_COLUMN = 12;
const DOORWAY_ROW = 6;

function buildLayout(floor: string, wall: string, gap: boolean): string[][] {
  const rows: string[][] = [];
  for (let y = 0; y < SKETCH_HEIGHT; y += 1) {
    const row: string[] = [];
    for (let x = 0; x < SKETCH_WIDTH; x += 1) {
      const solid = x === WALL_COLUMN && !(gap && y === DOORWAY_ROW);
      row.push(solid ? wall : floor);
    }
    rows.push(row);
  }
  return rows;
}

/** Map signal strength to a color ramp so threshold bands remain visible. */
function shade(strength: number): string {
  if (strength <= 0) return 'transparent';
  const alpha = 0.12 + Math.min(1, strength) * 0.68;
  return `rgba(90, 190, 255, ${alpha.toFixed(3)})`;
}

export function PerceptionView({ doc }: { doc: ModuleDoc }) {
  const senses = list(doc, 'rules.senses');
  const stances = list(doc, 'rules.stances');
  const monsters = list(doc, 'content.monsters');
  const terrains = list(doc, 'world.terrains');

  const [senseId, setSenseId] = useState('');
  const [stance, setStance] = useState('');
  const [statblock, setStatblock] = useState('');
  const [doorway, setDoorway] = useState(true);

  // Pick the first passable terrain and the first solid terrain from the module.
  const floor = terrains.find((t) => t['passable'] !== false)?.['id'];
  const wall = terrains.find((t) => t['passable'] === false)?.['id'];

  const preview = useMemo(() => {
    if (!floor || !wall) return null;
    const compiled = compileModule(doc);
    if (!compiled.ok) return null;

    try {
      return simulatePerception(compiled.module, {
        layout: buildLayout(String(floor), String(wall), doorway),
        source: { x: 4, y: DOORWAY_ROW },
        ...(statblock ? { statblock } : {}),
        ...(stance ? { stance } : {}),
      });
    } catch {
      // Ignore preview errors while the module is still being edited.
      return null;
    }
  }, [doc, floor, wall, doorway, statblock, stance]);

  if (!floor || !wall) {
    return (
      <div className="pane">
        <h2>Perception</h2>
        <p className="hint">
          Declare at least one passable and one impassable terrain in World →
          Terrains, and this will show how far each sense carries across them.
        </p>
      </div>
    );
  }

  if (senses.length === 0) {
    return (
      <div className="pane">
        <h2>Perception</h2>
        <p className="hint">
          No senses declared. Add one in Rules → Senses — a sense with no other
          fields set behaves as plain sight, and from there you can give it a
          falloff, let it spread around corners, or have it leave a trail.
        </p>
      </div>
    );
  }

  const active = senseId || String(senses[0]?.['id'] ?? '');
  const shown = preview?.senses.find((s) => s.id === active);

  return (
    <div className="pane wide">
      <h2>Perception</h2>
      <p className="hint">
        How far {shown?.name ?? 'this sense'} carries from the marked tile, across a
        wall with {doorway ? 'a doorway in it' : 'no way through'}. Brighter is stronger.
      </p>

      <div className="balance-controls">
        <label>
          Sense
          <select className="input narrow" value={active} onChange={(e) => setSenseId(e.target.value)}>
            {senses.map((sense) => (
              <option key={String(sense['id'])} value={String(sense['id'])}>
                {String(sense['name'] ?? sense['id'])}
              </option>
            ))}
          </select>
        </label>

        {stances.length > 0 && (
          <label>
            Moving as
            <select className="input narrow" value={stance} onChange={(e) => setStance(e.target.value)}>
              <option value="">(default)</option>
              {stances.map((entry) => (
                <option key={String(entry['id'])} value={String(entry['id'])}>
                  {String(entry['name'] ?? entry['id'])}
                </option>
              ))}
            </select>
          </label>
        )}

        {monsters.length > 0 && (
          <label>
            Giving it off
            <select className="input narrow" value={statblock} onChange={(e) => setStatblock(e.target.value)}>
              <option value="">(a character)</option>
              {monsters.map((entry) => (
                <option key={String(entry['id'])} value={String(entry['id'])}>
                  {String(entry['name'] ?? entry['id'])}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="checkbox">
          <input
            type="checkbox"
            checked={doorway}
            onChange={(e) => setDoorway(e.target.checked)}
          />
          Doorway in the wall
        </label>
      </div>

      {shown && (
        <p className="hint">
          Reaches {shown.range} tiles. Noticed above {shown.detect}, investigated
          above {shown.investigate}, fought above {shown.aggro}.
        </p>
      )}

      {preview ? (
        <div style={{ overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${preview.width}, 20px)`,
              gap: 1,
              width: 'max-content',
            }}
          >
            {preview.cells.map((cell) => {
              const strength = cell.signals[active] ?? 0;
              const solid = cell.terrain === String(wall);
              const isSource = cell.x === preview.source.x && cell.y === preview.source.y;

              // Show threshold bands as discrete labels instead of a smooth gradient.
              const band = shown && strength > shown.aggro
                ? '⚔'
                : shown && strength > shown.investigate
                  ? '?'
                  : '';

              return (
                <div
                  key={`${cell.x},${cell.y}`}
                  title={`${cell.x},${cell.y} — ${strength.toFixed(2)}`}
                  style={{
                    width: 20,
                    height: 20,
                    lineHeight: '20px',
                    textAlign: 'center',
                    fontSize: 11,
                    background: solid ? '#3a3a3a' : shade(strength),
                    color: isSource ? '#fff' : '#0b1a24',
                    outline: isSource ? '2px solid #ffb347' : 'none',
                  }}
                >
                  {isSource ? '◉' : band}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="hint">The module has an error in it — fix that and this will redraw.</p>
      )}

      <p className="hint">
        ◉ is what is being perceived. <strong>?</strong> marks where a creature
        would come and look; <strong>⚔</strong> where it would fight instead.
      </p>
    </div>
  );
}
