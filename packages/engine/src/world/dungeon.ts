/**
 * Dungeon generation.
 *
 * Rooms are placed, connected into a tree, carved into tiles, and then locked.
 * Two properties must hold for every seed, and both are guaranteed by
 * construction rather than checked afterwards:
 *
 *   **Everything is reachable.** Rooms are connected with a spanning tree
 *   before any extra loops are added, so the graph is connected by definition.
 *
 *   **Every key lies before its lock.** A lock is only ever placed on a *tree*
 *   edge, which splits the dungeon into exactly two parts. The key goes in the
 *   part containing the entrance. Because the edge is a bridge, there is no
 *   other route to the far side — so the key is always obtainable first, and
 *   never trapped behind the door it opens.
 *
 * Locking a non-tree edge would break that argument, which is why every extra
 * edge — branchiness loops *and* the `minExits`-raising connections — is added
 * only after locks are chosen, and refused when it would join a lock's two
 * sides.
 *
 * **Rng streams** — each subsystem derives its own, so a change in one cannot
 * shift another, and template `requires` evaluation is isolated per template
 * (`qualify:<id>`) so adding a gate to one room cannot reshuffle the map:
 *
 *   `count`          roomCount roll
 *   `size`           authored width/height rolls
 *   `qualify:<id>`   template requirement evaluation
 *   `rooms`          placement sampling
 *   `corridors`      elbow orientation, winding walks, per-edge length rolls
 *   `locks`          lock selection and key hosts
 *   `loops`          branchiness extras
 *   `scatter`        palette scatter over the carved floor
 *
 * (`depth` and `populate` are derived by the caller, unchanged.)
 */

import { Rng, parseDice, rollDice } from '@dm/core';
import { evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { CompiledModule, Requirement, Scope } from '@dm/module';
import { MapBuilder, key as packKey, unkey } from '../grid/tiles.js';
import type { Position, TileMap } from '../grid/tiles.js';
import { resolvePalette, applyScatter, reconnect } from './mapgen.js';
import type { Palette } from './mapgen.js';
import { placeRooms, diceMean } from './dungeon/rooms.js';
import type { PlaceableTemplate, PlacedRoom } from './dungeon/rooms.js';
import { degreeTree, degreesOf, raiseToMinDegrees } from './dungeon/degree.js';
import type { DegreeLimits } from './dungeon/degree.js';
import { carvePath } from './dungeon/corridors.js';
import type { CorridorSpec, CorridorStyle } from './dungeon/corridors.js';
import { bspLayout, punchAdjacent, findPunch } from './dungeon/bsp.js';
import { cavernLayout } from './dungeon/caverns.js';
import { buildStaticMap } from './staticmap.js';
import type { BuiltStaticMap, StaticSpawn } from './staticmap.js';
import type { ItemStack } from '../state.js';

export interface Room {
  readonly id: string;
  /** Which room template this was drawn from. */
  readonly template: string;
  readonly role: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centre: Position;
}

export interface Door {
  readonly at: Position;
  readonly between: readonly [string, string];
  /** Gate guarding it, when locked. */
  readonly gate: string | null;
}

export interface GeneratedDungeon {
  readonly id: string;
  readonly tiles: TileMap;
  readonly rooms: readonly Room[];
  readonly doors: readonly Door[];
  /** Where the party arrives. */
  readonly entrance: Position;
  readonly entranceRoom: string;
  readonly bossRoom: string | null;
  /**
   * Keys that must be placed: the item, the room it goes in, and the gate it
   * opens. The gate is recorded so the ordering can be verified — a key is
   * always reachable once every *earlier* lock has been opened.
   */
  readonly keyPlacements: readonly { item: string; room: string; gate: string }[];
  readonly palette: Palette;
  /**
   * Content authored on embedded static rooms, at absolute positions — the
   * hand-placed gates, traps, items and creatures a `map.static` room
   * template carries into the generated dungeon.
   */
  readonly authored: AuthoredContent;
}

export interface AuthoredContent {
  readonly gates: Readonly<Record<number, { readonly gate: string; readonly open: boolean }>>;
  readonly traps: Readonly<Record<number, { readonly trap: string; readonly state: 'hidden' }>>;
  readonly items: Readonly<Record<number, readonly ItemStack[]>>;
  readonly spawns: readonly StaticSpawn[];
}

const NO_AUTHORED: AuthoredContent = { gates: {}, traps: {}, items: {}, spawns: [] };

interface DungeonDef {
  id: string;
  name: string;
  biome: string;
  roomCount: string;
  depth: string;
  branchiness: number;
  lockedDoorChance: number;
  doorGates: string[];
  guaranteedRoles: string[];
  bossTable?: string;
  palette?: string;
  corridorLength: string;
  algorithm?: 'rooms' | 'bsp' | 'caverns';
  corridor?: { style: CorridorStyle; width: number };
  width?: string;
  height?: string;
}

interface BiomeDef {
  id: string;
  roomTemplates: string[];
  palette?: string;
}

interface GateDef {
  id: string;
  requires?: { items?: { item: string }[] };
}

function roll(notation: string, rng: Rng, fallback: number): number {
  try {
    return rollDice(parseDice(notation), rng).total;
  } catch {
    return fallback;
  }
}

/** Whether the party meets a template's gate, treating an unevaluable one as closed. */
function qualifies(requirement: Requirement | undefined, scope: Scope, rng: Rng): boolean {
  if (isEmptyRequirement(requirement)) return true;
  try {
    return evalPredicate(compileRequirement(requirement), { scope, rng });
  } catch {
    return false;
  }
}

/** Adjacency list for a set of tree edges. */
function adjacencyOf(edges: readonly [number, number][]): Map<number, number[]> {
  const adjacency = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const list = adjacency.get(a);
    if (list) list.push(b);
    else adjacency.set(a, [b]);
  };
  for (const [a, b] of edges) {
    add(a, b);
    add(b, a);
  }
  return adjacency;
}

/** Rooms reachable from the entrance when the given edges are sealed. */
function componentFrom(
  entranceIndex: number,
  edges: readonly [number, number][],
  sealed: ReadonlySet<string>,
): Set<number> {
  const usable = edges.filter(([a, b]) => !sealed.has(`${a}-${b}`));
  const adjacency = adjacencyOf(usable);

  const seen = new Set<number>([entranceIndex]);
  const stack = [entranceIndex];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const next of adjacency.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

/** Depth of each room in the tree, measured from the entrance. */
function depthsFrom(entranceIndex: number, edges: readonly [number, number][]): Map<number, number> {
  const adjacency = adjacencyOf(edges);
  const depth = new Map<number, number>([[entranceIndex, 0]]);
  const queue = [entranceIndex];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(current)! + 1);
      queue.push(next);
    }
  }
  return depth;
}

/** Generate a dungeon from its module definition. */
export function generateDungeon(
  module: CompiledModule,
  dungeonId: string,
  rng: Rng,
  scope: Scope = {},
): GeneratedDungeon {
  const definition = module.get<DungeonDef>('world.dungeons', dungeonId);
  const biome = module.find<BiomeDef>('world.biomes', definition.biome);
  const palette = resolvePalette(module, definition.palette ?? biome?.palette);

  // A template the party does not qualify for is not built at all — the same
  // remove-before-the-draw rule loot and encounters follow, so a vault gated on
  // a quest simply is not in the dungeon rather than being an empty room.
  //
  // Each evaluation gets its own derived stream: the old code passed the
  // parent rng in, so a template *gaining* a requirement shifted every stream
  // after it and reshuffled the whole dungeon.
  const templates = (biome?.roomTemplates ?? [])
    .map((id) => module.find<PlaceableTemplate>('world.roomTemplates', id))
    .filter((entry): entry is PlaceableTemplate => Boolean(entry))
    .filter((entry) => qualifies(entry.requires, scope, rng.derive(`qualify:${entry.id}`)));

  if (templates.length === 0) {
    // Nothing to build from: a single empty chamber is better than throwing,
    // since a half-authored module should still be explorable in the editor.
    const builder = new MapBuilder(11, 11, palette.floor);
    builder.strokeRect(0, 0, 11, 11, palette.wall);
    return {
      id: dungeonId,
      tiles: builder.freeze(),
      rooms: [],
      doors: [],
      entrance: { x: 5, y: 5 },
      entranceRoom: '',
      bossRoom: null,
      keyPlacements: [],
      palette,
      authored: NO_AUTHORED,
    };
  }

  const roomCount = Math.max(2, roll(definition.roomCount, rng.derive('count'), 6));

  // Room spacing comes from `corridorLength` — its static mean, so the map's
  // geometry consumes no rng. Bounds grow with it; authored `width`/`height`
  // dice override the derived square.
  const spacing = Math.max(1, Math.min(12, Math.round(diceMean(definition.corridorLength, 1))));
  const derivedSize = Math.max(20, Math.ceil(Math.sqrt(roomCount) * (8 + spacing)) + 6);
  const sizeRng = rng.derive('size');
  const bounds = {
    width: definition.width ? Math.max(20, roll(definition.width, sizeRng, derivedSize)) : derivedSize,
    height: definition.height ? Math.max(20, roll(definition.height, sizeRng, derivedSize)) : derivedSize,
  };

  const algorithm = definition.algorithm ?? 'rooms';
  const builder = new MapBuilder(bounds.width, bounds.height, palette.wall);
  const templateById = new Map(templates.map((entry) => [entry.id, entry]));
  const corridorRng = rng.derive('corridors');

  // Each algorithm lays out rooms, carves them, and connects its spanning
  // tree; everything after that — locks, minExits raising, loops, dressing —
  // is shared, parameterized by how (and whether) an extra edge can be made.
  let rooms: PlacedRoom[];
  let tree: [number, number][];
  let treeCrossings: { edge: [number, number]; crossings: Position[] }[];
  let connectExtra: (a: number, b: number) => boolean;
  let canConnect: (a: number, b: number) => boolean;
  let authored: AuthoredContent = NO_AUTHORED;
  // Static room cells, for the scatter pass: the author drew every tile of
  // them, and dressing is not invited.
  const staticCells = new Set<number>();
  // Their door markers, absolute — the corridor mouths just outside them must
  // stay clear of scatter too, or a rubble pile can wall off the one way in.
  const authoredDoors: Position[] = [];

  // A template whose map is a static `world.maps` entry embeds only in the
  // rooms algorithm — BSP's leaves take their size from the splits and a
  // cavern has no rooms to stamp — so the other two simply do not draw it.
  const nonStatic = templates.filter((entry) => !entry.map?.static);

  if (algorithm === 'caverns') {
    // No doors, no locks, no loops: a cavern is one organic body of floor.
    const layout = cavernLayout(
      builder, nonStatic.length > 0 ? nonStatic : templates, roomCount,
      definition.guaranteedRoles, palette, rng.derive('rooms'),
    );
    rooms = layout.rooms;
    tree = [];
    treeCrossings = [];
    connectExtra = () => false;
    canConnect = () => false;
  } else if (algorithm === 'bsp') {
    const layout = bspLayout(
      builder, nonStatic.length > 0 ? nonStatic : templates, roomCount,
      definition.guaranteedRoles, palette, rng.derive('rooms'),
    );
    rooms = layout.rooms;
    tree = layout.tree;
    treeCrossings = layout.treeCrossings;
    // Extra edges are wall punches, so only adjacent rooms can gain one.
    connectExtra = (a, b) => punchAdjacent(builder, rooms[a]!, rooms[b]!, palette) !== null;
    canConnect = (a, b) => findPunch(rooms[a]!, rooms[b]!) !== null;
  } else {
    // Static-mapped templates take their size from the map and are stamped
    // verbatim; the build is pure and cheap, done once per template here.
    const staticBuilt = new Map<string, BuiltStaticMap>();
    const placeable = templates.map((entry) => {
      const staticId = entry.map?.static;
      if (!staticId) return entry;
      const built = buildStaticMap(module, staticId);
      staticBuilt.set(entry.id, built);
      return {
        ...entry,
        fixedSize: { width: built.tiles.width, height: built.tiles.height },
      };
    });

    rooms = placeRooms(
      placeable,
      roomCount,
      bounds,
      definition.guaranteedRoles,
      spacing,
      rng.derive('rooms'),
    );

    // — carve ——————————————————————————————————————————————
    for (const room of rooms) {
      const template = templateById.get(room.template);
      const layout = template?.map?.layout;
      const built = staticBuilt.get(room.template);

      if (built) {
        // A static room, tile for tile as its author drew it.
        for (let dy = 0; dy < built.tiles.height; dy += 1) {
          for (let dx = 0; dx < built.tiles.width; dx += 1) {
            builder.set(room.x + dx, room.y + dy, built.tiles.tiles[dy * built.tiles.width + dx]!);
          }
        }
      } else if (layout && layout.length > 0) {
        // A hand-authored room is stamped verbatim. Its legend's defaults come
        // from the room's own declared palette when it names one — that was
        // the point of `roomTemplates[].map.palette`, ignored until now.
        const roomPalette = template?.map?.palette
          ? resolvePalette(module, template.map.palette)
          : palette;
        const legend: Record<string, string> = {
          '.': roomPalette.floor, '#': roomPalette.wall, '+': roomPalette.door,
          ...(template?.map?.legend ?? {}),
        };
        layout.forEach((row, dy) => {
          [...row].forEach((glyph, dx) => {
            builder.set(room.x + dx, room.y + dy, legend[glyph] ?? roomPalette.floor);
          });
        });
      } else {
        builder.fillRect(room.x, room.y, room.width, room.height, palette.floor);
        builder.strokeRect(room.x, room.y, room.width, room.height, palette.wall);
        builder.fillRect(room.x + 1, room.y + 1, room.width - 2, room.height - 2, palette.floor);
      }
    }

    // — connect ————————————————————————————————————————————
    const limitsFor = (room: PlacedRoom): DegreeLimits => {
      const template = templateById.get(room.template);
      return { min: template?.minExits ?? 0, max: template?.maxExits ?? Infinity };
    };
    const treeLimits = rooms.map(limitsFor);
    tree = degreeTree(rooms, treeLimits);

    const corridor: CorridorSpec = {
      style: definition.corridor?.style ?? 'l',
      width: definition.corridor?.width ?? 1,
    };

    // Door spots accumulate as tree corridors are carved, so no later brush
    // can erode the wall around an earlier door.
    const doorSpots = new Set<number>();

    // A static room may only be entered through its door markers: every other
    // cell of its rectangle is off limits to every corridor, so an unrelated
    // edge's elbow cannot slice through the author's walls.
    const forbidden = new Set<number>();
    for (const room of rooms) {
      const built = staticBuilt.get(room.template);
      if (!built) continue;
      for (let dy = 0; dy < room.height; dy += 1) {
        for (let dx = 0; dx < room.width; dx += 1) {
          forbidden.add((room.y + dy) * builder.width + (room.x + dx));
          staticCells.add((room.y + dy) * builder.width + (room.x + dx));
        }
      }
      for (const door of built.doors) {
        forbidden.delete((room.y + door.y) * builder.width + (room.x + door.x));
        authoredDoors.push({ x: room.x + door.x, y: room.y + door.y });
      }
    }

    // Corridors aim at a room's centre — unless the room is static, in which
    // case they aim at its nearest `door` marker: the author decided where
    // that room may be entered, and the generator respects it.
    const anchorOf = (index: number, toward: Position): Position => {
      const room = rooms[index]!;
      const built = staticBuilt.get(room.template);
      if (!built || built.doors.length === 0) return room.centre;
      let best = built.doors[0]!;
      let bestDistance = Infinity;
      for (const door of built.doors) {
        const at = { x: room.x + door.x, y: room.y + door.y };
        const distance = Math.abs(at.x - toward.x) + Math.abs(at.y - toward.y);
        if (distance < bestDistance) {
          best = door;
          bestDistance = distance;
        }
      }
      return { x: room.x + best.x, y: room.y + best.y };
    };

    const connect = (a: number, b: number): Position[] => {
      // Winding corridors read the per-edge roll as a minimum path length;
      // the other styles are exactly as long as geometry makes them.
      const minLength =
        corridor.style === 'winding' ? roll(definition.corridorLength, corridorRng, spacing) : 0;
      return carvePath(
        builder,
        anchorOf(a, rooms[b]!.centre),
        anchorOf(b, rooms[a]!.centre),
        palette,
        corridor,
        corridorRng,
        minLength,
        doorSpots,
        forbidden,
      );
    };

    treeCrossings = tree.map(([a, b]) => {
      const crossings = connect(a, b);
      // The first crossing is where this edge's door will sit.
      const spot = crossings[0];
      if (spot) doorSpots.add(spot.y * builder.width + spot.x);
      return { edge: [a, b] as [number, number], crossings };
    });

    connectExtra = (a, b) => {
      connect(a, b);
      return true;
    };
    canConnect = () => true;

    // — authored content, shifted to where its room landed —————
    if (staticBuilt.size > 0) {
      const gates: Record<number, { gate: string; open: boolean }> = {};
      const traps: Record<number, { trap: string; state: 'hidden' }> = {};
      const items: Record<number, ItemStack[]> = {};
      const spawns: StaticSpawn[] = [];

      for (const room of rooms) {
        const built = staticBuilt.get(room.template);
        if (!built) continue;
        const shift = (packed: number): number => {
          const at = unkey(packed);
          return packKey({ x: room.x + at.x, y: room.y + at.y });
        };
        for (const [packed, gate] of Object.entries(built.gates)) gates[shift(Number(packed))] = { ...gate };
        for (const [packed, trap] of Object.entries(built.traps)) traps[shift(Number(packed))] = { ...trap };
        for (const [packed, stack] of Object.entries(built.items)) {
          items[shift(Number(packed))] = stack.map((entry) => ({ ...entry }));
        }
        for (const spawn of built.spawns) {
          spawns.push({ ...spawn, at: { x: room.x + spawn.at.x, y: room.y + spawn.at.y } });
        }
      }
      authored = { gates, traps, items, spawns };
    }
  }

  if (rooms.length === 0) {
    return {
      id: dungeonId, tiles: builder.freeze(), rooms: [], doors: [],
      entrance: { x: 1, y: 1 }, entranceRoom: '', bossRoom: null, keyPlacements: [], palette,
      authored: NO_AUTHORED,
    };
  }

  const limits: DegreeLimits[] = rooms.map((room) => {
    const template = templateById.get(room.template);
    return {
      min: template?.minExits ?? 0,
      max: template?.maxExits ?? Infinity,
    };
  });

  // — lock ——————————————————————————————————————————————————
  // Only tree edges are candidates: each is a bridge, so locking one cleanly
  // separates the dungeon into a near side and a far side.
  const entranceIndex = Math.max(0, rooms.findIndex((room) => room.role === 'entrance'));
  const gates = definition.doorGates
    .map((id) => module.find<GateDef>('world.gates', id))
    .filter((entry): entry is GateDef => Boolean(entry));

  const lockRng = rng.derive('locks');
  const keyPlacements: { item: string; room: string; gate: string }[] = [];

  /**
   * Decide which doors are locked, then place their keys **in the order a
   * player meets them**.
   *
   * Locking only bridges is not sufficient on its own: with two locks, a room
   * can sit on the near side of the first while still being behind the second.
   * So locks are sorted by depth from the entrance and keys are placed one at a
   * time, each into the region the party can already reach — which is exactly
   * the situation they will be in when they need it.
   */
  const depth = depthsFrom(entranceIndex, tree);
  const candidates = treeCrossings
    .filter((entry) => entry.crossings.length > 0)
    .filter(() => gates.length > 0 && lockRng.chance(definition.lockedDoorChance))
    .sort((a, b) => {
      const depthOf = (edge: [number, number]) =>
        Math.max(depth.get(edge[0]) ?? 0, depth.get(edge[1]) ?? 0);
      return depthOf(a.edge) - depthOf(b.edge);
    });

  // Walk the locks outward: assign each its gate and place that gate's key in
  // the region reachable with every *later* lock still sealed.
  const gateByEdge = new Map<string, string>();
  const solved = new Set<string>();

  for (const { edge } of candidates) {
    const gate = lockRng.pick(gates);
    const edgeId = `${edge[0]}-${edge[1]}`;
    gateByEdge.set(edgeId, gate.id);

    // Everything still sealed at this point is what the party cannot yet pass.
    const stillLocked = new Set(
      candidates
        .map(({ edge: other }) => `${other[0]}-${other[1]}`)
        .filter((id) => !solved.has(id)),
    );
    const accessible = componentFrom(entranceIndex, tree, stillLocked);

    const hosts = [...accessible];
    const host = hosts.length > 0 ? lockRng.pick(hosts) : entranceIndex;

    for (const requirement of gate.requires?.items ?? []) {
      keyPlacements.push({ item: requirement.item, room: rooms[host]!.id, gate: gate.id });
    }

    // This lock is now considered solved for the sake of later placements.
    solved.add(edgeId);
  }

  // Every tree crossing becomes a door, built with its gate in one pass — the
  // old code computed `locked` here and threw it away (`locked ? null : null`),
  // patching gates in afterwards.
  const doors: Door[] = [];
  for (const { edge, crossings } of treeCrossings) {
    const spot = crossings[0];
    if (!spot) continue;
    builder.set(spot.x, spot.y, palette.door);
    doors.push({
      at: spot,
      between: [rooms[edge[0]]!.id, rooms[edge[1]]!.id],
      gate: gateByEdge.get(`${edge[0]}-${edge[1]}`) ?? null,
    });
  }

  /** Near sides of every lock, for keeping extra edges from bypassing them. */
  const lockedSides = candidates.map(({ edge }) =>
    componentFrom(entranceIndex, tree, new Set([`${edge[0]}-${edge[1]}`])),
  );
  const bypassesLock = (a: number, b: number): boolean =>
    lockedSides.some((near) => near.has(a) !== near.has(b));

  // — raise to minExits ————————————————————————————————————
  // After locking, for the same reason loops come after locking: an extra
  // connection must never route around a locked door. Deterministic, so it
  // sits between the `locks` and `loops` streams without owning one.
  const raised = raiseToMinDegrees(rooms, tree, limits, bypassesLock, canConnect);
  for (const [a, b] of raised) connectExtra(a, b);

  // — loop ——————————————————————————————————————————————————
  // Extra connections are added *after* locking, so they can never bypass a
  // locked door and invalidate the key-placement argument above. They now also
  // respect `maxExits`, which the tree honoured from the start.
  const extraRng = rng.derive('loops');
  const extras = Math.floor(rooms.length * definition.branchiness);
  const withRaised = [...tree, ...raised];
  const degree = degreesOf(rooms.length, withRaised);

  for (let i = 0; i < extras; i += 1) {
    const a = extraRng.nextInt(0, rooms.length - 1);
    const b = extraRng.nextInt(0, rooms.length - 1);
    if (a === b) continue;
    if (withRaised.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;
    if (degree[a]! >= limits[a]!.max || degree[b]! >= limits[b]!.max) continue;
    if (bypassesLock(a, b)) continue;

    if (!connectExtra(a, b)) continue;
    withRaised.push([a, b]);
    degree[a]! += 1;
    degree[b]! += 1;
  }

  const entranceRoom = rooms[entranceIndex]!;

  // — dress ————————————————————————————————————————————————
  // Scatter, at last, for dungeons too: rubble in the crypt, moss in the
  // burrow. Room centres, the entrance, and doorways are reserved — corridors
  // aim at centres and doors are the only way through a wall, so dressing must
  // never sit on either — and the reconnect pass guarantees whatever else it
  // claims cannot strand a region.
  if (palette.scatter.length > 0) {
    const reserved = new Set<number>(staticCells);
    const reserve = (at: Position) => reserved.add(at.y * builder.width + at.x);
    for (const room of rooms) reserve(room.centre);
    reserve(entranceRoom.centre);
    for (const at of [...doors.map((door) => door.at), ...authoredDoors]) {
      reserve(at);
      reserve({ x: at.x + 1, y: at.y });
      reserve({ x: at.x - 1, y: at.y });
      reserve({ x: at.x, y: at.y + 1 });
      reserve({ x: at.x, y: at.y - 1 });
    }
    applyScatter(builder, palette, rng.derive('scatter'), reserved);
    // Static room rectangles are off limits to the repair dig too, keyed the
    // way reconnect keys tiles.
    const avoid = new Set<number>();
    for (const packed of staticCells) {
      avoid.add(packKey({ x: packed % builder.width, y: Math.floor(packed / builder.width) }));
    }
    reconnect(builder, module, palette, entranceRoom.centre, avoid);
  }

  // `palette.exterior` fills the space beyond the walls — rock, void, open sky.
  // A wall with no carved neighbour is not a wall anyone can ever see past;
  // painting it exterior is what makes the field read as solid ground.
  if (palette.exterior !== palette.wall) {
    paintExterior(builder, palette);
  }

  const boss = rooms.find((room) => room.role === 'boss') ?? rooms.at(-1) ?? null;

  return {
    id: dungeonId,
    tiles: builder.freeze(),
    rooms,
    doors,
    entrance: entranceRoom.centre,
    entranceRoom: entranceRoom.id,
    bossRoom: boss && boss.id !== entranceRoom.id ? boss.id : null,
    keyPlacements,
    palette,
    authored,
  };
}

/** Walls with no carved 8-neighbour become the palette's exterior. */
function paintExterior(builder: MapBuilder, palette: Palette): void {
  const isWall = (x: number, y: number) => builder.get(x, y) === palette.wall;
  const exterior: Position[] = [];

  for (let y = 0; y < builder.height; y += 1) {
    for (let x = 0; x < builder.width; x += 1) {
      if (!isWall(x, y)) continue;
      let touchesCarved = false;
      for (let dy = -1; dy <= 1 && !touchesCarved; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighbour = builder.get(x + dx, y + dy);
          if (neighbour !== palette.wall && neighbour !== palette.exterior && neighbour !== '') {
            touchesCarved = true;
            break;
          }
        }
      }
      if (!touchesCarved) exterior.push({ x, y });
    }
  }

  for (const at of exterior) builder.set(at.x, at.y, palette.exterior);
}

/** Gate lookup by packed tile, for storing on a map instance. */
export function gatesOf(dungeon: GeneratedDungeon): Record<number, { gate: string; open: boolean }> {
  const out: Record<number, { gate: string; open: boolean }> = {};
  for (const door of dungeon.doors) {
    if (!door.gate) continue;
    out[packKey(door.at)] = { gate: door.gate, open: false };
  }
  return out;
}

