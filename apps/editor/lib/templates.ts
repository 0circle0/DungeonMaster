/**
 * Starting points for a new module.
 *
 * The blank scaffold is the smallest document the schema accepts — rules
 * require at least one attribute, one resource, a vital resource and a
 * progression, and character creation needs an ancestry and a class — so a
 * fresh module compiles immediately. It deliberately does NOT set a start
 * location or any areas: the two start lints then read as a to-do list in
 * the console ("set a start location", "add an area or dungeon"), which is
 * the guided entry point into world building.
 */

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
    narrative: {},
    start: {},
  };
}
