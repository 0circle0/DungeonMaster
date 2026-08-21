'use client';

/** Where you were, so closing the tab costs nothing. */

import type { Selection, ViewportKind, MapTarget } from '@/app/studio/selection';

const PLACE_KEY = 'dm.studio.place';

export interface Place {
  /** The world key this place is inside; a place in another one means nothing. */
  readonly module: string;
  readonly selection: Selection;
  readonly viewportKind: ViewportKind;
  readonly tablePath: string | null;
  readonly mapTarget: MapTarget;
}

export function rememberPlace(place: Place): void {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // Private browsing or a full quota, neither worth interrupting an author
    // over. Losing the place is the whole cost.
  }
}

export function readPlace(): Place | null {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const place = JSON.parse(raw) as Place;
    return typeof place?.module === 'string' && place.selection ? place : null;
  } catch {
    return null;
  }
}

/** Is this place still somewhere the document can go? */
export function placeStillExists(place: Place, doc: Record<string, unknown>): boolean {
  const selection = place.selection;
  if (selection.kind !== 'item') return true;

  const [section, name] = selection.path.split('.') as [string, string];
  const container = doc[section];
  if (typeof container !== 'object' || container === null) return false;
  const entries = (container as Record<string, unknown>)[name];
  return Array.isArray(entries) && selection.index < entries.length;
}
