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

import { diceMean } from '@dm/engine';

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

/**
 * What a dungeon as written will actually produce — the check, rather than the
 * fix. Reported per dungeon so an author can see which of theirs are lying.
 */
export function roomsThatFit(width: number, height: number, request: FitRequest): number {
  const spacing = diceMean(request.corridorLength, 6);
  const span = diceMean(request.roomSize, 7) + spacing + 2;
  return Math.max(1, Math.floor((width * height * PACKING) / (span * span)));
}
