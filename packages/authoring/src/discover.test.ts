/** Pinned two ways, because there are two ways to be wrong here. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { evalExpr } from '@dm/module';
import type { Expr } from '@dm/module';
import { readAssembledModule } from '@dm/module/load';
import { rumoured, readRumoured, threadAnchored, noticing, dcKnowing, floorOf } from './discover.js';
import type { Rumoured } from './discover.js';

/** Straight from `dmkit.lore.rumoured`, not written by hand. */
const FROM_PYTHON = [
  {
    spec: { thread: 'kings_under', base: 18, step: 3, entries: 4 },
    json: { hidden: true, discover: { skill: 'perception', difficulty: { max: [6, { sub: [18, { mul: [3, { ref: 'threads.kings_under.known' }] }] }] } } },
  },
  {
    spec: { thread: 'coast_horse', base: 17, step: 3, entries: 4, skill: 'survival' },
    json: { hidden: true, discover: { skill: 'survival', difficulty: { max: [5, { sub: [17, { mul: [3, { ref: 'threads.coast_horse.known' }] }] }] } } },
  },
] as const;

const run = (difficulty: unknown, known: number): unknown =>
  evalExpr(difficulty as Expr, {
    scope: { threads: { kings_under: { known }, coast_horse: { known } } },
    rng: Rng.fromSeed(1),
  });

describe('rumoured', () => {
  it.each(FROM_PYTHON)('matches dmkit for $spec.thread', ({ spec, json }) => {
    expect(rumoured(spec)).toEqual(json);
  });

  it('falls a step per clue and stops at the floor', () => {
    const spec: Rumoured = { thread: 'kings_under', base: 18, step: 3, entries: 4 };
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => dcKnowing(spec, n))).toEqual([18, 15, 12, 9, 6, 6, 6]);
    expect(floorOf(spec)).toBe(6);
  });

  /** The preview an author reads has to be the check the party rolls against. */
  it('dcKnowing predicts what the engine computes', () => {
    for (const { spec } of FROM_PYTHON) {
      const { discover } = rumoured(spec);
      for (let known = 0; known <= spec.entries + 2; known += 1) {
        expect(run(discover.difficulty, known)).toBe(dcKnowing(spec, known));
      }
    }
  });

  it('is never free, however much they know', () => {
    const spec: Rumoured = { thread: 'kings_under', base: 18, step: 3, entries: 4 };
    expect(dcKnowing(spec, 1000)).toBe(6);
  });
});

describe('readRumoured', () => {
  it('round-trips its own output', () => {
    for (const { spec } of FROM_PYTHON) {
      const read = readRumoured(rumoured(spec).discover);
      expect(read).toEqual({ skill: 'perception', ...spec });
    }
  });

  it('opens every rumoured place aurendel ships', () => {
    const doc = readAssembledModule(
      fileURLToPath(new URL('../../../modules/aurendel', import.meta.url)),
    ).doc as { world: { pointsOfInterest: Record<string, unknown>[] } };

    const hidden = doc.world.pointsOfInterest.filter((poi) => poi['hidden'] === true);
    expect(hidden.length).toBe(50);

    const readable = hidden.filter((poi) => readRumoured(poi['discover']) !== null);
    expect(readable.length).toBe(38);

    for (const poi of readable) {
      const spec = readRumoured(poi['discover'])!;
      expect(rumoured(spec).discover).toEqual(poi['discover']);
    }
  });

  it('leaves a plain difficulty alone rather than reinterpreting it', () => {
    expect(readRumoured({ skill: 'perception', difficulty: 13 })).toBeNull();
    expect(readRumoured({ skill: 'perception', difficulty: { max: [1, 2] } })).toBeNull();
    expect(readRumoured(undefined)).toBeNull();
  });
});

describe('threadAnchored', () => {
  it('finds the thread even in a formula it cannot fully read', () => {
    expect(threadAnchored({ difficulty: { sub: [12, { ref: 'threads.odd_one.known' }] } })).toBe('odd_one');
    expect(threadAnchored(rumoured(FROM_PYTHON[0].spec).discover)).toBe('kings_under');
    expect(threadAnchored({ skill: 'perception', difficulty: 13 })).toBeNull();
  });

  it('reports an anchor for every hidden place in aurendel that has one', () => {
    const doc = readAssembledModule(
      fileURLToPath(new URL('../../../modules/aurendel', import.meta.url)),
    ).doc as { world: { pointsOfInterest: Record<string, unknown>[] } };
    const anchored = doc.world.pointsOfInterest.filter((poi) => threadAnchored(poi['discover']) !== null);
    expect(anchored.length).toBe(38);
  });
});

describe('noticing', () => {
  it('matches dmkit.lore.finding', () => {
    expect(
      noticing({
        id: 'coast_found_horse',
        description: 'Close up, what the shape is made of.',
        clue: 'coast_horse_shape',
      }),
    ).toEqual({
      id: 'coast_found_horse',
      mode: 'once',
      on: 'enter',
      description: 'Close up, what the shape is made of.',
      effects: [{ learnLore: { entry: 'coast_horse_shape' } }],
    });
  });

  it('teaches from the trigger, where there is no roll to be before', () => {
    const trigger = noticing({ id: 't', description: 'd', clue: 'c', mode: 'always' });
    expect(trigger['mode']).toBe('always');
    expect(trigger['effects']).toEqual([{ learnLore: { entry: 'c' } }]);
  });
});
