/**
 * Studio selection model.
 *
 * One selection drives the whole shell: the inspector shows the selected
 * thing's form, the viewport shows its big picture (a map for world entities,
 * a table for collections), and the dock highlights where it lives. Keeping
 * this a single value is what makes the panels agree with each other.
 */

import type { Diagnostic } from '@dm/module';
import { COLLECTIONS, SINGLETONS } from '@/lib/schema';

/** What the inspector is editing. */
export type Selection =
  | { kind: 'none' }
  | { kind: 'start' }
  | { kind: 'singleton'; path: string }
  | { kind: 'item'; path: string; index: number };

/** Simulation and analysis views hosted in the viewport. */
export type ViewId = 'balance' | 'dialogue' | 'timeline' | 'perception' | 'events' | 'orphans' | 'prefabs' | 'rawjson';

export const VIEW_LABELS: Record<ViewId, string> = {
  balance: 'Balance',
  dialogue: 'Dialogue graph',
  timeline: 'Timeline',
  perception: 'Perception preview',
  events: 'Events',
  orphans: 'Unreferenced',
  prefabs: 'Prefabs',
  rawjson: 'Raw JSON',
};

/** What the map viewport is rendering. */
export type MapTarget =
  | { type: 'start' }
  | { type: 'area'; id: string }
  | { type: 'poi'; id: string }
  | { type: 'dungeon'; id: string }
  | { type: 'roomTemplate'; id: string }
  | { type: 'map'; id: string };

/**
 * Targets the read-only preview can draw. `map` is excluded: a `world.maps`
 * entry opens in the paint tool, not in a seed preview of itself.
 */
export type PreviewTarget = Exclude<MapTarget, { type: 'map' }>;

export type ViewportKind = 'map' | 'table' | ViewId;

const WORLD_MAP_COLLECTIONS: Record<string, MapTarget['type']> = {
  'world.areas': 'area',
  'world.pointsOfInterest': 'poi',
  'world.dungeons': 'dungeon',
  'world.roomTemplates': 'roomTemplate',
  'world.maps': 'map',
};

/** Map target for an item selection, when the item is a mappable world entity. */
export function mapTargetFor(path: string, entry: Record<string, unknown> | undefined): MapTarget | null {
  const type = WORLD_MAP_COLLECTIONS[path];
  const id = entry?.['id'];
  if (!type || typeof id !== 'string' || id === '') return null;
  return { type, id };
}

/**
 * Where a diagnostic should take the user. Item paths resolve to the owning
 * entry so the fix happens in a form, not in raw JSON; anything unrecognized
 * falls back to the raw view, which can always show the offending line.
 */
export function selectionForDiagnostic(diagnostic: Diagnostic): Selection | { kind: 'raw' } {
  const path = diagnostic.path;
  if (path === 'start' || path.startsWith('start.')) return { kind: 'start' };

  for (const collection of COLLECTIONS) {
    if (!path.startsWith(`${collection.path}.`)) continue;
    const rest = path.slice(collection.path.length + 1);
    const index = Number.parseInt(rest, 10);
    if (Number.isInteger(index)) return { kind: 'item', path: collection.path, index };
  }

  for (const singleton of SINGLETONS) {
    if (path === singleton.path || path.startsWith(`${singleton.path}.`)) {
      return { kind: 'singleton', path: singleton.path };
    }
  }

  return { kind: 'raw' };
}
