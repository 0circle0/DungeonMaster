/** Field of view, by recursive shadowcasting. */

import { key } from './tiles.js';
import type { Position, TileMap, TerrainIndex } from './tiles.js';
import { euclidean } from './geometry.js';

/** Multipliers that transform octant-local coordinates into map coordinates. */
const OCTANTS: readonly [number, number, number, number][] = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

/** The set of tiles visible from a point, as packed keys. */
export type Visible = ReadonlySet<number>;

export interface FovOptions {
  readonly map: TileMap;
  readonly terrain: TerrainIndex;
  readonly origin: Position;
  readonly radius: number;
}

/** Compute visible tiles from `origin`. */
export function fieldOfView(options: FovOptions): Visible {
  const { map, terrain, origin, radius } = options;
  const visible = new Set<number>([key(origin)]);
  if (radius <= 0) return visible;

  for (const octant of OCTANTS) {
    castLight(visible, map, terrain, origin, radius, 1, 1, 0, octant);
  }
  return visible;
}

function castLight(
  visible: Set<number>,
  map: TileMap,
  terrain: TerrainIndex,
  origin: Position,
  radius: number,
  row: number,
  startSlope: number,
  endSlope: number,
  octant: readonly [number, number, number, number],
): void {
  if (startSlope < endSlope) return;

  const [xx, xy, yx, yy] = octant;
  let nextStart = startSlope;
  let blocked = false;

  for (let currentRow = row; currentRow <= radius && !blocked; currentRow += 1) {
    for (let delta = -currentRow; delta <= 0; delta += 1) {
      const dx = delta;
      const dy = -currentRow;

      // Slopes to the leading and trailing edges of this tile.
      const leftSlope = (dx - 0.5) / (dy + 0.5);
      const rightSlope = (dx + 0.5) / (dy - 0.5);

      if (rightSlope > nextStart) continue;
      if (leftSlope < endSlope) break;

      const position = {
        x: origin.x + dx * xx + dy * xy,
        y: origin.y + dx * yx + dy * yy,
      };

      // Euclidean, so the visible area is a disk.
      if (euclidean(position, origin) <= radius + 0.5) visible.add(key(position));

      const opaque = terrain.isOpaque(map, position);

      if (blocked) {
        if (opaque) {
          nextStart = rightSlope;
          continue;
        }
        blocked = false;
        startSlope = nextStart;
        continue;
      }

      if (opaque && currentRow < radius) {
        // Start a shadow: scan the sector to this wall's left, then continue past it with a narrowed range.
        blocked = true;
        castLight(visible, map, terrain, origin, radius, currentRow + 1, startSlope, leftSlope, octant);
        nextStart = rightSlope;
      }
    }
  }
}

/** Whether an unobstructed line exists between two tiles. */
export function hasLineOfSight(
  map: TileMap,
  terrain: TerrainIndex,
  from: Position,
  to: Position,
): boolean {
  if (from.x === to.x && from.y === to.y) return true;

  const swap = from.x !== to.x ? from.x > to.x : from.y > to.y;
  const start = swap ? to : from;
  const end = swap ? from : to;

  // Walk the line and stop at the first opaque tile between the ends.
  const path = bresenham(start, end);
  for (let i = 1; i < path.length - 1; i += 1) {
    if (terrain.isOpaque(map, path[i]!)) return false;
  }
  return true;
}

/** Local Bresenham, kept here so line of sight has no import cycle. */
function bresenham(from: Position, to: Position): Position[] {
  const points: Position[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = Math.abs(to.y - y);
  const stepX = x < to.x ? 1 : -1;
  const stepY = y < to.y ? 1 : -1;
  let error = dx - dy;

  for (;;) {
    points.push({ x, y });
    if (x === to.x && y === to.y) return points;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += stepX;
    }
    if (doubled < dx) {
      error += dx;
      y += stepY;
    }
  }
}

/** Tiles lit by any light source, for describing a dark room. */
export function litTiles(
  map: TileMap,
  terrain: TerrainIndex,
  sources: readonly { position: Position; radius: number }[],
): Visible {
  const lit = new Set<number>();
  for (const source of sources) {
    for (const tile of fieldOfView({ map, terrain, origin: source.position, radius: source.radius })) {
      lit.add(tile);
    }
  }
  return lit;
}
