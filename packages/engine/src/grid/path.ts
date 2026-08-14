/**
 * Pathfinding: A* over the tile map.
 *
 * Runs for every creature that moves, every turn, so it uses a binary heap
 * rather than scanning an array for the cheapest node — the difference is
 * invisible on a small room and very visible in a large cavern with a dozen
 * combatants.
 *
 * Movement cost comes from the module: each terrain declares a `moveCost` and
 * each movement mode a `terrainMultiplier`, so a swimmer crosses water cheaply
 * and a walker cannot cross it at all. The engine contributes only the search.
 *
 * Determinism matters as much as speed. Ties are broken by insertion order, so
 * the same request always returns the same path — a replay that diverged
 * because two routes tied would be very hard to debug.
 */

import { key } from './tiles.js';
import type { Position, TileMap, TerrainIndex } from './tiles.js';
import { DIRECTIONS } from './tiles.js';
import { distance } from './geometry.js';

/** A minimal binary heap keyed on cost, stable on insertion order. */
class Heap<T> {
  private readonly items: { value: T; cost: number; order: number }[] = [];
  private counter = 0;

  get size(): number {
    return this.items.length;
  }

  push(value: T, cost: number): void {
    this.items.push({ value, cost, order: this.counter++ });
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.less(index, parent)) {
        this.swap(index, parent);
        index = parent;
      } else break;
    }
  }

  pop(): T | undefined {
    const top = this.items[0];
    if (top === undefined) return undefined;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.items.length && this.less(left, smallest)) smallest = left;
        if (right < this.items.length && this.less(right, smallest)) smallest = right;
        if (smallest === index) break;
        this.swap(index, smallest);
        index = smallest;
      }
    }
    return top.value;
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a]!;
    const y = this.items[b]!;
    // Insertion order breaks ties, which is what keeps paths reproducible.
    return x.cost !== y.cost ? x.cost < y.cost : x.order < y.order;
  }

  private swap(a: number, b: number): void {
    const temp = this.items[a]!;
    this.items[a] = this.items[b]!;
    this.items[b] = temp;
  }
}

export interface PathOptions {
  readonly map: TileMap;
  readonly terrain: TerrainIndex;
  readonly from: Position;
  readonly to: Position;
  /** Movement modes the mover has, e.g. `["walk", "swim"]`. */
  readonly modes?: readonly string[];
  /** Multiplier on terrain cost, from the mode being used. */
  readonly terrainMultiplier?: number;
  /** Tiles that cannot be entered — other creatures, usually. */
  readonly blocked?: ReadonlySet<number>;
  /** Give up after this much accumulated cost. */
  readonly maxCost?: number;
  /** Whether diagonal steps are allowed. */
  readonly diagonal?: boolean;
  /**
   * Stop on reaching any tile adjacent to the goal rather than the goal itself
   * — what a melee attacker wants, since the target's own tile is occupied.
   */
  readonly adjacentIsEnough?: boolean;
}

export interface Path {
  /** Tiles from the step after `from` through the destination. Empty if none. */
  readonly steps: readonly Position[];
  readonly cost: number;
  readonly found: boolean;
}

const NO_PATH: Path = { steps: [], cost: Infinity, found: false };

/** Find the cheapest path, or {@link NO_PATH} when none exists within budget. */
export function findPath(options: PathOptions): Path {
  const { map, terrain, from, to } = options;
  const modes = options.modes ?? [];
  const multiplier = options.terrainMultiplier ?? 1;
  const blocked = options.blocked ?? new Set<number>();
  const maxCost = options.maxCost ?? Infinity;
  const diagonal = options.diagonal !== false;
  const goalKey = key(to);

  const reached = (position: Position): boolean =>
    options.adjacentIsEnough ? distance(position, to) <= 1 : position.x === to.x && position.y === to.y;

  if (reached(from)) return { steps: [], cost: 0, found: true };

  const cameFrom = new Map<number, Position>();
  const costSoFar = new Map<number, number>([[key(from), 0]]);
  const frontier = new Heap<Position>();
  frontier.push(from, 0);

  const offsets = diagonal ? DIRECTIONS : DIRECTIONS.filter((d) => d.x === 0 || d.y === 0);

  while (frontier.size > 0) {
    const current = frontier.pop()!;
    const currentKey = key(current);

    if (reached(current)) return reconstruct(cameFrom, current, from, costSoFar.get(currentKey) ?? 0);

    const currentCost = costSoFar.get(currentKey) ?? 0;

    for (const offset of offsets) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const nextKey = key(next);

      // The goal itself may be occupied — that is the normal case when moving
      // to attack — so an occupied goal is still worth reaching.
      if (blocked.has(nextKey) && nextKey !== goalKey) continue;

      const step = terrain.costOf(map, next, modes);
      if (!Number.isFinite(step)) continue;

      const newCost = currentCost + step * multiplier;
      if (newCost > maxCost) continue;

      const previous = costSoFar.get(nextKey);
      if (previous !== undefined && newCost >= previous) continue;

      costSoFar.set(nextKey, newCost);
      cameFrom.set(nextKey, current);
      // Chebyshev heuristic matches the movement model, so A* stays admissible.
      frontier.push(next, newCost + distance(next, to));
    }
  }

  return NO_PATH;
}

function reconstruct(
  cameFrom: ReadonlyMap<number, Position>,
  goal: Position,
  start: Position,
  cost: number,
): Path {
  const steps: Position[] = [];
  let current: Position | undefined = goal;

  while (current && !(current.x === start.x && current.y === start.y)) {
    steps.push(current);
    current = cameFrom.get(key(current));
  }

  steps.reverse();
  return { steps, cost, found: true };
}

/**
 * Every tile reachable within a movement budget, with what it costs to get
 * there. This is what draws the "where can I move" highlight, and what an AI
 * uses to decide where to stand.
 */
export function reachable(
  options: Omit<PathOptions, 'to' | 'adjacentIsEnough'> & { budget: number },
): Map<number, number> {
  const { map, terrain, from, budget } = options;
  const modes = options.modes ?? [];
  const multiplier = options.terrainMultiplier ?? 1;
  const blocked = options.blocked ?? new Set<number>();
  const diagonal = options.diagonal !== false;

  const costs = new Map<number, number>([[key(from), 0]]);
  const frontier = new Heap<Position>();
  frontier.push(from, 0);

  const offsets = diagonal ? DIRECTIONS : DIRECTIONS.filter((d) => d.x === 0 || d.y === 0);

  while (frontier.size > 0) {
    const current = frontier.pop()!;
    const currentCost = costs.get(key(current)) ?? 0;

    for (const offset of offsets) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const nextKey = key(next);
      if (blocked.has(nextKey)) continue;

      const step = terrain.costOf(map, next, modes);
      if (!Number.isFinite(step)) continue;

      const newCost = currentCost + step * multiplier;
      if (newCost > budget) continue;

      const previous = costs.get(nextKey);
      if (previous !== undefined && newCost >= previous) continue;

      costs.set(nextKey, newCost);
      frontier.push(next, newCost);
    }
  }

  costs.delete(key(from));
  return costs;
}

/**
 * Flood fill of everything connected to a start tile.
 *
 * Used by generation to prove a dungeon has no sealed-off rooms — the property
 * test that keeps a generator from producing an unplayable map.
 */
export function floodFill(
  map: TileMap,
  terrain: TerrainIndex,
  from: Position,
  modes: readonly string[] = [],
): Set<number> {
  const seen = new Set<number>();
  if (!terrain.isPassable(map, from, modes)) return seen;

  const stack: Position[] = [from];
  seen.add(key(from));

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const offset of DIRECTIONS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const nextKey = key(next);
      if (seen.has(nextKey)) continue;
      if (!terrain.isPassable(map, next, modes)) continue;
      seen.add(nextKey);
      stack.push(next);
    }
  }

  return seen;
}
