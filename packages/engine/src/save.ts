/** Saving and loading. */

import type { CompiledModule } from '@dm/module';
import { SAVE_VERSION } from './state.js';
import type { GameState } from './state.js';

/** One module build this save has been written under. */
export interface SaveLineageEntry {
  readonly hash: string;
  readonly version: string;
  /** The `savedAt` of the save that first wrote this hash. */
  readonly at: number;
}

export interface SaveFile {
  readonly saveVersion: number;
  readonly savedAt: number;
  /** Every module build this save has been written under, oldest first. */
  readonly lineage?: readonly SaveLineageEntry[];
  /** Mods active when this was written, as `<id>-<hash>`, sorted. */
  readonly mods?: readonly string[];
  readonly state: GameState;
}

export type LoadResult =
  | {
      readonly ok: true;
      readonly state: GameState;
      readonly warnings: readonly string[];
      /** The envelope as read; hand it back to `save()` as `previous` to continue the chain. */
      readonly file: SaveFile;
    }
  | { readonly ok: false; readonly error: string };

export interface SaveOptions {
  /** The file this run was loaded from, if any. */
  readonly previous?: SaveFile | null;
  /** Active mods as `<id>-<hash>`. */
  readonly mods?: readonly string[];
}

/** Serialize state. */
export function save(state: GameState, savedAt: number, options: SaveOptions = {}): string {
  const previous = options.previous ?? null;
  const carried = previous?.lineage ?? [];
  const last = carried[carried.length - 1];

  // Appended only when the module actually changed.
  const lineage: SaveLineageEntry[] =
    last && last.hash === state.module.hash
      ? [...carried]
      : [...carried, { hash: state.module.hash, version: state.module.version, at: savedAt }];

  const file: SaveFile = {
    saveVersion: SAVE_VERSION,
    savedAt,
    lineage,
    mods: options.mods ? [...options.mods].sort() : [],
    state,
  };
  return JSON.stringify(file);
}

/** A migration from one save version to the next. */
type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** Migrations by the version they upgrade from. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /** 1 → 2: perception. */
  1: (state) => {
    const entities = { ...(state['entities'] as Record<string, Record<string, unknown>>) };
    for (const [id, entity] of Object.entries(entities)) {
      entities[id] = { ...entity, alerts: [], stance: null };
    }

    const maps = { ...(state['maps'] as Record<string, Record<string, unknown>>) };
    for (const [id, map] of Object.entries(maps)) {
      maps[id] = { ...map, marks: {} };
    }

    // `load` reads the version off the wrapper, never the copy inside the state.
    return { ...state, saveVersion: 2, entities, maps };
  },

  /** 2 → 3: walking together. */
  2: (state) => {
    const entities = { ...(state['entities'] as Record<string, Record<string, unknown>>) };
    for (const [id, entity] of Object.entries(entities)) {
      entities[id] = { ...entity, following: null };
    }
    return { ...state, saveVersion: 3, entities };
  },

  /** 3 → 4: the dungeon is a dungeon. */
  3: (state) => {
    const maps = { ...(state['maps'] as Record<string, Record<string, unknown>>) };
    for (const [id, map] of Object.entries(maps)) {
      // Filled in, never overwritten.
      maps[id] = {
        ...map,
        traps: map['traps'] ?? {},
        rooms: map['rooms'] ?? [],
        depth: map['depth'] ?? 1,
      };
    }
    return { ...state, saveVersion: 4, maps };
  },

  /** 4 → 5: coin. */
  4: (state) => ({ ...state, saveVersion: 5, purse: state['purse'] ?? 0 }),

  /** 5 → 6: cooldowns, once-per-encounter reactions, and legendary actions. */
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

  /** 6 → 7: casting. */
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

  /** 7 → 8: mods. */
  7: (state) => ({ ...state, saveVersion: 8, modState: state['modState'] ?? {} }),

  /** 8 → 9: lore. */
  8: (state) => ({ ...state, saveVersion: 9, lore: state['lore'] ?? {} }),

  /** 9 → 10: territory, and a fight that survives a corner. */
  9: (state) => {
    const entities = { ...(state['entities'] as Record<string, Record<string, unknown>>) };
    const party = new Set((state['party'] as string[] | undefined) ?? []);

    for (const [id, entity] of Object.entries(entities)) {
      const held = entity['anchor'];
      const position = entity['position'];
      entities[id] = {
        ...entity,
        anchor: held ?? (party.has(id) || entity['kind'] === 'character' ? null : position ?? null),
        // As if it had been standing there since the save was written.
        since: entity['since'] ?? state['minute'] ?? 0,
      };
    }

    const combat = state['combat'] as Record<string, unknown> | null | undefined;
    return {
      ...state,
      saveVersion: 10,
      entities,
      combat: combat ? { ...combat, unseenSince: combat['unseenSince'] ?? null } : combat ?? null,
    };
  },
};

export function load(
  text: string,
  module: CompiledModule,
  options: { allowModuleDrift?: boolean; mods?: readonly string[] } = {},
): LoadResult {
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
    // Content drift can be allowed deliberately, but never silently.
    const message =
      `module "${module.source.id}" has changed since this save was made ` +
      `(save ${recorded.hash.slice(0, 8)}, module ${module.hash.slice(0, 8)})`;
    if (!options.allowModuleDrift) {
      return { ok: false, error: `${message}. Load with allowModuleDrift to continue anyway.` };
    }
    warnings.push(message);
  }

  // Mod drift is reported, never refused.
  const savedMods = file.mods ?? [];
  const activeMods = options.mods ?? [];
  const gone = savedMods.filter((id) => !activeMods.includes(id));
  const added = activeMods.filter((id) => !savedMods.includes(id));
  if (gone.length > 0) {
    warnings.push(`this save was played with ${gone.join(', ')}, which ${gone.length === 1 ? 'is' : 'are'} not active now`);
  }
  if (added.length > 0) {
    warnings.push(`${added.join(', ')} ${added.length === 1 ? 'is' : 'are'} active now but ${added.length === 1 ? 'was' : 'were'} not when this save was made`);
  }

  return { ok: true, state, warnings, file: { ...file, state } };
}

/** Serialize with object keys in a fixed order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, held]) => held !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${entries.map(([key, held]) => `${JSON.stringify(key)}:${canonical(held)}`).join(',')}}`;
}

/** Whether two states are identical. */
export function statesEqual(a: GameState, b: GameState): boolean {
  return canonical(a) === canonical(b);
}
