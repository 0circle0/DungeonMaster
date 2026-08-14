/**
 * Deriving a character's numbers from the module's formulas.
 *
 * Nothing here knows what an attribute *means*. It reads `rules.attributes`,
 * evaluates each one's `modifier` expression, then feeds the results to the
 * resource and derived-stat formulas.
 *
 * **Evaluation order is a contract**, because the formulas reference each
 * other:
 *
 *   1. `attributes` — stored on the entity, depends on nothing
 *   2. `mod`        — from each attribute's `modifier`, sees only `value`
 *   3. `max`        — resource maxima, may see `attr`, `mod`, `level`
 *   4. `derived`    — may additionally see `res` and `max`
 *
 * A resource maximum therefore cannot depend on a derived stat. That is a
 * deliberate restriction: allowing both directions would let a module express
 * a cycle (Guard from HP from Guard) that could only be caught at runtime.
 */

import { Rng } from '@dm/core';
import type { CompiledModule, Value, Expr, Scope, DslRng } from '@dm/module';
import { evalExpr } from '@dm/module';
import type { Entity, GameState } from './state.js';

/** Formulas must not consume randomness; a stat that changes when re-read is a bug. */
const FORBIDDEN_RNG: Rng = Rng.fromSeed(0);

interface AttributeDef {
  id: string;
  modifier: Expr;
  min: number;
  max: number;
  default: number;
}

interface ResourceDef {
  id: string;
  max: Expr;
  min: Expr;
  initial?: Expr;
}

interface DerivedDef {
  id: string;
  formula: Expr;
}

interface ItemDef {
  id: string;
  modifiers: Record<string, Expr>;
}

interface ConditionDef {
  id: string;
  modifiers: Record<string, Expr>;
}

function evaluate(expr: Expr, scope: Scope, what: string): number {
  const value = evalExpr(expr, { scope, rng: FORBIDDEN_RNG });
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${what} must evaluate to a number, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Step 2: attribute modifiers. Each `modifier` sees only `{ value }`. */
export function modifiersOf(
  module: CompiledModule,
  attributes: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const attr of module.all<AttributeDef>('rules.attributes')) {
    const score = attributes[attr.id] ?? attr.default;
    out[attr.id] = evaluate(attr.modifier, { value: score }, `modifier for ${attr.id}`);
  }
  return out;
}

/** The scope a formula sees before maxima are known. */
function baseScope(entity: Entity, mods: Record<string, number>): Scope {
  return {
    actor: {
      id: entity.id,
      name: entity.name,
      level: entity.level,
      xp: entity.xp,
      attr: entity.attributes as Record<string, Value>,
      mod: mods,
      res: entity.resources as Record<string, Value>,
    },
  };
}

/** Step 3: resource maxima. */
export function maximaOf(
  module: CompiledModule,
  entity: Entity,
  mods: Record<string, number>,
): Record<string, number> {
  const scope = baseScope(entity, mods);
  const out: Record<string, number> = {};
  for (const resource of module.all<ResourceDef>('rules.resources')) {
    out[resource.id] = Math.max(0, Math.floor(evaluate(resource.max, scope, `max of ${resource.id}`)));
  }
  return out;
}

/**
 * Additive modifiers contributed by equipped items and active conditions.
 *
 * Computing these each time is why derived stats are not stored: equipping a
 * shield or catching fire changes them, and a cached copy would go stale.
 */
function externalModifiers(
  module: CompiledModule,
  entity: Entity,
  scope: Scope,
): Record<string, number> {
  const out: Record<string, number> = {};

  const add = (id: string, amount: number) => {
    out[id] = (out[id] ?? 0) + amount;
  };

  for (const itemIds of Object.values(entity.equipped)) {
    for (const itemId of itemIds) {
      const item = module.find<ItemDef>('content.items', itemId);
      if (!item) continue;
      for (const [statId, expr] of Object.entries(item.modifiers)) {
        add(statId, evaluate(expr, scope, `modifier from item ${itemId}`));
      }
    }
  }

  for (const active of entity.conditions) {
    const condition = module.find<ConditionDef>('rules.conditions', active.condition);
    if (!condition) continue;
    for (const [statId, expr] of Object.entries(condition.modifiers)) {
      const magnitudeScope: Scope = { ...scope, magnitude: active.magnitude ?? 1 };
      add(statId, evaluate(expr, magnitudeScope, `modifier from condition ${active.condition}`));
    }
  }

  return out;
}

/** Step 4: derived stats, including gear and condition modifiers. */
export function derivedOf(
  module: CompiledModule,
  entity: Entity,
  mods: Record<string, number>,
  maxima: Record<string, number>,
): Record<string, number> {
  const scope: Scope = {
    actor: {
      ...(baseScope(entity, mods)['actor'] as Record<string, Value>),
      max: maxima,
    },
  };

  const external = externalModifiers(module, entity, scope);
  const out: Record<string, number> = {};
  for (const stat of module.all<DerivedDef>('rules.derivedStats')) {
    const base = evaluate(stat.formula, scope, `formula for ${stat.id}`);
    out[stat.id] = Math.floor(base + (external[stat.id] ?? 0));
  }
  return out;
}

/** Every computed number for an entity, in dependency order. */
export interface EntityStats {
  readonly mod: Readonly<Record<string, number>>;
  readonly max: Readonly<Record<string, number>>;
  readonly derived: Readonly<Record<string, number>>;
}

export function statsOf(module: CompiledModule, entity: Entity): EntityStats {
  const mod = modifiersOf(module, entity.attributes);
  const max = maximaOf(module, entity, mod);
  const derived = derivedOf(module, entity, mod, max);
  return { mod, max, derived };
}

/**
 * Namespaces where a missing key means "not yet" rather than "typo".
 *
 * Flags, quests, and memory are written during play and are legitimately empty
 * at the start — content asking about a flag nobody has set is normal. Anything
 * structural (`actor.attr`, `actor.derived`) stays strict, so a misspelling
 * there is still an error rather than a silent zero.
 */
export const OPEN_NAMESPACES = ['flags', 'quests', 'memory', 'reputation', 'rank', 'tiers', 'ranks'] as const;

/** The evaluation context the engine uses everywhere. */
export function evalContext(scope: Scope, rng: DslRng): { scope: Scope; rng: DslRng; openNamespaces: readonly string[] } {
  return { scope, rng, openNamespaces: OPEN_NAMESPACES };
}

/**
 * The scope handed to the DSL during play.
 *
 * Every readable value the content can reference lives here, which is why the
 * DSL needs no game-specific primitives: `flags.met_vess` and
 * `actor.res.vitality` are ordinary paths.
 */
export function buildScope(
  module: CompiledModule,
  state: GameState,
  actor: Entity,
  extra: Scope = {},
): Scope {
  const stats = statsOf(module, actor);
  const conditions: Record<string, Value> = {};
  for (const active of actor.conditions) {
    conditions[active.condition] = active.remaining ?? true;
  }
  const inventory: Record<string, Value> = {};
  for (const stack of actor.inventory) {
    inventory[stack.item] = (inventory[stack.item] as number | undefined ?? 0) + stack.quantity;
  }

  // Equipped items are counted separately, so a requirement can insist a blade
  // is drawn rather than merely carried.
  const equippedItems: Record<string, Value> = {};
  for (const slot of Object.values(actor.equipped)) {
    for (const item of slot) {
      equippedItems[item] = (equippedItems[item] as number | undefined ?? 0) + 1;
    }
  }

  // Quest and memory state, in the shape `compileRequirement` reads them.
  const quests: Record<string, Value> = {};
  for (const [id, quest] of Object.entries(state.quests)) {
    const objectives: Record<string, Value> = {};
    for (const objective of quest.completedObjectives) objectives[objective] = true;
    quests[id] = { status: quest.status, objectives };
  }

  return {
    actor: {
      id: actor.id,
      name: actor.name,
      level: actor.level,
      xp: actor.xp,
      alive: actor.alive,
      attr: actor.attributes as Record<string, Value>,
      mod: stats.mod,
      res: actor.resources as Record<string, Value>,
      max: stats.max,
      derived: stats.derived,
      conditions,
      inventory,
      equippedItems,
      abilities: [...actor.abilities],
      skills: actor.skills as Record<string, Value>,
      ancestry: actor.ancestry,
      class: actor.characterClass,
    },
    quests,
    flags: state.flags,
    reputation: state.reputation,
    world: {
      minute: state.minute,
      day: Math.floor(state.minute / module.source.world.time.minutesPerDay) + 1,
    },
    party: state.party.map((id) => {
      const member = state.entities[id];
      return member ? { id: member.id, name: member.name, alive: member.alive } : null;
    }),
    ...extra,
  };
}
