/**
 * Saving and loading.
 *
 * A save is the `GameState` object and nothing else — no side tables, no
 * derived caches, no engine version of the world held anywhere but here. That
 * is why maxima, Guard, and initiative are computed rather than stored: a
 * cached number would be a second source of truth that a save could disagree
 * with.
 *
 * Two guards matter:
 *
 *   - **Module identity.** A save records the module id, version, and content
 *     hash it was made against. Loading it into an edited module is refused
 *     rather than silently producing a character whose class no longer exists.
 *   - **Schema version.** Migrations run in order, so an old save is brought
 *     forward step by step rather than needing a migration per version pair.
 */

import type { CompiledModule } from '@dm/module';
import { SAVE_VERSION } from './state.js';
import type { GameState } from './state.js';

export interface SaveFile {
  readonly saveVersion: number;
  readonly savedAt: number;
  readonly state: GameState;
}

export type LoadResult =
  | { readonly ok: true; readonly state: GameState; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string };

/**
 * Serialize state.
 *
 * `savedAt` is passed in rather than read from a clock, because the engine has
 * no clock — reading one would make saving impure and break replay.
 */
export function save(state: GameState, savedAt: number): string {
  const file: SaveFile = { saveVersion: SAVE_VERSION, savedAt, state };
  return JSON.stringify(file);
}

/** A migration from one save version to the next. */
type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations by the version they upgrade *from*.
 *
 * Each moves a save forward exactly one version. Adding a field with a sensible
 * default belongs here; anything that cannot be defaulted means the save should
 * be refused rather than guessed at.
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * 1 → 2: perception.
   *
   * Creatures gained what they have noticed and how they are moving; maps
   * gained the traces left on them. All three default cleanly, so an old save
   * loads as a world where nobody has noticed anything yet.
   */
  1: (state) => {
    const entities = { ...(state['entities'] as Record<string, Record<string, unknown>>) };
    for (const [id, entity] of Object.entries(entities)) {
      entities[id] = { ...entity, alerts: [], stance: null };
    }

    const maps = { ...(state['maps'] as Record<string, Record<string, unknown>>) };
    for (const [id, map] of Object.entries(maps)) {
      maps[id] = { ...map, marks: {} };
    }

    // `load` only reads the version off the file wrapper and never touches the
    // copy inside the state, so a migration has to move it itself — otherwise a
    // migrated save is forever unequal to an identical fresh one.
    return { ...state, saveVersion: 2, entities, maps };
  },

  /**
   * 2 → 3: walking together.
   *
   * Creatures gained who they are following. Null is exactly the old behaviour
   * — everybody stands where they were left until told otherwise — so an old
   * save loads as the game it was saved from.
   */
  2: (state) => {
    const entities = { ...(state['entities'] as Record<string, Record<string, unknown>>) };
    for (const [id, entity] of Object.entries(entities)) {
      entities[id] = { ...entity, following: null };
    }
    return { ...state, saveVersion: 3, entities };
  },

  /**
   * 3 → 4: the dungeon is a dungeon.
   *
   * Maps gained their traps, the rooms they were generated from, and how deep
   * they sit. All three default to exactly the old behaviour — no traps
   * installed, no rooms known, everything at depth 1 — so an old save loads as
   * the game it was saved from rather than as a newly dangerous one.
   */
  3: (state) => {
    const maps = { ...(state['maps'] as Record<string, Record<string, unknown>>) };
    for (const [id, map] of Object.entries(maps)) {
      // Filled in, never overwritten: a migration that clobbers a field which
      // is already present can only destroy a save.
      maps[id] = {
        ...map,
        traps: map['traps'] ?? {},
        rooms: map['rooms'] ?? [],
        depth: map['depth'] ?? 1,
      };
    }
    return { ...state, saveVersion: 4, maps };
  },

  /**
   * 4 → 5: coin.
   *
   * An empty purse is what a save written before money existed describes, so
   * an old party loads exactly as poor as it was.
   */
  4: (state) => ({ ...state, saveVersion: 5, purse: state['purse'] ?? 0 }),

  /**
   * 5 → 6: cooldowns, once-per-encounter reactions, and legendary actions.
   *
   * All three live on the combat, which is null in most saves. Empty is exactly
   * the old behaviour — nothing on cooldown, nothing spent — so a fight saved
   * mid-round resumes as the fight it was.
   */
  5: (state) => {
    const combat = state['combat'] as Record<string, unknown> | null;
    if (!combat) return { ...state, saveVersion: 6 };
    return {
      ...state,
      saveVersion: 6,
      combat: {
        ...combat,
        cooldowns: combat['cooldowns'] ?? [],
        usedOnce: combat['usedOnce'] ?? [],
        specialUses: combat['specialUses'] ?? {},
      },
    };
  },

  /**
   * 6 → 7: casting.
   *
   * Creatures gained the slots they have spent and what they are concentrating
   * on. Nothing spent and nothing held is exactly the old behaviour, so a saved
   * caster loads with a full complement.
   */
  6: (state) => {
    const entities = { ...(state['entities'] as Record<string, Record<string, unknown>>) };
    for (const [id, entity] of Object.entries(entities)) {
      entities[id] = {
        ...entity,
        slotsUsed: entity['slotsUsed'] ?? [],
        concentrating: entity['concentrating'] ?? null,
      };
    }
    return { ...state, saveVersion: 7, entities };
  },
};

export function load(text: string, module: CompiledModule, options: { allowModuleDrift?: boolean } = {}): LoadResult {
  let file: SaveFile;
  try {
    file = JSON.parse(text) as SaveFile;
  } catch (error) {
    return { ok: false, error: `save file is not valid JSON: ${(error as Error).message}` };
  }

  if (typeof file?.saveVersion !== 'number' || typeof file.state !== 'object' || file.state === null) {
    return { ok: false, error: 'save file is missing its version or state' };
  }

  if (file.saveVersion > SAVE_VERSION) {
    return {
      ok: false,
      error: `save was written by a newer engine (save version ${file.saveVersion}, this engine reads ${SAVE_VERSION})`,
    };
  }

  let raw = file.state as unknown as Record<string, unknown>;
  const warnings: string[] = [];

  for (let version = file.saveVersion; version < SAVE_VERSION; version += 1) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      return { ok: false, error: `no migration from save version ${version} to ${version + 1}` };
    }
    raw = migration(raw);
    warnings.push(`migrated save from version ${version} to ${version + 1}`);
  }

  const state = raw as unknown as GameState;

  const recorded = state.module;
  if (!recorded || recorded.id !== module.source.id) {
    return {
      ok: false,
      error: `save belongs to module "${recorded?.id ?? 'unknown'}", not "${module.source.id}"`,
    };
  }

  if (recorded.hash !== module.hash) {
    // Content drift is usually an edited module rather than a corrupt save, so
    // it can be allowed deliberately — but never silently.
    const message =
      `module "${module.source.id}" has changed since this save was made ` +
      `(save ${recorded.hash.slice(0, 8)}, module ${module.hash.slice(0, 8)})`;
    if (!options.allowModuleDrift) {
      return { ok: false, error: `${message}. Load with allowModuleDrift to continue anyway.` };
    }
    warnings.push(message);
  }

  return { ok: true, state, warnings };
}

/**
 * Serialize with object keys in a fixed order.
 *
 * Array order is preserved — that is real information — but the order two
 * pieces of code happened to *write* the fields of an object is not. A state
 * rebuilt by a save migration lists its fields in a different order than one
 * built fresh, and without this they would compare unequal while being the same
 * game in every respect that matters.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, held]) => held !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${entries.map(([key, held]) => `${JSON.stringify(key)}:${canonical(held)}`).join(',')}}`;
}

/**
 * Whether two states are identical.
 *
 * The determinism tests rest on this: same seed and same actions must produce
 * the same state. Comparing serialized forms catches a difference anywhere,
 * including RNG position, which a field-by-field check would miss.
 */
export function statesEqual(a: GameState, b: GameState): boolean {
  return canonical(a) === canonical(b);
}
