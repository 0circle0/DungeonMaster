/** The map as data. */

import type { CompiledModule } from '@dm/module';
import type { GameState, Entity, EntityId, Position } from '@dm/engine';
import { TerrainIndex, fieldOfView, key } from '@dm/engine';
import { toneOf, toneOfEntity, glyphOfEntity } from './palette.js';
import type { Tone } from './palette.js';

export type Visibility = 'visible' | 'remembered' | 'unknown';

export interface MapCellEntity {
  readonly id: EntityId;
  readonly name: string;
  readonly glyph: string;
  readonly tone: Tone;
  readonly selected: boolean;
  readonly party: boolean;
  readonly hostile: boolean;
}

/** A trap on this tile, if the party has found it. */
function knownTrapAt(
  map: { traps: Readonly<Record<number, { trap: string; state: string }>> },
  packed: number,
): 'found' | 'disarmed' | 'sprung' | null {
  const placed = map.traps[packed];
  if (!placed || placed.state === 'hidden') return null;
  return placed.state as 'found' | 'disarmed' | 'sprung';
}

export interface MapCellView {
  readonly x: number;
  readonly y: number;
  readonly visibility: Visibility;
  /** Terrain id; empty when unknown. */
  readonly terrain: string;
  readonly glyph: string;
  readonly tone: Tone | null;
  /** Only ever set when visible — memory does not track things that move. */
  readonly entity: MapCellEntity | null;
  /** Item stacks lying on the floor here. */
  readonly items: number;
  readonly gate: { readonly id: string; readonly open: boolean } | null;
  /** A trap the party knows about. */
  readonly trap: 'found' | 'disarmed' | 'sprung' | null;
}

export interface MapView {
  readonly mapId: string;
  /** The whole map's size, for scrollbars and overviews. */
  readonly width: number;
  readonly height: number;
  /** Viewport top-left in map coordinates. */
  readonly origin: Position;
  readonly viewport: { readonly width: number; readonly height: number };
  /** Viewport-sized, row-major. */
  readonly cells: readonly MapCellView[];
  /** Where the selected character stands. */
  readonly at: Position;
}

export interface MapViewOptions {
  readonly viewport: { readonly width: number; readonly height: number };
  /** How far the party can see, in tiles. */
  readonly sightRadius?: number;
  /** Centre the viewport here rather than on the selected character. */
  readonly centre?: Position;
}

const UNKNOWN: Omit<MapCellView, 'x' | 'y'> = {
  visibility: 'unknown', terrain: '', glyph: ' ', tone: null,
  entity: null, items: 0, gate: null, trap: null,
};

export function mapView(
  module: CompiledModule,
  state: GameState,
  terrain: TerrainIndex,
  options: MapViewOptions,
): MapView | null {
  const map = state.maps[state.currentMap];
  if (!map) return null;

  const actor = state.entities[state.selected];
  const at = actor?.position ?? { x: 0, y: 0 };
  const centre = options.centre ?? at;
  const radius = options.sightRadius ?? 8;

  const visible = fieldOfView({ map: map.tiles, terrain, origin: at, radius });
  const remembered = new Set(map.explored);
  const tones = new Map<string, Tone | null>();

  // Occupants, drawn over the terrain.
  const occupants = new Map<number, Entity>();
  for (const entity of Object.values(state.entities)) {
    if (!entity.alive || entity.map !== state.currentMap) continue;
    occupants.set(key(entity.position), entity);
  }

  const view = options.viewport;
  const halfWidth = Math.floor(view.width / 2);
  const halfHeight = Math.floor(view.height / 2);
  const left = Math.max(0, Math.min(centre.x - halfWidth, map.tiles.width - view.width));
  const top = Math.max(0, Math.min(centre.y - halfHeight, map.tiles.height - view.height));

  const cells: MapCellView[] = [];
  const bottom = Math.min(map.tiles.height, top + view.height);
  const right = Math.min(map.tiles.width, left + view.width);

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const packed = key({ x, y });
      const seen = visible.has(packed);
      const known = remembered.has(packed);

      if (!seen && !known) {
        cells.push({ x, y, ...UNKNOWN });
        continue;
      }

      const tile = terrain.at(map.tiles, { x, y });
      const occupant = seen ? occupants.get(packed) : undefined;
      const gate = map.gates[packed];

      cells.push({
        x, y,
        visibility: seen ? 'visible' : 'remembered',
        terrain: tile.id,
        glyph: tile.glyph,
        tone: toneOf(module, tile.id, tones),
        entity: occupant
          ? {
              id: occupant.id,
              name: occupant.name,
              glyph: glyphOfEntity(occupant),
              tone: toneOfEntity(occupant),
              selected: occupant.id === state.selected,
              party: occupant.kind === 'character',
              hostile: occupant.disposition === 'hostile',
            }
          : null,
        items: seen ? (map.items[packed]?.length ?? 0) : 0,
        gate: gate ? { id: gate.gate, open: gate.open } : null,
        trap: knownTrapAt(map, packed),
      });
    }
  }

  return {
    mapId: map.id,
    width: map.tiles.width,
    height: map.tiles.height,
    origin: { x: left, y: top },
    viewport: { width: right - left, height: bottom - top },
    cells,
    at,
  };
}
