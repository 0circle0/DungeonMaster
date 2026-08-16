/**
 * Building tiles from a map spec.
 *
 * A module describes a space either by size (`width`/`height` as dice, so it
 * varies per instance) or by a hand-authored `layout` of glyph rows. Set pieces
 * and generated space compose: a dungeon's boss room can be drawn by hand while
 * its corridors stay procedural.
 *
 * Palettes are the indirection that makes one generator produce a stone crypt
 * or a reed marsh. The generator asks for "floor" and "wall"; the palette
 * decides what those are.
 */

import { Rng, parseDice, rollDice, valueNoise } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import { MapBuilder, TerrainIndex, key as packKey, unkey } from '../grid/tiles.js';
import type { TileMap, Position } from '../grid/tiles.js';
import { floodFill } from '../grid/path.js';
import { line } from '../grid/geometry.js';
import { defaultMovementModeOf } from '../rules/config.js';

export interface MapSpec {
  width: string;
  height: string;
  palette?: string;
  /** A `world.maps` id used verbatim. Callers branch to `buildStaticMap` before generating. */
  static?: string;
  layout: string[];
  legend: Record<string, string>;
}

/**
 * Terrain laid over the floor after a space is generated.
 *
 * `speckle` is an independent roll per tile — right for debris, wrong for
 * anything that ought to be one thing rather than many. `patch` thresholds a
 * noise field, so the terrain comes out connected and can carry a shoreline.
 */
export interface ScatterDef {
  readonly terrain: string;
  readonly frequency: number;
  readonly distribution: 'speckle' | 'patch';
  readonly scale: number;
  readonly octaves: number;
  readonly edgeTerrain?: string;
  readonly edgeWidth: number;
  readonly priority: number;
}

/** The terrain a generator reaches for, resolved from a palette. */
export interface Palette {
  readonly id: string;
  readonly floor: string;
  readonly wall: string;
  readonly door: string;
  readonly exterior: string;
  readonly scatter: readonly ScatterDef[];
}

interface PaletteDef {
  id: string;
  floor: string;
  wall: string;
  door?: string;
  exterior?: string;
  scatter: Partial<ScatterDef>[];
}

/** Fill in a scatter entry's defaults, so the generator sees one shape. */
function resolveScatter(entry: Partial<ScatterDef>): ScatterDef {
  return {
    terrain: entry.terrain ?? '',
    frequency: entry.frequency ?? 0.05,
    distribution: entry.distribution ?? 'speckle',
    scale: entry.scale ?? 8,
    octaves: entry.octaves ?? 2,
    ...(entry.edgeTerrain ? { edgeTerrain: entry.edgeTerrain } : {}),
    edgeWidth: entry.edgeWidth ?? 1,
    priority: entry.priority ?? 0,
  };
}

/**
 * Resolve a palette by id.
 *
 * Falls back to the first passable and first impassable terrain the module
 * declares, so a module that never mentions palettes still generates something
 * walkable rather than failing.
 */
export function resolvePalette(module: CompiledModule, paletteId: string | undefined): Palette {
  const definition = paletteId
    ? module.find<PaletteDef>('world.palettes', paletteId)
    : undefined;

  if (definition) {
    return {
      id: definition.id,
      floor: definition.floor,
      wall: definition.wall,
      door: definition.door ?? definition.floor,
      exterior: definition.exterior ?? definition.wall,
      scatter: (definition.scatter ?? []).map(resolveScatter),
    };
  }

  const terrains = module.all<{ id: string; passable: boolean }>('world.terrains');
  const floor = terrains.find((terrain) => terrain.passable !== false)?.id ?? '';
  const wall = terrains.find((terrain) => terrain.passable === false)?.id ?? floor;

  return { id: '', floor, wall, door: floor, exterior: wall, scatter: [] };
}

function rollSize(notation: string | undefined, rng: Rng, fallback: number): number {
  if (!notation) return fallback;
  try {
    return Math.max(3, rollDice(parseDice(notation), rng).total);
  } catch {
    return fallback;
  }
}

export interface BuiltMap {
  readonly tiles: TileMap;
  readonly palette: Palette;
  /** Positions marked by a glyph in a hand-authored layout, by glyph. */
  readonly marks: Readonly<Record<string, { x: number; y: number }[]>>;
}

/**
 * Build a map from its spec.
 *
 * A `layout` is used verbatim; otherwise a walled rectangle is generated at the
 * rolled size. Scatter terrain is sprinkled afterwards, never onto walls, so a
 * palette cannot accidentally seal a room.
 */
export function buildMap(
  module: CompiledModule,
  spec: MapSpec | undefined,
  rng: Rng,
  paletteOverride?: string,
  options: { readonly entry?: Position } = {},
): BuiltMap {
  const palette = resolvePalette(module, paletteOverride ?? spec?.palette);
  const marks: Record<string, { x: number; y: number }[]> = {};

  // — hand-authored ————————————————————————————————————————
  if (spec?.layout && spec.layout.length > 0) {
    const width = spec.layout[0]!.length;
    const builder = new MapBuilder(width, spec.layout.length, palette.floor);

    const legend: Record<string, string> = {
      '.': palette.floor,
      '#': palette.wall,
      '+': palette.door,
      ...spec.legend,
    };

    spec.layout.forEach((row, y) => {
      [...row].forEach((glyph, x) => {
        const terrain = legend[glyph];
        if (terrain) {
          builder.set(x, y, terrain);
        } else {
          // An unmapped glyph is a marker — a spawn point, a treasure spot —
          // recorded for the caller and drawn as floor.
          builder.set(x, y, palette.floor);
        }
        if (!(glyph in legend) && glyph !== ' ') {
          (marks[glyph] ??= []).push({ x, y });
        }
      });
    });

    return { tiles: builder.freeze(), palette, marks };
  }

  // — generated ————————————————————————————————————————————
  const width = rollSize(spec?.width, rng.derive('width'), 7);
  const height = rollSize(spec?.height, rng.derive('height'), 7);

  const builder = new MapBuilder(width, height, palette.floor);
  builder.strokeRect(0, 0, width, height, palette.wall);

  applyScatter(builder, palette, rng.derive('scatter'));

  // A lake is a wall you walk around, which is the point of it — but only for
  // as long as there is a way around. This guarantees there is.
  const entry = options.entry ?? { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  reconnect(builder, module, palette, entry);

  return { tiles: builder.freeze(), palette, marks };
}

/**
 * Lay a palette's scatter over the open floor.
 *
 * Entries are laid in priority order and never overwrite one another: the old
 * code wrote each pass unconditionally, so a second entry silently deleted a
 * share of the first and the listed order changed everyone's effective
 * frequency but the last's.
 */
export function applyScatter(
  builder: MapBuilder,
  palette: Palette,
  rng: Rng,
  /**
   * Tiles scatter may never claim, packed `y * width + x`. Dungeons reserve
   * room centres, the entrance, and doorways: scatter is dressing, and an
   * impassable rubble pile on the boss room's centre is not dressing.
   */
  reserved: ReadonlySet<number> = new Set(),
): void {
  const { width, height } = builder;
  const claimed = new Uint8Array(width * height);
  for (const index of reserved) {
    if (index >= 0 && index < claimed.length) claimed[index] = 1;
  }

  // A stable sort by priority: equal priorities keep their declared order, so
  // reordering identical entries cannot change the map.
  const entries = palette.scatter
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.priority - b.entry.priority || a.index - b.index);

  const open = (x: number, y: number): boolean =>
    !claimed[y * width + x] && builder.get(x, y) === palette.floor;

  const claim = (x: number, y: number, terrain: string): void => {
    builder.set(x, y, terrain);
    claimed[y * width + x] = 1;
  };

  for (const { entry } of entries) {
    if (entry.frequency <= 0 || !entry.terrain) continue;

    if (entry.distribution === 'speckle') {
      // Deliberately the original roll, drawn in the original order from the
      // one shared stream: a module that has not opted into patches must
      // generate exactly the map it did before. Note the roll happens *before*
      // the `open` check, so skipping an already-claimed tile cannot shift the
      // stream either.
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          if (!rng.chance(entry.frequency)) continue;
          if (!open(x, y)) continue;
          claim(x, y, entry.terrain);
        }
      }
      continue;
    }

    // — patch ————————————————————————————————————————————
    const field = valueNoise(rng.derive(`patch:${entry.terrain}`).nextUint32(), {
      scale: entry.scale,
      octaves: entry.octaves,
    });

    // Threshold by rank rather than by a fixed value, so `frequency` means the
    // fraction of floor covered whatever shape the noise happens to take —
    // an authored 0.16 stays 0.16 if the noise is ever retuned.
    const candidates: { at: number; value: number }[] = [];
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        if (!open(x, y)) continue;
        candidates.push({ at: y * width + x, value: field.at(x, y) });
      }
    }
    if (candidates.length === 0) continue;

    // Ties broken by tile index, so the ordering is total and reproducible.
    candidates.sort((a, b) => a.value - b.value || a.at - b.at);
    const wanted = Math.round(candidates.length * entry.frequency);
    const chosen = candidates.slice(candidates.length - wanted);

    const inPatch = new Set<number>();
    for (const tile of chosen) inPatch.add(tile.at);

    // The shore goes down first, so the patch itself can then be written over
    // the inner edge of it without a hole appearing.
    if (entry.edgeTerrain && entry.edgeWidth > 0) {
      const reach = entry.edgeWidth;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const at = y * width + x;
          if (inPatch.has(at) || !open(x, y)) continue;

          let touches = false;
          for (let dy = -reach; dy <= reach && !touches; dy += 1) {
            for (let dx = -reach; dx <= reach; dx += 1) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
              if (inPatch.has(ny * width + nx)) { touches = true; break; }
            }
          }
          if (touches) claim(x, y, entry.edgeTerrain);
        }
      }
    }

    for (const at of inPatch) claim(at % width, Math.floor(at / width), entry.terrain);
  }
}

/**
 * Make sure every piece of walkable floor can be reached from the entry.
 *
 * Patches of impassable terrain can strand a corner of the map, or bury the
 * entry point itself. Rather than constrain the generator — which would make
 * the shapes duller — anything cut off is dug back out along a straight line to
 * the main region.
 *
 * The invariant is worth stating plainly: **`buildMap` never returns a map
 * whose walkable floor is in more than one piece.**
 */
export function reconnect(
  builder: MapBuilder,
  module: CompiledModule,
  palette: Palette,
  entry: Position,
  /**
   * Cells the repair may never dig through nor worry about, packed with the
   * grid `key()`. Dungeons pass their static rooms' rectangles: a pocket the
   * author sealed stays sealed, and no causeway is scored through their walls.
   */
  avoid: ReadonlySet<number> = new Set(),
): void {
  const terrain = new TerrainIndex(module);
  const { width, height } = builder;
  // Connectivity is judged for whatever the ruleset says a creature does by
  // default. A module whose modes are `glide` and `phase` is checked with the
  // one it declares, not with a word the engine happens to know.
  const defaultMode = defaultMovementModeOf(module);
  const WALK = defaultMode === null ? [] : [defaultMode];

  /**
   * What to replace a blocking tile with.
   *
   * Whatever the scatter entry declared as that terrain's edge, so a way cut
   * through a lake is a ford of shallow water rather than a dry corridor
   * scored across it — and a shore tile can never be left beside nothing.
   */
  const walkable = (id: string): boolean => {
    const definition = module.find<{ passable?: boolean; requiresMode?: string[] }>(
      'world.terrains',
      id,
    );
    if (!definition || definition.passable === false) return false;
    const needs = definition.requiresMode ?? [];
    return needs.length === 0 || needs.some((mode) => WALK.includes(mode));
  };

  const crossing = (at: Position): string => {
    const owner = palette.scatter.find((entry) => entry.terrain === builder.get(at.x, at.y));
    const edge = owner?.edgeTerrain;
    return edge && walkable(edge) ? edge : palette.floor;
  };

  // The entry itself must be standable, whatever landed on it.
  if (!terrain.isPassable(builder.freeze(), entry, WALK)) {
    builder.set(entry.x, entry.y, crossing(entry));
  }

  // Stranded tiles whose every route back crosses an avoided cell: given up
  // on, so the search does not pick them again forever.
  const abandoned = new Set<number>();

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const tiles = builder.freeze();
    const main = floodFill(tiles, terrain, entry, WALK);

    // Any walkable tile the flood did not reach is stranded. Tiles inside an
    // avoided region are the author's business, not the repair crew's.
    let stranded: Position | null = null;
    for (let y = 1; y < height - 1 && !stranded; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const packed = packKey({ x, y });
        if (avoid.has(packed) || abandoned.has(packed)) continue;
        if (!terrain.isPassable(tiles, { x, y }, WALK)) continue;
        if (main.has(packed)) continue;
        stranded = { x, y };
        break;
      }
    }
    if (!stranded) return;

    // Dig straight back to the nearest tile of the main region whose line does
    // not cross an avoided cell. A channel is the honest repair here: it reads
    // as a ford or a causeway, not as damage.
    const crossesAvoid = (target: Position): boolean =>
      avoid.size > 0 && line(stranded, target).some((step) => avoid.has(packKey(step)));

    let nearest: Position | null = null;
    let best = Infinity;
    for (const packed of main) {
      const at = unkey(packed);
      const span = Math.max(Math.abs(at.x - stranded.x), Math.abs(at.y - stranded.y));
      if (span >= best) continue;
      if (crossesAvoid(at)) continue;
      best = span;
      nearest = at;
    }
    if (!nearest) {
      abandoned.add(packKey(stranded));
      continue;
    }

    for (const step of line(stranded, nearest)) {
      if (step.x <= 0 || step.y <= 0 || step.x >= width - 1 || step.y >= height - 1) continue;
      if (terrain.isPassable(tiles, step, WALK)) continue;
      builder.set(step.x, step.y, crossing(step));
    }
  }
}
