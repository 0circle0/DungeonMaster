/**
 * Clicking a warning has to go where the warning is.
 *
 * It did not, for 127 of the 130 rows aurendel shows: a mod names an entry by
 * id and the resolver only understood indices, so every one of them fell
 * through to "somewhere in this document" — which is the raw JSON, and is not
 * an answer.
 */

import { describe, it, expect } from 'vitest';
import { withEntryIndex, splitEntryPath } from './diagnosticPath.js';

const DOC = {
  content: {
    monsters: [{ id: 'bog_hound' }, { id: 'grave_hound' }, { id: '3rd_thing' }],
    items: [{ id: 'rope' }],
  },
  world: { areas: [{ id: 'millford' }, { id: 'the_fens' }] },
};

describe('withEntryIndex', () => {
  it('turns an id into the index it sits at', () => {
    expect(withEntryIndex(DOC, 'content.monsters.grave_hound')).toBe('content.monsters.1');
    expect(withEntryIndex(DOC, 'world.areas.the_fens')).toBe('world.areas.1');
  });

  it('keeps whatever the path said after the entry', () => {
    expect(withEntryIndex(DOC, 'content.monsters.grave_hound.extra.morale')).toBe(
      'content.monsters.1.extra.morale',
    );
  });

  it('leaves a path that already counts alone', () => {
    expect(withEntryIndex(DOC, 'content.monsters.1.extra.morale')).toBe(
      'content.monsters.1.extra.morale',
    );
  });

  /**
   * `Number.parseInt` stops at the first non-digit, so an id that begins with
   * one reads as an index and opens whatever happens to be there — silently,
   * and at the wrong entry, which is worse than not navigating at all.
   */
  it('does not mistake an id that starts with a digit for an index', () => {
    expect(withEntryIndex(DOC, 'content.monsters.3rd_thing')).toBe('content.monsters.2');
  });

  it('says so when the id names nothing', () => {
    expect(withEntryIndex(DOC, 'content.monsters.never_written')).toBeNull();
  });

  it('leaves a path that is not about an entry alone', () => {
    expect(withEntryIndex(DOC, 'start.startingPoi')).toBe('start.startingPoi');
    expect(withEntryIndex(DOC, 'flags.vess_dead')).toBe('flags.vess_dead');
  });
});

describe('splitEntryPath', () => {
  it('separates the collection, the entry and the rest', () => {
    expect(splitEntryPath(DOC, 'content.monsters.grave_hound.extra.morale')).toEqual({
      collection: 'content.monsters',
      index: 1,
      rest: ['extra', 'morale'],
    });
  });

  it('returns nothing for a path outside every collection', () => {
    // `rules.progression` is a singleton section, not a collection, so a path
    // into it has no entry to name and the resolver leaves it to the raw view.
    expect(splitEntryPath(DOC, 'rules.progression.levels.0')).toBeNull();
    expect(splitEntryPath(DOC, 'meta.title')).toBeNull();
  });
});
