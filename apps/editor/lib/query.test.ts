/**
 * The filter grammar, which has one hard requirement: nothing an author types
 * may be an error. A half-finished query is a normal state of a text box, so
 * anything unrecognised falls back to looking for the text.
 */

import { describe, it, expect } from 'vitest';
import { parseQuery, matchesQuery } from './query.js';

const hound = {
  id: 'bog_hound',
  name: 'Bog Hound',
  description: 'A lean thing that hunts in the fen.',
  level: 2,
  xp: 20,
  tags: ['beast', 'fen'],
  loot: 'fen_scavenge',
};
const wight = {
  id: 'barrow_wight',
  name: 'Barrow Wight',
  description: 'Cold and patient.',
  level: 6,
  xp: 150,
  tags: ['undead'],
};

const keep = (entries: Record<string, unknown>[], query: string) =>
  entries.filter((e) => matchesQuery(e, parseQuery(query))).map((e) => e['id']);

describe('parseQuery', () => {
  it('treats anything it does not recognise as text to look for', () => {
    expect(parseQuery('bog')).toEqual([{ kind: 'text', text: 'bog' }]);
    // A query being typed: the operator is there but the value is not yet.
    expect(parseQuery('level>')).toEqual([{ kind: 'text', text: 'level>' }]);
  });

  it('keeps a quoted phrase together', () => {
    expect(parseQuery('"barrow wight"')).toEqual([{ kind: 'text', text: 'barrow wight' }]);
  });

  it('reads the operators', () => {
    expect(parseQuery('level>=3')).toEqual([{ kind: 'compare', field: 'level', op: '>=', value: '3' }]);
    // `:` is the friendlier spelling of `=`, since that is what people type.
    expect(parseQuery('kind:weapon')).toEqual([
      { kind: 'compare', field: 'kind', op: '=', value: 'weapon' },
    ]);
  });
});

describe('matchesQuery', () => {
  const all = [hound, wight];

  it('matches id, name and description', () => {
    expect(keep(all, 'bog')).toEqual(['bog_hound']);
    expect(keep(all, 'patient')).toEqual(['barrow_wight']);
    expect(keep(all, 'Barrow')).toEqual(['barrow_wight']);
  });

  it('ands its terms together', () => {
    expect(keep(all, 'level>1 tag:undead')).toEqual(['barrow_wight']);
    expect(keep(all, 'level>10 tag:undead')).toEqual([]);
  });

  it('compares numbers as numbers', () => {
    // The trap: "150" < "20" as text, and a level filter that sorted like a
    // string would quietly return the wrong creatures.
    expect(keep(all, 'xp>100')).toEqual(['barrow_wight']);
    expect(keep(all, 'xp<100')).toEqual(['bog_hound']);
    expect(keep(all, 'level=2')).toEqual(['bog_hound']);
    expect(keep(all, 'level!=2')).toEqual(['barrow_wight']);
  });

  it('finds what is missing, which is the harder question', () => {
    expect(keep(all, 'missing:loot')).toEqual(['barrow_wight']);
    expect(keep(all, 'has:loot')).toEqual(['bog_hound']);
  });

  it('does not count an empty list as present', () => {
    expect(keep([{ id: 'a', tags: [] }, { id: 'b', tags: ['x'] }], 'has:tags')).toEqual(['b']);
    expect(keep([{ id: 'a', name: '  ' }, { id: 'b', name: 'x' }], 'has:name')).toEqual(['b']);
  });

  it('reads a dotted field', () => {
    const areas = [
      { id: 'wide', map: { width: 51 } },
      { id: 'small', map: { width: 21 } },
    ];
    expect(keep(areas, 'map.width>40')).toEqual(['wide']);
  });

  it('matches everything when the box is empty', () => {
    expect(keep(all, '')).toEqual(['bog_hound', 'barrow_wight']);
    expect(keep(all, '   ')).toEqual(['bog_hound', 'barrow_wight']);
  });
});
