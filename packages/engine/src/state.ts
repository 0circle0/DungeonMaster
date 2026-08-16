/**
 * Game state.
 *
 * Everything here is plain, serializable data — no class instances, no
 * functions, no `Date`. A save file *is* this object, RNG state included, so
 * `seed + action log` reproduces a run exactly.
 *
 * The guiding rule is **store base facts, compute the rest**. Attributes and
 * current resource values are stored because nothing else determines them.
 * Maxima, Guard, and initiative are computed on demand, because they depend on
 * equipment and active conditions and would otherwise go stale the moment a
 * character puts on a helmet.
 */

import type { RngState } from '@dm/core';
import type { Value } from '@dm/module';
import type { Position, TileMap } from './grid/tiles.js';

/** Bumped when the shape changes in a way that needs migrating. */
export const SAVE_VERSION = 8;

export type EntityId = string;

/** An instance of a condition on an entity. */
export interface ActiveCondition {
  readonly condition: string;
  /** Rounds left; null lasts until removed. */
  readonly remaining: number | null;
  readonly magnitude: number | null;
  /** Entity that applied it, for attribution in the log. */
  readonly source: EntityId | null;
}

export interface ItemStack {
  readonly item: string;
  readonly quantity: number;
}

/**
 * A trace a creature left on a tile — a scent, a print, a lingering warmth.
 *
 * Strength is deliberately *not* stored. It is derived from how long ago the
 * mark was left, so nothing has to tick, nothing can drift, and a trail cannot
 * disagree with itself about how cold it is.
 */
export interface Mark {
  readonly sense: string;
  readonly by: EntityId;
  /** World minute it was left. */
  readonly at: number;
  /** What the leaver was giving off at the time. */
  readonly strength: number;
}

/**
 * Something a creature noticed and has not yet forgotten.
 *
 * This is why a creature walks somewhere nothing attacked it from. A list
 * rather than a record keyed by sense: `JSON.stringify` writes string keys in
 * insertion order, and saved state is compared by its serialization.
 */
export interface Alert {
  readonly sense: string;
  readonly of: EntityId;
  readonly at: Position;
  /** World minute it was perceived. */
  readonly minute: number;
  readonly strength: number;
}

/**
 * A character, monster, or NPC. One shape for all three: a monster is an
 * entity built from a statblock, and an NPC is one that can also talk. Keeping
 * them uniform means combat never branches on who is fighting.
 */
export interface Entity {
  readonly id: EntityId;
  readonly name: string;
  readonly kind: 'character' | 'monster' | 'npc';

  readonly level: number;
  readonly xp: number;

  /** Base scores before conditions and gear. */
  readonly attributes: Readonly<Record<string, number>>;
  /** Current values only; maxima are computed. */
  readonly resources: Readonly<Record<string, number>>;
  readonly skills: Readonly<Record<string, number>>;

  readonly conditions: readonly ActiveCondition[];
  readonly inventory: readonly ItemStack[];
  /** Slot id to the item ids occupying it. */
  readonly equipped: Readonly<Record<string, readonly string[]>>;
  readonly abilities: readonly string[];

  /** Content ids this entity was built from, for re-deriving and for prose. */
  readonly ancestry: string | null;
  readonly characterClass: string | null;
  readonly statblock: string | null;
  readonly faction: string | null;

  /** False once the vital resource is depleted. */
  readonly alive: boolean;

  /** Which map this entity stands on, and where. The grid is always on. */
  readonly map: string;
  readonly position: Position;
  /** Movement modes available, e.g. `["walk"]`. Drawn from ancestry and gear. */
  readonly movementModes: readonly string[];

  /** What it has noticed and not yet forgotten, strongest first. */
  readonly alerts: readonly Alert[];
  /**
   * Spell slots already spent, indexed by spell level.
   *
   * An array indexed by level rather than a record keyed by one: index order is
   * a total order by construction, so two saves that spent the same slots
   * compare equal without anything having to sort.
   */
  readonly slotsUsed: readonly number[];
  /** The concentration spell this creature is holding, if any. */
  readonly concentrating: string | null;
  /** How it is moving, and so what it gives off. Null when none is declared. */
  readonly stance: string | null;

  /** Hostility toward the party, which decides who fights whom. */
  readonly disposition: 'ally' | 'neutral' | 'hostile';

  /**
   * Who this creature walks with, or null to hold position.
   *
   * Per-creature rather than one party-wide switch, so leaving a scout behind
   * while the rest close up costs nothing to express.
   */
  readonly following: EntityId | null;

  /** Author-defined data carried through from the module's `extra` bag. */
  readonly extra: Readonly<Record<string, Value>>;
}

/**
 * A map the party has been on, kept in state because it is generated from a
 * seed once and must not be regenerated differently later.
 */
export interface MapInstance {
  readonly id: string;
  readonly tiles: TileMap;
  /** What this map represents, for description and for travel. */
  readonly kind: 'area' | 'room' | 'interior';
  /** The content id this was generated from. */
  readonly source: string;
  /** Tiles the party has ever seen, as packed keys — the fog of war. */
  readonly explored: readonly number[];
  /** Doors and gates by packed tile key. */
  readonly gates: Readonly<Record<number, { readonly gate: string; readonly open: boolean }>>;
  /** Exits to other maps, by packed tile key. */
  readonly exits: Readonly<Record<number, { readonly toMap: string; readonly at: Position }>>;
  /**
   * Traps installed on this map, by packed tile key.
   *
   * Shaped like {@link MapInstance.gates} on purpose: one per tile, keyed the
   * same way, discovered and then dealt with. The generator has always *placed*
   * traps and the arrival code threw them away, so `content.traps` — detect,
   * disarm, onTrigger, onDisarm, reusable — was a whole collection that did
   * nothing.
   */
  readonly traps: Readonly<Record<number, {
    readonly trap: string;
    readonly state: 'hidden' | 'found' | 'disarmed' | 'sprung';
  }>>;
  /**
   * The rooms this map was generated from, in generator order.
   *
   * Kept so walking from one room into another can be noticed — which is what
   * makes a room template's `descriptionKey` and its `triggers` reachable.
   */
  readonly rooms: readonly {
    readonly id: string;
    readonly template: string;
    readonly role: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  /** How deep this map sits, for the tables that gate on depth. */
  readonly depth: number;
  /**
   * Items lying on the floor, by packed tile key.
   *
   * Kept on the map rather than in a global list so a dropped sword is *where*
   * it was dropped, and leaving a dungeon does not tidy it away.
   */
  readonly items: Readonly<Record<number, readonly ItemStack[]>>;

  /**
   * Traces left on tiles, by packed tile key — the trail a creature leaves.
   *
   * Keyed by the packed integer, never by a string: integer-like keys serialize
   * in ascending numeric order whatever order they were written in, which is
   * what lets marks be pruned by rebuilding the record without two equivalent
   * runs producing different bytes.
   */
  readonly marks: Readonly<Record<number, readonly Mark[]>>;
}

/** An encounter in progress. Absent outside combat. */
export interface CombatState {
  readonly round: number;
  /** Initiative order, highest first. */
  readonly order: readonly EntityId[];
  /** Index into `order` whose turn it is. */
  readonly turn: number;
  /** Action budget spent this turn, by action type id. */
  readonly spent: Readonly<Record<string, number>>;
  /** Movement remaining this turn, in tiles. */
  readonly movement: number;
  /** Reactions used this round, by entity. */
  readonly reactionsUsed: Readonly<Record<EntityId, number>>;
  /**
   * Abilities on cooldown, and the round they come back.
   *
   * An array with a total sort rather than a nested record, because this is a
   * collection creatures accumulate — and it lives on the *combat*, not on the
   * entity, because a cooldown is counted in rounds and there are no rounds
   * outside a fight.
   */
  readonly cooldowns: readonly {
    readonly entity: EntityId;
    readonly ability: string;
    readonly until: number;
  }[];
  /** Reactions already spent for the whole encounter, as `<entity>:<reaction>`. */
  readonly usedOnce: readonly string[];
  /** Special turns taken this round, by entity — reset alongside `reactionsUsed`. */
  readonly specialUses: Readonly<Record<EntityId, number>>;
}

/**
 * Where the party currently is.
 *
 * Mirrors the world hierarchy: an area is a place on the map, a point of
 * interest is somewhere within it, and a dungeon is a generated space entered
 * from one.
 */
export type Location =
  | { readonly kind: 'area'; readonly area: string }
  | { readonly kind: 'poi'; readonly area: string; readonly poi: string }
  | { readonly kind: 'dungeon'; readonly dungeon: string; readonly room: string };

export interface QuestState {
  readonly quest: string;
  readonly status: 'available' | 'active' | 'complete' | 'failed';
  readonly completedObjectives: readonly string[];
  /** World minute it was accepted, for journal ordering. */
  readonly startedAt: number | null;
}

/**
 * A notable act. The social simulation is built on these: a deed is known only
 * to its witnesses, then spreads by rumour, so killing someone with no
 * survivors genuinely goes unnoticed.
 */
export interface Deed {
  readonly id: string;
  readonly kind: string;
  readonly actor: EntityId;
  readonly subject: string | null;
  readonly at: number;
  readonly location: string;
  readonly witnesses: readonly string[];
  readonly severity: number;
}

export interface GameState {
  readonly saveVersion: number;

  /** Identity of the module this save was made against; a mismatch is refused. */
  readonly module: {
    readonly id: string;
    readonly version: string;
    readonly hash: string;
  };

  readonly seed: number;
  readonly rng: RngState;
  readonly nextEntityId: number;

  /** Absolute world-clock minutes since the campaign began. */
  readonly minute: number;

  readonly party: readonly EntityId[];
  readonly entities: Readonly<Record<EntityId, Entity>>;
  /** Which party member the player is currently controlling. */
  readonly selected: EntityId;

  readonly location: Location;
  /** Generated maps, keyed by id. Kept so a place stays the same on return. */
  readonly maps: Readonly<Record<string, MapInstance>>;
  /** The map the party is standing on. */
  readonly currentMap: string;

  /** Set while an encounter is running. */
  readonly combat: CombatState | null;

  /**
   * Triggers that have fired, and when. This is what `remember` means: a
   * ransacked shrine stays ransacked because the trigger is recorded here.
   */
  readonly firedTriggers: Readonly<Record<string, number>>;

  /** Per-NPC memory of deeds: npc id → deed id → strength and when heard. */
  readonly memory: Readonly<Record<string, Readonly<Record<string, { readonly at: number; readonly strength: number; readonly hops: number }>>>>;

  /** Conversation in progress, if any. */
  readonly dialogue: { readonly npc: EntityId; readonly dialogue: string; readonly node: string; readonly taken: readonly string[] } | null;

  readonly flags: Readonly<Record<string, Value>>;
  /**
   * What the party has to spend.
   *
   * Party-wide rather than per character, because a D&D party shares a purse
   * and per-character coin is a bookkeeping tax nobody enjoys. A scalar rather
   * than an item, because `item.value` and `start.creation.startingCurrency`
   * are both numbers — an item-based purse would need a "which item is money"
   * field, and would let a player drop three hundred coins on the floor.
   */
  readonly purse: number;
  readonly reputation: Readonly<Record<string, number>>;
  readonly quests: Readonly<Record<string, QuestState>>;
  readonly deeds: readonly Deed[];

  /**
   * Mod-owned state, namespaced by mod id.
   *
   * A separate bag rather than `flags`: a mod writing into `flags` would
   * collide with the module's own namespace and with the `setFlag` op, and
   * `load` could not then tell an author that a save carries state for a mod
   * they do not have installed.
   *
   * A record rather than an array, despite the "collections are arrays" rule
   * above: those exist because `JSON.stringify` writes keys in insertion order,
   * whereas `statesEqual` compares through `canonical()`, which sorts keys at
   * every level. Two runs that write the same mod keys in different orders
   * therefore still compare equal. Mods only ever write under their own id,
   * enforced host-side, so the outer keys are a small fixed set.
   */
  readonly modState: Readonly<Record<string, Readonly<Record<string, Value>>>>;

  /** Set when the run has ended. */
  readonly outcome: 'playing' | 'victory' | 'defeat';
}

/** Read an entity, throwing if the id is unknown. */
export function entity(state: GameState, id: EntityId): Entity {
  const found = state.entities[id];
  if (!found) throw new Error(`no entity ${JSON.stringify(id)}`);
  return found;
}

/** The party's living members, in roster order. */
export function livingParty(state: GameState): readonly Entity[] {
  return state.party.map((id) => entity(state, id)).filter((e) => e.alive);
}

/** Replace one entity, returning a new state. */
export function withEntity(state: GameState, next: Entity): GameState {
  return { ...state, entities: { ...state.entities, [next.id]: next } };
}

/**
 * Which npc definition an entity came from.
 *
 * Prefers the recorded content id over the entity id, and never the statblock —
 * looking a person up by the monster they fight like finds nothing.
 *
 * This and `memoryKeyOf` live here, on the leaf that owns `Entity`, rather than
 * in `character.ts` and `sim/gossip.ts` where they grew up: `stats.ts` needs
 * them to build the memory scope, and `character.ts` imports `stats.ts`. Both
 * are still re-exported from their old homes.
 */
export function npcIdOf(entity: Entity): string {
  const recorded = entity.extra['npc'];
  return typeof recorded === 'string' && recorded ? recorded : entity.id;
}

/**
 * The key an entity's memories are filed under.
 *
 * Named NPCs are persistent, so their memories belong to the *character*, not
 * to whichever entity instance happens to represent them. Monsters are
 * transient and keep theirs on the instance.
 */
export function memoryKeyOf(entity: Entity): string {
  return entity.kind === 'npc' ? npcIdOf(entity) : entity.id;
}
