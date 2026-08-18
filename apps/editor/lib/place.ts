'use client';

/**
 * Where you were, so closing the tab costs nothing.
 *
 * A tab closes by accident — a stray ⌘W, a browser that updated itself
 * overnight, a crash. Autosave means the *work* survives that; this is the
 * other half, because arriving back at the default module with nothing selected
 * and having to find your way to the quest you were three edits into is its own
 * small tax, paid every time.
 *
 * Local storage, not a cookie. Which world was last open used to be a cookie
 * because a server component read it to choose the starting document; there is
 * no server component now, and the library remembers that itself. What is left
 * here is where you were *inside* a world, which is browser state rather than
 * content and has no business travelling to another machine.
 *
 * Nothing here is authoritative. A remembered place that no longer exists — an
 * entry deleted, a collection emptied — is dropped rather than restored, since
 * the alternative is opening onto "nothing here, it may have been deleted".
 */

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

/**
 * Is this place still somewhere the document can go?
 *
 * The check is deliberately cheap and total: it asks whether the thing selected
 * is still there, not whether it is the same thing. An entry that moved is
 * still worth reopening; an index past the end of a collection is not.
 */
export function placeStillExists(place: Place, doc: Record<string, unknown>): boolean {
  const selection = place.selection;
  if (selection.kind !== 'item') return true;

  const [section, name] = selection.path.split('.') as [string, string];
  const container = doc[section];
  if (typeof container !== 'object' || container === null) return false;
  const entries = (container as Record<string, unknown>)[name];
  return Array.isArray(entries) && selection.index < entries.length;
}
