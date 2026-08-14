/**
 * Targeting: who can be hit, from where.
 *
 * This is where the grid earns its cost. Range, reach, line of sight, cover,
 * and area shapes are all real geometry rather than tags, so a wall genuinely
 * protects you and a fireball genuinely catches your own party if you aim it
 * badly.
 *
 * Distances are in **tiles**. The module measures range in its own units — feet,
 * by convention — so conversion happens once, here, using the tile size derived
 * from `rules.sizes`.
 */

import type { CompiledModule } from '@dm/module';
import type { GameState, Entity, EntityId } from '../../state.js';
import { TerrainIndex } from '../../grid/tiles.js';
import type { Position } from '../../grid/tiles.js';
import { distance, area } from '../../grid/geometry.js';
import type { AreaShape } from '../../grid/geometry.js';
import { hasLineOfSight } from '../../grid/fov.js';
import { stanceOf } from '../../sim/senses.js';

/** Fallback tile size when a module declares no sizes. */
const DEFAULT_TILE_SIZE = 5;

/**
 * How many module units one tile represents.
 *
 * Taken from the smallest declared size's `space`, since that is the creature
 * that fits in exactly one tile.
 */
export function tileSize(module: CompiledModule): number {
  const sizes = module.all<{ space: number }>('rules.sizes');
  if (sizes.length === 0) return DEFAULT_TILE_SIZE;
  return Math.min(...sizes.map((size) => size.space || DEFAULT_TILE_SIZE));
}

/** Convert a module distance into tiles, rounding down. */
export function toTiles(module: CompiledModule, units: number): number {
  const size = tileSize(module);
  return size > 0 ? Math.floor(units / size) : units;
}

/** A creature's reach in tiles: its size's natural reach, at least one. */
export function reachOf(module: CompiledModule, entity: Entity): number {
  if (!entity.statblock) return 1;
  const statblock = module.find<{ size?: string }>('content.monsters', entity.statblock);
  if (!statblock?.size) return 1;
  const size = module.find<{ reach: number }>('rules.sizes', statblock.size);
  return size ? Math.max(1, toTiles(module, size.reach)) : 1;
}

/** Movement allowance in tiles for one turn. */
export function speedOf(module: CompiledModule, entity: Entity): number {
  let best = 0;
  for (const modeId of entity.movementModes) {
    const mode = module.find<{ defaultSpeed: number }>('rules.movementModes', modeId);
    let speed = mode?.defaultSpeed ?? 0;

    if (entity.statblock) {
      const statblock = module.find<{ speeds?: Record<string, number> }>('content.monsters', entity.statblock);
      speed = statblock?.speeds?.[modeId] ?? speed;
    }
    best = Math.max(best, toTiles(module, speed));
  }
  // Creeping is slower than walking, and running is not free either.
  const stance = stanceOf(module, entity);
  if (stance) best = Math.floor(best * stance.speedMultiplier);

  // A creature with no declared movement still shuffles one tile; being unable
  // to move at all should come from a condition, not from missing data.
  return Math.max(1, best);
}

export interface TargetingContext {
  readonly module: CompiledModule;
  readonly state: GameState;
  readonly terrain: TerrainIndex;
}

/** Living entities on the same map as the actor. */
export function combatants(state: GameState, map: string): Entity[] {
  return Object.values(state.entities).filter((entity) => entity.alive && entity.map === map);
}

/** Whether two entities are on opposing sides. */
export function isHostileTo(actor: Entity, other: Entity): boolean {
  if (actor.disposition === 'hostile') return other.disposition !== 'hostile';
  return other.disposition === 'hostile';
}

export interface Reachability {
  readonly inRange: boolean;
  readonly hasSight: boolean;
  /** Distance in tiles. */
  readonly distance: number;
  /** Cover the target benefits from, if any. */
  readonly cover: string | null;
}

/**
 * Whether a target can be reached from a position, and what protects it.
 *
 * Cover is read from the terrain between the two — a creature standing behind
 * rubble is harder to hit, and the module decides how much by declaring the
 * cover type on the terrain.
 */
export function reachability(
  context: TargetingContext,
  from: Position,
  to: Position,
  range: number,
): Reachability {
  const map = context.state.maps[context.state.currentMap];
  const gap = distance(from, to);

  if (!map) return { inRange: false, hasSight: false, distance: gap, cover: null };

  const hasSight = hasLineOfSight(map.tiles, context.terrain, from, to);

  // Cover comes from the tile immediately adjacent to the target along the
  // line of fire — the thing it is standing behind.
  let cover: string | null = null;
  if (hasSight && gap > 1) {
    for (const offset of [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }]) {
      const beside = { x: to.x + offset.x, y: to.y + offset.y };
      // Only terrain between shooter and target counts as cover.
      if (distance(beside, from) >= gap) continue;
      const provided = context.terrain.at(map.tiles, beside).providesCover;
      if (provided) {
        cover = provided;
        break;
      }
    }
  }

  return { inRange: gap <= range, hasSight, distance: gap, cover };
}

/** Defence bonus granted by a cover type. */
export function coverBonus(module: CompiledModule, cover: string | null): number {
  if (!cover) return 0;
  const definition = module.find<{ defenceBonus: number }>('rules.coverTypes', cover);
  return definition?.defenceBonus ?? 0;
}

interface AbilityDef {
  id: string;
  range: number;
  targeting: 'self' | 'single' | 'allEnemies' | 'allAllies' | 'all' | 'none';
  areaOfEffect?: { shape: AreaShape; size: number; affects: 'all' | 'enemies' | 'allies' | 'others' };
}

/**
 * Everyone an ability would affect.
 *
 * Area abilities catch whoever is standing in the shape, including the caster's
 * own party — `affects` is how content narrows that, and a module that leaves
 * it at `all` gets friendly fire, which is usually the intent.
 */
export function resolveTargets(
  context: TargetingContext,
  actor: Entity,
  ability: AbilityDef,
  explicit: { target?: EntityId; at?: Position },
): { targets: Entity[]; tiles: Position[]; reason: string | null } {
  const { module, state } = context;
  const present = combatants(state, actor.map);
  const range = Math.max(0, toTiles(module, ability.range));

  // An area ability is resolved by its shape rather than by the target list.
  if (ability.areaOfEffect) {
    const origin = explicit.at
      ?? (explicit.target ? state.entities[explicit.target]?.position : undefined)
      ?? actor.position;

    const check = reachability(context, actor.position, origin, Math.max(range, 1));
    if (!check.inRange) return { targets: [], tiles: [], reason: 'out of range' };
    if (!check.hasSight) return { targets: [], tiles: [], reason: 'no line of sight' };

    const tiles = area({
      shape: ability.areaOfEffect.shape,
      size: Math.max(1, toTiles(module, ability.areaOfEffect.size)),
      origin,
      toward: origin,
    });
    const covered = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));

    const affects = ability.areaOfEffect.affects;
    const targets = present.filter((entity) => {
      if (!covered.has(`${entity.position.x},${entity.position.y}`)) return false;
      if (affects === 'enemies') return isHostileTo(actor, entity);
      if (affects === 'allies') return !isHostileTo(actor, entity) && entity.id !== actor.id;
      if (affects === 'others') return entity.id !== actor.id;
      return true;
    });

    return { targets, tiles, reason: null };
  }

  switch (ability.targeting) {
    case 'self':
      return { targets: [actor], tiles: [actor.position], reason: null };

    case 'none':
      return { targets: [], tiles: [], reason: null };

    case 'allEnemies':
    case 'allAllies':
    case 'all': {
      const wanted = present.filter((entity) => {
        if (ability.targeting === 'allEnemies') return isHostileTo(actor, entity);
        if (ability.targeting === 'allAllies') return !isHostileTo(actor, entity);
        return true;
      });
      // Even a sweeping ability only reaches what it can see and get to.
      const reachable = wanted.filter((entity) => {
        const check = reachability(context, actor.position, entity.position, Math.max(range, 1));
        return check.inRange && check.hasSight;
      });
      return { targets: reachable, tiles: reachable.map((e) => e.position), reason: null };
    }

    default: {
      if (!explicit.target) return { targets: [], tiles: [], reason: 'no target' };
      const target = state.entities[explicit.target];
      if (!target || !target.alive) return { targets: [], tiles: [], reason: 'nothing there' };
      if (target.map !== actor.map) return { targets: [], tiles: [], reason: 'not here' };

      const effectiveRange = Math.max(range, reachOf(module, actor));
      const check = reachability(context, actor.position, target.position, effectiveRange);
      if (!check.inRange) return { targets: [], tiles: [], reason: 'out of reach' };
      if (!check.hasSight) return { targets: [], tiles: [], reason: 'no line of sight' };

      return { targets: [target], tiles: [target.position], reason: null };
    }
  }
}

/** The nearest hostile an actor can see, for AI target selection. */
export function nearestHostile(
  context: TargetingContext,
  actor: Entity,
  options: { readonly range?: number } = {},
): Entity | null {
  const map = context.state.maps[actor.map];
  if (!map) return null;

  // Uncapped unless a caller says otherwise. How far a creature can notice
  // something is a question about *that creature*, so the limit belongs to
  // whoever is asking rather than being baked into a shared query.
  const limit = options.range ?? Infinity;

  let best: Entity | null = null;
  let bestDistance = Infinity;

  for (const other of combatants(context.state, actor.map)) {
    if (other.id === actor.id || !isHostileTo(actor, other)) continue;
    if (!hasLineOfSight(map.tiles, context.terrain, actor.position, other.position)) continue;

    const gap = distance(actor.position, other.position);
    if (gap > limit) continue;
    // Ties break on entity id so AI target choice stays reproducible.
    if (gap < bestDistance || (gap === bestDistance && best && other.id < best.id)) {
      best = other;
      bestDistance = gap;
    }
  }
  return best;
}
