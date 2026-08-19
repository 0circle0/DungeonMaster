/**
 * Tile maps.
 *
 * A map is a flat array of terrain ids with a width — flat rather than nested
 * because it serializes compactly into a save file and indexes without
 * allocating. Everything spatial in the engine reads through this.
 *
 * The map stores *terrain ids only*. Whether a tile can be walked on is a
 * question for the module's terrain definitions, not a property baked into the
 * map, so the same map means different things under different rulesets.
 */

import type { CompiledModule } from '@dm/module';

export interface Position {
  readonly x: number;
  readonly y: number;
}

/** A rectangular map of terrain ids. Serializable as-is. */
export interface TileMap {
  readonly width: number;
  readonly height: number;
  /** `width * height` terrain ids, row-major. */
  readonly tiles: readonly string[];
}

/** Terrain properties, as the module declares them. */
export interface TerrainDef {
  readonly id: string;
  readonly glyph: string;
  readonly passable: boolean;
  readonly opaque: boolean;
  readonly moveCost: number;
  readonly requiresMode: readonly string[];
  readonly providesCover?: string;
  readonly lightRadius: number;
  readonly isDoor: boolean;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Pack a position into a single number, for use as a Set or Map key. */
export function key(position: Position): number {
  // Bounded by map size; 16 bits per axis is far more than any playable map.
  return (position.y << 16) | position.x;
}

export function unkey(packed: number): Position {
  return { x: packed & 0xffff, y: packed >>> 16 };
}

export function inBounds(map: TileMap, position: Position): boolean {
  return position.x >= 0 && position.y >= 0 && position.x < map.width && position.y < map.height;
}

/** Terrain id at a position; empty string when out of bounds. */
export function terrainAt(map: TileMap, position: Position): string {
  if (!inBounds(map, position)) return '';
  return map.tiles[position.y * map.width + position.x] ?? '';
}

/** Build a map filled with one terrain. */
export function createMap(width: number, height: number, fill: string): TileMap {
  return { width, height, tiles: new Array<string>(width * height).fill(fill) };
}

/**
 * Return a copy with one tile changed.
 *
 * Copying a whole map per tile would be wasteful during generation, so
 * generators use {@link MapBuilder}; this exists for the rare in-play change,
 * such as a door being broken open.
 */
export function withTile(map: TileMap, position: Position, terrain: string): TileMap {
  if (!inBounds(map, position)) return map;
  const tiles = map.tiles.slice();
  tiles[position.y * map.width + position.x] = terrain;
  return { ...map, tiles };
}

/** Mutable map, for generation. Call {@link MapBuilder.freeze} when done. */
export class MapBuilder {
  readonly width: number;
  readonly height: number;
  private readonly tiles: string[];

  constructor(width: number, height: number, fill: string) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.tiles = new Array<string>(this.width * this.height).fill(fill);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): string {
    return this.inBounds(x, y) ? this.tiles[y * this.width + x]! : '';
  }

  set(x: number, y: number, terrain: string): void {
    if (this.inBounds(x, y)) this.tiles[y * this.width + x] = terrain;
  }

  /** Fill a rectangle, clipped to the map. */
  fillRect(x: number, y: number, width: number, height: number, terrain: string): void {
    for (let dy = 0; dy < height; dy += 1) {
      for (let dx = 0; dx < width; dx += 1) this.set(x + dx, y + dy, terrain);
    }
  }

  /** Draw the outline of a rectangle. */
  strokeRect(x: number, y: number, width: number, height: number, terrain: string): void {
    for (let dx = 0; dx < width; dx += 1) {
      this.set(x + dx, y, terrain);
      this.set(x + dx, y + height - 1, terrain);
    }
    for (let dy = 0; dy < height; dy += 1) {
      this.set(x, y + dy, terrain);
      this.set(x + width - 1, y + dy, terrain);
    }
  }

  freeze(): TileMap {
    return { width: this.width, height: this.height, tiles: this.tiles.slice() };
  }
}

/**
 * Terrain lookup for a compiled module.
 *
 * Built once per module rather than per query: movement and field of view read
 * terrain properties for every tile they touch, and a map lookup per tile adds
 * up quickly across a whole party's turn.
 */
export class TerrainIndex {
  private readonly byId: ReadonlyMap<string, TerrainDef>;
  private readonly fallback: TerrainDef;
  /** `movementModes[].terrainMultiplier`, by mode id. */
  private readonly modeMultiplier: ReadonlyMap<string, number>;

  constructor(module: CompiledModule) {
    this.modeMultiplier = new Map(
      module
        .all<{ id: string; terrainMultiplier: number }>('rules.movementModes')
        .map((mode) => [mode.id, mode.terrainMultiplier]),
    );
    const map = new Map<string, TerrainDef>();
    for (const terrain of module.all<Record<string, unknown>>('world.terrains')) {
      map.set(String(terrain['id']), {
        id: String(terrain['id']),
        glyph: String(terrain['glyph'] ?? '.'),
        passable: terrain['passable'] !== false,
        opaque: terrain['opaque'] === true,
        moveCost: Number(terrain['moveCost'] ?? 1),
        requiresMode: (terrain['requiresMode'] as string[] | undefined) ?? [],
        ...(terrain['providesCover'] ? { providesCover: String(terrain['providesCover']) } : {}),
        lightRadius: Number(terrain['lightRadius'] ?? 0),
        isDoor: terrain['isDoor'] === true,
      });
    }
    this.byId = map;

    // Out-of-bounds and unknown terrain read as solid rock: impassable and
    // opaque. Treating the unknown as open would let creatures walk off the
    // edge of the world.
    this.fallback = {
      id: '',
      glyph: ' ',
      passable: false,
      opaque: true,
      moveCost: 1,
      requiresMode: [],
      lightRadius: 0,
      isDoor: false,
    };
  }

  get(id: string): TerrainDef {
    return this.byId.get(id) ?? this.fallback;
  }

  at(map: TileMap, position: Position): TerrainDef {
    return this.get(terrainAt(map, position));
  }

  isPassable(map: TileMap, position: Position, modes: readonly string[] = []): boolean {
    const terrain = this.at(map, position);
    if (!terrain.passable) return false;
    // Terrain that demands a mode — deep water, a chasm — is impassable to
    // anything lacking it.
    if (terrain.requiresMode.length === 0) return true;
    return terrain.requiresMode.some((mode) => modes.includes(mode));
  }

  isOpaque(map: TileMap, position: Position): boolean {
    return this.at(map, position).opaque;
  }

  /**
   * Movement cost to enter, or `Infinity` when the tile cannot be entered.
   *
   * The terrain's own cost times the mover's cheapest mode multiplier, which is
   * what `space.ts` has always documented `moveCost` as meaning and what
   * nothing did — `movementModes[].terrainMultiplier` was authored, validated,
   * and read by no one, so a flier waded through a bog at a walker's pace. A
   * creature with several modes uses whichever crosses this ground best.
   *
   * "Best of the modes it has", not "best of those and also 1": the running
   * minimum used to start at 1, so a multiplier above 1 could never win and a
   * mode declared as *worse* over some ground was quietly free.
   */
  costOf(map: TileMap, position: Position, modes: readonly string[] = []): number {
    if (!this.isPassable(map, position, modes)) return Infinity;
    const base = Math.max(0, this.at(map, position).moveCost);

    let best: number | undefined;
    for (const mode of modes) {
      const declared = this.modeMultiplier.get(mode);
      if (declared === undefined) continue;
      if (best === undefined || declared < best) best = declared;
    }
    return base * (best ?? 1);
  }
}

/** The eight neighbours, in a stable order so iteration is deterministic. */
export const DIRECTIONS: readonly Position[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

/** The four orthogonal neighbours. */
export const ORTHOGONAL: readonly Position[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function neighbours(position: Position, diagonal = true): Position[] {
  const offsets = diagonal ? DIRECTIONS : ORTHOGONAL;
  return offsets.map((offset) => ({ x: position.x + offset.x, y: position.y + offset.y }));
}

/**
 * The terrain index for a module, built once.
 *
 * Keyed on the module object, so replacing the module replaces the index. Lives
 * here rather than in the reducer because the combat turn needs one too, and
 * importing the reducer from inside it would be a cycle.
 */
const terrainCache = new WeakMap<CompiledModule, TerrainIndex>();

export function terrainFor(module: CompiledModule): TerrainIndex {
  let index = terrainCache.get(module);
  if (!index) {
    index = new TerrainIndex(module);
    terrainCache.set(module, index);
  }
  return index;
}
