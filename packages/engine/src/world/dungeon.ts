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
 * Locking a non-tree edge would break that argument, which is why extra loops
 * are added only after locks are chosen.
 */

import { Rng, parseDice, rollDice } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import { MapBuilder, key as packKey } from '../grid/tiles.js';
import type { Position, TileMap } from '../grid/tiles.js';
import { resolvePalette } from './mapgen.js';
import type { Palette } from './mapgen.js';

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
}

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
}

interface RoomTemplateDef {
  id: string;
  role: string;
  weight: number;
  map?: { width: string; height: string; palette?: string; layout: string[]; legend: Record<string, string> };
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

/** Rectangles do not overlap, and keep a gap so walls are not shared. */
function overlaps(a: Room, b: Room): boolean {
  return (
    a.x < b.x + b.width + 1 &&
    a.x + a.width + 1 > b.x &&
    a.y < b.y + b.height + 1 &&
    a.y + a.height + 1 > b.y
  );
}

/**
 * Place non-overlapping rooms by rejection sampling.
 *
 * Simple and predictable; a BSP split would pack tighter but produces a
 * recognisably grid-like dungeon, and rejection sampling reads more naturally
 * when rooms vary a lot in size.
 */
function placeRooms(
  module: CompiledModule,
  templates: RoomTemplateDef[],
  count: number,
  bounds: { width: number; height: number },
  guaranteedRoles: readonly string[],
  rng: Rng,
): Room[] {
  const rooms: Room[] = [];
  const attemptsPerRoom = 40;

  /**
   * Build the draw order up front.
   *
   * A guaranteed role means *exactly one* — one entrance, one boss. Drawing
   * purely by weight would give a dungeon three entrances and two boss rooms,
   * which is what happens without this.
   */
  const ordered: RoomTemplateDef[] = [];
  const guaranteed = new Set(guaranteedRoles);

  for (const role of guaranteedRoles) {
    const options = templates.filter((entry) => entry.role === role);
    if (options.length > 0) ordered.push(rng.weightedPick(options, (entry) => entry.weight ?? 1));
  }

  // Everything else is drawn from templates that do not claim a unique role.
  const filler = templates.filter((entry) => !guaranteed.has(entry.role));
  const fillerPool = filler.length > 0 ? filler : templates;

  while (ordered.length < count) {
    ordered.push(rng.weightedPick(fillerPool, (entry) => entry.weight ?? 1));
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const template = ordered[index]!;
    const spec = template.map;

    const width = Math.max(3, roll(spec?.width ?? '2d3+3', rng, 6));
    const height = Math.max(3, roll(spec?.height ?? '2d3+3', rng, 6));
    // A hand-authored room uses its layout's own dimensions.
    const laidOut = spec?.layout && spec.layout.length > 0;
    const w = laidOut ? spec.layout[0]!.length : width;
    const h = laidOut ? spec.layout.length : height;

    if (w + 2 >= bounds.width || h + 2 >= bounds.height) continue;

    for (let attempt = 0; attempt < attemptsPerRoom; attempt += 1) {
      const x = rng.nextInt(1, bounds.width - w - 2);
      const y = rng.nextInt(1, bounds.height - h - 2);
      const candidate: Room = {
        id: `r${index}`,
        template: template.id,
        // A filler room drawn from a role-bearing template loses that role, so
        // the guarantee holds even when a module has only one template.
        role: index < guaranteedRoles.length ? template.role : (guaranteed.has(template.role) ? 'chamber' : template.role),
        x, y, width: w, height: h,
        centre: { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) },
      };
      if (rooms.some((existing) => overlaps(candidate, existing))) continue;
      rooms.push(candidate);
      break;
    }
  }

  void module;
  return rooms;
}

/** Minimum spanning tree over room centres, by nearest neighbour. */
function spanningTree(rooms: readonly Room[]): [number, number][] {
  if (rooms.length < 2) return [];

  const connected = new Set<number>([0]);
  const edges: [number, number][] = [];

  while (connected.size < rooms.length) {
    let best: { from: number; to: number; distance: number } | null = null;

    for (const from of connected) {
      for (let to = 0; to < rooms.length; to += 1) {
        if (connected.has(to)) continue;
        const a = rooms[from]!.centre;
        const b = rooms[to]!.centre;
        const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        // Ties break on index, so the tree is reproducible.
        if (!best || distance < best.distance) best = { from, to, distance };
      }
    }

    if (!best) break;
    edges.push([best.from, best.to]);
    connected.add(best.to);
  }

  return edges;
}

/** Carve an L-shaped corridor between two points, recording where it meets walls. */
function carveCorridor(
  builder: MapBuilder,
  from: Position,
  to: Position,
  palette: Palette,
  horizontalFirst: boolean,
): Position[] {
  const carved: Position[] = [];
  const step = (x: number, y: number) => {
    if (builder.get(x, y) === palette.wall) carved.push({ x, y });
    builder.set(x, y, palette.floor);
  };

  if (horizontalFirst) {
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x += 1) step(x, from.y);
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += 1) step(to.x, y);
  } else {
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += 1) step(from.x, y);
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x += 1) step(x, to.y);
  }

  return carved;
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
): GeneratedDungeon {
  const definition = module.get<DungeonDef>('world.dungeons', dungeonId);
  const biome = module.find<BiomeDef>('world.biomes', definition.biome);
  const palette = resolvePalette(module, definition.palette ?? biome?.palette);

  const templates = (biome?.roomTemplates ?? [])
    .map((id) => module.find<RoomTemplateDef>('world.roomTemplates', id))
    .filter((entry): entry is RoomTemplateDef => Boolean(entry));

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
    };
  }

  const roomCount = Math.max(2, roll(definition.roomCount, rng.derive('count'), 6));
  // Bounds scale with room count, with enough slack for rejection sampling to
  // find placements without leaving the map mostly empty.
  const size = Math.max(20, Math.ceil(Math.sqrt(roomCount) * 10) + 6);
  const bounds = { width: size, height: size };

  const rooms = placeRooms(
    module,
    templates,
    roomCount,
    bounds,
    definition.guaranteedRoles,
    rng.derive('rooms'),
  );
  if (rooms.length === 0) {
    const builder = new MapBuilder(bounds.width, bounds.height, palette.wall);
    return {
      id: dungeonId, tiles: builder.freeze(), rooms: [], doors: [],
      entrance: { x: 1, y: 1 }, entranceRoom: '', bossRoom: null, keyPlacements: [], palette,
    };
  }

  // — carve ————————————————————————————————————————————————
  const builder = new MapBuilder(bounds.width, bounds.height, palette.wall);
  const templateById = new Map(templates.map((entry) => [entry.id, entry]));

  for (const room of rooms) {
    const template = templateById.get(room.template);
    const layout = template?.map?.layout;

    if (layout && layout.length > 0) {
      // A hand-authored room is stamped verbatim.
      const legend: Record<string, string> = {
        '.': palette.floor, '#': palette.wall, '+': palette.door,
        ...(template?.map?.legend ?? {}),
      };
      layout.forEach((row, dy) => {
        [...row].forEach((glyph, dx) => {
          builder.set(room.x + dx, room.y + dy, legend[glyph] ?? palette.floor);
        });
      });
    } else {
      builder.fillRect(room.x, room.y, room.width, room.height, palette.floor);
      builder.strokeRect(room.x, room.y, room.width, room.height, palette.wall);
      builder.fillRect(room.x + 1, room.y + 1, room.width - 2, room.height - 2, palette.floor);
    }
  }

  // — connect ——————————————————————————————————————————————
  const tree = spanningTree(rooms);
  const corridorRng = rng.derive('corridors');
  const doors: Door[] = [];

  const connect = (a: number, b: number): Position[] =>
    carveCorridor(builder, rooms[a]!.centre, rooms[b]!.centre, palette, corridorRng.chance(0.5));

  const treeCrossings = tree.map(([a, b]) => ({ edge: [a, b] as [number, number], crossings: connect(a, b) }));

  // — lock ——————————————————————————————————————————————————
  // Only tree edges are candidates: each is a bridge, so locking one cleanly
  // separates the dungeon into a near side and a far side.
  const entranceIndex = Math.max(0, rooms.findIndex((room) => room.role === 'entrance'));
  const gates = definition.doorGates
    .map((id) => module.find<GateDef>('world.gates', id))
    .filter((entry): entry is GateDef => Boolean(entry));

  const lockRng = rng.derive('locks');
  const keyPlacements: { item: string; room: string; gate: string }[] = [];
  const lockedEdges = new Set<string>();

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

  const lockedSet = new Set(candidates.map(({ edge }) => `${edge[0]}-${edge[1]}`));

  // Doors first, so every crossing becomes a door whether or not it is locked.
  for (const { edge, crossings } of treeCrossings) {
    const spot = crossings[0];
    if (!spot) continue;
    const locked = lockedSet.has(`${edge[0]}-${edge[1]}`);
    builder.set(spot.x, spot.y, palette.door);
    doors.push({
      at: spot,
      between: [rooms[edge[0]]!.id, rooms[edge[1]]!.id],
      gate: locked ? null : null,
    });
  }

  // Now walk the locks outward, assigning a gate and placing its key.
  for (const { edge } of candidates) {
    const gate = lockRng.pick(gates);
    const edgeId = `${edge[0]}-${edge[1]}`;

    // Everything still sealed at this point is what the party cannot yet pass.
    const stillLocked = new Set(
      candidates
        .map(({ edge: other }) => `${other[0]}-${other[1]}`)
        .filter((id) => !lockedEdges.has(id)),
    );
    const accessible = componentFrom(entranceIndex, tree, stillLocked);

    const hosts = [...accessible];
    const host = hosts.length > 0 ? lockRng.pick(hosts) : entranceIndex;

    for (const requirement of gate.requires?.items ?? []) {
      keyPlacements.push({ item: requirement.item, room: rooms[host]!.id, gate: gate.id });
    }

    // Record the gate on the door that guards this edge.
    const door = doors.find(
      (entry) =>
        entry.between[0] === rooms[edge[0]]!.id && entry.between[1] === rooms[edge[1]]!.id,
    );
    if (door) {
      doors[doors.indexOf(door)] = { ...door, gate: gate.id };
    }

    // This lock is now considered solved for the sake of later placements.
    lockedEdges.add(edgeId);
  }

  /** Near sides of every lock, for keeping extra loops from bypassing them. */
  const lockedSides = candidates.map(({ edge }) =>
    componentFrom(entranceIndex, tree, new Set([`${edge[0]}-${edge[1]}`])),
  );

  // — loop ——————————————————————————————————————————————————
  // Extra connections are added *after* locking, so they can never bypass a
  // locked door and invalidate the key-placement argument above.
  const extraRng = rng.derive('loops');
  const extras = Math.floor(rooms.length * definition.branchiness);

  for (let i = 0; i < extras; i += 1) {
    const a = extraRng.nextInt(0, rooms.length - 1);
    const b = extraRng.nextInt(0, rooms.length - 1);
    if (a === b) continue;
    if (tree.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;

    // A loop that joined the two sides of a locked door would route around it,
    // and the key-before-lock guarantee would no longer hold.
    const bypassesLock = lockedSides.some((near) => near.has(a) !== near.has(b));
    if (bypassesLock) continue;

    connect(a, b);
  }

  const entranceRoom = rooms[entranceIndex]!;
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
  };
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
