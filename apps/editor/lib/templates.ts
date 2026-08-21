/** Starting points for a new module. */

import { requiredSystemText } from '@dm/module';
import type { ModuleDoc } from './store';

export function blankModule(): ModuleDoc {
  return {
    format: 1,
    id: 'untitled',
    version: '0.1.0',
    meta: {
      title: 'Untitled Module',
      description: 'A new world. Add a biome and an area in the World tree, then pick where play starts.',
    },
    rules: {
      attributes: [
        {
          id: 'might',
          name: 'Might',
          abbrev: 'MGT',
          min: 1,
          max: 20,
          default: 10,
          modifier: { floor: { div: [{ sub: [{ ref: 'value' }, 10] }, 2] } },
        },
      ],
      resources: [
        {
          id: 'hp',
          name: 'Health',
          max: { add: [8, { mul: [{ ref: 'actor.mod.might' }, 2] }] },
          min: 0,
          onDepleted: [{ emit: { event: 'died', data: { who: { ref: 'actor.id' } } } }],
        },
      ],
      vitalResource: 'hp',
      progression: {
        maxLevel: 3,
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 100 },
          { level: 3, xpRequired: 300 },
        ],
      },
    },
    content: {
      ancestries: [{ id: 'human', name: 'Human' }],
      classes: [{ id: 'adventurer', name: 'Adventurer', hitDie: '1d8', primaryAttribute: 'might' }],
    },
    world: {},
    // The fragments other messages are built from.
    narrative: { systemText: requiredSystemText() },
    start: {},
  };
}
