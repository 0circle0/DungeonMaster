/**
 * A remembered place has to be checked before it is used.
 *
 * Between one session and the next an entry can be deleted, a collection
 * emptied, a module rebuilt by a generator. Restoring blindly lands the author
 * on "nothing here — the entry may have been deleted", which is a worse
 * greeting than the default they were trying to avoid.
 */

import { describe, it, expect } from 'vitest';
import { placeStillExists } from './place.js';
import type { Place } from './place.js';

const doc = {
  content: { monsters: [{ id: 'a' }, { id: 'b' }] },
  world: { areas: [] },
};

const at = (path: string, index: number): Place => ({
  module: 'greenmarch',
  selection: { kind: 'item', path, index },
  viewportKind: 'table',
  tablePath: path,
  mapTarget: { type: 'start' },
});

describe('placeStillExists', () => {
  it('accepts an entry that is still there', () => {
    expect(placeStillExists(at('content.monsters', 0), doc)).toBe(true);
    expect(placeStillExists(at('content.monsters', 1), doc)).toBe(true);
  });

  it('rejects an index past the end', () => {
    expect(placeStillExists(at('content.monsters', 2), doc)).toBe(false);
  });

  it('rejects a collection that has been emptied', () => {
    expect(placeStillExists(at('world.areas', 0), doc)).toBe(false);
  });

  it('rejects a collection that is not there at all', () => {
    expect(placeStillExists(at('narrative.quests', 0), doc)).toBe(false);
    expect(placeStillExists(at('nonsense.things', 0), doc)).toBe(false);
  });

  /** Anything not pointing at an entry has nothing to go stale. */
  it('accepts a place that is not an entry', () => {
    const start: Place = {
      module: 'greenmarch',
      selection: { kind: 'start' },
      viewportKind: 'map',
      tablePath: null,
      mapTarget: { type: 'start' },
    };
    expect(placeStillExists(start, doc)).toBe(true);
  });
});
