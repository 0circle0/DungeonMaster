/**
 * Deriving a character's numbers from the module's formulas.
 *
 * Nothing here knows what an attribute means. It reads `rules.attributes`, evaluates each one's
 * `modifier` expression, then feeds the results to the resource and derived-stat formulas.
 *
 * Evaluation order is a contract, because the formulas reference each other:
 *
 *   1. `attributes` — stored on the entity, depends on nothing
 *   2. `mod`        — from each attribute's `modifier`, sees only `value`
 *   3. `max`        — resource maxima, may see `attr`, `mod`, `level`
 *   4. `derived`    — may additionally see `res` and `max`
 *
 * A resource maximum therefore cannot depend on a derived stat, so a module cannot express a cycle
 * that could only be caught at runtime.
 */

import { Rng } from '@dm/core';
import type { CompiledModule, Value, Expr, Scope, DslRng } from '@dm/module';
import { evalExpr } from '@dm/module';
import type { Entity, GameState } from './state.js';
import { dateOf, phaseOf, layerOf } from './sim/clock.js';
import { arcScope } from './sim/arcs.js';
import { threadScope } from './sim/lore.js';
import { memoryScope } from './sim/memoryscope.js';
import { impliedConditions } from './rules/implied.js';

/** Formulas must not consume randomness; a stat that changes when re-read is a bug. */
const FORBIDDEN_RNG: Rng = Rng.fromSeed(0);

interface ClassScopeDef {
  id: string;
  primaryAttribute?: string;
  saveProficiencies?: string[];
}

interface MasteryTierDef {
  id: string;
  atRank: number;
}

interface FactionRankDef {
  id: string;
  ranks?: { id: string; atLeast: number }[];
}

/**
 * The thresholds a requirement compares against: mastery tiers and faction ranks.
 *
 * `compileRequirement` lowers "requires journeyman smithing" to a comparison against
 * `tiers.journeyman`, and "requires the Wardens to trust you" to one against
 * `ranks.wardens.trusted`. Both are pure functions of the module, so they are built once and cached
 * on the module object.
 */
const thresholdCache = new WeakMap<CompiledModule, { tiers: Scope; ranks: Scope }>();

function thresholdsOf(module: CompiledModule): { tiers: Scope; ranks: Scope } {
  const cached = thresholdCache.get(module);
  if (cached) return cached;

  const tiers: Record<string, Value> = {};
  for (const tier of module.all<MasteryTierDef>('rules.masteryTiers')) {
    tiers[tier.id] = tier.atRank;
  }

  // Scoped per faction, so two factions may each name a rank `trusted`.
  const ranks: Record<string, Value> = {};
  for (const faction of module.all<FactionRankDef>('content.factions')) {
    const ladder: Record<string, Value> = {};
    for (const rank of faction.ranks ?? []) ladder[rank.id] = rank.atLeast;
    ranks[faction.id] = ladder;
  }

  const value = { tiers, ranks };
  thresholdCache.set(module, value);
  return value;
}

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
  properties?: string[];
}

interface SkillBonusDef {
  skillBonuses?: Record<string, number>;
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
 * Step 3, the other end: resource minima. Sees exactly what `max` sees, for the same reason — a
 * minimum that depended on a derived stat could express a cycle.
 */
export function minimaOf(
  module: CompiledModule,
  entity: Entity,
  mods: Record<string, number>,
): Record<string, number> {
  const scope = baseScope(entity, mods);
  const out: Record<string, number> = {};
  for (const resource of module.all<ResourceDef>('rules.resources')) {
    out[resource.id] = Math.floor(evaluate(resource.min, scope, `min of ${resource.id}`));
  }
  return out;
}

/** What a resource starts at. Defaults to full, which is what `initial` being optional means. */
export function initialOf(
  module: CompiledModule,
  entity: Entity,
  mods: Record<string, number>,
): Record<string, number> {
  const scope = baseScope(entity, mods);
  const maxima = maximaOf(module, entity, mods);
  const minima = minimaOf(module, entity, mods);
  const out: Record<string, number> = {};
  for (const resource of module.all<ResourceDef>('rules.resources')) {
    const max = maxima[resource.id] ?? 0;
    const value = resource.initial === undefined
      ? max
      : Math.floor(evaluate(resource.initial, scope, `initial of ${resource.id}`));
    out[resource.id] = Math.max(minima[resource.id] ?? 0, Math.min(max, value));
  }
  return out;
}

/**
 * Additive modifiers contributed by equipped items and active conditions. Computed each time rather
 * than stored, because equipping a shield or catching fire changes them.
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
      // And whatever its declared `properties` are worth.
      for (const propertyId of item.properties ?? []) {
        const property = module.find<ItemDef>('rules.itemProperties', propertyId);
        for (const [statId, expr] of Object.entries(property?.modifiers ?? {})) {
          add(statId, evaluate(expr, scope, `modifier from property ${propertyId}`));
        }
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

  // What those conditions imply counts too, at magnitude 1: an implied condition was never applied,
  // so there is no magnitude to inherit.
  for (const id of impliedConditions(module, entity)) {
    const condition = module.find<ConditionDef>('rules.conditions', id);
    if (!condition) continue;
    for (const [statId, expr] of Object.entries(condition.modifiers)) {
      add(statId, evaluate(expr, { ...scope, magnitude: 1 }, `modifier implied by ${id}`));
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
 * Flags, quests and memory are written during play and are legitimately empty at the start.
 * Anything structural (`actor.attr`, `actor.derived`) stays strict, so a misspelling there is an
 * error rather than a silent zero.
 *
 * `tiers` and `ranks` are not open: they are derived from the module rather than written during
 * play, so a missing key is a misspelled tier.
 *
 * `lore` is open and `threads` is not: a lore id is absent from state until the party learns it,
 * exactly as a flag is, while a thread is declared by the module and `threadScope` populates every
 * one.
 */
export const OPEN_NAMESPACES = ['flags', 'quests', 'memory', 'reputation', 'lore'] as const;

/**
 * The module's proficiency-style bonus for a character, if it declares one: a single formula over
 * `actor.level`.
 */
export function proficiencyOf(module: CompiledModule, entity: Entity): number {
  const formula = module.source.rules.progression.proficiency;
  if (formula === undefined) return 0;
  const mods = modifiersOf(module, entity.attributes);
  const value = evalExpr(formula, { scope: baseScope(entity, mods), rng: FORBIDDEN_RNG });
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
}

/**
 * A character's effective rank in a skill: what they trained, plus what they wear.
 *
 * `entity.skills` is written at character creation and at monster spawn and never again, so
 * equipment is the only way a rank moves during play. Summed here rather than at the two call
 * sites, so a check and a `minRank` gate cannot disagree.
 *
 * Only equipped items count.
 */
export function skillRankOf(module: CompiledModule, entity: Entity, skillId: string): number {
  let rank = entity.skills[skillId] ?? 0;
  for (const itemIds of Object.values(entity.equipped)) {
    for (const itemId of itemIds) {
      const item = module.find<SkillBonusDef>('content.items', itemId);
      rank += item?.skillBonuses?.[skillId] ?? 0;
    }
  }
  return rank;
}

/** Every skill the module declares, at the rank this entity brings to it. */
export function skillRanksOf(module: CompiledModule, entity: Entity): Record<string, number> {
  const out: Record<string, number> = { ...entity.skills };
  for (const skill of module.all<{ id: string }>('content.skills')) {
    out[skill.id] = skillRankOf(module, entity, skill.id);
  }
  return out;
}

/** Everything an entity is carrying, by declared weight. */
export function carriedWeight(module: CompiledModule, entity: Entity): number {
  let total = 0;
  for (const stack of entity.inventory) {
    const item = module.find<{ weight?: number }>('content.items', stack.item);
    total += (item?.weight ?? 0) * stack.quantity;
  }
  return Math.round(total * 100) / 100;
}

/**
 * The world half of the scope: the clock, and what the module makes of it. Phase, month and year
 * are derived on every read rather than stored, so content can gate on `world.phase` without
 * anything having to tick.
 */
function worldScope(module: CompiledModule, state: GameState): Scope {
  const date = dateOf(module, state.minute);
  const phase = phaseOf(module, state.minute, layerOf(module, state.location));

  return {
    minute: state.minute,
    day: date.day,
    dayOfMonth: date.dayOfMonth,
    month: date.month,
    monthName: date.monthName,
    year: date.year,
    hour: date.hour,
    // Null underground, where there is no daylight to have a phase of.
    phase: phase?.id ?? null,
    phaseName: phase?.name ?? null,
  };
}

/** Whether a character's class is trained in a saving throw. */
export function isSaveProficient(module: CompiledModule, entity: Entity, saveId: string): boolean {
  if (!entity.characterClass) return false;
  const characterClass = module.find<ClassScopeDef>('content.classes', entity.characterClass);
  return characterClass?.saveProficiencies?.includes(saveId) ?? false;
}

/** The evaluation context the engine uses everywhere. */
export function evalContext(scope: Scope, rng: DslRng): { scope: Scope; rng: DslRng; openNamespaces: readonly string[] } {
  return { scope, rng, openNamespaces: OPEN_NAMESPACES };
}

/**
 * The scope handed to the DSL during play. Every readable value content can reference lives here,
 * which is why the DSL needs no game-specific primitives: `flags.met_vess` and `actor.res.vitality`
 * are ordinary paths.
 */
/**
 * The other side of a roll, as a predicate can read it. Narrower than `buildScope`: what an
 * attacker or a reacting creature may know about the one in front of them, and nothing about the
 * world. Implied conditions are included.
 */
export function targetScope(module: CompiledModule, target: Entity): Record<string, never> {
  const stats = statsOf(module, target);
  const conditions: Record<string, unknown> = {};
  for (const active of target.conditions) conditions[active.condition] = active.remaining ?? true;
  for (const id of impliedConditions(module, target)) conditions[id] ??= true;

  return {
    id: target.id,
    name: target.name,
    level: target.level,
    alive: target.alive,
    attr: target.attributes,
    mod: stats.mod,
    res: target.resources,
    max: stats.max,
    derived: stats.derived,
    conditions,
  } as unknown as Record<string, never>;
}

export function buildScope(
  module: CompiledModule,
  state: GameState,
  actor: Entity,
  extra: Scope = {},
): Scope {
  const stats = statsOf(module, actor);
  const primary = actor.characterClass
    ? module.find<ClassScopeDef>('content.classes', actor.characterClass)
    : undefined;
  const conditions: Record<string, Value> = {};
  for (const active of actor.conditions) {
    conditions[active.condition] = active.remaining ?? true;
  }
  const inventory: Record<string, Value> = {};
  for (const stack of actor.inventory) {
    inventory[stack.item] = (inventory[stack.item] as number | undefined ?? 0) + stack.quantity;
  }

  // Equipped items are counted separately, so a requirement can insist a blade is drawn rather than
  // merely carried.
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
      // Trained rank plus equipment, so `requirement.skills[].minRank` and the mastery tiers see
      // the same number the dice do.
      skills: skillRanksOf(module, actor) as Record<string, Value>,
      ancestry: actor.ancestry,
      class: actor.characterClass,
      // The proficiency-style bonus a module may declare, and the attribute its class keys off.
      // `primaryMod` lets one authored `strike` serve a might class and an agility class.
      proficiency: proficiencyOf(module, actor),
      // Total weight carried. The engine owns no encumbrance rule; a module builds one out of a
      // derived stat and a condition.
      carried: carriedWeight(module, actor),
      // What the creature is, for content that gates on it. Empty rather than absent, so a module
      // that declares none of this vocabulary still resolves the paths.
      creatureType: (actor.extra['creatureType'] as Value) ?? null,
      alignment: (actor.extra['alignment'] as Value) ?? null,
      size: (actor.extra['size'] as Value) ?? null,
      languages: (actor.extra['languages'] as Value) ?? [],
      primaryAttribute: primary?.primaryAttribute ?? null,
      primaryMod: primary?.primaryAttribute ? (stats.mod[primary.primaryAttribute] ?? 0) : 0,
    },
    quests,
    flags: state.flags,
    // What is remembered, so `requirement.memories` works at every gate rather than only inside a
    // conversation. Built lazily; see sim/memoryscope.ts.
    memory: memoryScope(module, state, actor),
    reputation: state.reputation,
    purse: state.purse,
    ...thresholdsOf(module),
    arcs: arcScope(module, state),
    // What the party has found out, and how far along each thread it is. `lore` is open (a bare id,
    // absent until learned) and `threads` is closed, since a thread is declared.
    lore: state.lore,
    threads: threadScope(module, state),
    world: worldScope(module, state),
    party: state.party.map((id) => {
      const member = state.entities[id];
      return member ? { id: member.id, name: member.name, alive: member.alive } : null;
    }),
    ...extra,
  };
}
