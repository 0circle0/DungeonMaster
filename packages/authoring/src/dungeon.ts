/**
 * Sizing a dungeon so it holds the rooms you asked for.
 *
 * `roomCount` is a *request*, not a promise. `placeRooms` gives each room forty
 * attempts at a spot that keeps `corridorLength`'s mean away from every other
 * room, and when it runs out of attempts it stops — silently, with no error and
 * no diagnostic, leaving a map with fewer rooms than the number in the file.
 * Asking for fifteen rooms with `5d3` corridors on a 47×27 map produced two
 * rooms and a great deal of empty stone, which is why this exists.
 *
 * Nothing in the schema can catch that: every field is valid, the module
 * compiles, and the only symptom is a dungeon that reads bigger than it walks.
 */

import { diceMean, generateDungeon, placeRooms, placementInputs } from '@dm/engine';
import type { PlacementInputs } from '@dm/engine';
import type { CompiledModule } from '@dm/module';
import { Rng } from '@dm/core';

/**
 * How much of a map rejection sampling can fill before it starts dropping the
 * tail of the room list. Measured against `placeRooms`' forty attempts.
 */
export const PACKING = 0.42;

/** The largest map worth generating; beyond this, spacing has to give way. */
export const MAX_SIDE = 81;

/** Progressively shorter corridors, tried only once the map hits its ceiling. */
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
 * A map — and if need be a corridor length — that holds `rooms` rooms.
 *
 * The map grows first, because a long corridor is the thing the author asked
 * for and the map is the thing they did not. Only when the map hits its
 * ceiling does the spacing give way, and then the result says so.
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
      // Odd sides: a map with an even dimension wastes its last row to the
      // wall, which is where a room the author counted on was going to go.
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

/** What the author asked for, then progressively shorter corridors. */
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
 * How many rooms a dungeon *actually* generates, by generating it.
 *
 * Measured rather than predicted, and the first attempt here is why. Inverting
 * `fit`'s arithmetic looks like the obvious way to answer this and is wrong:
 * that formula is a sizing heuristic with deliberate headroom, so read as a
 * prediction it declared 63 of Aurendel's 68 dungeons broken when the engine
 * generates all but a handful of them in full. A warning that fires on
 * everything is worse than no warning, because it is the one an author learns
 * to dismiss.
 *
 * Placement is seeded, so the count varies by seed; several samples and the
 * worst of them is the honest figure — a dungeon that comes up short one run in
 * five is short.
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
 * A size that has been *checked* to hold the rooms, rather than estimated.
 *
 * `fit` is a heuristic with headroom, and at the margin its headroom is not
 * enough: sizing greenmarch's barrow depths by `fit` took it from four rooms
 * out of six to five, which is better and still wrong. An author told "size it
 * to fit", who does so and is told again that it does not fit, has been given a
 * dead end.
 *
 * Two things make the check real rather than another estimate. It probes with
 * the engine's own `placeRooms`, using the templates the biome actually
 * supplies — which declare their own sizes, so `roomSize` is not what most
 * rooms are. And it takes the spacing from `placementInputs`, because
 * generation *rounds and clamps* the corridor mean to 1..12 and `fit`, ported
 * from the Python, uses the raw value: they disagree by a factor of two on
 * exactly the long corridors that cause the problem.
 *
 * It grows from whichever is larger, `fit`'s answer or the current size, so a
 * second attempt makes progress instead of proposing the same thing again.
 */
export function sizeToFit(
  module: CompiledModule,
  dungeonId: string,
  current?: { readonly width: number; readonly height: number },
  /**
   * Placement is seeded and the probe cannot use generation's own stream, so
   * "held on N samples" is evidence rather than proof. Twenty-four probes are
   * still far cheaper than one generation, and the margin they buy is what
   * stops the suggestion from being one that only usually works.
   */
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
