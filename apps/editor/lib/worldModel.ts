/** Reading world structure out of the raw authored document. */

import type { ModuleDoc } from './store';

export interface WorldEntry extends Record<string, unknown> {
  id?: unknown;
  name?: unknown;
}

export function asList(value: unknown): WorldEntry[] {
  return Array.isArray(value) ? (value as WorldEntry[]) : [];
}

export function worldOf(doc: ModuleDoc): Record<string, unknown> {
  const world = doc['world'];
  return typeof world === 'object' && world !== null ? (world as Record<string, unknown>) : {};
}

export function startOf(doc: ModuleDoc): Record<string, unknown> {
  const start = doc['start'];
  return typeof start === 'object' && start !== null ? (start as Record<string, unknown>) : {};
}

export function displayName(entry: WorldEntry | undefined): string {
  if (!entry) return '?';
  const name = entry['name'];
  if (typeof name === 'string' && name !== '') return name;
  const id = entry['id'];
  return typeof id === 'string' ? id : '?';
}

export interface ResolvedStart {
  /** Which field decided it, in the engine's precedence order: POI, area, dungeon. */
  readonly kind: 'poi' | 'area' | 'dungeon';
  readonly id: string;
  readonly label: string;
  /** For a POI start, the area the engine derives from `poi.area`. */
  readonly areaId: string | null;
}

/** The same precedence `startingLocation()` applies in the engine: POI first, then area, then dungeon. */
export function resolveStart(doc: ModuleDoc): ResolvedStart | null {
  const start = startOf(doc);
  const world = worldOf(doc);

  const poiId = start['startingPoi'];
  if (typeof poiId === 'string' && poiId !== '') {
    const poi = asList(world['pointsOfInterest']).find((p) => p['id'] === poiId);
    const rawArea = poi?.['area'];
    const areaId = typeof rawArea === 'string' ? rawArea : null;
    return { kind: 'poi', id: poiId, label: displayName(poi) === '?' ? poiId : displayName(poi), areaId };
  }

  const areaId = start['startingArea'];
  if (typeof areaId === 'string' && areaId !== '') {
    const area = asList(world['areas']).find((a) => a['id'] === areaId);
    return { kind: 'area', id: areaId, label: displayName(area) === '?' ? areaId : displayName(area), areaId };
  }

  const dungeonId = start['startingDungeon'];
  if (typeof dungeonId === 'string' && dungeonId !== '') {
    const dungeon = asList(world['dungeons']).find((d) => d['id'] === dungeonId);
    return {
      kind: 'dungeon',
      id: dungeonId,
      label: displayName(dungeon) === '?' ? dungeonId : displayName(dungeon),
      areaId: null,
    };
  }

  return null;
}

/** Whether a map spec draws a hand-authored layout rather than generating one. */
export function hasAuthoredLayout(entry: WorldEntry | undefined): boolean {
  const map = entry?.['map'];
  if (typeof map !== 'object' || map === null) return false;
  const layout = (map as Record<string, unknown>)['layout'];
  return Array.isArray(layout) && layout.length > 0;
}
