/** How a scaled damage number becomes a whole one. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { reduce } from './reduce.js';
import { createMap } from './grid/tiles.js';
import type { GameState } from './state.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');

/** Seven, so that halving it lands exactly between two whole numbers. */
const FLAT_DAMAGE = 7;

type Rounding = 'floor' | 'round' | 'ceil';

/** Greenmarch plus one ability that deals a flat, unrolled amount. */
function moduleRounding(rounding: Rounding, kind: 'save' | 'critical'): CompiledModule {
  const doc = JSON.parse(JSON.stringify(GREENMARCH.source)) as never as {
    rules: { resolution: Record<string, unknown> };
    content: { abilities: Record<string, unknown>[] };
  };

  doc.rules.resolution['damageRounding'] = rounding;
  doc.rules.resolution['criticalFailureAt'] = null;
  if (kind === 'critical') {
    // Every natural roll is at or above 1, so every attack is a critical.
    doc.rules.resolution['criticalSuccessAt'] = 1;
    doc.rules.resolution['criticalDamageMultiplier'] = 1.5;
  }

  doc.content.abilities.push({
    id: 'test_burst',
    name: 'Test Burst',
    description: 'A fixed amount of harm, for measuring with.',
    actionType: 'action',
    targeting: 'single',
    range: 30,
    ...(kind === 'save'
      ? { savingThrow: { save: 'will', difficulty: 0, onSuccess: 'half' } }
      : { attack: { stat: 'might', against: 'guard' } }),
    onUse: [
      {
        damage: {
          target: { ref: 'target.id' },
          amount: FLAT_DAMAGE,
          damageType: 'cold',
        },
      },
    ],
  });

  const compiled = compileModule(doc);
  if (!compiled.ok) throw new Error(`fixture failed to compile: ${JSON.stringify(compiled.errors)}`);
  return compiled.module;
}

/** A hero who knows the ability, and a hound within reach of it. */
function arena(module: CompiledModule): GameState {
  const base = newGame(module, { seed: 4, party: [defaultChoices(module, 'Ash')] });
  const hero = base.entities[base.party[0]!]!;
  const hound = spawnMonster(module, 'e:99', 'bog_hound');

  return {
    ...base,
    currentMap: 'here',
    maps: {
      here: {
        id: 'here', tiles: createMap(11, 11, 'floor'), kind: 'area', source: 'millford',
        explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1,
      },
    },
    entities: {
      ...base.entities,
      [hero.id]: {
        ...hero,
        map: 'here',
        position: { x: 5, y: 5 },
        abilities: [...hero.abilities, 'test_burst'],
      },
      'e:99': { ...hound, map: 'here', position: { x: 6, y: 5 }, disposition: 'hostile' },
    },
  };
}

/** The scaled amount the blow asked for. */
function damageAsked(rounding: Rounding, kind: 'save' | 'critical'): number {
  const module = moduleRounding(rounding, kind);
  const { events } = reduce(
    arena(module),
    { type: 'useAbility', ability: 'test_burst', target: 'e:99' },
    { module },
  );
  const damaged = events.find((event) => event.type === 'damaged');
  if (!damaged || damaged.type !== 'damaged') throw new Error('the ability dealt no damage');
  return damaged.raw;
}

describe('damageRounding', () => {
  it('governs a save for half', () => {
    expect(damageAsked('round', 'save')).toBe(4);
    expect(damageAsked('floor', 'save')).toBe(3);
    expect(damageAsked('ceil', 'save')).toBe(4);
  });

  // 7 × 1.5 = 10.5.
  it('governs a critical', () => {
    expect(damageAsked('round', 'critical')).toBe(11);
    expect(damageAsked('floor', 'critical')).toBe(10);
  });

  // The default is `round`, so this is the assertion that fails if the default is ever changed by accident.
  it('rounds by default', () => {
    expect(GREENMARCH.source.rules.resolution.damageRounding).toBe('round');
  });
});
