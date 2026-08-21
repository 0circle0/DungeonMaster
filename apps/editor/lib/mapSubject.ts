/**
 * What actually drew the map on screen.
 *
 * The viewport shows a generated map and everything about it is authorable, but the fields live two
 * or three collections away: an area's reeds and water come from a palette's `scatter`, reached
 * through the biome named on the area; a barrow's shape comes from the dungeon entry.
 *
 * This resolves that chain the way the engine does, so the controls beside the map are the ones
 * that moved the pixels. The per-type knowledge lives here because the engine's palette resolution
 * is itself per-type — an area takes its biome's palette as an override, a POI interior takes no
 * override, and a dungeon prefers its own.
 *
 * Works on the raw authored document, so the controls survive a module that does not currently
 * compile.
 */

import type { ModuleDoc, Path } from './store';
import type { MapTarget } from '@/app/studio/selection';
import { asList, displayName, resolveStart, worldOf } from './worldModel';
import type { WorldEntry } from './worldModel';

/** One editable entry: where it lives in the document, and what to call it. */
export interface MapSubject {
  /** Collection path, for the schema and the field registries. */
  readonly registryPath: string;
  /** Where `store.set` writes — the collection path plus the entry's index. */
  readonly basePath: Path;
  readonly id: string;
  readonly label: string;
}

export interface MapSubjects {
  /** The entry whose fields shape the map being drawn. */
  readonly place: MapSubject | null;
  /** The palette the engine will resolve for it, when that palette is authored. */
  readonly palette: MapSubject | null;
  readonly paletteId: string | null;
  /** Why that palette and not another, in a sentence. */
  readonly paletteReason: string;
  /** Set when the map drawn is not the selected target's own. */
  readonly redirect: string | null;
}

const NOTHING: MapSubjects = {
  place: null,
  palette: null,
  paletteId: null,
  paletteReason: '',
  redirect: null,
};

function find(doc: ModuleDoc, collection: string, id: string): { entry: WorldEntry; index: number } | null {
  const entries = asList(worldOf(doc)[collection]);
  const index = entries.findIndex((e) => e['id'] === id);
  const entry = entries[index];
  // First match wins, the way `module.find` resolves a duplicate id.
  return entry ? { entry, index } : null;
}

function subject(collection: string, id: string, entry: WorldEntry, index: number): MapSubject {
  return {
    registryPath: `world.${collection}`,
    basePath: ['world', collection, index],
    id,
    label: displayName(entry),
  };
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** The `map` sub-object of an area or POI, when it is one. */
function mapSpecOf(entry: WorldEntry): Record<string, unknown> | null {
  const map = entry['map'];
  return typeof map === 'object' && map !== null ? (map as Record<string, unknown>) : null;
}

/** The palette entry itself, so its `scatter` can be edited in place. */
function paletteSubject(doc: ModuleDoc, id: string | null): MapSubject | null {
  if (!id) return null;
  const found = find(doc, 'palettes', id);
  return found ? subject('palettes', id, found.entry, found.index) : null;
}

/**
 * Which entry and which palette produced the map for this target. The redirects matter as much as
 * the palettes: a POI with no interior draws its area, and a POI with a dungeon draws the dungeon.
 */
export function resolveMapSubjects(doc: ModuleDoc, target: MapTarget): MapSubjects {
  switch (target.type) {
    // The engine resolves the start the same way — POI, then area, then dungeon — so this reduces
    // to whichever of those it picked.
    case 'start': {
      const start = resolveStart(doc);
      if (!start) return NOTHING;
      return resolveMapSubjects(doc, { type: start.kind, id: start.id });
    }

    case 'area': {
      const found = find(doc, 'areas', target.id);
      if (!found) return NOTHING;

      // `buildMap(module, area.map, rng, biome?.palette)`: the biome's palette arrives as an
      // override, and `resolvePalette` takes the override ahead of the spec's own. See preview.ts
      // and mapgen.ts.
      const biomeId = str(found.entry['biome']);
      const biome = biomeId ? find(doc, 'biomes', biomeId) : null;
      const fromBiome = str(biome?.entry['palette']);
      const own = str(mapSpecOf(found.entry)?.['palette'] ?? null);
      const paletteId = fromBiome ?? own;

      const reason = fromBiome
        ? own && own !== fromBiome
          ? `Palette "${fromBiome}" comes from the biome "${biomeId}", which overrides this area's own map.palette ("${own}") — that field is never read for an area.`
          : `Palette "${fromBiome}" comes from the biome "${biomeId}". An area always takes its biome's palette; its own map.palette is only a fallback for a biome that names none.`
        : own
          ? `Palette "${own}" comes from this area's map.palette — the biome "${biomeId ?? '?'}" names none.`
          : 'No palette resolves, so the map falls back to the first passable and first impassable terrain declared in World → Terrains.';

      return {
        place: subject('areas', target.id, found.entry, found.index),
        palette: paletteSubject(doc, paletteId),
        paletteId,
        paletteReason: reason,
        redirect: null,
      };
    }

    case 'poi': {
      const found = find(doc, 'pointsOfInterest', target.id);
      if (!found) return NOTHING;
      const name = displayName(found.entry);

      // A POI that descends into a dungeon shows the dungeon.
      const dungeonId = str(found.entry['dungeon']);
      if (dungeonId) {
        const inner = resolveMapSubjects(doc, { type: 'dungeon', id: dungeonId });
        return { ...inner, redirect: `"${name}" descends into the dungeon "${dungeonId}" — that is the map drawn here, and these are its controls.` };
      }

      // A POI with no interior is a spot on its area's map.
      const spec = mapSpecOf(found.entry);
      if (!spec) {
        const areaId = str(found.entry['area']);
        if (!areaId) return NOTHING;
        const inner = resolveMapSubjects(doc, { type: 'area', id: areaId });
        return { ...inner, redirect: `"${name}" has no interior map, so what is drawn is its area, "${areaId}" — these controls are the area's. Give the POI a \`map\` for a walkable interior of its own.` };
      }

      // An interior gets no override: `buildMap(module, poi.map, rng)`.
      const paletteId = str(spec['palette']);
      return {
        place: subject('pointsOfInterest', target.id, found.entry, found.index),
        palette: paletteSubject(doc, paletteId),
        paletteId,
        paletteReason: paletteId
          ? `Palette "${paletteId}" comes from this POI's own map.palette. A POI interior does not inherit its biome's palette — unlike an area, it is never given one.`
          : 'This POI names no palette, and an interior does not inherit its biome\'s, so the map falls back to the first passable and first impassable terrain in World → Terrains.',
        redirect: null,
      };
    }

    case 'dungeon': {
      const found = find(doc, 'dungeons', target.id);
      if (!found) return NOTHING;

      // `resolvePalette(module, definition.palette ?? biome?.palette)` — the dungeon's own wins
      // here, the opposite way round from an area.
      const own = str(found.entry['palette']);
      const biomeId = str(found.entry['biome']);
      const biome = biomeId ? find(doc, 'biomes', biomeId) : null;
      const fromBiome = str(biome?.entry['palette']);
      const paletteId = own ?? fromBiome;

      return {
        place: subject('dungeons', target.id, found.entry, found.index),
        palette: paletteSubject(doc, paletteId),
        paletteId,
        paletteReason: own
          ? `Palette "${own}" is the dungeon's own, which wins over the biome's.`
          : fromBiome
            ? `Palette "${fromBiome}" comes from the biome "${biomeId}", since the dungeon names none.`
            : 'No palette resolves, so rooms fall back to the first passable and first impassable terrain in World → Terrains.',
        redirect: null,
      };
    }

    case 'roomTemplate': {
      const found = find(doc, 'roomTemplates', target.id);
      if (!found) return NOTHING;

      const staticId = str(mapSpecOf(found.entry)?.['static'] ?? null);
      if (staticId) {
        const inner = find(doc, 'maps', staticId);
        return {
          place: subject('roomTemplates', target.id, found.entry, found.index),
          palette: null,
          paletteId: null,
          paletteReason: inner
            ? `This room is the static map "${staticId}" — every tile hand-drawn, no palette involved. Edit it under World → Maps.`
            : `This room names the static map "${staticId}", which does not exist.`,
          redirect: null,
        };
      }

      const own = str(mapSpecOf(found.entry)?.['palette'] ?? null);
      return {
        place: subject('roomTemplates', target.id, found.entry, found.index),
        palette: paletteSubject(doc, own),
        paletteId: own,
        paletteReason: own
          ? `Palette "${own}" is this template's own; when it is stamped into a dungeon, its legend defaults resolve against it.`
          : 'No palette of its own: the dungeon that stamps this room supplies one.',
        redirect: null,
      };
    }

    case 'map': {
      const found = find(doc, 'maps', target.id);
      if (!found) return NOTHING;
      return {
        place: subject('maps', target.id, found.entry, found.index),
        palette: null,
        paletteId: null,
        paletteReason:
          'A static map has no palette — every cell names its terrain directly.',
        redirect: null,
      };
    }
  }
}
