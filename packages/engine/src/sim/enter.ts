/**
 * Arriving somewhere.
 *
 * Generating a place and putting the party on it. Maps are generated once and
 * kept in state, so walking back out of a dungeon and returning finds the same
 * dungeon — regenerating it from the seed on every visit would be cheaper in
 * memory and completely wrong.
 */

import { Rng } from '@dm/core';
import type { Scope } from '@dm/module';
import type { Entity, ItemStack, MapInstance } from '../state.js';
import { Transaction } from '../rules/apply.js';
import { buildScope } from '../stats.js';
import { TerrainIndex, key as packKey } from '../grid/tiles.js';
import type { Position } from '../grid/tiles.js';
import { generateDungeon, gatesOf } from '../world/dungeon.js';
import { buildMap } from '../world/mapgen.js';
import { populateDungeon, rollEncounter } from '../world/populate.js';
import { spawnMonster, spawnNpc } from '../character.js';
import { runTriggers, triggersFor } from './triggers.js';

/** A free tile near a preferred spot, for placing an entity. */
function freeNear(
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
    txn.putEntity({ ...member, map: mapId, position: spot });
    txn.emit({ type: 'enteredMap', entity: id, map: mapId, at: spot });
  }
  txn.set({ ...txn.state, currentMap: mapId });
}

function scopeOf(txn: Transaction): Scope {
  const leader = txn.entity(txn.state.selected);
  return leader ? buildScope(txn.module, txn.state, leader) : ({});
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
    txn.putEntity({ ...person, map: mapId, position: at });
    txn.emit({ type: 'spawned', entity: npcId, statblock: person.statblock ?? npcId, at });
  }
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
        ...monster,
        map: mapId,
        position: at,
        disposition: draw.hostile ? 'hostile' : 'neutral',
      });
      txn.emit({ type: 'spawned', entity: id, statblock: entry.monster, at });
    }
  }

  txn.set({ ...txn.state, nextEntityId: nextId });
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
    // Been here before: walk back in where we came out. The room is only known
    // while the dungeon is being generated, so a return trip records the place
    // without it.
    txn.set({ ...txn.state, location: { kind: 'dungeon', dungeon: dungeonId, room: '' } });
    placeParty(txn, terrain, mapId, existing.exits[0]?.at ?? { x: 1, y: 1 });
    return true;
  }

  const definition = txn.module.find<{ id: string }>('world.dungeons', dungeonId);
  if (!definition) {
    txn.emit({ type: 'refused', action: 'enter', reason: `no dungeon "${dungeonId}"` });
    return false;
  }

  const dungeonRng = rng.derive(`dungeon:${dungeonId}`);
  const generated = generateDungeon(txn.module, dungeonId, dungeonRng);

  const instance: MapInstance = {
    id: mapId,
    tiles: generated.tiles,
    kind: 'room',
    source: dungeonId,
    explored: [],
    gates: gatesOf(generated),
    exits: {},
    items: {},
    marks: {},
  };
  txn.set({ ...txn.state, maps: { ...txn.state.maps, [mapId]: instance } });

  // — inhabitants and treasure ————————————————————————————
  const population = populateDungeon({
    module: txn.module,
    dungeon: generated,
    terrain,
    scope: scopeOf(txn),
    depth: 1,
    rng: dungeonRng.derive('populate'),
  });

  let nextId = txn.state.nextEntityId;
  const entities = { ...txn.state.entities };

  for (const placed of population.monsters) {
    nextId += 1;
    const id = `e:${nextId}`;
    const monster = spawnMonster(txn.module, id, placed.monster);
    entities[id] = {
      ...monster,
      map: mapId,
      position: placed.at,
      disposition: placed.hostile ? 'hostile' : 'neutral',
    };
  }
  txn.set({ ...txn.state, entities, nextEntityId: nextId });

  for (const placed of population.monsters) {
    txn.emit({ type: 'spawned', entity: '', statblock: placed.monster, at: placed.at });
  }

  // Where the party *is* — not just which map is drawn. Everything that asks
  // "where are we?" reads this, which is why entering must set it.
  txn.set({
    ...txn.state,
    location: { kind: 'dungeon', dungeon: dungeonId, room: generated.entranceRoom },
  });
  placeParty(txn, terrain, mapId, generated.entrance);

  // Loot goes on the floor where the generator put it.
  const floor: Record<number, ItemStack[]> = {};
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
    map?: never;
    entryPoint?: Position;
  }>('world.areas', areaId);

  if (!area) {
    txn.emit({ type: 'refused', action: 'travelToArea', reason: `no area "${areaId}"` });
    return false;
  }

  const mapId = `area:${areaId}`;
  if (!txn.state.maps[mapId]) {
    const biome = txn.module.find<{ palette?: string }>('world.biomes', area.biome);
    // The entry point goes in so the generator can guarantee the party can
    // reach the rest of the map from where they will be standing.
    const built = buildMap(txn.module, area.map, rng.derive(`area:${areaId}`), biome?.palette, {
      entry: area.entryPoint ?? { x: 1, y: 1 },
    });

    const instance: MapInstance = {
      id: mapId, tiles: built.tiles, kind: 'area', source: areaId,
      explored: [], gates: {}, exits: {}, items: {}, marks: {},
    };
    txn.set({ ...txn.state, maps: { ...txn.state.maps, [mapId]: instance } });
  }

  const arrival = area.entryPoint ?? { x: 1, y: 1 };
  placeParty(txn, terrain, mapId, arrival);
  txn.set({ ...txn.state, location: { kind: 'area', area: areaId } });

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
    map?: never;
    position?: Position;
    descriptionKey?: string;
    residents?: string[];
    encounterTables?: string[];
    encounterChance?: number;
  }>('world.pointsOfInterest', poiId);

  if (!poi) {
    txn.emit({ type: 'refused', action: 'enter', reason: `no such place` });
    return false;
  }
  if (poi.gate && !gateOpened) return false;

  if (poi.dungeon) return enterDungeon(txn, terrain, poi.dungeon, rng);

  // An interior, if the place has one; otherwise the party simply stands here.
  const mapId = `poi:${poiId}`;
  if (poi.map && !txn.state.maps[mapId]) {
    const built = buildMap(txn.module, poi.map, rng.derive(`poi:${poiId}`));
    txn.set({
      ...txn.state,
      maps: {
        ...txn.state.maps,
        [mapId]: {
          id: mapId, tiles: built.tiles, kind: 'interior', source: poiId,
          explored: [], gates: {}, exits: {}, items: {}, marks: {},
        },
      },
    });
    placeParty(txn, terrain, mapId, { x: 1, y: 1 });
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

  // The people who live here. Declared by every module that has ever used
  // `residents` and, until now, instantiated by nothing — so the quest-givers
  // named in the content were not on the map to be talked to.
  spawnResidents(txn, terrain, poi.residents ?? [], poi.position);

  // And whatever else is in it. A ruin that declares an encounter table and
  // spawns nothing is a room the party walks into, finds empty, and has no way
  // to clear — which is the shape of a quest objective that can never progress.
  spawnEncounter(
    txn,
    terrain,
    poi.encounterTables ?? [],
    poi.encounterChance ?? 0,
    poi.position,
    rng.derive(`encounter:${poiId}`),
  );

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
