'use client';

/** The map: a monospace grid of clickable cells. */

import { useMemo, useState } from 'react';
import type { Action, Position } from '@dm/engine';
import { key as packKey } from '@dm/engine';
import { mapView, affordancesAt } from '@dm/play';
import type { Affordance, MapCellView } from '@dm/play';
import type { SessionApi } from '../lib/useSession.js';
import { toneVar } from '../lib/tones.js';
import { Picker } from './Picker.js';
import type { PickerItem } from './Picker.js';

const VIEWPORT = { width: 41, height: 25 };

export function MapView({ session }: { session: SessionApi }) {
  const { module, terrain, frame, dispatchAction } = session;
  const [hover, setHover] = useState<Position | null>(null);
  const [picker, setPicker] = useState<{
    items: readonly PickerItem[]; at: { x: number; y: number };
  } | null>(null);

  const view = useMemo(
    () => mapView(module, frame.state, terrain, { viewport: VIEWPORT }),
    [module, frame.state, terrain],
  );

  // The route a click on the hovered tile would walk, for the path preview.
  const hoverPath = useMemo(() => {
    if (!hover) return null;
    const offered = affordancesAt({ module, state: frame.state, terrain }, hover);
    const primary = offered.find((entry) => !entry.blocked);
    if (!primary?.path) return null;
    return new Set(primary.path.steps.map((step) => packKey(step)));
  }, [module, frame.state, terrain, hover]);

  if (!view) return <div className="empty">Nowhere to draw yet.</div>;

  const actor = frame.state.entities[frame.state.selected];

  const clicked = (cell: MapCellView, event: React.MouseEvent) => {
    const offered = affordancesAt({ module, state: frame.state, terrain }, { x: cell.x, y: cell.y });
    if (offered.length === 0) return;

    const unblocked = offered.filter((entry) => !entry.blocked);
    const wantsMenu = event.type === 'contextmenu' || unblocked.length !== 1;

    if (!wantsMenu) {
      const only = unblocked[0];
      if (only) dispatchAction(only.action);
      return;
    }

    event.preventDefault();
    setPicker({
      at: { x: event.clientX, y: event.clientY },
      items: offered.map((entry) => toPickerItem(entry, actor?.position ?? null, dispatchAction)),
    });
  };

  return (
    <div className="map-scroll">
      <div
        className="mapgrid"
        style={{ gridTemplateColumns: `repeat(${view.viewport.width}, var(--cell))` }}
        onMouseLeave={() => setHover(null)}
      >
        {view.cells.map((cell) => {
          const packed = packKey({ x: cell.x, y: cell.y });
          const you = cell.entity?.selected === true;
          const classes = [
            'cell',
            cell.visibility,
            you ? 'you' : '',
            cell.visibility !== 'unknown' ? 'walkable' : '',
            hoverPath?.has(packed) ? 'on-path' : '',
            hover && hover.x === cell.x && hover.y === cell.y ? 'hover-target' : '',
          ].filter(Boolean).join(' ');

          const glyph = cell.entity?.glyph ?? (cell.items > 0 ? '·' : cell.glyph);
          const tone = cell.entity?.tone ?? cell.tone;

          return (
            <button
              key={packed}
              className={classes}
              style={you ? undefined : { color: toneVar(tone) }}
              title={cell.entity?.name ?? undefined}
              onMouseEnter={() => setHover({ x: cell.x, y: cell.y })}
              onClick={(event) => clicked(cell, event)}
              onContextMenu={(event) => clicked(cell, event)}
              tabIndex={-1}
            >
              {cell.visibility === 'unknown' ? ' ' : glyph}
            </button>
          );
        })}
      </div>
      {picker && <Picker items={picker.items} at={picker.at} onClose={() => setPicker(null)} />}
    </div>
  );
}

/** An affordance as a picker row. */
export function toPickerItem(
  entry: Affordance,
  _from: Position | null,
  dispatch: (action: Action) => void,
): PickerItem {
  const detail = entry.path
    ? `${entry.path.steps.length} ${entry.path.steps.length === 1 ? 'step' : 'steps'}`
    : '';

  return {
    id: entry.id,
    label: entry.label,
    detail,
    ...(entry.blocked !== undefined ? { blocked: entry.blocked } : {}),
    pick: () => dispatch(entry.action),
  };
}
