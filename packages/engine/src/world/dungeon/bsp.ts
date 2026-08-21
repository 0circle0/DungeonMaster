/** BSP interiors: the made place. */

import type { Rng } from '@dm/core';
import { MapBuilder } from '../../grid/tiles.js';
import type { Position } from '../../grid/tiles.js';
import type { Palette } from '../mapgen.js';
import type { PlaceableTemplate, PlacedRoom } from './rooms.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BspLayout {
  readonly rooms: PlacedRoom[];
  readonly tree: [number, number][];
  /** Door punch position per tree edge, aligned with `tree`. */
  readonly treeCrossings: { edge: [number, number]; crossings: Position[] }[];
}

/** A leaf is never split below this, walls included. */
const DEFAULT_MIN_LEAF = 5;

/** Split the bounds into at least `count` leaves and carve them. */
export function bspLayout(
  builder: MapBuilder,
  templates: PlaceableTemplate[],
  count: number,
  guaranteedRoles: readonly string[],
  palette: Palette,
  rng: Rng,
  minLeaf: number = DEFAULT_MIN_LEAF,
): BspLayout {
  const MIN_LEAF = minLeaf;
  const bounds: Rect = { x: 0, y: 0, width: builder.width, height: builder.height };

  // — split ————————————————————————————————————————————————
  interface Node {
    rect: Rect;
    left?: Node;
    right?: Node;
    /** Vertical split shares a column, horizontal a row. */
    split?: { axis: 'x' | 'y'; at: number };
  }

  const root: Node = { rect: bounds };
  let leaves = 1;

  // Split the largest leaf first, so leaves stay roughly even.
  const splittable = (): Node | null => {
    let best: Node | null = null;
    const walk = (node: Node) => {
      if (node.left && node.right) {
        walk(node.left);
        walk(node.right);
        return;
      }
      const { width, height } = node.rect;
      if (width < MIN_LEAF * 2 - 1 && height < MIN_LEAF * 2 - 1) return;
      if (!best || area(node.rect) > area(best.rect)) best = node;
    };
    walk(root);
    return best;
  };

  while (leaves < count) {
    const node = splittable();
    if (!node) break;
    const { rect } = node;

    // Wider than tall splits vertically, and vice versa; square rects pick by whichever axis has room.
    const canX = rect.width >= MIN_LEAF * 2 - 1;
    const canY = rect.height >= MIN_LEAF * 2 - 1;
    const axis: 'x' | 'y' = canX && canY ? (rect.width >= rect.height ? 'x' : 'y') : canX ? 'x' : 'y';

    const extent = axis === 'x' ? rect.width : rect.height;
    // 40–60% along, clamped so both halves keep MIN_LEAF.
    const low = Math.max(MIN_LEAF - 1, Math.floor(extent * 0.4));
    const high = Math.min(extent - MIN_LEAF, Math.ceil(extent * 0.6));
    const at = low >= high ? low : rng.nextInt(low, high);

    if (axis === 'x') {
      node.left = { rect: { ...rect, width: at + 1 } };
      node.right = { rect: { ...rect, x: rect.x + at, width: rect.width - at } };
      node.split = { axis, at: rect.x + at };
    } else {
      node.left = { rect: { ...rect, height: at + 1 } };
      node.right = { rect: { ...rect, y: rect.y + at, height: rect.height - at } };
      node.split = { axis, at: rect.y + at };
    }
    leaves += 1;
  }

  // — collect leaves, in-order, and assign templates ————————
  const leafRects: Rect[] = [];
  const collect = (node: Node) => {
    if (node.left && node.right) {
      collect(node.left);
      collect(node.right);
      return;
    }
    leafRects.push(node.rect);
  };
  collect(root);

  // Same draw-order rules as the rooms algorithm: one of each guaranteed role, filler for the rest.
  const ordered: PlaceableTemplate[] = [];
  const guaranteed = new Set(guaranteedRoles);
  for (const role of guaranteedRoles) {
    const options = templates.filter((entry) => entry.role === role);
    if (options.length > 0) ordered.push(rng.weightedPick(options, (entry) => entry.weight ?? 1));
  }
  const filler = templates.filter((entry) => !guaranteed.has(entry.role));
  const fillerPool = filler.length > 0 ? filler : templates;
  while (ordered.length < leafRects.length) {
    ordered.push(rng.weightedPick(fillerPool, (entry) => entry.weight ?? 1));
  }

  const rooms: PlacedRoom[] = leafRects.map((rect, index) => {
    const template = ordered[index]!;
    return {
      id: `r${index}`,
      template: template.id,
      role: index < guaranteedRoles.length
        ? template.role
        : (guaranteed.has(template.role) ? 'chamber' : template.role),
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      centre: { x: rect.x + Math.floor(rect.width / 2), y: rect.y + Math.floor(rect.height / 2) },
    };
  });

  // --- carve: whole field wall, then every leaf's interior floored ---
  for (const room of rooms) {
    builder.fillRect(room.x + 1, room.y + 1, room.width - 2, room.height - 2, palette.floor);
  }

  // --- connect: the leaf pair sharing the longest boundary, door at its midpoint ---
  const tree: [number, number][] = [];
  const treeCrossings: { edge: [number, number]; crossings: Position[] }[] = [];

  const leafIndex = new Map(leafRects.map((rect, index) => [rect, index] as const));
  const leavesUnder = (node: Node): Rect[] => {
    if (node.left && node.right) return [...leavesUnder(node.left), ...leavesUnder(node.right)];
    return [node.rect];
  };

  const connectSplits = (node: Node) => {
    if (!node.left || !node.right || !node.split) return;
    connectSplits(node.left);
    connectSplits(node.right);

    const leftLeaves = leavesUnder(node.left);
    const rightLeaves = leavesUnder(node.right);

    let best: { a: Rect; b: Rect; overlap: [number, number] } | null = null;
    for (const a of leftLeaves) {
      for (const b of rightLeaves) {
        const overlap = sharedWall(a, b, node.split);
        if (!overlap) continue;
        const span = overlap[1] - overlap[0];
        if (!best || span > best.overlap[1] - best.overlap[0]) best = { a, b, overlap };
      }
    }
    if (!best) return;

    const a = leafIndex.get(best.a)!;
    const b = leafIndex.get(best.b)!;
    const mid = Math.floor((best.overlap[0] + best.overlap[1]) / 2);
    const at: Position =
      node.split.axis === 'x' ? { x: node.split.at, y: mid } : { x: mid, y: node.split.at };

    builder.set(at.x, at.y, palette.floor);
    tree.push([a, b]);
    treeCrossings.push({ edge: [a, b], crossings: [at] });
  };
  connectSplits(root);

  return { rooms, tree, treeCrossings };
}

function area(rect: Rect): number {
  return rect.width * rect.height;
}

/** The interior span two leaves share along a split line, or null when they do not touch. */
function sharedWall(
  a: Rect,
  b: Rect,
  split: { axis: 'x' | 'y'; at: number },
): [number, number] | null {
  if (split.axis === 'x') {
    if (a.x + a.width - 1 !== split.at || b.x !== split.at) return null;
    const lo = Math.max(a.y + 1, b.y + 1);
    const hi = Math.min(a.y + a.height - 2, b.y + b.height - 2);
    return lo <= hi ? [lo, hi] : null;
  }
  if (a.y + a.height - 1 !== split.at || b.y !== split.at) return null;
  const lo = Math.max(a.x + 1, b.x + 1);
  const hi = Math.min(a.x + a.width - 2, b.x + b.width - 2);
  return lo <= hi ? [lo, hi] : null;
}

/** Where a door between two rooms would go, or null when they do not share a wall. */
export function findPunch(a: PlacedRoom, b: PlacedRoom): Position | null {
  // Vertical shared wall: a's right edge is b's left edge, or vice versa.
  const vertical = (left: PlacedRoom, right: PlacedRoom): Position | null => {
    if (left.x + left.width - 1 !== right.x) return null;
    const lo = Math.max(left.y + 1, right.y + 1);
    const hi = Math.min(left.y + left.height - 2, right.y + right.height - 2);
    if (lo > hi) return null;
    return { x: right.x, y: Math.floor((lo + hi) / 2) };
  };
  const horizontal = (top: PlacedRoom, bottom: PlacedRoom): Position | null => {
    if (top.y + top.height - 1 !== bottom.y) return null;
    const lo = Math.max(top.x + 1, bottom.x + 1);
    const hi = Math.min(top.x + top.width - 2, bottom.x + bottom.width - 2);
    if (lo > hi) return null;
    return { x: Math.floor((lo + hi) / 2), y: bottom.y };
  };

  return vertical(a, b) ?? vertical(b, a) ?? horizontal(a, b) ?? horizontal(b, a);
}

/** A door punch between two adjacent rooms, for minExits raising and branchiness loops. */
export function punchAdjacent(
  builder: MapBuilder,
  a: PlacedRoom,
  b: PlacedRoom,
  palette: Palette,
): Position | null {
  const at = findPunch(a, b);
  if (!at) return null;
  builder.set(at.x, at.y, palette.floor);
  return at;
}
