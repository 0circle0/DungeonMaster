/** The map painter: `world.maps` entries, edited by clicking on them. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LAYER_TARGETS } from '@dm/module';
import type { LayerKind } from '@dm/module';
import type { ModuleStore } from '@/lib/store';
import { getAt } from '@/lib/store';
import { terrainColor } from '@/lib/terrainColors';
import styles from '@/app/studio/studio.module.css';

const TILE = 22;

interface LayerData {
  kind: LayerKind;
  name?: string;
  cells: string[][];
}

/** Badge hue per non-terrain layer kind, for the glyph overlay. */
const KIND_HUES: Record<string, string> = {
  items: '#d4a017',
  monsters: '#c0392b',
  npcs: '#27ae60',
  gates: '#8e44ad',
  traps: '#e67e22',
  markers: '#16a085',
};

type Tool = 'paint' | 'erase' | 'rect' | 'pick';

export function MapPainter(props: { store: ModuleStore; mapId: string }) {
  const { store, mapId } = props;
  const doc = store.doc;

  const maps = useMemo(() => {
    const list = getAt(doc, ['world', 'maps']);
    return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  }, [doc]);
  const index = maps.findIndex((entry) => entry['id'] === mapId);
  const entry = index >= 0 ? maps[index] : undefined;
  const layers = useMemo(
    () => (Array.isArray(entry?.['layers']) ? (entry['layers'] as LayerData[]) : []),
    [entry],
  );

  const height = layers[0]?.cells.length ?? 0;
  const width = layers[0]?.cells[0]?.length ?? 0;

  const [active, setActive] = useState(0);
  const [tool, setTool] = useState<Tool>('paint');
  const [brush, setBrush] = useState('');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [resize, setResize] = useState<{ w: number; h: number }>({ w: width, h: height });

  // Pending stroke: packed cell -> id, drawn as an overlay until pointer-up.
  const strokeRef = useRef<Map<number, string> | null>(null);
  const [, bump] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const layer = layers[active] ?? layers[0];
  const activeIndex = layers[active] ? active : 0;
  const target = layer ? LAYER_TARGETS[layer.kind] : null;
  const paletteIds = useMemo(() => {
    if (!layer) return [];
    if (!target) return []; // markers: free text
    return store.idsByCollection[target] ?? [];
  }, [layer, target, store.idsByCollection]);

  useEffect(() => setResize({ w: width, h: height }), [width, height]);

  // — canvas painting ————————————————————————————————————————
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width * TILE;
    canvas.height = height * TILE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pending = strokeRef.current;
    const cellOf = (data: LayerData, x: number, y: number): string => {
      if (pending && layers[activeIndex] === data) {
        const stroked = pending.get(y * width + x);
        if (stroked !== undefined) return stroked;
      }
      return data.cells[y]?.[x] ?? '';
    };

    // Ground first: terrain layers composite in order, last non-empty wins.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let ground = '';
        for (const data of layers) {
          if (data.kind !== 'terrain') continue;
          const cell = cellOf(data, x, y);
          if (cell !== '') ground = cell;
        }
        ctx.fillStyle = ground === '' ? '#111' : terrainColor(ground);
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Object layers as lettered badges, in draw order.
    for (const data of layers) {
      if (data.kind === 'terrain') continue;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const cell = cellOf(data, x, y);
          if (cell === '') continue;
          ctx.fillStyle = KIND_HUES[data.kind] ?? '#888';
          ctx.beginPath();
          ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 0.34, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `${Math.floor(TILE * 0.5)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell[0].toUpperCase(), x * TILE + TILE / 2, y * TILE + TILE / 2 + 1);
        }
      }
    }

    // Grid, faint.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 1) {
      ctx.beginPath();
      ctx.moveTo(x * TILE + 0.5, 0);
      ctx.lineTo(x * TILE + 0.5, height * TILE);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 1) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE + 0.5);
      ctx.lineTo(width * TILE, y * TILE + 0.5);
      ctx.stroke();
    }

    // Rect preview and hover.
    if (rectStart && hover && tool === 'rect') {
      const x0 = Math.min(rectStart.x, hover.x);
      const y0 = Math.min(rectStart.y, hover.y);
      const x1 = Math.max(rectStart.x, hover.x);
      const y1 = Math.max(rectStart.y, hover.y);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(x0 * TILE + 1, y0 * TILE + 1, (x1 - x0 + 1) * TILE - 2, (y1 - y0 + 1) * TILE - 2);
    } else if (hover) {
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(hover.x * TILE + 1, hover.y * TILE + 1, TILE - 2, TILE - 2);
    }
  });

  if (!entry || !layer) {
    return <div className={styles.mapEmpty}>No map &quot;{mapId}&quot; in world.maps.</div>;
  }

  const cellAt = (event: React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / TILE);
    const y = Math.floor((event.clientY - rect.top) / TILE);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return { x, y };
  };

  // The first terrain layer must stay total: erasing on it is refused.
  const isBaseTerrain = activeIndex === layers.findIndex((data) => data.kind === 'terrain');

  const applyStroke = (at: { x: number; y: number }, erase: boolean) => {
    if (erase && isBaseTerrain && layer.kind === 'terrain') return;
    const value = erase ? '' : brush;
    if (!erase && value === '') return;
    (strokeRef.current ??= new Map()).set(at.y * width + at.x, value);
    bump((n) => n + 1);
  };

  const commitStroke = () => {
    const pending = strokeRef.current;
    strokeRef.current = null;
    if (!pending || pending.size === 0) return;
    const next = layer.cells.map((row) => [...row]);
    for (const [packed, value] of pending) {
      next[Math.floor(packed / width)][packed % width] = value;
    }
    store.set(['world', 'maps', index, 'layers', activeIndex, 'cells'], next);
  };

  const commitRect = (to: { x: number; y: number }) => {
    if (!rectStart || brush === '') return;
    const next = layer.cells.map((row) => [...row]);
    for (let y = Math.min(rectStart.y, to.y); y <= Math.max(rectStart.y, to.y); y += 1) {
      for (let x = Math.min(rectStart.x, to.x); x <= Math.max(rectStart.x, to.x); x += 1) {
        next[y][x] = brush;
      }
    }
    store.set(['world', 'maps', index, 'layers', activeIndex, 'cells'], next);
  };

  const onMouseDown = (event: React.MouseEvent) => {
    const at = cellAt(event);
    if (!at) return;
    event.preventDefault();
    const erase = event.button === 2 || tool === 'erase';

    if (tool === 'pick') {
      const picked = layer.cells[at.y]?.[at.x] ?? '';
      if (picked !== '') setBrush(picked);
      return;
    }
    if (tool === 'rect' && !erase) {
      setRectStart(at);
      return;
    }
    applyStroke(at, erase);
  };

  const onMouseMove = (event: React.MouseEvent) => {
    const at = cellAt(event);
    setHover(at);
    if (!at) return;
    if (strokeRef.current && event.buttons > 0 && tool !== 'rect' && tool !== 'pick') {
      applyStroke(at, event.buttons === 2 || tool === 'erase');
    }
  };

  const onMouseUp = (event: React.MouseEvent) => {
    const at = cellAt(event);
    if (tool === 'rect' && rectStart) {
      if (at) commitRect(at);
      setRectStart(null);
      return;
    }
    commitStroke();
  };

  // — layer management ———————————————————————————————————————
  const emptyGrid = () => Array.from({ length: height }, () => Array.from({ length: width }, () => ''));

  const addLayer = (kind: LayerKind) => {
    store.set(['world', 'maps', index, 'layers', layers.length], { kind, cells: emptyGrid() });
    setActive(layers.length);
  };

  const removeLayer = (at: number) => {
    const data = layers[at];
    if (!data) return;
    if (data.kind === 'terrain' && layers.filter((l) => l.kind === 'terrain').length === 1) return;
    store.set(
      ['world', 'maps', index, 'layers'],
      layers.filter((_, i) => i !== at),
    );
    setActive(0);
  };

  // — resize ————————————————————————————————————————————————
  const applyResize = () => {
    const w = Math.max(3, Math.min(96, Math.floor(resize.w)));
    const h = Math.max(3, Math.min(96, Math.floor(resize.h)));
    if (w === width && h === height) return;

    const base = layers.findIndex((data) => data.kind === 'terrain');
    // Pad the base with its most common border tile.
    const counts = new Map<string, number>();
    const baseCells = layers[base]?.cells ?? [];
    baseCells.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell === '') return;
        if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) return;
        counts.set(cell, (counts.get(cell) ?? 0) + 1);
      }));
    const fill = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? baseCells[0]?.[0] ?? '';

    const next = layers.map((data, i) => ({
      ...data,
      cells: Array.from({ length: h }, (_, y) =>
        Array.from({ length: w }, (_, x) =>
          data.cells[y]?.[x] ?? (i === base ? fill : ''))),
    }));
    store.set(['world', 'maps', index, 'layers'], next);
  };

  // — saving —————————————————————————————————————————————————

  const hoverCells = hover
    ? layers
        .map((data) => ({ kind: data.kind, cell: data.cells[hover.y]?.[hover.x] ?? '' }))
        .filter(({ cell }) => cell !== '')
    : [];

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <canvas
          ref={canvasRef}
          style={{ imageRendering: 'pixelated', cursor: 'crosshair' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            setHover(null);
            commitStroke();
          }}
          onContextMenu={(event) => event.preventDefault()}
        />
        <div className="hint" style={{ marginTop: 8, minHeight: 18 }}>
          {hover
            ? `${hover.x},${hover.y}` +
              (hoverCells.length > 0
                ? ' — ' + hoverCells.map(({ kind, cell }) => `${kind}: ${cell}`).join(', ')
                : '')
            : 'Left-drag paints, right-drag erases. Every stroke is one undo step.'}
        </div>
      </div>

      <aside style={{ width: 240, borderLeft: '1px solid rgba(255,255,255,0.1)', padding: 12, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="hint">Tools</div>
          {(['paint', 'erase', 'rect', 'pick'] as Tool[]).map((id) => (
            <button
              key={id}
              className={styles.viewportTab}
              style={tool === id ? { fontWeight: 700, textDecoration: 'underline' } : undefined}
              onClick={() => setTool(id)}
            >
              {id === 'rect' ? 'fill rect' : id === 'pick' ? 'eyedrop' : id}
            </button>
          ))}
        </div>

        <div>
          <div className="hint">Layers, in draw order</div>
          {layers.map((data, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className={styles.viewportTab}
                style={i === activeIndex ? { fontWeight: 700, textDecoration: 'underline' } : undefined}
                onClick={() => setActive(i)}
              >
                {data.kind}
                {data.name ? ` (${data.name})` : ''}
              </button>
              <button className={styles.viewportTab} title="delete layer" onClick={() => removeLayer(i)}>
                ×
              </button>
            </div>
          ))}
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) addLayer(event.target.value as LayerKind);
            }}
          >
            <option value="">+ add layer…</option>
            {Object.keys(LAYER_TARGETS).map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="hint">
            Brush — {layer.kind}
            {target ? ` (${target})` : ' (free ids)'}
          </div>
          {target ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflow: 'auto' }}>
              {paletteIds.map((id) => (
                <button
                  key={id}
                  className={styles.viewportTab}
                  style={{
                    textAlign: 'left',
                    ...(brush === id ? { fontWeight: 700, textDecoration: 'underline' } : {}),
                  }}
                  onClick={() => setBrush(id)}
                >
                  {layer.kind === 'terrain' && (
                    <span
                      style={{
                        display: 'inline-block', width: 10, height: 10, marginRight: 6,
                        background: terrainColor(id),
                      }}
                    />
                  )}
                  {id}
                </button>
              ))}
              {paletteIds.length === 0 && <div className="hint">nothing declared in {target}</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                value={brush}
                placeholder="marker id"
                onChange={(event) => setBrush(event.target.value)}
              />
              {['entry', 'door', 'spawn'].map((id) => (
                <button key={id} className={styles.viewportTab} onClick={() => setBrush(id)}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="hint">Size</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="number"
              style={{ width: 56 }}
              value={resize.w}
              onChange={(event) => setResize((r) => ({ ...r, w: Number(event.target.value) }))}
            />
            ×
            <input
              type="number"
              style={{ width: 56 }}
              value={resize.h}
              onChange={(event) => setResize((r) => ({ ...r, h: Number(event.target.value) }))}
            />
            <button className={styles.viewportTab} onClick={applyResize}>
              apply
            </button>
          </div>
        </div>

      </aside>
    </div>
  );
}
