/**
 * Building a hand-authored map, exactly as written.
 *
 * A static map is the author's promise that a place is *this*, not "something
 * like this": the same castle on every seed, in every run. Accordingly this
 * file consumes **no rng anywhere** — everything it produces is a pure
 * function of the module — and it never "fixes" the map. Where `buildMap`
 * guarantees a connected floor by digging, a disconnected static map is the
 * author's decision (or the linter's warning), never silently re-carved.
 *
 * The layer kinds compose into the existing `MapInstance` shape: terrain
 * layers composite into the tile array (last non-empty cell wins, so a base
 * layer carries the ground and later layers lay roads over it), object layers
 * become the packed-key records the instance already has, and marker layers
 * become named positions — `entry` for arrival, `door` for where corridors may
 * attach when the map is stamped into a dungeon.
 */

import type { CompiledModule, StaticMap } from '@dm/module';
import type { TileMap, Position } from '../grid/tiles.js';
import { key as packKey, terrainFor } from '../grid/tiles.js';
import type { ItemStack } from '../state.js';

export interface StaticSpawn {
  readonly kind: 'monster' | 'npc';
  readonly id: string;
  readonly at: Position;
}

export interface BuiltStaticMap {
  readonly tiles: TileMap;
  /** Where the party arrives: the entry marker, or the first passable tile. */
  readonly entry: Position;
  /** Marker id → its positions, row-major. */
  readonly marks: Readonly<Record<string, readonly Position[]>>;
  /** The `door` markers — corridor attachment points for embedded rooms. */
  readonly doors: readonly Position[];
  readonly gates: Readonly<Record<number, { readonly gate: string; readonly open: boolean }>>;
  readonly traps: Readonly<Record<number, { readonly trap: string; readonly state: 'hidden' }>>;
  readonly items: Readonly<Record<number, readonly ItemStack[]>>;
  /** Creatures the map places, in layer order then row-major — a total order. */
  readonly spawns: readonly StaticSpawn[];
}

/** Build a `world.maps` entry. Throws on an unknown id; compile makes that unreachable. */
export function buildStaticMap(module: CompiledModule, mapId: string): BuiltStaticMap {
  const def = module.get<StaticMap>('world.maps', mapId);

  const first = def.layers[0]!.cells as string[][];
  const height = first.length;
  const width = first[0]?.length ?? 0;

  const tiles: string[] = new Array<string>(width * height).fill('');
  const marks: Record<string, Position[]> = {};
  const gates: Record<number, { gate: string; open: boolean }> = {};
  const traps: Record<number, { trap: string; state: 'hidden' }> = {};
  const items: Record<number, ItemStack[]> = {};
  const spawns: StaticSpawn[] = [];

  for (const layer of def.layers) {
    const cells = layer.cells as string[][];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = cells[y]?.[x] ?? '';
        if (cell === '') continue;
        const at = { x, y };
        const packed = packKey(at);

        switch (layer.kind) {
          case 'terrain':
            tiles[y * width + x] = cell;
            break;
          case 'items':
            items[packed] = [...(items[packed] ?? []), { item: cell, quantity: 1 }];
            break;
          case 'monsters':
            spawns.push({ kind: 'monster', id: cell, at });
            break;
          case 'npcs':
            spawns.push({ kind: 'npc', id: cell, at });
            break;
          case 'gates':
            gates[packed] = { gate: cell, open: false };
            break;
          case 'traps':
            traps[packed] = { trap: cell, state: 'hidden' };
            break;
          case 'markers':
            marks[cell] = [...(marks[cell] ?? []), at];
            break;
        }
      }
    }
  }

  const map: TileMap = { width, height, tiles };

  // The entry marker names the arrival tile. A map that lacks one (legal for a
  // room only ever stamped into dungeons) falls back to the first passable
  // tile in row-major order — deterministic, and never a wall.
  const terrain = terrainFor(module);
  const entry = marks[def.entry]?.[0] ?? firstPassable(map, terrain.isPassable.bind(terrain));

  return {
    tiles: map,
    entry,
    marks,
    doors: marks['door'] ?? [],
    gates,
    traps,
    items,
    spawns,
  };
}

function firstPassable(
  map: TileMap,
  passable: (map: TileMap, at: Position) => boolean,
): Position {
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (passable(map, { x, y })) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
