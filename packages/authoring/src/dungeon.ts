/**
 * Estimate a dungeon size that can hold the requested room count.
 */

import { diceMean, generateDungeon, placeRooms, placementInputs } from '@dm/engine';
import type { PlacementInputs } from '@dm/engine';
import type { CompiledModule } from '@dm/module';
import { Rng } from '@dm/core';

/** Fraction of the map that can be filled before room placement starts dropping the tail of the list. */
export const PACKING = 0.42;

/** Maximum side length before spacing must be shortened to keep generation practical. */
export const MAX_SIDE = 81;

/** Corridor lengths to try as the map approaches its maximum size. */
const FALLBACKS = ['4d3', '3d3', '2d3', '1d3+1', '1d2+1'] as const;

export interface FitRequest {
  /** How many rooms the author wants to actually exist. */
  readonly rooms: number;
  /** `roomSize` notation, e.g. `2d3+4`. */
  readonly roomSize: string;
  /** `corridorLength` notation — the spacing, whatever it is called. */
  readonly corridorLength: string;
  /** Width over height. 1 is square. */
  readonly aspect?: number;
}

export interface FitResult {
  readonly width: number;
  readonly height: number;
  /** The corridor length that fits, which may not be the one asked for. */
  readonly corridorLength: string;
  /** True when the map hit its ceiling and the spacing had to give way. */
  readonly shortened: boolean;
  /** The spacing every room will keep, as the engine will compute it. */
  readonly spacing: number;
}

/**
 * Find a map size and, if needed, a shorter corridor length that fits the room count.
 */
export function fit(request: FitRequest): FitResult {
  const aspect = request.aspect ?? 1;
  const roomMean = diceMean(request.roomSize, 7);
  const wanted = diceMean(request.corridorLength, 6);
  const ceiling = MAX_SIDE * MAX_SIDE;

  for (const [spacing, notation] of spacings(request.corridorLength, wanted)) {
    const span = roomMean + spacing + 2;
    const needed = (request.rooms * span * span) / PACKING;
    if (needed > ceiling && spacing > 2) continue;

    const height = Math.max(21, Math.round(Math.sqrt(needed / aspect)));
    const width = Math.max(21, Math.round(height * aspect));
    return {
      // Force odd dimensions so each map side can use its full interior.
      width: Math.min(MAX_SIDE, width | 1),
      height: Math.min(MAX_SIDE, height | 1),
      corridorLength: notation,
      shortened: notation !== request.corridorLength,
      spacing,
    };
  }
  // Unreachable: the walk ends at a spacing of 2, which passes the guard.
  throw new Error('fit: the spacing walk did not terminate');
}

/** Yield the requested corridor length and then progressively shorter fallbacks. */
function* spacings(notation: string, wanted: number): Generator<[number, string]> {
  yield [wanted, notation];
  for (const fallback of FALLBACKS) {
    const mean = diceMean(fallback, 4);
    if (mean < wanted) yield [mean, fallback];
  }
  yield [2, '1d2+1'];
}

export interface RoomMeasurement {
  /** What the dungeon says it has. */
  readonly wanted: number;
  /** The fewest it produced across the samples — the one that matters. */
  readonly worst: number;
  /** The most it produced, so a wide spread is visible as a spread. */
  readonly best: number;
  readonly samples: number;
}

/**
 * Measure how many rooms a dungeon actually generates across a few seeded runs.
 */
export function measureRooms(
  module: CompiledModule,
  dungeonId: string,
  samples = 5,
): RoomMeasurement {
  const definition = module.find<{ roomCount?: string }>('world.dungeons', dungeonId);
  const wanted = Number.parseInt(String(definition?.roomCount ?? ''), 10);

  let worst = Infinity;
  let best = 0;
  for (let seed = 1; seed <= samples; seed += 1) {
    const count = generateDungeon(module, dungeonId, Rng.fromSeed(seed)).rooms.length;
    worst = Math.min(worst, count);
    best = Math.max(best, count);
  }
  return { wanted: Number.isFinite(wanted) ? wanted : 0, worst, best, samples };
}


/**
 * Check a size against the engine's actual placement behavior rather than the heuristic estimate.
 */
export function sizeToFit(
  module: CompiledModule,
  dungeonId: string,
  current?: { readonly width: number; readonly height: number },
  /** Sample a generated layout to validate the suggested size before proposing it. */
  samples = 24,
): FitResult {
  const inputs = placementInputs(module, dungeonId);
  const definition = module.get<{ roomSize?: string; corridorLength?: string; roomCount?: string }>(
    'world.dungeons',
    dungeonId,
  );
  const request: FitRequest = {
    rooms: inputs.roomCount,
    roomSize: definition.roomSize ?? '2d3+3',
    corridorLength: definition.corridorLength ?? '3d3',
  };

  const start = fit(request);
  let width = Math.max(start.width, current?.width ?? 0, inputs.derivedSize);
  let height = Math.max(start.height, current?.height ?? 0, inputs.derivedSize);
  let notation = definition.corridorLength ?? '3d3';
  let shortened = false;

  for (let guard = 0; guard < 40; guard += 1) {
    const spacing = Math.max(1, Math.min(12, Math.round(diceMean(notation, 1))));
    if (holds(inputs, width, height, spacing, samples)) break;

    if (width < MAX_SIDE || height < MAX_SIDE) {
      width = Math.min(MAX_SIDE, (Math.round(width * 1.1) + 1) | 1);
      height = Math.min(MAX_SIDE, (Math.round(height * 1.1) + 1) | 1);
      continue;
    }

    // At the ceiling the spacing gives way, in `fit`'s order of preference —
    // a long corridor is what was asked for, so it goes last.
    const shorter = nextShorter(notation);
    if (!shorter) break;
    notation = shorter;
    shortened = true;
  }

  return {
    width: width | 1,
    height: height | 1,
    corridorLength: notation,
    shortened,
    spacing: Math.max(1, Math.min(12, Math.round(diceMean(notation, 1)))),
  };
}

/** Does placement actually succeed at this size, on every sample? */
function holds(
  inputs: PlacementInputs,
  width: number,
  height: number,
  spacing: number,
  samples: number,
): boolean {
  // One room of headroom. Generation draws placement from a *derived* stream
  // that a probe cannot reproduce, so holding exactly the room count on every
  // sample here still failed about one real run in twenty — rejection sampling
  // gets unlucky. Asking the probe for one more than is needed buys the margin
  // that makes the suggestion one that works rather than one that usually does.
  const want = inputs.roomCount + 1;
  for (let seed = 1; seed <= samples; seed += 1) {
    const placed = placeRooms(
      [...inputs.templates],
      want,
      { width, height },
      inputs.guaranteedRoles,
      spacing,
      Rng.fromSeed(seed),
      inputs.defaultSize,
    );
    if (placed.length < want) return false;
  }
  return true;
}

/** The next shorter corridor notation, or null at the end of the walk. */
function nextShorter(notation: string): string | null {
  const mean = diceMean(notation, 6);
  for (const fallback of FALLBACKS) {
    if (diceMean(fallback, 4) < mean) return fallback;
  }
  return null;
}
