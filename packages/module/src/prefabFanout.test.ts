/** "Editing `inn` updates thirty-six inns" is the feature and the hazard in one sentence. */

import { describe, it, expect } from 'vitest';
import { planFanout, fanoutEdits } from './prefabFanout.js';
import { expandPrefab } from './prefab.js';
import type { Prefab, InstanceMap, StyleTables } from './prefab.js';

const STYLE: StyleTables = { pools: { inn: 'int_inn', hall: 'int_hall' } };

const INN: Prefab = {
  id: 'inn',
  collection: 'world.pointsOfInterest',
  params: [
    { key: 'id', kind: 'id', required: true },
    { key: 'name', kind: 'string', required: true },
  ],
  template: {
    id: '{{id}}',
    name: '{{name}}',
    kind: 'settlement',
    travelMinutes: 3,
    descriptionKey: { '@lookup': ['pools', 'inn'] },
  },
};

/** Three inns and a hand-made place that follows nothing. */
function world(): { doc: Record<string, unknown>; instances: InstanceMap } {
  const made = (id: string, name: string) => expandPrefab(INN, { id, name }, STYLE).entry;
  return {
    doc: {
      world: {
        pointsOfInterest: [
          made('one', 'The First'),
          made('two', 'The Second'),
          { id: 'handmade', name: 'A One-Off', kind: 'ruin' },
          made('three', 'The Third'),
        ],
      },
    },
    instances: {
      'world.pointsOfInterest': {
        one: { id: 'inn', params: { id: 'one', name: 'The First' }, overrides: [] },
        two: { id: 'inn', params: { id: 'two', name: 'The Second' }, overrides: ['travelMinutes'] },
        three: { id: 'inn', params: { id: 'three', name: 'The Third' }, overrides: [] },
      },
    },
  };
}

const slower: Prefab = { ...INN, template: { ...(INN.template as object), travelMinutes: 8 } };

describe('planFanout', () => {
  it('says which instances move and what moves in them', () => {
    const { doc, instances } = world();
    (doc['world'] as { pointsOfInterest: Record<string, unknown>[] }).pointsOfInterest[1]!['travelMinutes'] = 20;

    const plan = planFanout(slower, doc, instances, STYLE);

    // `two` overrode travelMinutes, so it is not moved by this change.
    expect(plan.changed.map((c) => c.id)).toEqual(['one', 'three']);
    expect(plan.changed[0]?.changes).toEqual([{ path: 'travelMinutes', from: 3, to: 8 }]);
  });

  it('counts the ones that come out identical rather than hiding them', () => {
    const { doc, instances } = world();
    // The same prefab: nothing to do, but "0 of 3 change" is a useful answer.
    const plan = planFanout(INN, doc, instances, STYLE);
    expect(plan.changed).toEqual([]);
    expect(plan.unchanged).toBe(3);
  });

  it('never touches an entry that follows nothing', () => {
    const { doc, instances } = world();
    const plan = planFanout(slower, doc, instances, STYLE);
    expect(plan.changed.some((c) => c.id === 'handmade')).toBe(false);
  });

  /** The difference between "this did nothing" and "this was already yours". */
  it('says what the prefab wanted and did not get', () => {
    const { doc, instances } = world();
    const entries = (doc['world'] as { pointsOfInterest: Record<string, unknown>[] }).pointsOfInterest;
    entries[1]!['travelMinutes'] = 20;
    // Also change something `two` did not override, so it appears in the plan.
    const both: Prefab = { ...slower, template: { ...(slower.template as object), kind: 'market' } };

    const two = planFanout(both, doc, instances, STYLE).changed.find((c) => c.id === 'two');
    expect(two?.changes.map((c) => c.path)).toEqual(['kind']);
    expect(two?.kept).toEqual(['travelMinutes']);
  });

  it('reports a prefab that cannot expand rather than writing nonsense', () => {
    const { doc, instances } = world();
    const broken: Prefab = {
      ...INN,
      template: { ...(INN.template as object), descriptionKey: { '@lookup': ['pools', 'nowhere'] } },
    };
    expect(planFanout(broken, doc, instances, STYLE).problems.length).toBeGreaterThan(0);
  });

  it('turns into edits the store can apply as one step', () => {
    const { doc, instances } = world();
    const edits = fanoutEdits(planFanout(slower, doc, instances, STYLE));
    expect(edits.map((e) => e.path)).toEqual([
      ['world', 'pointsOfInterest', 0],
      ['world', 'pointsOfInterest', 3],
    ]);
  });
});
