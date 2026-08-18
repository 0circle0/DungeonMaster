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
 * Two halves, stored differently on purpose:
 *
 * - **which module** goes in a cookie, because the server chooses the starting
 *   document and reading it there means the right module renders first rather
 *   than the wrong one flashing up and being replaced;
 * - **where inside it** goes in local storage, because it is browser state
 *   rather than content and has no business travelling to another machine.
 *
 * Nothing here is authoritative. A remembered place that no longer exists — an
 * entry deleted, a collection emptied — is dropped rather than restored, since
 * the alternative is opening onto "nothing here, it may have been deleted".
 */

import type { Selection, ViewportKind, MapTarget } from '@/app/studio/selection';
import { MODULE_COOKIE } from './placeCookie';

export { MODULE_COOKIE };

const PLACE_KEY = 'dm.studio.place';

export interface Place {
  /** The module this place is inside; a place in another one means nothing. */
  readonly module: string;
  readonly selection: Selection;
  readonly viewportKind: ViewportKind;
  readonly tablePath: string | null;
  readonly mapTarget: MapTarget;
}

export function rememberPlace(place: Place): void {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(place));
    // A year, and same-site: this only ever decides which file an editor opens.
    document.cookie = `${MODULE_COOKIE}=${encodeURIComponent(place.module)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Private browsing, a full quota, a cookie policy — none of which are worth
    // interrupting an author over. Losing the place is the whole cost.
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
