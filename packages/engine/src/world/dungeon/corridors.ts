/** Corridor carving, in three styles. */

import type { Rng } from '@dm/core';
import { MapBuilder } from '../../grid/tiles.js';
import type { Position } from '../../grid/tiles.js';
import type { Palette } from '../mapgen.js';

export type CorridorStyle = 'l' | 'straight' | 'winding';

export interface CorridorSpec {
  readonly style: CorridorStyle;
  /** Carve brush, 1–3 tiles. */
  readonly width: number;
  /** How a `winding` corridor wanders: the chance of carrying on, and what a turn costs. */
  readonly winding: { readonly continueChance: number; readonly turnPenalty: number };
}

/** Carve a corridor and return the wall cells it pierced, in carve order. */
export function carvePath(
  builder: MapBuilder,
  from: Position,
  to: Position,
  palette: Palette,
  spec: CorridorSpec,
  rng: Rng,
  minLength = 0,
  /** Door spots placed so far, packed `y * width + x`. */
  doorSpots: ReadonlySet<number> = new Set(),
  /** Cells no corridor may cross, packed: the interiors and walls of static rooms. */
  forbidden: ReadonlySet<number> = new Set(),
): Position[] {
  let line =
    spec.style === 'straight' ? straightLine(from, to)
    : spec.style === 'winding' ? windingLine(from, to, rng, minLength, builder, spec.winding.continueChance)
    : elbowLine(from, to, rng.chance(0.5));

  // The endpoints themselves are legal: a door marker sits inside the room's rectangle.
  const packed = (at: Position) => at.y * builder.width + at.x;
  const isForbidden = (at: Position) =>
    forbidden.has(packed(at)) && !(at.x === from.x && at.y === from.y) && !(at.x === to.x && at.y === to.y);

  if (forbidden.size > 0 && line.some(isForbidden)) {
    line = detourLine(from, to, builder, isForbidden, spec.winding.turnPenalty) ?? line;
  }

  const crossings: Position[] = [];
  for (const at of line) {
    const current = builder.get(at.x, at.y);
    if (current === palette.wall) {
      crossings.push(at);
      builder.set(at.x, at.y, palette.floor);
    } else if (current === palette.floor) {
      // Already open; nothing to do.
    }
    // Anything else — a door, an authored terrain — is left as it is, so a corridor ending on a
    // static room's door marker does not pave it over.
  }

  // --- widen: perpendicular to travel, never near a doorway or the outer ring ---
  const protectedSpots = crossings.length > 0
    ? [...doorSpots, crossings[0]!.y * builder.width + crossings[0]!.x]
    : [...doorSpots];
  const nearDoor = (x: number, y: number): boolean =>
    protectedSpots.some((spot) => {
      const sx = spot % builder.width;
      const sy = Math.floor(spot / builder.width);
      return Math.abs(sx - x) + Math.abs(sy - y) <= 1;
    });

  for (let extra = 1; extra < spec.width; extra += 1) {
    // Alternate sides: offsets +1, -1, +2, -2, and so on.
    const offset = extra % 2 === 1 ? Math.ceil(extra / 2) : -Math.ceil(extra / 2);

    for (let i = 0; i < line.length; i += 1) {
      const at = line[i]!;
      const before = line[i - 1] ?? at;
      const after = line[i + 1] ?? at;
      const dx = Math.sign(after.x - before.x);
      const dy = Math.sign(after.y - before.y);
      if (dx !== 0 && dy !== 0) continue; // a corner widens on neither axis isolated endpoint
      if (dx === 0 && dy === 0) continue; 

      // Perpendicular: offset along the axis not travelled.
      const side = { x: at.x + (dy === 0 ? 0 : offset), y: at.y + (dx === 0 ? 0 : offset) };

      if (side.x <= 0 || side.y <= 0 || side.x >= builder.width - 1 || side.y >= builder.height - 1) {
        continue;
      }
      if (nearDoor(side.x, side.y) || nearDoor(at.x, at.y)) continue;
      if (forbidden.has(side.y * builder.width + side.x)) continue;
      builder.set(side.x, side.y, palette.floor);
    }
  }

  return crossings;
}

/** A shortest orthogonal path around forbidden cells, preferring straight runs. */
function detourLine(
  from: Position,
  to: Position,
  builder: MapBuilder,
  isForbidden: (at: Position) => boolean,
  turnPenalty: number,
): Position[] | null {
  interface Node {
    x: number;
    y: number;
    dir: number;
    cost: number;
    estimate: number;
    order: number;
    prev: Node | null;
  }

  const DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const heuristic = (x: number, y: number) => Math.abs(to.x - x) + Math.abs(to.y - y);

  const open: Node[] = [
    { x: from.x, y: from.y, dir: -1, cost: 0, estimate: heuristic(from.x, from.y), order: 0, prev: null },
  ];
  // Best known cost per (cell, incoming direction).
  const seen = new Map<number, number>();
  let counter = 1;

  while (open.length > 0) {
    // Smallest estimate wins; ties on cost, then insertion order.
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      const a = open[i]!;
      const b = open[bestIndex]!;
      if (
        a.estimate < b.estimate ||
        (a.estimate === b.estimate && (a.cost < b.cost || (a.cost === b.cost && a.order < b.order)))
      ) {
        bestIndex = i;
      }
    }
    const current = open.splice(bestIndex, 1)[0]!;

    if (current.x === to.x && current.y === to.y) {
      const path: Position[] = [];
      for (let node: Node | null = current; node; node = node.prev) {
        path.push({ x: node.x, y: node.y });
      }
      return path.reverse();
    }

    for (let dir = 0; dir < DIRS.length; dir += 1) {
      const [dx, dy] = DIRS[dir]!;
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx <= 0 || ny <= 0 || nx >= builder.width - 1 || ny >= builder.height - 1) continue;
      if (isForbidden({ x: nx, y: ny })) continue;

      const turn = current.dir !== -1 && current.dir !== dir ? turnPenalty : 0;
      const cost = current.cost + 1 + turn;
      const key = (ny * builder.width + nx) * 4 + dir;
      const known = seen.get(key);
      if (known !== undefined && known <= cost) continue;
      seen.set(key, cost);

      open.push({
        x: nx, y: ny, dir, cost,
        estimate: cost + heuristic(nx, ny),
        order: counter,
        prev: current,
      });
      counter += 1;
    }
  }

  return null;
}

/** The classic two-run elbow. */
function elbowLine(from: Position, to: Position, horizontalFirst: boolean): Position[] {
  const out: Position[] = [];
  if (horizontalFirst) {
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x += 1) out.push({ x, y: from.y });
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += 1) out.push({ x: to.x, y });
  } else {
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += 1) out.push({ x: from.x, y });
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x += 1) out.push({ x, y: to.y });
  }
  return out;
}

/** Point to point, with every diagonal step squared off for 4-way movement. */
function straightLine(from: Position, to: Position): Position[] {
  const out: Position[] = [{ ...from }];
  let { x, y } = from;
  const dx = Math.abs(to.x - x);
  const dy = Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let err = dx - dy;

  while (x !== to.x || y !== to.y) {
    const doubled = 2 * err;
    const stepX = doubled > -dy && x !== to.x;
    const stepY = doubled < dx && y !== to.y;
    if (stepX && stepY) {
      // Orthogonalize: go through the horizontal neighbour first.
      out.push({ x: x + sx, y });
    }
    if (stepX) { err -= dy; x += sx; }
    if (stepY) { err += dx; y += sy; }
    out.push({ x, y });
  }
  return out;
}

/** A target-biased walk, elbowed to the goal when the wander budget runs out; `minLength` stretches it. */
function windingLine(
  from: Position,
  to: Position,
  rng: Rng,
  minLength: number,
  builder: MapBuilder,
  continueChance: number,
): Position[] {
  const out: Position[] = [{ ...from }];
  let { x, y } = from;
  const manhattan = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  const budget = manhattan * 4 + minLength * 2;

  const inField = (nx: number, ny: number) =>
    nx > 0 && ny > 0 && nx < builder.width - 1 && ny < builder.height - 1;

  for (let step = 0; step < budget; step += 1) {
    if (x === to.x && y === to.y && out.length > minLength) break;

    const towardX = Math.sign(to.x - x);
    const towardY = Math.sign(to.y - y);
    const arrived = x === to.x && y === to.y;

    let dx = 0;
    let dy = 0;
    if (!arrived && rng.chance(continueChance)) {
      // Step toward the target, preferring the axis with more ground to cover.
      const preferX = Math.abs(to.x - x) >= Math.abs(to.y - y);
      if (preferX && towardX !== 0) dx = towardX;
      else if (towardY !== 0) dy = towardY;
      else dx = towardX;
    } else {
      // Wander perpendicular-ish: any of the four directions.
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      [dx, dy] = rng.pick(dirs);
    }

    if (!inField(x + dx, y + dy)) continue;
    x += dx;
    y += dy;
    out.push({ x, y });
  }

  // Guarantee arrival whatever the walk did.
  if (x !== to.x || y !== to.y) {
    const finish = elbowLine({ x, y }, to, rng.chance(0.5));
    out.push(...finish);
  }
  return out;
}
