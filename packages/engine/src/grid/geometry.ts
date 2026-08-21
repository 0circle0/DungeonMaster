/**
 * Grid geometry: distance, lines, and area shapes.
 *
 * Distance is Chebyshev — diagonal movement costs the same as orthogonal. It is the convention
 * tabletop games use for a square grid, it keeps circles from looking like diamonds, and it means
 * "within 6" is a square of side 13. Euclidean distance is available where a genuinely round shape
 * is wanted.
 *
 * Lines are Bresenham — integer-only and the same routine for line of sight, line-shaped spells and
 * thrown objects, so a spell can never reach somewhere the eye cannot see it.
 */

import type { Position } from './tiles.js';
import type { SystemTextKey } from '@dm/module';

/** Chebyshev distance: the number of steps when diagonals are free. */
export function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** True Euclidean distance, for genuinely circular areas. */
export function euclidean(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Manhattan distance, for modules that want orthogonal-only movement. */
export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAdjacent(a: Position, b: Position): boolean {
  return distance(a, b) === 1;
}

/**
 * Every tile on the line from `from` to `to`, inclusive of both. Bresenham's algorithm; the order
 * matters, because callers walk it outward from the origin to find the first blocking tile.
 */
export function line(from: Position, to: Position): Position[] {
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

/** All tiles within `radius` Chebyshev steps, including the centre. */
export function within(centre: Position, radius: number): Position[] {
  const out: Position[] = [];
  for (let y = centre.y - radius; y <= centre.y + radius; y += 1) {
    for (let x = centre.x - radius; x <= centre.x + radius; x += 1) {
      out.push({ x, y });
    }
  }
  return out;
}

/** The ring of tiles at exactly `radius` steps. */
export function ring(centre: Position, radius: number): Position[] {
  if (radius <= 0) return [{ ...centre }];
  const out: Position[] = [];
  for (let x = centre.x - radius; x <= centre.x + radius; x += 1) {
    out.push({ x, y: centre.y - radius }, { x, y: centre.y + radius });
  }
  for (let y = centre.y - radius + 1; y <= centre.y + radius - 1; y += 1) {
    out.push({ x: centre.x - radius, y }, { x: centre.x + radius, y });
  }
  return out;
}

/** Area shapes an ability can project, matching `areaOfEffect.shape`. */
export type AreaShape = 'sphere' | 'cube' | 'cone' | 'line' | 'cylinder' | 'aura';

export interface AreaSpec {
  readonly shape: AreaShape;
  /** Radius, side, or length — in tiles. */
  readonly size: number;
  /** Where it is centred, or where a cone or line starts. */
  readonly origin: Position;
  /** Direction for cones and lines; ignored by the rest. */
  readonly toward?: Position;
  /** Half-angle of a cone, in degrees. Defaults to the quarter-circle blast. */
  readonly angle?: number;
  /** Width of a line shape. */
  readonly width?: number;
}

/**
 * The tiles an area covers. Shapes are computed geometrically and then filtered by what can
 * actually be reached, since a fireball does not curve around a corner. The caller supplies that
 * filter, because the line-of-sight check needs the map and this module does not have it.
 */
export function area(spec: AreaSpec): Position[] {
  const { shape, size, origin } = spec;
  const radius = Math.max(0, Math.floor(size));

  switch (shape) {
    case 'cube':
      // A cube of side `size` centred on the origin.
      return within(origin, Math.floor(radius / 2));

    case 'sphere':
    case 'cylinder':
      // Round in the plane; a cylinder differs only in a dimension the grid does not model.
      return within(origin, radius).filter((p) => euclidean(p, origin) <= radius + 0.5);

    case 'aura':
      // Centred on the caster and excluding their own tile.
      return within(origin, radius).filter((p) => !(p.x === origin.x && p.y === origin.y));

    case 'line': {
      if (!spec.toward) return [{ ...origin }];
      const width = Math.max(1, spec.width ?? 1);
      const direction = normalize(origin, spec.toward);
      const end = {
        x: origin.x + Math.round(direction.x * radius),
        y: origin.y + Math.round(direction.y * radius),
      };
      const spine = line(origin, end);
      if (width === 1) return spine;

      // Widen by taking every tile within half the width of the spine.
      const spread = Math.floor(width / 2);
      const seen = new Set<string>();
      const out: Position[] = [];
      for (const point of spine) {
        for (const near of within(point, spread)) {
          const id = `${near.x},${near.y}`;
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(near);
        }
      }
      return out;
    }

    case 'cone': {
      if (!spec.toward) return [{ ...origin }];
      const direction = normalize(origin, spec.toward);
      const out: Position[] = [];

      // A tile is in the cone when it is within range and its bearing from the origin is within the
      // cone's half-angle — 45 degrees each side unless the ability says otherwise. A small
      // tolerance keeps the edges from looking ragged.
      const halfAngle = ((spec.angle ?? 45) * Math.PI) / 180;
      const limit = Math.cos(halfAngle) - 0.007;
      for (const point of within(origin, radius)) {
        if (point.x === origin.x && point.y === origin.y) continue;
        if (distance(point, origin) > radius) continue;

        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        const dot = (dx / length) * direction.x + (dy / length) * direction.y;
        if (dot >= limit) out.push(point);
      }
      return out;
    }

    default:
      return [{ ...origin }];
  }
}

/** Unit vector from `from` toward `to`; zero-length defaults to east. */
function normalize(from: Position, to: Position): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

/**
 * The eight-way compass direction from one tile to another, as a `systemText` key. Geometry decides
 * which octant; the module decides what to call it.
 */
export function bearing(from: Position, to: Position): SystemTextKey {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 'direction.here';

  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const compass = [
    'direction.east', 'direction.southeast', 'direction.south', 'direction.southwest',
    'direction.west', 'direction.northwest', 'direction.north', 'direction.northeast',
  ] as const;
  const index = Math.round(((angle + 360) % 360) / 45) % 8;
  return compass[index]!;
}

/** Step one tile from `from` toward `to`, diagonals included. */
export function stepToward(from: Position, to: Position): Position {
  return {
    x: from.x + Math.sign(to.x - from.x),
    y: from.y + Math.sign(to.y - from.y),
  };
}
