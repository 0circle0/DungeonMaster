/**
 * Room placement for the rooms-and-corridors algorithm.
 *
 * Rejection sampling, as ever — simple, predictable, and it reads naturally
 * when rooms vary a lot in size. What changed: the gap between rooms is no
 * longer a hardcoded single tile. `dungeons[].corridorLength` now sets the
 * spacing rooms are sampled at (its mean, statically — no rng is consumed
 * computing it), so "long corridors" finally means long corridors.
 */

import { Rng, parseDice, rollDice } from '@dm/core';
import type { DiceExpr } from '@dm/core';
import type { Requirement } from '@dm/module';

export interface PlacedRoom {
  readonly id: string;
  readonly template: string;
  readonly role: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centre: { x: number; y: number };
}

export interface PlaceableTemplate {
  id: string;
  role: string;
  weight: number;
  minExits?: number;
  maxExits?: number;
  requires?: Requirement;
  map?: {
    width: string;
    height: string;
    palette?: string;
    static?: string;
    layout: string[];
    legend: Record<string, string>;
  };
  /** Fixed dimensions, for templates whose map is a static `world.maps` entry. */
  fixedSize?: { width: number; height: number };
}

function roll(notation: string, rng: Rng, fallback: number): number {
  try {
    return rollDice(parseDice(notation), rng).total;
  } catch {
    return fallback;
  }
}

/**
 * The mean of a dice expression, statically.
 *
 * Used for room spacing so that map geometry does not consume the rng — a
 * corridorLength of `2d3` spaces rooms four tiles apart on every seed, and
 * only the winding walk (which has its own stream) varies. Keep clauses are
 * approximated as keeping plain dice; nobody writes `4d6kh3` corridors, and if
 * they do, "roughly the mean" is still the honest reading.
 */
export function diceMean(notation: string, fallback: number): number {
  let parsed: DiceExpr;
  try {
    parsed = parseDice(notation);
  } catch {
    return fallback;
  }
  let mean = 0;
  for (const term of parsed.terms) {
    if (term.kind === 'constant') mean += term.sign * term.value;
    else {
      const kept = term.keep ? Math.min(term.keep.count, term.count) : term.count;
      mean += term.sign * kept * ((term.sides + 1) / 2);
    }
  }
  return mean;
}

/** Rectangles do not overlap, and keep `spacing` tiles between their walls. */
function overlaps(a: PlacedRoom, b: PlacedRoom, spacing: number): boolean {
  return (
    a.x < b.x + b.width + spacing &&
    a.x + a.width + spacing > b.x &&
    a.y < b.y + b.height + spacing &&
    a.y + a.height + spacing > b.y
  );
}

/** Place non-overlapping rooms by rejection sampling. */
export function placeRooms(
  templates: PlaceableTemplate[],
  count: number,
  bounds: { width: number; height: number },
  guaranteedRoles: readonly string[],
  spacing: number,
  rng: Rng,
  /** Size for a template that declares no map spec, from the dungeon. */
  defaultSize = '2d3+3',
): PlacedRoom[] {
  const rooms: PlacedRoom[] = [];
  const attemptsPerRoom = 40;

  /**
   * Build the draw order up front.
   *
   * A guaranteed role means *exactly one* — one entrance, one boss. Drawing
   * purely by weight would give a dungeon three entrances and two boss rooms,
   * which is what happens without this.
   */
  const ordered: PlaceableTemplate[] = [];
  const guaranteed = new Set(guaranteedRoles);

  for (const role of guaranteedRoles) {
    const options = templates.filter((entry) => entry.role === role);
    if (options.length > 0) ordered.push(rng.weightedPick(options, (entry) => entry.weight ?? 1));
  }

  // Everything else is drawn from templates that do not claim a unique role.
  const filler = templates.filter((entry) => !guaranteed.has(entry.role));
  const fillerPool = filler.length > 0 ? filler : templates;

  while (ordered.length < count) {
    ordered.push(rng.weightedPick(fillerPool, (entry) => entry.weight ?? 1));
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const template = ordered[index]!;
    const spec = template.map;

    const width = Math.max(3, roll(spec?.width ?? defaultSize, rng, 6));
    const height = Math.max(3, roll(spec?.height ?? defaultSize, rng, 6));
    // A hand-authored room uses its own dimensions, glyph layout or static map.
    const laidOut = spec?.layout && spec.layout.length > 0;
    const w = template.fixedSize?.width ?? (laidOut ? spec.layout[0]!.length : width);
    const h = template.fixedSize?.height ?? (laidOut ? spec.layout.length : height);

    if (w + 2 >= bounds.width || h + 2 >= bounds.height) continue;

    for (let attempt = 0; attempt < attemptsPerRoom; attempt += 1) {
      const x = rng.nextInt(1, bounds.width - w - 2);
      const y = rng.nextInt(1, bounds.height - h - 2);
      const candidate: PlacedRoom = {
        id: `r${index}`,
        template: template.id,
        // A filler room drawn from a role-bearing template loses that role, so
        // the guarantee holds even when a module has only one template.
        role: index < guaranteedRoles.length
          ? template.role
          : (guaranteed.has(template.role) ? 'chamber' : template.role),
        x, y, width: w, height: h,
        centre: { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) },
      };
      if (rooms.some((existing) => overlaps(candidate, existing, spacing))) continue;
      rooms.push(candidate);
      break;
    }
  }

  return rooms;
}
