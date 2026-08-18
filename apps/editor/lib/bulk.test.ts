/**
 * Bulk edits, planned rather than applied.
 *
 * The property worth pinning is that a plan counts what will *change*, not what
 * was selected: telling an author "40 entries updated" when 37 of them already
 * held the value is how a tool loses their trust the second time they use it.
 */

import { describe, it, expect } from 'vitest';
import { planSetField, planTag, planReplace, planMove } from './bulk.js';
import { setAtMany, getAt } from './store.js';

const entries = [
  { id: 'hound', name: 'Bog Hound', level: 2, tags: ['beast'] },
  { id: 'wight', name: 'Barrow Wight', level: 6, tags: ['undead'] },
  { id: 'husk', name: 'Husk', level: 2 },
];
const doc = { content: { monsters: entries } };
const all = [0, 1, 2];

describe('planSetField', () => {
  it('skips entries that already hold the value', () => {
    const plan = planSetField(entries, 'content.monsters', all, 'level', 2);
    // hound and husk are already 2; only the wight moves.
    expect(plan.changed).toBe(1);
    expect(plan.edits[0]?.path).toEqual(['content', 'monsters', 1, 'level']);
  });

  it('writes a dotted field', () => {
    const plan = planSetField(entries, 'content.monsters', [0], 'map.width', 40);
    expect(plan.edits[0]?.path).toEqual(['content', 'monsters', 0, 'map', 'width']);
  });

  it('does nothing without a field', () => {
    expect(planSetField(entries, 'content.monsters', all, '  ', 1).changed).toBe(0);
  });
});

describe('planTag', () => {
  it('adds only where the tag is missing', () => {
    const plan = planTag(entries, 'content.monsters', all, 'beast', 'add');
    expect(plan.changed).toBe(2); // the hound already has it
    const next = setAtMany(doc, plan.edits);
    expect(getAt(next, ['content', 'monsters', 0, 'tags'])).toEqual(['beast']);
    expect(getAt(next, ['content', 'monsters', 1, 'tags'])).toEqual(['undead', 'beast']);
    // An entry with no tags at all gets a list rather than an error.
    expect(getAt(next, ['content', 'monsters', 2, 'tags'])).toEqual(['beast']);
  });

  it('removes only where the tag is there', () => {
    const plan = planTag(entries, 'content.monsters', all, 'undead', 'remove');
    expect(plan.changed).toBe(1);
    expect(getAt(setAtMany(doc, plan.edits), ['content', 'monsters', 1, 'tags'])).toEqual([]);
  });
});

describe('planReplace', () => {
  it('rewrites the field it is pointed at and nothing else', () => {
    const plan = planReplace(entries, 'content.monsters', all, 'name', 'Bog', 'Fen');
    expect(plan.changed).toBe(1);
    const next = setAtMany(doc, plan.edits);
    expect(getAt(next, ['content', 'monsters', 0, 'name'])).toBe('Fen Hound');
    // The id is untouched: renaming one is `planRename`'s job, not this.
    expect(getAt(next, ['content', 'monsters', 0, 'id'])).toBe('hound');
  });

  it('replaces every occurrence in the value', () => {
    const repeated = [{ id: 'a', name: 'a a a' }];
    const plan = planReplace(repeated, 'content.monsters', [0], 'name', 'a', 'b');
    expect(getAt(setAtMany({ content: { monsters: repeated } }, plan.edits), [
      'content', 'monsters', 0, 'name',
    ])).toBe('b b b');
  });
});

describe('planMove', () => {
  it('moves an entry and keeps the rest in order', () => {
    const plan = planMove(entries, 'content.monsters', 2, 0);
    const next = setAtMany(doc, plan.edits);
    expect((getAt(next, ['content', 'monsters']) as { id: string }[]).map((e) => e.id)).toEqual([
      'husk',
      'hound',
      'wight',
    ]);
  });

  it('clamps rather than losing the entry off the end', () => {
    const plan = planMove(entries, 'content.monsters', 0, 99);
    const next = setAtMany(doc, plan.edits);
    expect((getAt(next, ['content', 'monsters']) as { id: string }[]).map((e) => e.id)).toEqual([
      'wight',
      'husk',
      'hound',
    ]);
  });

  it('does nothing when the entry is already there', () => {
    expect(planMove(entries, 'content.monsters', 1, 1).edits).toEqual([]);
  });

  it('leaves the entries themselves as the same objects', () => {
    // Reordering must not re-identify anything, or validation reparses the
    // whole collection to move one row.
    const plan = planMove(entries, 'content.monsters', 2, 0);
    const next = setAtMany(doc, plan.edits);
    const after = getAt(next, ['content', 'monsters']) as unknown[];
    expect(after[0]).toBe(entries[2]);
    expect(after[1]).toBe(entries[0]);
  });
});

describe('applying a plan preserves identity', () => {
  it('shares every entry the plan did not name', () => {
    const plan = planTag(entries, 'content.monsters', [1], 'extra', 'add');
    const next = setAtMany(doc, plan.edits);
    const after = getAt(next, ['content', 'monsters']) as unknown[];
    expect(after[0]).toBe(entries[0]);
    expect(after[2]).toBe(entries[2]);
    expect(after[1]).not.toBe(entries[1]);
  });
});
