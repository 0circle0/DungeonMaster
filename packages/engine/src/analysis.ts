/** Preview simulations, for the editor. */

import { Rng } from '@dm/core';
import type { CompiledModule, Scope } from '@dm/module';
import { rollLoot, rollEncounter, singleScope } from './world/populate.js';
import { monsterThreat } from '@dm/module';
import { MapBuilder, TerrainIndex, terrainAt } from './grid/tiles.js';
import type { Position } from './grid/tiles.js';
import type { Entity, GameState } from './state.js';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster } from './character.js';
import { sensesOf, signalAt, emissionOf } from './sim/senses.js';

export interface Outcome {
  readonly id: string;
  readonly label: string;
  /** Trials in which this appeared at least once. */
  readonly appearances: number;
  /** Share of trials, 0..1. */
  readonly frequency: number;
  readonly total: number;
  readonly averageWhenPresent: number;
  /** Excluded by gating for this party. */
  readonly gatedOut: boolean;
}

export interface SimulationResult {
  readonly trials: number;
  readonly outcomes: readonly Outcome[];
  readonly emptyTrials: number;
  readonly excluded: readonly string[];
}

export interface EncounterOutcome extends Outcome {
  readonly averageCreatures: number;
  readonly averageThreat: number;
}

export interface EncounterSimulationResult {
  readonly trials: number;
  readonly outcomes: readonly EncounterOutcome[];
  readonly emptyTrials: number;
  readonly excluded: readonly string[];
}

interface Options {
  readonly trials?: number;
  readonly seed?: number;
  readonly labelFor?: (id: string) => string;
}

/** Roll a loot table many times. */
export function simulateLoot(
  module: CompiledModule,
  tableId: string,
  scope: Scope,
  options: Options = {},
): SimulationResult {
  const trials = options.trials ?? 2000;
  const label = options.labelFor ?? ((id: string) => id);
  const rng = Rng.fromSeed(options.seed ?? 1);

  const table = module.find<{ entries?: { value: { item: string } }[] }>('content.lootTables', tableId);
  const declared = (table?.entries ?? []).map((entry) => entry.value.item);

  const appearances = new Map<string, number>();
  const totals = new Map<string, number>();
  let emptyTrials = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const draws = rollLoot(module, tableId, singleScope(scope), rng.derive(`trial:${trial}`));
    if (draws.length === 0) {
      emptyTrials += 1;
      continue;
    }
    for (const draw of draws) {
      appearances.set(draw.item, (appearances.get(draw.item) ?? 0) + 1);
      totals.set(draw.item, (totals.get(draw.item) ?? 0) + draw.quantity);
    }
  }

  // Anything declared but never drawn across the whole run was gated out.
  const excluded = declared.filter((item) => !appearances.has(item));

  const outcomes: Outcome[] = [...new Set(declared)].map((id) => {
    const seen = appearances.get(id) ?? 0;
    const total = totals.get(id) ?? 0;
    return {
      id,
      label: label(id),
      appearances: seen,
      frequency: seen / trials,
      total,
      averageWhenPresent: seen > 0 ? total / seen : 0,
      gatedOut: seen === 0,
    };
  });

  outcomes.sort((a, b) => b.frequency - a.frequency || a.label.localeCompare(b.label));
  return { trials, outcomes, emptyTrials, excluded };
}

/** Roll an encounter table many times. */
export function simulateEncounters(
  module: CompiledModule,
  tableId: string,
  scope: Scope,
  options: Options & { depth?: number } = {},
): EncounterSimulationResult {
  const trials = options.trials ?? 2000;
  const rng = Rng.fromSeed(options.seed ?? 1);
  const depth = options.depth ?? 0;

  const table = module.find<{ groups?: { id: string; name?: string }[] }>(
    'world.encounterTables',
    tableId,
  );
  const groups = table?.groups ?? [];
  const monsters = module.all<{ id: string; xp?: number; level?: number; challenge?: number }>('content.monsters');

  const appearances = new Map<string, number>();
  const creatures = new Map<string, number>();
  const threat = new Map<string, number>();
  let emptyTrials = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const draw = rollEncounter(module, tableId, scope, rng.derive(`trial:${trial}`), depth);
    if (!draw) {
      emptyTrials += 1;
      continue;
    }

    let count = 0;
    let worth = 0;
    for (const entry of draw.monsters) {
      count += entry.count;
      const monster = monsters.find((candidate) => candidate.id === entry.monster);
      if (monster) worth += monsterThreat(monster) * entry.count;
    }

    appearances.set(draw.group, (appearances.get(draw.group) ?? 0) + 1);
    creatures.set(draw.group, (creatures.get(draw.group) ?? 0) + count);
    threat.set(draw.group, (threat.get(draw.group) ?? 0) + worth);
  }

  const excluded = groups.filter((group) => !appearances.has(group.id)).map((group) => group.id);

  const outcomes: EncounterOutcome[] = groups.map((group) => {
    const seen = appearances.get(group.id) ?? 0;
    const total = creatures.get(group.id) ?? 0;
    return {
      id: group.id,
      label: group.name ?? group.id,
      appearances: seen,
      frequency: seen / trials,
      total,
      averageWhenPresent: seen > 0 ? total / seen : 0,
      averageCreatures: seen > 0 ? total / seen : 0,
      averageThreat: seen > 0 ? Math.round((threat.get(group.id) ?? 0) / seen) : 0,
      gatedOut: seen === 0,
    };
  });

  outcomes.sort((a, b) => b.frequency - a.frequency || a.label.localeCompare(b.label));
  return { trials, outcomes, emptyTrials, excluded };
}

/** One tile of a perception preview. */
export interface PerceptionCell {
  readonly x: number;
  readonly y: number;
  readonly terrain: string;
  /** Signal strength reaching a creature standing here, per sense id. */
  readonly signals: Readonly<Record<string, number>>;
}

export interface PerceptionPreview {
  readonly width: number;
  readonly height: number;
  readonly source: { readonly x: number; readonly y: number };
  readonly senses: readonly {
    readonly id: string;
    readonly name: string;
    readonly range: number;
    readonly detect: number;
    readonly investigate: number;
    readonly aggro: number;
  }[];
  readonly cells: readonly PerceptionCell[];
}

/** How far each sense reaches across a sketch of a map. */
export function simulatePerception(
  module: CompiledModule,
  options: {
    readonly layout: readonly (readonly string[])[];
    readonly source: Position;
    readonly statblock?: string;
    readonly stance?: string;
  },
): PerceptionPreview {
  const height = Math.max(1, options.layout.length);
  const width = Math.max(1, ...options.layout.map((row) => row.length));

  const fallback = options.layout[0]?.[0] ?? module.ids('world.terrains')[0] ?? 'floor';
  const builder = new MapBuilder(width, height, fallback);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const terrain = options.layout[y]?.[x];
      if (terrain) builder.set(x, y, terrain);
    }
  }
  const tiles = builder.freeze();

  // A game state holding nothing but this sketch.
  const base = newGame(module, { seed: 1, party: [defaultChoices(module, 'Preview')] });
  const template = base.entities[base.party[0]!]!;

  const source: Entity = options.statblock
    ? { ...spawnMonster(module, 'preview:source', options.statblock), map: 'preview', position: options.source, stance: options.stance ?? null }
    : { ...template, id: 'preview:source', map: 'preview', position: options.source, stance: options.stance ?? null };

  const state: GameState = {
    ...base,
    currentMap: 'preview',
    maps: {
      preview: {
        id: 'preview', tiles, kind: 'room', source: 'preview',
        explored: [], gates: {}, exits: {}, items: {}, marks: {},
      traps: {}, rooms: [], depth: 1,
      },
    },
    entities: { 'preview:source': source },
    party: [],
  };

  const terrain = new TerrainIndex(module);
  const senses = sensesOf(module);
  const cells: PerceptionCell[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Someone standing here: how much of the source reaches them?
      const observer: Entity = { ...template, id: 'preview:observer', map: 'preview', position: { x, y } };
      const context = {
        module,
        state: { ...state, entities: { ...state.entities, 'preview:observer': observer } },
        terrain,
      };

      const signals: Record<string, number> = {};
      for (const sense of senses) {
        signals[sense.id] = signalAt(context, sense, observer, options.source, emissionOf(module, source, sense));
      }

      cells.push({ x, y, terrain: terrainAt(tiles, { x, y }), signals });
    }
  }

  return {
    width,
    height,
    source: options.source,
    cells,
    senses: senses.map((sense) => ({
      id: sense.id,
      name: module.find<{ name: string }>('rules.senses', sense.id)?.name ?? sense.id,
      range: sense.range,
      detect: sense.detect,
      investigate: sense.investigate,
      aggro: sense.aggro,
    })),
  };
}
