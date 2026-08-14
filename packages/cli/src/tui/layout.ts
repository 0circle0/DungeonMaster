/**
 * Where everything goes on screen.
 *
 * Pure arithmetic, deliberately: no terminal, no escape codes, no state. A
 * layout bug is the kind that only shows up at one window size, and the only
 * way to catch those is to be able to ask for that size in a test.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Layout {
  readonly columns: number;
  readonly rows: number;
  /** False when the terminal is too small to draw anything useful in. */
  readonly usable: boolean;
  /** The map, with its header row above it. */
  readonly header: Rect;
  readonly map: Rect;
  /** Party, objective and legend. Zero width on a narrow terminal. */
  readonly side: Rect;
  /** The transcript. */
  readonly log: Rect;
  readonly status: Rect;
  /** The one row readline owns. Never painted by the screen. */
  readonly promptRow: number;
  /** Map viewport in *tiles*, accounting for how wide a tile is drawn. */
  readonly viewport: { readonly width: number; readonly height: number };
  readonly cellWidth: 1 | 2;
}

/** Below this there is no point taking the screen over. */
export const MIN_COLUMNS = 60;
export const MIN_ROWS = 20;

/** Under this width the side pane folds away and its content moves inline. */
const SIDE_AT = 90;

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

export function layout(columns: number, rows: number): Layout {
  if (columns < MIN_COLUMNS || rows < MIN_ROWS) {
    const empty: Rect = { x: 0, y: 0, width: 0, height: 0 };
    return {
      columns, rows, usable: false,
      header: empty, map: empty, side: empty, log: empty, status: empty,
      promptRow: rows, viewport: { width: 0, height: 0 }, cellWidth: 1,
    };
  }

  // A narrow terminal gives the whole width to the map and folds the party and
  // objective into the status row — better than two cramped columns.
  const sideWidth = columns >= SIDE_AT ? clamp(Math.floor(columns * 0.28), 24, 32) : 0;
  const mapWidth = columns - sideWidth;

  const statusRows = 1;
  const promptRows = 1;
  const headerRows = 1;
  const logRows = clamp(Math.floor((rows - headerRows - statusRows - promptRows) * 0.35), 4, 12);
  const mapRows = rows - headerRows - logRows - statusRows - promptRows;

  // Two columns per tile whenever there is room for a useful number of them; a
  // terminal cell is about twice as tall as it is wide, so single-width tiles
  // draw a squashed map.
  const inner = mapWidth - 2;
  const cellWidth: 1 | 2 = inner >= 60 ? 2 : 1;

  return {
    columns,
    rows,
    usable: true,
    header: { x: 0, y: 0, width: mapWidth, height: headerRows },
    map: { x: 0, y: headerRows, width: mapWidth, height: mapRows },
    side: { x: mapWidth, y: 0, width: sideWidth, height: headerRows + mapRows },
    log: { x: 0, y: headerRows + mapRows, width: columns, height: logRows },
    status: { x: 0, y: rows - promptRows - statusRows, width: columns, height: statusRows },
    promptRow: rows - 1,
    viewport: {
      width: Math.max(1, Math.floor(inner / cellWidth)),
      height: Math.max(1, mapRows),
    },
    cellWidth,
  };
}
