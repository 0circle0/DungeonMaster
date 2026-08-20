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
  /**
   * Every module build this save has been written under, oldest first.
   *
   * Appended, never replaced. The point is to answer "which change broke it"
   * later, and to let a player tell someone else which version of a game a
   * broken save came from — so the earlier entries are the valuable part and
   * are never dropped.
   *
   * Optional so a save written before lineage existed still loads.
   */
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
      /**
       * The envelope as read, so a front end can show lineage and hand it back
       * to `save()` as `previous` — which is what keeps the chain going.
       */
      readonly file: SaveFile;
    }
  | { readonly ok: false; readonly error: string };

export interface SaveOptions {
  /** The file this run was loaded from, if any. Its lineage is carried forward. */
  readonly previous?: SaveFile | null;
  /** Active mods as `<id>-<hash>`. */
  readonly mods?: readonly string[];
}

/**
 * Serialize state.
 *
 * `savedAt` is passed in rather than read from a clock, because the engine has
 * no clock — reading one would make saving impure and break replay.
 */
export function save(state: GameState, savedAt: number, options: SaveOptions = {}): string {
  const previous = options.previous ?? null;
  const carried = previous?.lineage ?? [];
  const last = carried[carried.length - 1];

  // Append only when the module actually changed. Saving twice against the
  // same build should not grow the chain — a lineage full of duplicates says
  // nothing about which change broke anything.
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

  /**
   * 7 → 8: mods.
   *
   * A save written before mods existed carries no mod state, which is exactly
   * what an empty bag describes — so it loads as the game it was saved from.
   * `lineage` and `mods` live on the envelope rather than in state and need no
   * migration at all: an older file simply has neither, and both are optional.
   */
  7: (state) => ({ ...state, saveVersion: 8, modState: state['modState'] ?? {} }),

  /**
   * 8 → 9: lore.
   *
   * The party gained a record of what it has found out. Knowing nothing is the
   * state every save before this one was in, so an empty bag is not a default
   * standing in for lost information — it is the information.
   */
  8: (state) => ({ ...state, saveVersion: 9, lore: state['lore'] ?? {} }),

  /**
   * 9 → 10: territory, and a fight that survives a corner.
   *
   * Creatures gained the tile they keep to, and an encounter gained a count of
   * how long nobody has been able to find anybody.
   *
   * A creature adopts where it is standing rather than getting a null anchor.
   * Null would be defensible — the save genuinely does not record where it
   * started — but it would leave every creature in an old save permanently
   * unable to wander, which is a worse lie than "it lives here now". The party
   * keeps a null anchor because the party has no territory.
   */
  9: (state) => {
    const entities = { ...(state['entities'] as Record<string, Record<string, unknown>>) };
    const party = new Set((state['party'] as string[] | undefined) ?? []);

    for (const [id, entity] of Object.entries(entities)) {
      const held = entity['anchor'];
      const position = entity['position'];
      entities[id] = {
        ...entity,
        anchor: held ?? (party.has(id) || entity['kind'] === 'character' ? null : position ?? null),
        // As if it had been standing there since the save was written, which is
        // the only honest reading: an older save records no arrival time, and
        // pretending the scent is already everywhere would be worse.
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

  // Mod drift is reported, never refused.
  //
  // The engine cannot tell whether a different mod set matters: it does not
  // know what any mod changed. Blocking would make every mod toggle a
  // save-breaking decision, which is not a trade a player should be forced
  // into. Naming what differs lets them judge it — and the lineage is there
  // afterwards if something did go wrong.
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
