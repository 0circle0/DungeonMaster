/**
 * Room degree: how many ways in and out of a room there are.
 *
 * `roomTemplates[].minExits`/`maxExits` were validated against each other and
 * then ignored — room degree was whatever the spanning tree plus random loops
 * produced. Here they finally bite:
 *
 *   - the spanning tree refuses to attach new rooms through a room already at
 *     its `maxExits`, so a `maxExits: 1` boss cell ends up a leaf;
 *   - after locking, rooms under their `minExits` get extra nearest-neighbour
 *     connections, without ever bypassing a lock;
 *   - branchiness loops respect `maxExits` too.
 *
 * **Connectivity always wins.** When every connected room is saturated the cap
 * is relaxed on the lowest-degree one — a dungeon you cannot cross is worse
 * than a room with one door too many, and the static lint warns the author
 * long before this code has to choose.
 *
 * Everything here is deterministic — nearest-neighbour with index tie-breaks —
 * so it consumes no rng at all.
 */

import type { Position } from '../../grid/tiles.js';

export interface DegreeLimits {
  readonly min: number;
  readonly max: number;
}

interface Node {
  readonly centre: Position;
}

const distanceOf = (a: Position, b: Position) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Prim-style spanning tree over room centres, honouring `maxExits`.
 *
 * Identical to the old nearest-neighbour tree when no template declares a cap
 * (every room defaults to Infinity), which keeps the untouched-module diff to
 * the corridor changes alone.
 */
export function degreeTree(
  rooms: readonly Node[],
  limits: readonly DegreeLimits[],
): [number, number][] {
  if (rooms.length < 2) return [];

  const degree = new Array<number>(rooms.length).fill(0);
  const connected = new Set<number>([0]);
  const edges: [number, number][] = [];

  while (connected.size < rooms.length) {
    let best: { from: number; to: number; distance: number } | null = null;
    let relaxed: { from: number; to: number; distance: number } | null = null;

    for (const from of connected) {
      for (let to = 0; to < rooms.length; to += 1) {
        if (connected.has(to)) continue;
        const distance = distanceOf(rooms[from]!.centre, rooms[to]!.centre);

        // The relaxed candidate ignores caps entirely, preferring the
        // lowest-degree attachment point so a forced violation lands where it
        // does least harm. Ties break on distance then index, as ever.
        if (
          !relaxed ||
          degree[from]! < degree[relaxed.from]! ||
          (degree[from] === degree[relaxed.from] && distance < relaxed.distance)
        ) {
          relaxed = { from, to, distance };
        }

        if (degree[from]! >= (limits[from]?.max ?? Infinity)) continue;
        if (!best || distance < best.distance) best = { from, to, distance };
      }
    }

    const chosen = best ?? relaxed;
    if (!chosen) break;
    edges.push([chosen.from, chosen.to]);
    degree[chosen.from]! += 1;
    degree[chosen.to]! += 1;
    connected.add(chosen.to);
  }

  return edges;
}

/** Degree of every node under a set of edges. */
export function degreesOf(count: number, edges: readonly [number, number][]): number[] {
  const degree = new Array<number>(count).fill(0);
  for (const [a, b] of edges) {
    degree[a]! += 1;
    degree[b]! += 1;
  }
  return degree;
}

/**
 * Extra edges that raise every under-`minExits` room toward its floor.
 *
 * Runs after locking, so a candidate that would join the two sides of a locked
 * door is rejected the same way branchiness loops are — the key-before-lock
 * argument stays intact. An unsatisfiable minimum is simply left short; the
 * lint said so at author time.
 */
export function raiseToMinDegrees(
  rooms: readonly Node[],
  existing: readonly [number, number][],
  limits: readonly DegreeLimits[],
  bypassesLock: (a: number, b: number) => boolean,
  /** Whether the algorithm can physically connect this pair (BSP: adjacency). */
  canConnect: (a: number, b: number) => boolean = () => true,
): [number, number][] {
  const degree = degreesOf(rooms.length, existing);
  const has = new Set(existing.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  const added: [number, number][] = [];

  for (let room = 0; room < rooms.length; room += 1) {
    const min = limits[room]?.min ?? 0;

    while (degree[room]! < min) {
      // Nearest room with headroom that is not already a neighbour and does
      // not bridge a lock. Deterministic: distance, then index.
      let pick = -1;
      let pickDistance = Infinity;
      for (let other = 0; other < rooms.length; other += 1) {
        if (other === room) continue;
        if (has.has(`${Math.min(room, other)}-${Math.max(room, other)}`)) continue;
        if (degree[other]! >= (limits[other]?.max ?? Infinity)) continue;
        if (bypassesLock(room, other)) continue;
        if (!canConnect(room, other)) continue;
        const distance = distanceOf(rooms[room]!.centre, rooms[other]!.centre);
        if (distance < pickDistance) {
          pick = other;
          pickDistance = distance;
        }
      }
      if (pick === -1) break;

      added.push([room, pick]);
      has.add(`${Math.min(room, pick)}-${Math.max(room, pick)}`);
      degree[room]! += 1;
      degree[pick]! += 1;
    }
  }

  return added;
}
