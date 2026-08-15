/**
 * Filling a dungeon: encounters, loot, and traps.
 *
 * This is the **authoritative** implementation of drawing from an encounter or
 * loot table. The editor's Balance preview calls these same functions rather
 * than keeping its own copy, because a preview that disagreed with play would
 * be worse than no preview at all.
 *
 * Gating is evaluated before the draw, not after. An entry the party does not
 * qualify for is removed from the table entirely, so the odds shown and the
 * odds experienced are the same odds — rolling and discarding would quietly
 * inflate the chance of everything else.
 */

import { Rng, parseDice, rollDice } from '@dm/core';
import { evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { CompiledModule, Requirement, Scope } from '@dm/module';
import type { Position } from '../grid/tiles.js';
import { TerrainIndex, key as packKey } from '../grid/tiles.js';
import type { GeneratedDungeon, Room } from './dungeon.js';

interface LootEntryDef {
  item: string;
  quantity: string;
  requires?: Requirement;
  requirementScope: 'finder' | 'party' | 'anyMember';
  unique: boolean;
}

interface LootTableDef {
  id: string;
  rolls: string;
  emptyChance: number;
  entries: { weight: number; value: LootEntryDef }[];
  requires?: Requirement;
  bonusRollSkill?: string;
}

interface EncounterGroupDef {
  id: string;
  name?: string;
  weight: number;
  requires?: Requirement;
  entries: { monster: string; count: string; scaleWithLevel: boolean }[];
  hostile: boolean;
}

interface EncounterTableDef {
  id: string;
  chance: number;
  emptyWeight: number;
  minDepth: number;
  maxDepth: number;
  groups: EncounterGroupDef[];
}

interface RoomTemplateDef {
  id: string;
  encounterChance: number;
  trapChance: number;
  lootChance: number;
}

interface BiomeDef {
  encounterTables: string[];
  lootTables: string[];
  traps: string[];
}

/**
 * Who a loot gate is asked about.
 *
 * `requirementScope` has always offered three answers — the one who found it,
 * any member of the party, or all of them — and a single `Scope` could only
 * express the first. A treasure that "the party must be level 3 to find" and
 * one that "someone must be able to read" are different questions.
 */
export interface ScopeSet {
  /** The finder: the killer, the searcher, the one who opened the chest. */
  readonly finder: Scope;
  /** Everyone whose development might satisfy the gate, finder included. */
  readonly members: readonly Scope[];
}

/** One scope standing for the whole party — what a single-character caller has. */
export function singleScope(scope: Scope): ScopeSet {
  return { finder: scope, members: [scope] };
}

/** Evaluate a gate, treating an unevaluable one as closed. */
function passesFor(requirement: Requirement | undefined, scope: Scope, rng: Rng): boolean {
  if (isEmptyRequirement(requirement)) return true;
  try {
    return evalPredicate(compileRequirement(requirement), { scope, rng });
  } catch {
    return false;
  }
}

/** Evaluate a gate against whichever of the party it is asking about. */
function passes(
  requirement: Requirement | undefined,
  scopes: ScopeSet,
  rng: Rng,
  who: 'finder' | 'party' | 'anyMember' = 'anyMember',
): boolean {
  if (isEmptyRequirement(requirement)) return true;
  if (who === 'finder') return passesFor(requirement, scopes.finder, rng);

  const members = scopes.members.length > 0 ? scopes.members : [scopes.finder];
  return who === 'party'
    ? members.every((scope) => passesFor(requirement, scope, rng))
    : members.some((scope) => passesFor(requirement, scope, rng));
}

function rollCount(notation: string | undefined, rng: Rng, fallback = 1): number {
  if (!notation) return fallback;
  try {
    return rollDice(parseDice(notation), rng).total;
  } catch {
    return fallback;
  }
}

export interface LootDraw {
  readonly item: string;
  readonly quantity: number;
  /** Drops once across a save; the caller records that it has. */
  readonly unique: boolean;
}

export interface LootOptions {
  /**
   * Extra draws earned by a scavenging skill.
   *
   * Computed by the caller rather than here, because the roll needs a character
   * and this function deliberately knows only scopes — and because the editor's
   * preview wants to show the odds with and without it.
   */
  readonly bonusRolls?: number;
}

/**
 * Draw from a loot table.
 *
 * Shared with the editor preview, which simply calls this many times. Gating is
 * evaluated before the draw so the odds shown and the odds experienced are the
 * same odds — which is also why a `unique` item already taken is removed from
 * the table rather than rolled and discarded.
 */
export function rollLoot(
  module: CompiledModule,
  tableId: string,
  scopes: ScopeSet,
  rng: Rng,
  options: LootOptions = {},
): LootDraw[] {
  const table = module.find<LootTableDef>('content.lootTables', tableId);
  if (!table) return [];
  if (!passes(table.requires, scopes, rng)) return [];

  // `flags` is where the engine records what has already dropped; the finder's
  // scope carries it, and the editor's preview simply has none set.
  const taken = (scopes.finder['flags'] ?? {}) as Record<string, unknown>;

  const eligible = table.entries.filter((entry) => {
    if (entry.value.unique && taken[`unique:${entry.value.item}`]) return false;
    return passes(entry.value.requires, scopes, rng, entry.value.requirementScope);
  });
  if (eligible.length === 0) return [];

  const totalWeight = eligible.reduce((sum, entry) => sum + (entry.weight ?? 1), 0);
  if (totalWeight <= 0) return [];

  const draws = rollCount(table.rolls, rng, 1) + Math.max(0, options.bonusRolls ?? 0);
  const out = new Map<string, number>();
  const unique = new Set<string>();

  for (let draw = 0; draw < draws; draw += 1) {
    if (table.emptyChance > 0 && rng.chance(table.emptyChance)) continue;

    let roll = rng.nextFloat() * totalWeight;
    for (const entry of eligible) {
      roll -= entry.weight ?? 1;
      if (roll > 0) continue;
      // A unique drawn twice in one roll is still one item.
      if (entry.value.unique && unique.has(entry.value.item)) break;
      const quantity = rollCount(entry.value.quantity, rng, 1);
      out.set(entry.value.item, (out.get(entry.value.item) ?? 0) + quantity);
      if (entry.value.unique) unique.add(entry.value.item);
      break;
    }
  }

  return [...out].map(([item, quantity]) => ({
    item,
    quantity: unique.has(item) ? 1 : quantity,
    unique: unique.has(item),
  }));
}

export interface EncounterDraw {
  readonly group: string;
  readonly hostile: boolean;
  readonly monsters: readonly { monster: string; count: number }[];
}

/** Draw an encounter, or nothing. Shared with the editor preview. */
export function rollEncounter(
  module: CompiledModule,
  tableId: string,
  scope: Scope,
  rng: Rng,
  depth = 0,
): EncounterDraw | null {
  const table = module.find<EncounterTableDef>('world.encounterTables', tableId);
  if (!table) return null;
  if (depth < table.minDepth || depth > table.maxDepth) return null;
  if (table.chance < 1 && !rng.chance(table.chance)) return null;

  const eligible = table.groups.filter((group) => passesFor(group.requires, scope, rng));
  const totalWeight =
    eligible.reduce((sum, group) => sum + (group.weight ?? 1), 0) + (table.emptyWeight ?? 0);
  if (totalWeight <= 0) return null;

  let roll = rng.nextFloat() * totalWeight;
  for (const group of eligible) {
    roll -= group.weight ?? 1;
    if (roll > 0) continue;

    // A group that scales gains one creature per full two levels above the
    // first, which keeps a table relevant without becoming a second table.
    const level = Number((scope['actor'] as { level?: unknown } | undefined)?.level ?? 1);
    const bonus = Math.max(0, Math.floor((level - 1) / 2));

    return {
      group: group.id,
      hostile: group.hostile !== false,
      monsters: group.entries.map((entry) => ({
        monster: entry.monster,
        count: Math.max(1, rollCount(entry.count, rng, 1) + (entry.scaleWithLevel ? bonus : 0)),
      })),
    };
  }

  // The remaining weight is the empty result.
  return null;
}

export interface PlacedMonster {
  readonly monster: string;
  readonly at: Position;
  readonly hostile: boolean;
  readonly room: string;
}

export interface PlacedLoot {
  readonly item: string;
  readonly quantity: number;
  readonly at: Position;
  readonly room: string;
}

export interface PlacedTrap {
  readonly trap: string;
  readonly at: Position;
  readonly room: string;
}

export interface Population {
  readonly monsters: readonly PlacedMonster[];
  readonly loot: readonly PlacedLoot[];
  readonly traps: readonly PlacedTrap[];
}

/** Open tiles inside a room, excluding the ones already taken. */
function freeTilesIn(
  room: Room,
  dungeon: GeneratedDungeon,
  terrain: TerrainIndex,
  taken: ReadonlySet<number>,
): Position[] {
  const out: Position[] = [];
  for (let y = room.y + 1; y < room.y + room.height - 1; y += 1) {
    for (let x = room.x + 1; x < room.x + room.width - 1; x += 1) {
      const at = { x, y };
      if (taken.has(packKey(at))) continue;
      if (!terrain.isPassable(dungeon.tiles, at)) continue;
      out.push(at);
    }
  }
  return out;
}

export interface PopulateOptions {
  readonly module: CompiledModule;
  readonly dungeon: GeneratedDungeon;
  readonly terrain: TerrainIndex;
  /** Party state, for evaluating gates on tables and on loot entries. */
  readonly scopes: ScopeSet;
  readonly depth?: number;
  /**
   * Tiles rolled placement must avoid, packed — the cells an embedded static
   * room's author already filled. Rolled loot never lands on authored loot.
   */
  readonly occupied?: readonly number[];
  readonly rng: Rng;
}

/**
 * Fill a generated dungeon.
 *
 * The entrance room is deliberately left empty of monsters: arriving inside an
 * ambush with no chance to react reads as unfair rather than dangerous.
 */
export function populateDungeon(options: PopulateOptions): Population {
  const { module, dungeon, terrain, scopes, rng } = options;
  const depth = options.depth ?? 0;

  const biomeId = module.find<{ biome: string }>('world.dungeons', dungeon.id)?.biome;
  const biome = biomeId ? module.find<BiomeDef>('world.biomes', biomeId) : undefined;

  const monsters: PlacedMonster[] = [];
  const loot: PlacedLoot[] = [];
  const traps: PlacedTrap[] = [];
  const taken = new Set<number>([packKey(dungeon.entrance), ...(options.occupied ?? [])]);

  // Keys the generator promised are placed first, so a locked door always has
  // its key somewhere findable.
  for (const placement of dungeon.keyPlacements) {
    const room = dungeon.rooms.find((entry) => entry.id === placement.room);
    if (!room) continue;
    const free = freeTilesIn(room, dungeon, terrain, taken);
    if (free.length === 0) continue;
    const at = rng.derive(`key:${placement.item}:${room.id}`).pick(free);
    taken.add(packKey(at));
    loot.push({ item: placement.item, quantity: 1, at, room: room.id });
  }

  for (const room of dungeon.rooms) {
    const template = module.find<RoomTemplateDef>('world.roomTemplates', room.template);
    const roomRng = rng.derive(`room:${room.id}`);
    const isEntrance = room.id === dungeon.entranceRoom;

    // — encounters ————————————————————————————————————————
    const tables = biome?.encounterTables ?? [];
    const bossTable = module.find<{ bossTable?: string }>('world.dungeons', dungeon.id)?.bossTable;
    const chosenTable =
      room.role === 'boss' && bossTable
        ? bossTable
        : tables.length > 0
          ? roomRng.pick(tables)
          : null;

    const wantsEncounter =
      room.role === 'boss' || (!isEntrance && roomRng.chance(template?.encounterChance ?? 0.3));

    if (chosenTable && wantsEncounter) {
      const draw = rollEncounter(module, chosenTable, scopes.finder, roomRng.derive('encounter'), depth);
      if (draw) {
        for (const entry of draw.monsters) {
          for (let i = 0; i < entry.count; i += 1) {
            const free = freeTilesIn(room, dungeon, terrain, taken);
            if (free.length === 0) break;
            const at = roomRng.derive(`spawn:${entry.monster}:${i}`).pick(free);
            taken.add(packKey(at));
            monsters.push({ monster: entry.monster, at, hostile: draw.hostile, room: room.id });
          }
        }
      }
    }

    // — loot ——————————————————————————————————————————————
    const lootTables = biome?.lootTables ?? [];
    if (lootTables.length > 0 && roomRng.chance(template?.lootChance ?? 0.25)) {
      const tableId = roomRng.pick(lootTables);
      for (const draw of rollLoot(module, tableId, scopes, roomRng.derive('loot'))) {
        const free = freeTilesIn(room, dungeon, terrain, taken);
        if (free.length === 0) break;
        const at = roomRng.derive(`loot:${draw.item}`).pick(free);
        taken.add(packKey(at));
        loot.push({ item: draw.item, quantity: draw.quantity, at, room: room.id });
      }
    }

    // — traps ——————————————————————————————————————————————
    const trapIds = biome?.traps ?? [];
    if (!isEntrance && trapIds.length > 0 && roomRng.chance(template?.trapChance ?? 0.1)) {
      const free = freeTilesIn(room, dungeon, terrain, taken);
      if (free.length > 0) {
        const at = roomRng.derive('trap').pick(free);
        taken.add(packKey(at));
        traps.push({ trap: roomRng.pick(trapIds), at, room: room.id });
      }
    }
  }

  return { monsters, loot, traps };
}
