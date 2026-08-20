/**
 * Arriving somewhere.
 *
 * Generating a place and putting the party on it. Maps are generated once and
 * kept in state, so walking back out of a dungeon and returning finds the same
 * dungeon — regenerating it from the seed on every visit would be cheaper in
 * memory and completely wrong.
 */

import { Rng, parseDice, rollDice } from '@dm/core';
import { evalEffects, evalExpr } from '@dm/module';
import type { Effect, Expr, Scope } from '@dm/module';
import type { Entity, ItemStack, MapInstance } from '../state.js';
import { placeOn } from '../state.js';
import { Transaction, applyOps } from '../rules/apply.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { TerrainIndex, key as packKey, unkey } from '../grid/tiles.js';
import type { Position } from '../grid/tiles.js';
import { generateDungeon, gatesOf } from '../world/dungeon.js';
import { buildMap } from '../world/mapgen.js';
import type { MapSpec } from '../world/mapgen.js';
import { buildStaticMap } from '../world/staticmap.js';
import type { BuiltStaticMap, StaticSpawn } from '../world/staticmap.js';
import { populateDungeon, rollEncounter, rollLoot } from '../world/populate.js';
import type { ScopeSet } from '../world/populate.js';
import { spawnMonster, spawnNpc } from '../character.js';
import { runTriggers, triggersFor } from './triggers.js';
import { phaseOf, layerOf } from './clock.js';
import { message } from '../narrate/systemText.js';

/** How deep a dungeon runs, from its declared dice. */
function rollDepth(notation: string | undefined, rng: Rng): number {
  if (!notation) return 1;
  try {
    return Math.max(1, rollDice(parseDice(notation), rng).total);
  } catch {
    return 1;
  }
}

/** A free tile near a preferred spot, for placing an entity or its leavings. */
export function freeNear(
  txn: Transaction,
  terrain: TerrainIndex,
  mapId: string,
  preferred: Position,
): Position {
  const map = txn.state.maps[mapId];
  if (!map) return preferred;

  const taken = new Set<number>();
  for (const entity of Object.values(txn.state.entities)) {
    if (entity.alive && entity.map === mapId) taken.add(packKey(entity.position));
  }

  if (terrain.isPassable(map.tiles, preferred) && !taken.has(packKey(preferred))) return preferred;

  // Spiral outward until something is free.
  for (let radius = 1; radius < 12; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const at = { x: preferred.x + dx, y: preferred.y + dy };
        if (!terrain.isPassable(map.tiles, at)) continue;
        if (taken.has(packKey(at))) continue;
        return at;
      }
    }
  }
  return preferred;
}

/** Move the whole party onto a map, clustered around the arrival point. */
export function placeParty(
  txn: Transaction,
  terrain: TerrainIndex,
  mapId: string,
  at: Position,
): void {
  for (const id of txn.state.party) {
    const member = txn.entity(id);
    if (!member) continue;
    const spot = freeNear(txn, terrain, mapId, at);
    txn.putEntity(placeOn(member, mapId, spot, txn.state.minute));
    txn.emit({ type: 'enteredMap', entity: id, map: mapId, at: spot });
  }
  txn.set({ ...txn.state, currentMap: mapId });
}

function scopeOf(txn: Transaction): Scope {
  const leader = txn.entity(txn.state.selected);
  return leader ? buildScope(txn.module, txn.state, leader) : ({});
}

/**
 * Remember the way out, on first entry only.
 *
 * `MapInstance.exits` existed from the start and was written by nothing, which
 * left two holes at once: re-entering a dungeon dropped the party at `{1,1}`
 * (frequently inside the wall ring), and there was no way to leave one at all.
 * The record is written *before* `placeParty` flips `currentMap`, because the
 * whole point is where the party came **from**.
 */
function recordExit(txn: Transaction, mapId: string, arrival: Position): void {
  const from = txn.state.currentMap;
  const map = txn.state.maps[mapId];
  if (!map || !from || from === mapId || !txn.state.maps[from]) return;
  if (Object.keys(map.exits).length > 0) return;

  const leader = txn.entity(txn.state.selected);
  txn.set({
    ...txn.state,
    maps: {
      ...txn.state.maps,
      [mapId]: {
        ...map,
        exits: {
          [packKey(arrival)]: { toMap: from, at: leader?.position ?? { x: 1, y: 1 } },
        },
      },
    },
  });
}

/** Where a returning party re-enters: the exit tile, known since first entry. */
function exitTileOf(map: { exits: Readonly<Record<number, unknown>> }): Position | null {
  const keys = Object.keys(map.exits).map(Number);
  if (keys.length === 0) return null;
  return unkey(Math.min(...keys));
}

/**
 * Put a static map's authored creatures on it, at map creation.
 *
 * NPCs are keyed by their own id — the same once-semantics as
 * {@link spawnResidents}, so the shopkeeper painted into the shop is the same
 * person on every visit and stays dead if killed. Monsters get fresh ids in
 * cell order, which is a total order because the layers are.
 */
function spawnStaticContent(
  txn: Transaction,
  terrain: TerrainIndex,
  mapId: string,
  spawns: readonly StaticSpawn[],
): void {
  let nextId = txn.state.nextEntityId;

  for (const spawn of spawns) {
    if (spawn.kind === 'npc') {
      if (txn.state.entities[spawn.id]) continue;
      let person;
      try {
        person = spawnNpc(txn.module, spawn.id);
      } catch {
        continue;
      }
      txn.putEntity(placeOn(person, mapId, spawn.at, txn.state.minute));
      txn.emit({ type: 'spawned', entity: spawn.id, statblock: person.statblock ?? spawn.id, at: spawn.at });
      continue;
    }

    nextId += 1;
    const id = `e:${nextId}`;
    let monster;
    try {
      monster = spawnMonster(txn.module, id, spawn.id);
    } catch {
      continue;
    }
    txn.putEntity({ ...placeOn(monster, mapId, spawn.at, txn.state.minute), disposition: 'hostile' });
    txn.emit({ type: 'spawned', entity: id, statblock: spawn.id, at: spawn.at });
  }

  if (nextId !== txn.state.nextEntityId) {
    txn.set({ ...txn.state, nextEntityId: nextId });
  }
  void terrain;
}

/** A static map as a fresh `MapInstance`. The authored placements ride along. */
function staticInstance(
  mapId: string,
  source: string,
  kind: MapInstance['kind'],
  built: BuiltStaticMap,
): MapInstance {
  return {
    id: mapId,
    tiles: built.tiles,
    kind,
    source,
    explored: [],
    gates: built.gates,
    exits: {},
    items: built.items,
    marks: {},
    traps: built.traps,
    rooms: [],
    depth: 1,
  };
}

/**
 * The party as a set of scopes, for gates that ask about more than the leader.
 *
 * A loot entry's `requirementScope` distinguishes "the finder can read this"
 * from "somebody in the party can" from "all of you are high enough level", and
 * only the first of those is answerable from the leader alone.
 */
export function partyScopes(txn: Transaction): ScopeSet {
  const finder = scopeOf(txn);
  const members = txn.state.party
    .map((id) => txn.entity(id))
    .filter((member): member is Entity => Boolean(member))
    .map((member) => buildScope(txn.module, txn.state, member));
  return { finder, members: members.length > 0 ? members : [finder] };
}

/**
 * Put a place's residents on the map, once.
 *
 * Keyed by the npc's own id, so coming back to a village finds the same miller
 * with the same memory of you rather than a second copy of her. Somebody who
 * has died stays dead, and somebody who has wandered off is not teleported home.
 */
function spawnResidents(
  txn: Transaction,
  terrain: TerrainIndex,
  residents: readonly string[],
  near: Position | undefined,
): void {
  const mapId = txn.state.currentMap;
  if (!mapId || residents.length === 0) return;

  const anchor = near
    ?? txn.entity(txn.state.selected)?.position
    ?? { x: 1, y: 1 };

  for (const npcId of residents) {
    if (txn.state.entities[npcId]) continue;

    let person;
    try {
      person = spawnNpc(txn.module, npcId);
    } catch {
      // A resident the content does not define is an authoring error the linter
      // reports; it must not stop the party from entering the village.
      continue;
    }

    const at = freeNear(txn, terrain, mapId, anchor);
    txn.putEntity(placeOn(person, mapId, at, txn.state.minute));
    txn.emit({ type: 'spawned', entity: npcId, statblock: person.statblock ?? npcId, at });
  }
}

/** Everyone who belongs at a place, however the module said so. */
function residentsOf(
  txn: Transaction,
  poiId: string,
  declared: readonly string[],
): string[] {
  const out = new Set(declared);
  for (const npc of txn.module.all<{ id: string; home?: string }>('content.npcs')) {
    if (npc.home === poiId) out.add(npc.id);
  }
  // Sorted, so the order two runs spawn people in cannot differ.
  return [...out].sort();
}

/**
 * Put whatever lives in a place onto the map when the party walks in.
 *
 * Rolled per visit rather than once, because that is what a module means by an
 * `encounterChance` on a place you can leave and come back to — and it is how
 * the reference module's "repeats until the mill is actually clear" trigger is
 * meant to work.
 *
 * Nothing spawns while something hostile from the last visit is still standing,
 * so coming back mid-fight does not stack a second pack on top of the first.
 */
function spawnEncounter(
  txn: Transaction,
  terrain: TerrainIndex,
  tables: readonly string[],
  chance: number,
  near: Position | undefined,
  rng: Rng,
): void {
  const mapId = txn.state.currentMap;
  if (!mapId || tables.length === 0 || chance <= 0) return;

  const standing = Object.values(txn.state.entities).some(
    (entity) => entity.alive && entity.map === mapId && entity.disposition === 'hostile',
  );
  if (standing) return;
  if (!rng.chance(chance)) return;

  const draw = rollEncounter(txn.module, rng.pick([...tables]), scopeOf(txn), rng.derive('draw'));
  if (!draw) return;

  const anchor = near ?? txn.entity(txn.state.selected)?.position ?? { x: 1, y: 1 };
  let nextId = txn.state.nextEntityId;

  for (const entry of draw.monsters) {
    for (let n = 0; n < entry.count; n += 1) {
      nextId += 1;
      const id = `e:${nextId}`;

      let monster;
      try {
        monster = spawnMonster(txn.module, id, entry.monster);
      } catch {
        continue;
      }

      const at = freeNear(txn, terrain, mapId, anchor);
      txn.putEntity({
        ...placeOn(monster, mapId, at, txn.state.minute),
        disposition: draw.hostile ? 'hostile' : 'neutral',
      });
      txn.emit({ type: 'spawned', entity: id, statblock: entry.monster, at });
    }
  }

  txn.set({ ...txn.state, nextEntityId: nextId });

  // What the group itself has to say and do. Both were authored and neither was
  // ever reached — greenmarch's `mill_things` declares an `onEncounter` today.
  runEncounterGroup(txn, draw.group, rng.derive('onEncounter'));
}

/**
 * The effects and prose a drawn encounter group declares.
 *
 * Found by scanning the tables rather than being handed down, because the draw
 * reports only the group id — and a group id is unique across the module.
 */
function runEncounterGroup(txn: Transaction, groupId: string, rng: Rng): void {
  interface GroupDef { id: string; onEncounter?: Effect[]; textKey?: string }
  for (const table of txn.module.all<{ groups?: GroupDef[] }>('world.encounterTables')) {
    const group = table.groups?.find((entry) => entry.id === groupId);
    if (!group) continue;

    if (group.textKey) {
      txn.emit({ type: 'narrate', textKey: group.textKey, context: { group: groupId } });
    }
    if (group.onEncounter && group.onEncounter.length > 0) {
      const leader = txn.entity(txn.state.selected);
      if (leader) {
        const scope = buildScope(txn.module, txn.state, leader);
        applyOps(txn, evalEffects(group.onEncounter, { scope, rng, openNamespaces: OPEN_NAMESPACES }), leader.id);
      }
    }
    return;
  }
}

/**
 * Put a place's own loot on its floor, the first time the party arrives.
 *
 * Once, not per visit: a place's treasure is a thing that is there, unlike an
 * encounter, which is a thing that happens.
 */
function spawnPoiLoot(
  txn: Transaction,
  terrain: TerrainIndex,
  poiId: string,
  tables: readonly string[],
  near: Position | undefined,
  rng: Rng,
): void {
  const mapId = txn.state.currentMap;
  if (!mapId || tables.length === 0) return;
  if (txn.state.flags[`looted:${poiId}`] === true) return;

  txn.set({ ...txn.state, flags: { ...txn.state.flags, [`looted:${poiId}`]: true } });

  const scopes = partyScopes(txn);
  const anchor = near ?? txn.entity(txn.state.selected)?.position ?? { x: 1, y: 1 };
  const dropped: ItemStack[] = [];

  for (const tableId of tables) {
    for (const draw of rollLoot(txn.module, tableId, scopes, rng.derive(tableId))) {
      dropped.push({ item: draw.item, quantity: draw.quantity });
      if (draw.unique) {
        txn.set({ ...txn.state, flags: { ...txn.state.flags, [`unique:${draw.item}`]: true } });
      }
    }
  }
  if (dropped.length === 0) return;

  const at = freeNear(txn, terrain, mapId, anchor);
  const tile = packKey(at);
  const map = txn.state.maps[mapId];
  if (!map) return;

  txn.set({
    ...txn.state,
    maps: {
      ...txn.state.maps,
      [mapId]: { ...map, items: { ...map.items, [tile]: [...(map.items[tile] ?? []), ...dropped] } },
    },
  });
}

/**
 * Enter a dungeon, generating it on first visit.
 *
 * The map, its inhabitants, and its loot are all derived from a sub-stream of
 * the run's seed, so the same seed always produces the same dungeon — and
 * fighting in it never changes what the next dungeon looks like.
 */
export function enterDungeon(
  txn: Transaction,
  terrain: TerrainIndex,
  dungeonId: string,
  rng: Rng,
): boolean {
  const mapId = `dungeon:${dungeonId}`;
  const existing = txn.state.maps[mapId];

  if (existing) {
    // Been here before: walk back in at the tile we first arrived on — the
    // exit tile recorded on first entry. (The old code read `exits[0]?.at`,
    // which was wrong twice: nothing ever wrote the record, and `at` is a
    // position on the *other* map.)
    txn.set({ ...txn.state, location: { kind: 'dungeon', dungeon: dungeonId, room: '' } });
    placeParty(txn, terrain, mapId, exitTileOf(existing) ?? { x: 1, y: 1 });
    return true;
  }

  const definition = txn.module.find<{
    id: string;
    depth?: string;
    biome?: string;
    staticMap?: string;
    rollEncounters?: boolean;
  }>('world.dungeons', dungeonId);
  if (!definition) {
    txn.emit({ type: 'refused', action: 'enter', reason: message('refused.enter.unknownDungeon', { dungeon: dungeonId }) });
    return false;
  }

  const dungeonRng = rng.derive(`dungeon:${dungeonId}`);

  // — a hand-built dungeon: the same castle on every seed —————
  if (definition.staticMap) {
    const built = buildStaticMap(txn.module, definition.staticMap);
    const depth = rollDepth(definition.depth, dungeonRng.derive('depth'));
    txn.set({
      ...txn.state,
      maps: {
        ...txn.state.maps,
        [mapId]: { ...staticInstance(mapId, dungeonId, 'room', built), depth },
      },
    });
    spawnStaticContent(txn, terrain, mapId, built.spawns);

    txn.set({ ...txn.state, location: { kind: 'dungeon', dungeon: dungeonId, room: '' } });
    recordExit(txn, mapId, built.entry);
    placeParty(txn, terrain, mapId, built.entry);

    // The author's toggle for rolled life in a fixed place: one draw from the
    // biome's tables per `spawn` marker.
    if (definition.rollEncounters) {
      const biome = txn.module.find<{ encounterTables?: string[] }>(
        'world.biomes', definition.biome ?? '',
      );
      const tables = biome?.encounterTables ?? [];
      const populateRng = dungeonRng.derive('populate');
      for (const [index, anchor] of (built.marks['spawn'] ?? []).entries()) {
        if (tables.length === 0) break;
        const drawRng = populateRng.derive(`spawn:${index}`);
        const draw = rollEncounter(txn.module, drawRng.pick([...tables]), scopeOf(txn), drawRng, depth);
        if (!draw) continue;
        let nextId = txn.state.nextEntityId;
        for (const entry of draw.monsters) {
          for (let n = 0; n < entry.count; n += 1) {
            nextId += 1;
            const id = `e:${nextId}`;
            let monster;
            try {
              monster = spawnMonster(txn.module, id, entry.monster);
            } catch {
              continue;
            }
            const at = freeNear(txn, terrain, mapId, anchor);
            txn.putEntity({
              ...placeOn(monster, mapId, at, txn.state.minute),
              disposition: draw.hostile ? 'hostile' : 'neutral',
            });
            txn.emit({ type: 'spawned', entity: id, statblock: entry.monster, at });
          }
        }
        txn.set({ ...txn.state, nextEntityId: nextId });
      }
    }

    const leader = txn.entity(txn.state.selected);
    if (leader) {
      runTriggers(
        txn,
        triggersFor(txn, [{ collection: 'world.dungeons', id: dungeonId }]),
        'enter',
        { id: dungeonId, kind: 'dungeon' },
        leader,
        rng,
      );
    }
    return true;
  }

  const generated = generateDungeon(txn.module, dungeonId, dungeonRng, scopeOf(txn));

  // How deep this place runs. Rolled once and kept on the map, so a return trip
  // finds the same dungeon — and so the `minDepth`/`maxDepth` every encounter
  // table declares finally bites in play, rather than only in the editor's
  // Balance preview.
  const depth = rollDepth(definition.depth, dungeonRng.derive('depth'));

  const instance: MapInstance = {
    id: mapId,
    tiles: generated.tiles,
    kind: 'room',
    source: dungeonId,
    explored: [],
    // Generated locks plus whatever gates an embedded static room authored.
    gates: { ...gatesOf(generated), ...generated.authored.gates },
    exits: {},
    items: {},
    marks: {},
    traps: {},
    // Kept so walking from one room into another can be noticed, which is what
    // makes a template's `descriptionKey` and its `triggers` reachable at all.
    rooms: generated.rooms.map((room) => ({
      id: room.id, template: room.template, role: room.role,
      x: room.x, y: room.y, width: room.width, height: room.height,
    })),
    depth,
  };
  txn.set({ ...txn.state, maps: { ...txn.state.maps, [mapId]: instance } });

  // The cells an embedded static room's author already filled: rolled
  // placement must not stack on them.
  const authoredTiles = [
    ...Object.keys(generated.authored.items),
    ...Object.keys(generated.authored.traps),
    ...Object.keys(generated.authored.gates),
  ].map(Number);
  for (const spawn of generated.authored.spawns) authoredTiles.push(packKey(spawn.at));

  // — inhabitants and treasure ————————————————————————————
  const population = populateDungeon({
    module: txn.module,
    dungeon: generated,
    terrain,
    scopes: partyScopes(txn),
    depth,
    occupied: authoredTiles,
    rng: dungeonRng.derive('populate'),
  });

  let nextId = txn.state.nextEntityId;
  const entities = { ...txn.state.entities };

  for (const placed of population.monsters) {
    nextId += 1;
    const id = `e:${nextId}`;
    const monster = spawnMonster(txn.module, id, placed.monster);
    entities[id] = {
      ...placeOn(monster, mapId, placed.at, txn.state.minute),
      disposition: placed.hostile ? 'hostile' : 'neutral',
    };
  }
  txn.set({ ...txn.state, entities, nextEntityId: nextId });

  for (const placed of population.monsters) {
    txn.emit({ type: 'spawned', entity: '', statblock: placed.monster, at: placed.at });
  }

  // The creatures an embedded static room authored, exactly where drawn.
  spawnStaticContent(txn, terrain, mapId, generated.authored.spawns);

  // Where the party *is* — not just which map is drawn. Everything that asks
  // "where are we?" reads this, which is why entering must set it.
  txn.set({
    ...txn.state,
    location: { kind: 'dungeon', dungeon: dungeonId, room: generated.entranceRoom },
  });
  recordExit(txn, mapId, generated.entrance);
  placeParty(txn, terrain, mapId, generated.entrance);

  // The traps the generator placed — these were computed on every visit and
  // thrown away, so `content.traps` was a collection that could never fire —
  // plus any an embedded static room authored.
  const installed: Record<number, { trap: string; state: 'hidden' }> = {
    ...generated.authored.traps,
  };
  for (const placed of population.traps) {
    installed[packKey(placed.at)] = { trap: placed.trap, state: 'hidden' };
  }

  const withTraps = txn.state.maps[mapId];
  if (withTraps && Object.keys(installed).length > 0) {
    txn.set({
      ...txn.state,
      maps: { ...txn.state.maps, [mapId]: { ...withTraps, traps: installed } },
    });
  }

  // Loot goes on the floor where the generator put it — and where an embedded
  // room's author drew it.
  const floor: Record<number, ItemStack[]> = {};
  for (const [tile, stack] of Object.entries(generated.authored.items)) {
    floor[Number(tile)] = stack.map((entry) => ({ ...entry }));
  }
  for (const placed of population.loot) {
    const tile = packKey(placed.at);
    floor[tile] = [...(floor[tile] ?? []), { item: placed.item, quantity: placed.quantity }];
  }

  const withLoot = txn.state.maps[mapId];
  if (withLoot) {
    txn.set({
      ...txn.state,
      maps: { ...txn.state.maps, [mapId]: { ...withLoot, items: floor } },
    });
  }

  const leader = txn.entity(txn.state.selected);
  if (leader) {
    runTriggers(
      txn,
      triggersFor(txn, [{ collection: 'world.dungeons', id: dungeonId }]),
      'enter',
      { id: dungeonId, kind: 'dungeon' },
      leader,
      rng,
    );
  }

  return true;
}

/** Enter an area's open map. */
export function enterArea(
  txn: Transaction,
  terrain: TerrainIndex,
  areaId: string,
  rng: Rng,
): boolean {
  const area = txn.module.find<{
    id: string;
    biome: string;
    map?: MapSpec;
    entryPoint?: Position;
    encounterTables?: string[];
    dangerLevel: number;
    encounterChance: Expr;
  }>('world.areas', areaId);

  if (!area) {
    txn.emit({ type: 'refused', action: 'travelToArea', reason: message('refused.travel.unknownArea', { area: areaId }) });
    return false;
  }

  const mapId = `area:${areaId}`;
  // A static map is authored, identical across seeds, and knows its own entry;
  // built here even when the instance exists because the entry tile is needed
  // on every visit and the build is a pure function of the module.
  const authored = area.map?.static ? buildStaticMap(txn.module, area.map.static) : null;

  if (!txn.state.maps[mapId]) {
    if (authored) {
      txn.set({
        ...txn.state,
        maps: { ...txn.state.maps, [mapId]: staticInstance(mapId, areaId, 'area', authored) },
      });
      spawnStaticContent(txn, terrain, mapId, authored.spawns);
    } else {
      const biome = txn.module.find<{ palette?: string }>('world.biomes', area.biome);
      // The entry point goes in so the generator can guarantee the party can
      // reach the rest of the map from where they will be standing.
      const built = buildMap(txn.module, area.map, rng.derive(`area:${areaId}`), biome?.palette, {
        entry: area.entryPoint ?? { x: 1, y: 1 },
      });

      const instance: MapInstance = {
        id: mapId, tiles: built.tiles, kind: 'area', source: areaId,
        explored: [], gates: {}, exits: {}, items: {}, marks: {},
        traps: {}, rooms: [], depth: 1,
      };
      txn.set({ ...txn.state, maps: { ...txn.state.maps, [mapId]: instance } });
    }
  }

  const arrival = authored?.entry ?? area.entryPoint ?? { x: 1, y: 1 };
  placeParty(txn, terrain, mapId, arrival);
  txn.set({ ...txn.state, location: { kind: 'area', area: areaId } });

  // What lives out here. An area's own `encounterTables` were declared by every
  // module that has one and rolled by nothing, so walking into the fens found
  // an empty marsh however many wanderers it listed.
  //
  // `dangerLevel` sets the odds: a settlement at 0 is quiet by definition, and
  // each step up makes an arrival more likely, to a ceiling short of certainty
  // — a place you can never cross in peace is a wall, not a wilderness.
  //
  // The curve from danger to probability is the area's own expression, so a
  // module that wants "danger 5 means near-certain ambush" can say it. The
  // default reproduces the engine's old `min(0.75, danger * 0.15)` exactly.
  const encounterRng = rng.derive(`area:${areaId}:encounter`);
  const chance = Number(
    evalExpr(area.encounterChance, {
      scope: { dangerLevel: area.dangerLevel },
      rng: encounterRng,
      openNamespaces: OPEN_NAMESPACES,
    }),
  );

  spawnEncounter(
    txn,
    terrain,
    area.encounterTables ?? [],
    Math.max(0, Math.min(1, chance)),
    area.entryPoint,
    encounterRng,
  );

  // What the place is like right now. A biome's `ambienceKey` was declared and
  // narrated nowhere, so the fens read the same at dawn as at midnight — the
  // phase goes into the context so one pool can cover the whole day.
  const biome = txn.module.find<{ ambienceKey?: string }>('world.biomes', area.biome);
  if (biome?.ambienceKey) {
    const phase = phaseOf(txn.module, txn.state.minute, layerOf(txn.module, txn.state.location));
    txn.emit({
      type: 'narrate',
      textKey: biome.ambienceKey,
      context: { place: areaId, phase: phase?.id ?? '' },
    });
  }

  const leader = txn.entity(txn.state.selected);
  if (leader) {
    runTriggers(
      txn,
      triggersFor(txn, [
        { collection: 'world.biomes', id: area.biome },
        { collection: 'world.areas', id: areaId },
      ]),
      'enter',
      { id: areaId, kind: 'area' },
      leader,
      rng,
    );
  }
  return true;
}

/**
 * Enter a point of interest.
 *
 * A gated place is refused until the gate opens, and a place that leads into a
 * dungeon hands straight over to {@link enterDungeon}.
 */
export function enterPoi(
  txn: Transaction,
  terrain: TerrainIndex,
  poiId: string,
  actor: Entity,
  rng: Rng,
  gateOpened: boolean,
): boolean {
  const poi = txn.module.find<{
    id: string;
    area: string;
    gate?: string;
    dungeon?: string;
    map?: MapSpec;
    position?: Position;
    descriptionKey?: string;
    residents?: string[];
    loot?: string[];
    travelMinutes?: number;
    encounterTables?: string[];
    encounterChance?: number;
  }>('world.pointsOfInterest', poiId);

  if (!poi) {
    txn.emit({ type: 'refused', action: 'enter', reason: message('refused.enter.unknownPlace') });
    return false;
  }
  if (poi.gate && !gateOpened) return false;

  // A place that fronts a dungeon is still a place you arrived at. Handing
  // straight off meant the `entered` event below never fired for any of them,
  // so a `reach` objective naming a barrow mouth or a stair head could never
  // complete — and `objective.target` is not a ref, so nothing said a word
  // about it. The event goes first, then the descent.
  if (poi.dungeon) {
    txn.emit({ type: 'custom', event: 'entered', data: { place: poiId, kind: 'poi' } });
    // And its own triggers, for the same reason and before the descent. The
    // `entered` event above was added when a `reach` on a barrow mouth turned
    // out to be uncompletable; the triggers sat one line further down and were
    // missed, so every trigger on all sixty-eight dungeon-fronting places in
    // Aurendel was dead. That included the three that set `down_by_the_tarn`,
    // `down_by_the_crater` and `down_by_karn_dolur` — the only three ways to
    // finish `the_way_below`, and therefore the only three ways to reach the
    // ending at all.
    runTriggers(
      txn,
      triggersFor(txn, [{ collection: 'world.pointsOfInterest', id: poiId }]),
      'enter',
      { id: poiId, kind: 'poi' },
      actor,
      rng,
    );
    return enterDungeon(txn, terrain, poi.dungeon, rng);
  }

  // An interior, if the place has one; otherwise the party simply stands here.
  const mapId = `poi:${poiId}`;
  if (poi.map) {
    const authored = poi.map.static ? buildStaticMap(txn.module, poi.map.static) : null;

    if (!txn.state.maps[mapId]) {
      if (authored) {
        txn.set({
          ...txn.state,
          maps: {
            ...txn.state.maps,
            [mapId]: staticInstance(mapId, poiId, 'interior', authored),
          },
        });
        spawnStaticContent(txn, terrain, mapId, authored.spawns);
      } else {
        const built = buildMap(txn.module, poi.map, rng.derive(`poi:${poiId}`));
        txn.set({
          ...txn.state,
          maps: {
            ...txn.state.maps,
            [mapId]: {
              id: mapId, tiles: built.tiles, kind: 'interior', source: poiId,
              explored: [], gates: {}, exits: {}, items: {}, marks: {},
              traps: {}, rooms: [], depth: 1,
            },
          },
        });
      }
    }
    // Every visit walks in at the door — a return trip re-enters the interior
    // rather than standing the party on the area map outside it. A static
    // interior's door is its entry marker; a generated one keeps `{1,1}`.
    const door = authored?.entry ?? { x: 1, y: 1 };
    recordExit(txn, mapId, door);
    placeParty(txn, terrain, mapId, door);
  } else if (poi.position && txn.state.currentMap) {
    // A place with no interior is still somewhere you stand. Without this the
    // party "enters the village" from wherever they happened to be on the area
    // map — often ten tiles away from the village and everyone in it.
    placeParty(txn, terrain, txn.state.currentMap, poi.position);
  }

  txn.set({ ...txn.state, location: { kind: 'poi', area: poi.area, poi: poiId } });

  // Say where the party now is. A place with no interior map and no authored
  // description used to produce no output whatsoever, so entering it was
  // indistinguishable from the command doing nothing — and nothing watching the
  // event stream, quests included, could tell they had arrived.
  txn.emit({ type: 'custom', event: 'entered', data: { place: poiId, kind: 'poi' } });

  // `position` is in *area* coordinates. Inside an interior it points at
  // nothing (often outside the map entirely), so spawns anchor to the party.
  const anchor = poi.map ? undefined : poi.position;

  // The people who live here. Declared by every module that has ever used
  // `residents` and, until now, instantiated by nothing — so the quest-givers
  // named in the content were not on the map to be talked to.
  // Anyone the place lists, plus anyone who lists the place. Declaring a home
  // was inert and unvalidated, so an NPC given one and left out of `residents`
  // existed in the content and nowhere in the world.
  spawnResidents(txn, terrain, residentsOf(txn, poiId, poi.residents ?? []), anchor);

  // And whatever else is in it. A ruin that declares an encounter table and
  // spawns nothing is a room the party walks into, finds empty, and has no way
  // to clear — which is the shape of a quest objective that can never progress.
  spawnEncounter(
    txn,
    terrain,
    poi.encounterTables ?? [],
    poi.encounterChance ?? 0,
    anchor,
    rng.derive(`encounter:${poiId}`),
  );

  // Whatever the place itself is worth searching for, once. A ruin's own loot
  // tables were declared by every module that has ever used them and rolled by
  // nothing, so the miller's effects sat in the mill and could never be found.
  spawnPoiLoot(txn, terrain, poiId, poi.loot ?? [], anchor, rng.derive(`loot:${poiId}`));

  if (poi.descriptionKey) {
    txn.emit({ type: 'narrate', textKey: poi.descriptionKey, context: { place: poiId } });
  }

  runTriggers(
    txn,
    triggersFor(txn, [{ collection: 'world.pointsOfInterest', id: poiId }]),
    'enter',
    { id: poiId, kind: 'poi' },
    actor,
    rng,
  );

  return true;
}
