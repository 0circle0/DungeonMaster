/** Game state. */

import type { RngState } from '@dm/core';
import type { Value } from '@dm/module';
import type { Position, TileMap } from './grid/tiles.js';

/** Bumped when the shape changes in a way that needs migrating. */
export const SAVE_VERSION = 10;

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

/** A trace a creature left on a tile — a scent, a print, a lingering warmth. */
export interface Mark {
  readonly sense: string;
  readonly by: EntityId;
  /** World minute it was left. */
  readonly at: number;
  /** What the leaver was giving off at the time. */
  readonly strength: number;
}

/** Something a creature noticed and has not yet forgotten. */
export interface Alert {
  readonly sense: string;
  readonly of: EntityId;
  readonly at: Position;
  /** World minute it was perceived. */
  readonly minute: number;
  readonly strength: number;
}

/** A character, monster, or NPC. */
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

  /** Which map this entity stands on, and where. */
  readonly map: string;
  readonly position: Position;
  /** The tile it was placed on: its territory, and where it returns to. */
  readonly anchor: Position | null;
  /** World minute it arrived on the tile it is standing on. */
  readonly since: number;
  /** Movement modes available, e.g. `["walk"]`. */
  readonly movementModes: readonly string[];

  /** What it has noticed and not yet forgotten, strongest first. */
  readonly alerts: readonly Alert[];
  /** Spell slots already spent, indexed by spell level. */
  readonly slotsUsed: readonly number[];
  /** The concentration spell this creature is holding, if any. */
  readonly concentrating: string | null;
  /** How it is moving, and so what it gives off. */
  readonly stance: string | null;

  /** Hostility toward the party, which decides who fights whom. */
  readonly disposition: 'ally' | 'neutral' | 'hostile';

  /** Who this creature walks with, or null to hold position. */
  readonly following: EntityId | null;

  /** Author-defined data carried through from the module's `extra` bag. */
  readonly extra: Readonly<Record<string, Value>>;
}

/** A map the party has been on. */
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
  /** Traps installed on this map, by packed tile key. */
  readonly traps: Readonly<Record<number, {
    readonly trap: string;
    readonly state: 'hidden' | 'found' | 'disarmed' | 'sprung';
  }>>;
  /** The rooms this map was generated from, in generator order. */
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
  /** Items lying on the floor, by packed tile key. */
  readonly items: Readonly<Record<number, readonly ItemStack[]>>;

  /** Traces left on tiles, by packed tile key. */
  readonly marks: Readonly<Record<number, readonly Mark[]>>;
}

/** An encounter in progress. */
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
  /** Abilities on cooldown, and the round they come back. */
  readonly cooldowns: readonly {
    readonly entity: EntityId;
    readonly ability: string;
    readonly until: number;
  }[];
  /** Reactions already spent for the whole encounter, as `<entity>:<reaction>`. */
  readonly usedOnce: readonly string[];
  /** Special turns taken this round, by entity — reset alongside `reactionsUsed`. */
  readonly specialUses: Readonly<Record<EntityId, number>>;
  /** The round in which everyone lost track of everyone, or null while someone can still be perceived. */
  readonly unseenSince: number | null;
}

/** Where the party currently is. */
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

/** A notable act. */
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
  /** Generated maps, keyed by id. */
  readonly maps: Readonly<Record<string, MapInstance>>;
  /** The map the party is standing on. */
  readonly currentMap: string;

  /** Set while an encounter is running. */
  readonly combat: CombatState | null;

  /** Triggers that have fired, and when. */
  readonly firedTriggers: Readonly<Record<string, number>>;

  /** Per-NPC memory of deeds: npc id → deed id → strength and when heard. */
  readonly memory: Readonly<Record<string, Readonly<Record<string, { readonly at: number; readonly strength: number; readonly hops: number }>>>>;

  /** Conversation in progress, if any. */
  readonly dialogue: { readonly npc: EntityId; readonly dialogue: string; readonly node: string; readonly taken: readonly string[] } | null;

  readonly flags: Readonly<Record<string, Value>>;

  /** `narrative.lore` the party has learned, and the world minute it learned it. */
  readonly lore: Readonly<Record<string, number>>;

  /** What the party has to spend. */
  readonly purse: number;
  readonly reputation: Readonly<Record<string, number>>;
  readonly quests: Readonly<Record<string, QuestState>>;
  readonly deeds: readonly Deed[];

  /** Mod-owned state, namespaced by mod id. */
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

/** Put a creature somewhere, and record that place as its anchor. */
export function placeOn(entity: Entity, map: string, at: Position, minute: number): Entity {
  return {
    ...entity,
    map,
    position: at,
    since: minute,
    anchor: entity.kind === 'character' ? null : { x: at.x, y: at.y },
  };
}

/** One step, and the arrival minute that goes with it. */
export function steppedTo(entity: Entity, at: Position, minute: number): Entity {
  return { ...entity, position: at, since: minute };
}

/** Replace one entity, returning a new state. */
export function withEntity(state: GameState, next: Entity): GameState {
  return { ...state, entities: { ...state.entities, [next.id]: next } };
}

/** Which npc definition an entity came from. */
export function npcIdOf(entity: Entity): string {
  const recorded = entity.extra['npc'];
  return typeof recorded === 'string' && recorded ? recorded : entity.id;
}

/** The key an entity's memories are filed under. */
export function memoryKeyOf(entity: Entity): string {
  return entity.kind === 'npc' ? npcIdOf(entity) : entity.id;
}
