/**
 * Preview a map as a canvas with marker overlays and generation controls.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModuleStore } from '@/lib/store';
import { getAt } from '@/lib/store';
import {
  previewArea, previewDungeon, previewPoi, previewRoomTemplate, previewStart,
} from '@/lib/preview';
import type { PreviewResult } from '@/lib/preview';
import { terrainColor } from '@/lib/terrainColors';
import type { PreviewTarget } from '@/app/studio/selection';
import { MapGenerationPanel } from './MapGenerationPanel';
import styles from '@/app/studio/studio.module.css';

const TILE = 18;
const DEFAULT_SEED = 12345;

export function MapViewport(props: { store: ModuleStore; target: PreviewTarget }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  // Start with the generation controls open so the preview settings are immediately visible.
  const [showControls, setShowControls] = useState(true);

  // Use the compiled module from validation rather than compile it again for preview.
  const module = props.store.validation.compiled;

  const result: PreviewResult | null = useMemo(() => {
    if (!module) return null;
    switch (props.target.type) {
      case 'start':
        return previewStart(module, seed);
      case 'area':
        return previewArea(module, props.target.id, seed);
      case 'poi':
        return previewPoi(module, props.target.id, seed);
      case 'dungeon':
        return previewDungeon(module, props.target.id, seed);
      case 'roomTemplate':
        return previewRoomTemplate(module, props.target.id, seed);
    }
  }, [module, props.target, seed]);

  /**
   * Move a point of interest to a new map position.
   */
  const movePoi = (id: string, x: number, y: number) => {
    const pois = (getAt(props.store.doc, ['world', 'pointsOfInterest']) ?? []) as Record<string, unknown>[];
    const index = pois.findIndex((poi) => String(poi['id']) === id);
    if (index < 0) return;
    props.store.set(['world', 'pointsOfInterest', index, 'position'], { x, y });
  };

  const title =
    props.target.type === 'start' ? 'Game start' : `${props.target.type}: ${props.target.id}`;

  return (
    <>
      <div className={styles.mapTools}>
        <span className={styles.mapBadge}>{title}</span>
        {result?.ok && (
          <span
            className={`${styles.mapBadge} ${result.preview.authored ? styles.mapBadgeAuthored : styles.mapBadgeGenerated}`}
            title={
              result.preview.authored
                ? 'This layout is hand-authored in the module; the seed has no effect on it.'
                : 'This map is generated from the seed by the engine at play time.'
            }
          >
            {result.preview.authored ? '✎ authored' : '🎲 generated'}
          </span>
        )}
        <label>
          seed
          <input
            className={`input ${styles.seedInput}`}
            type="number"
            value={seed}
            disabled={result?.ok === true && result.preview.authored}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
          />
        </label>
        <button
          className="btn tiny"
          title="Try another seed"
          disabled={result?.ok === true && result.preview.authored}
          onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
        >
          ⟳ re-roll
        </button>
        <label>
          <input type="checkbox" checked={showMarkers} onChange={(e) => setShowMarkers(e.target.checked)} />
          markers
        </label>
        <label>
          <input type="checkbox" checked={showRooms} onChange={(e) => setShowRooms(e.target.checked)} />
          rooms
        </label>
        <button
          className={`btn tiny ${showControls ? 'primary' : ''}`}
          title="The fields that decide what this map looks like"
          onClick={() => setShowControls(!showControls)}
        >
          ⚙ generation
        </button>
      </div>

      <div className={styles.mapBody}>
        <div className={styles.mapColumn}>
          {!module && (
            <div className={styles.mapScroll}>
              <p className={styles.mapMessage}>
                The module has <code>errors</code> — the engine cannot compile it, so nothing can be
                generated. Fix the problems in the console below and the preview appears.
              </p>
            </div>
          )}

          {module && result && !result.ok && (
            <div className={styles.mapScroll}>
              <p className={styles.mapMessage}>{result.message}</p>
            </div>
          )}

          {module && result?.ok && (
            <>
              <MapCanvas
                preview={result.preview}
                showMarkers={showMarkers}
                onMovePoi={movePoi}
                showRooms={showRooms}
              />
              <div className={styles.mapSide}>
                <div className={styles.mapExplain}>
                  {result.preview.explain.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                  {!result.preview.authored && (
                    <p>
                      <strong>Why a seed?</strong> The module stores no tiles for generated places — a
                      runtime seed decides them, and the first visit freezes the result into the save.
                    </p>
                  )}
                </div>
                <Legend tiles={result.preview.tiles} />
              </div>
            </>
          )}
        </div>

        {/* Deliberately outside every `module &&` guard above. Half-typed dice
            notation stops the module compiling, and controls that vanished at
            that moment could not be used to type the rest. */}
        {showControls && (
          <MapGenerationPanel
            store={props.store}
            target={props.target}
            authored={result?.ok === true && result.preview.authored}
          />
        )}
      </div>
    </>
  );
}

function MapCanvas(props: {
  preview: {
    tiles: { width: number; height: number; tiles: readonly string[] };
    markers: readonly { x: number; y: number; glyph: string; label: string; poi?: string }[];
    rooms: readonly { x: number; y: number; width: number; height: number; role: string }[];
  };
  showMarkers: boolean;
  showRooms: boolean;
  /** Absent for a dungeon or a room template, where nothing here is movable. */
  onMovePoi?: (id: string, x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; terrain: string } | null>(null);
  /**
   * Where a marker is being dragged to, before it is written.
   *
   * The ref is the truth and the state is only so it draws. A drag reads its
   * own position in the very next pointer event, and React state is not applied
   * by then — so keeping it in state alone means every move handler sees the
   * drag as not started, and the drop writes nothing.
   */
  const dragRef = useRef<{ poi: string; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ poi: string; x: number; y: number } | null>(null);
  const { tiles, markers, rooms } = props.preview;

  /** The tile under a pointer, or null off the edge of the map. */
  const tileUnder = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / TILE);
    const y = Math.floor((clientY - rect.top) / TILE);
    if (x < 0 || y < 0 || x >= tiles.width || y >= tiles.height) return null;
    return { x, y };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = tiles.width * TILE * ratio;
    canvas.height = tiles.height * TILE * ratio;
    canvas.style.width = `${tiles.width * TILE}px`;
    canvas.style.height = `${tiles.height * TILE}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);

    for (let y = 0; y < tiles.height; y += 1) {
      for (let x = 0; x < tiles.width; x += 1) {
        const terrain = tiles.tiles[y * tiles.width + x] ?? '';
        ctx.fillStyle = terrainColor(terrain);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // A faint grid keeps tiles countable without shouting.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= tiles.width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * TILE + 0.5, 0);
      ctx.lineTo(x * TILE + 0.5, tiles.height * TILE);
      ctx.stroke();
    }
    for (let y = 0; y <= tiles.height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE + 0.5);
      ctx.lineTo(tiles.width * TILE, y * TILE + 0.5);
      ctx.stroke();
    }

    if (props.showRooms) {
      ctx.strokeStyle = 'rgba(217, 164, 65, 0.55)';
      ctx.lineWidth = 1.5;
      for (const room of rooms) {
        ctx.strokeRect(room.x * TILE + 1, room.y * TILE + 1, room.width * TILE - 2, room.height * TILE - 2);
      }
    }
  }, [tiles, rooms, props.showRooms]);

  return (
    <div className={styles.mapScroll}>
      <div className={styles.mapCanvasWrap}>
        <canvas
          ref={canvasRef}
          className={styles.mapCanvas}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / TILE);
            const y = Math.floor((e.clientY - rect.top) / TILE);
            if (x < 0 || y < 0 || x >= tiles.width || y >= tiles.height) {
              setHover(null);
              return;
            }
            setHover({ x, y, terrain: tiles.tiles[y * tiles.width + x] ?? '' });
          }}
          onMouseLeave={() => setHover(null)}
        />
        {props.showMarkers &&
          markers.map((marker, i) => {
            const movable = Boolean(marker.poi && props.onMovePoi);
            const at = dragging !== null && dragging.poi === marker.poi ? dragging : marker;
            return (
              <span
                key={i}
                className={`${styles.mapMarker}${movable ? ` ${styles.mapMarkerDrag}` : ''}`}
                style={{ left: 24 + at.x * TILE + TILE / 2, top: 24 + at.y * TILE + TILE / 2 }}
                title={movable ? `${marker.label}\n\nDrag to move it.` : marker.label}
                onPointerDown={(e) => {
                  if (!movable || !marker.poi) return;
                  e.preventDefault();
                  // Capture keeps the drag alive when the pointer leaves the
                  // glyph, which it does immediately. A pointer the browser
                  // does not know is not a reason to refuse the drag.
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    /* not capturable; the move handler still tracks it */
                  }
                  dragRef.current = { poi: marker.poi, x: marker.x, y: marker.y };
                  setDragging(dragRef.current);
                }}
                onPointerMove={(e) => {
                  const drag = dragRef.current;
                  if (!drag || drag.poi !== marker.poi) return;
                  const spot = tileUnder(e.clientX, e.clientY);
                  if (!spot) return;
                  dragRef.current = { poi: drag.poi, ...spot };
                  setDragging(dragRef.current);
                }}
                onPointerUp={() => {
                  const drag = dragRef.current;
                  dragRef.current = null;
                  setDragging(null);
                  if (!drag || drag.poi !== marker.poi) return;
                  // Written once, on drop: a write per tile crossed would be a
                  // revalidation per tile and an undo step per tile with it.
                  if (drag.x !== marker.x || drag.y !== marker.y) {
                    props.onMovePoi?.(drag.poi, drag.x, drag.y);
                  }
                }}
              >
                {marker.glyph}
              </span>
            );
          })}
        {hover && (
          <span
            className={styles.mapHover}
            style={{ left: 24 + hover.x * TILE + TILE, top: 24 + hover.y * TILE - TILE }}
          >
            {hover.x},{hover.y} <code>{hover.terrain}</code>
          </span>
        )}
      </div>
    </div>
  );
}

/** Every terrain on this map, with its color and passability. */
function Legend(props: { tiles: { tiles: readonly string[] } }) {
  const ids = useMemo(() => [...new Set(props.tiles.tiles)].sort(), [props.tiles]);
  return (
    <div className={styles.legend}>
      {ids.map((id) => (
        <span className={styles.legendRow} key={id}>
          <span className={styles.legendSwatch} style={{ background: terrainColor(id) }} />
          <span className={styles.legendId}>{id || '(empty)'}</span>
        </span>
      ))}
    </div>
  );
}
