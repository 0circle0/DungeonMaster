/**
 * Putting every point of interest somewhere on its area's map.
 *
 * `position` is where the party stands when they arrive at a place with no
 * interior, and where it shows on the area map when it has one. Hand-placing
 * four hundred of them is not a good use of anybody; hand-placing the ones that
 * matter and laying out the rest is.
 *
 * The only hard requirement is that a spot is inside the map — `freeNear`
 * shifts anyone who lands on a wall — so this optimises for legibility rather
 * than correctness: a ring inset from the edge, filled clockwise, then a second
 * ring further in. Two rings hold twenty-odd places, which is more than any one
 * settlement has.
 */

export interface Positioned {
  readonly id: string;
  readonly area?: string;
  readonly position?: { readonly x: number; readonly y: number };
}

export interface AreaSize {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

/** The default when an entry names an area that has no map of its own. */
const DEFAULT_SIZE = { width: 31, height: 21 };

const PER_RING = 12;

export interface Placement {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
}

/**
 * Spots for the entries that have none.
 *
 * Returns placements rather than mutating, so the caller decides what to do
 * with them — the studio shows them as a diff before applying, because a
 * hundred positions appearing without warning is not a generator, it is an
 * accident.
 *
 * An entry that already has a position keeps it, and is not returned. That is
 * what makes this safe to re-run: hand placement always wins.
 */
export function layOut(entries: readonly Positioned[], areas: readonly AreaSize[]): Placement[] {
  const sizes = new Map(areas.map((area) => [area.id, { width: area.width, height: area.height }]));
  const counters = new Map<string, number>();
  const out: Placement[] = [];

  for (const entry of entries) {
    if (entry.position) continue;
    const area = entry.area ?? '';
    const { width, height } = sizes.get(area) ?? DEFAULT_SIZE;
    const index = counters.get(area) ?? 0;
    counters.set(area, index + 1);
    out.push({ id: entry.id, position: ringSpot(index, width, height) });
  }
  return out;
}

/** The `index`-th spot on a set of concentric rings inside a `width`×`height` map. */
export function ringSpot(index: number, width: number, height: number): { x: number; y: number } {
  const ring = Math.floor(index / PER_RING);
  const step = index % PER_RING;
  const inset = 3 + ring * 4;

  let left = inset;
  let right = width - 1 - inset;
  let top = inset;
  let bottom = height - 1 - inset;
  // A ring that has collapsed to nothing is no longer a ring. Fall back to the
  // outermost one rather than emitting a column of identical positions.
  if (right - left < 4 || bottom - top < 4) {
    left = 3;
    right = width - 4;
    top = 3;
    bottom = height - 4;
  }

  const spanX = right - left;
  const spanY = bottom - top;
  let x: number;
  let y: number;
  if (step < 4) {
    x = left + Math.floor((spanX * step) / 4);
    y = top;
  } else if (step < 6) {
    x = right;
    y = top + Math.floor((spanY * (step - 4)) / 2);
  } else if (step < 10) {
    x = right - Math.floor((spanX * (step - 6)) / 4);
    y = bottom;
  } else {
    x = left;
    y = bottom - Math.floor((spanY * (step - 10)) / 2);
  }

  return {
    x: Math.max(1, Math.min(width - 2, x)),
    y: Math.max(1, Math.min(height - 2, y)),
  };
}
