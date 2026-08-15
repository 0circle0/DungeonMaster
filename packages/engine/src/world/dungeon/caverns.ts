/**
 * Cellular caverns: the place nobody built.
 *
 * A noise fill smoothed by a few automaton passes produces organic chambers
 * and squeezes; the largest connected body of floor is kept and every smaller
 * pocket is filled back in, so the one component invariant holds by
 * construction rather than by digging.
 *
 * A cavern has no doors, so it has no locks and no branchiness — the lint
 * warns when a module authors either. Rooms still exist, as **pseudo-rooms**:
 * farthest-point samples across the floor that give `populateDungeon`
 * somewhere to put monsters, loot, and traps, and give `descriptionKey` a
 * chamber to describe. The entrance is the first sample; the boss holds the
 * chamber farthest from it.
 */

import type { Rng } from '@dm/core';
import { MapBuilder } from '../../grid/tiles.js';
import type { Palette } from '../mapgen.js';
import type { PlaceableTemplate, PlacedRoom } from './rooms.js';

export interface CavernLayout {
  readonly rooms: PlacedRoom[];
  readonly entranceIndex: number;
}

const FILL = 0.45;
const SMOOTHING_PASSES = 4;

/** Carve a cavern into the builder and sample its chambers. */
export function cavernLayout(
  builder: MapBuilder,
  templates: PlaceableTemplate[],
  count: number,
  guaranteedRoles: readonly string[],
  palette: Palette,
  rng: Rng,
): CavernLayout {
  const { width, height } = builder;

  // — fill and smooth ——————————————————————————————————————
  // One boolean grid, mutated in generations; the builder is written once at
  // the end. The outer ring is always wall.
  let wall = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      wall[y * width + x] = edge || rng.chance(FILL) ? 1 : 0;
    }
  }

  for (let pass = 0; pass < SMOOTHING_PASSES; pass += 1) {
    const next = new Uint8Array(wall);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let neighbours = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            neighbours += wall[(y + dy) * width + x + dx]!;
          }
        }
        // The classic majority rule: crowded cells silt up, open ones erode.
        next[y * width + x] = neighbours >= 5 ? 1 : 0;
      }
    }
    wall = next;
  }

  // — keep the largest component ———————————————————————————
  const component = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < wall.length; start += 1) {
    if (wall[start] === 1 || component[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    component[start] = id;
    while (stack.length > 0) {
      const cell = stack.pop()!;
      size += 1;
      const cx = cell % width;
      const cy = Math.floor(cell / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (wall[next] === 1 || component[next] !== -1) continue;
        component[next] = id;
        stack.push(next);
      }
    }
    sizes.push(size);
  }

  const largest = sizes.indexOf(Math.max(0, ...sizes));
  const floor: number[] = [];
  for (let cell = 0; cell < wall.length; cell += 1) {
    if (wall[cell] === 0 && component[cell] === largest) floor.push(cell);
    else wall[cell] = 1;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      builder.set(x, y, wall[y * width + x] === 1 ? palette.wall : palette.floor);
    }
  }

  // A degenerate noise roll can silt the whole field; an empty cavern is a
  // stub chamber rather than a crash, same doctrine as the no-templates case.
  if (floor.length === 0) {
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    builder.fillRect(cx - 2, cy - 2, 5, 5, palette.floor);
    for (let y = cy - 2; y <= cy + 2; y += 1) {
      for (let x = cx - 2; x <= cx + 2; x += 1) floor.push(y * width + x);
    }
  }

  // — pseudo-rooms by farthest-point sampling ———————————————
  // BFS distance over the floor from the chosen set; each new sample is the
  // floor tile farthest from everything chosen so far. Deterministic: the
  // first sample is the lowest packed floor cell, ties break on cell order.
  const chosen: number[] = [floor[0]!];
  const roomCount = Math.max(2, Math.min(count, Math.max(2, Math.floor(floor.length / 12))));

  const distancesFrom = (sources: readonly number[]): Int32Array => {
    const distance = new Int32Array(width * height).fill(-1);
    const queue: number[] = [...sources];
    for (const source of sources) distance[source] = 0;
    let head = 0;
    while (head < queue.length) {
      const cell = queue[head]!;
      head += 1;
      const cx = cell % width;
      const cy = Math.floor(cell / width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (wall[next] === 1 || distance[next] !== -1) continue;
        distance[next] = distance[cell]! + 1;
        queue.push(next);
      }
    }
    return distance;
  };

  while (chosen.length < roomCount) {
    const distance = distancesFrom(chosen);
    let farthest = -1;
    let best = -1;
    for (const cell of floor) {
      if (distance[cell]! > best) {
        best = distance[cell]!;
        farthest = cell;
      }
    }
    if (farthest === -1 || best <= 2) break;
    chosen.push(farthest);
  }

  // The boss chamber is the sample farthest from the entrance, so index order
  // is: entrance first, boss second, the rest as drawn.
  const fromEntrance = distancesFrom([chosen[0]!]);
  const rest = chosen.slice(1).sort((a, b) => fromEntrance[b]! - fromEntrance[a]! || a - b);
  const samples = [chosen[0]!, ...rest];

  // Same template draw-order rules as everywhere else.
  const ordered: PlaceableTemplate[] = [];
  const guaranteed = new Set(guaranteedRoles);
  for (const role of guaranteedRoles) {
    const options = templates.filter((entry) => entry.role === role);
    if (options.length > 0) ordered.push(rng.weightedPick(options, (entry) => entry.weight ?? 1));
  }
  const filler = templates.filter((entry) => !guaranteed.has(entry.role));
  const fillerPool = filler.length > 0 ? filler : templates;
  while (ordered.length < samples.length) {
    ordered.push(rng.weightedPick(fillerPool, (entry) => entry.weight ?? 1));
  }

  // The entrance role must land on sample 0 and the boss on the farthest, so
  // map guaranteed roles positionally: entrance → 0, boss → 1.
  const rooms: PlacedRoom[] = samples.map((cell, index) => {
    const cx = cell % width;
    const cy = Math.floor(cell / width);
    // A 5×5 window around the sample; populate reads its interior.
    const x = Math.max(0, Math.min(width - 5, cx - 2));
    const y = Math.max(0, Math.min(height - 5, cy - 2));
    const template = ordered[index]!;
    return {
      id: `r${index}`,
      template: template.id,
      role: index < guaranteedRoles.length
        ? template.role
        : (guaranteed.has(template.role) ? 'chamber' : template.role),
      x, y, width: 5, height: 5,
      centre: { x: cx, y: cy },
    };
  });

  return { rooms, entranceIndex: 0 };
}
