/**
 * Using an ability, and hitting with it.
 *
 * One path for everything a creature actively does: a sword swing, a spell, a
 * shout, a healing touch. The differences are declared in the ability — whether
 * it rolls to hit, whether the target saves, what it costs — so the engine has
 * no separate notion of "attack" versus "spell".
 *
 * Order of resolution:
 *
 *   1. can it be used at all — costs, cooldown, requirement, conditions
 *   2. who does it reach — range, line of sight, area shape
 *   3. per target: attack roll, or saving throw, or neither
 *   4. effects, scaled for criticals and successful saves
 */

import { Rng } from '@dm/core';
import { evalEffects, evalExpr, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Expr } from '@dm/module';
import type { CompiledModule, Effect, EffectOp, Predicate, Requirement } from '@dm/module';
import type { Entity, EntityId } from '../../state.js';
import type { Position } from '../../grid/tiles.js';
import { buildScope, statsOf, OPEN_NAMESPACES } from '../../stats.js';
import { Transaction, applyOps, adjustResource } from '../apply.js';
import { preventsAction } from '../conditions.js';
import { check, savingThrow, succeeded, criticalMultiplier, difficultyOf } from '../check.js';
import type { TargetingContext } from './targeting.js';
import { resolveTargets, reachability, coverBonus, toTiles, reachOf } from './targeting.js';

export interface AbilityDef {
  id: string;
  name: string;
  actionType?: string;
  costs: Record<string, unknown>;
  range: number;
  cooldown: number;
  targeting: 'self' | 'single' | 'allEnemies' | 'allAllies' | 'all' | 'none';
  requires?: Requirement;
  when?: Predicate;
  attack?: { stat: string; against: string };
  savingThrow?: {
    save: string;
    difficulty?: unknown;
    onSuccess: 'none' | 'half' | 'negates' | 'partial';
    onSuccessEffects: Effect[];
  };
  areaOfEffect?: { shape: never; size: number; affects: 'all' | 'enemies' | 'allies' | 'others' };
  onUse: Effect[];
  onMiss: Effect[];
  onCritical: Effect[];
}

export interface UseResult {
  readonly used: boolean;
  readonly reason: string | null;
}

/** Scale damage in a set of ops — used for criticals and half-damage saves. */
function scaleDamage(ops: readonly EffectOp[], factor: number): EffectOp[] {
  if (factor === 1) return [...ops];
  return ops.map((op) =>
    op.op === 'damage' ? { ...op, amount: Math.max(0, Math.floor(op.amount * factor)) } : op,
  );
}

/**
 * Evaluate an ability's costs.
 *
 * Costs are DSL expressions, so a spell can cost more at higher level. Rolled
 * once and reused for both the affordability check and the payment — evaluating
 * twice would let a random cost differ between the two.
 */
function costsOf(txn: Transaction, actor: Entity, ability: AbilityDef, rng: Rng): Map<string, number> {
  const scope = buildScope(txn.module, txn.state, actor);
  const costs = new Map<string, number>();

  for (const [resourceId, expr] of Object.entries(ability.costs)) {
    const value = evalExpr(expr as Expr, { scope, rng, openNamespaces: OPEN_NAMESPACES });
    const cost = typeof value === 'number' ? value : 0;
    if (Number.isFinite(cost) && cost > 0) costs.set(resourceId, cost);
  }
  return costs;
}

/** The first cost the actor cannot pay, as a readable reason. */
function shortfallOf(txn: Transaction, actor: Entity, costs: ReadonlyMap<string, number>): string | null {
  for (const [resourceId, cost] of costs) {
    if ((actor.resources[resourceId] ?? 0) >= cost) continue;
    const resource = txn.module.find<{ name: string }>('rules.resources', resourceId);
    return `not enough ${resource?.name ?? resourceId}`;
  }
  return null;
}

function payCosts(txn: Transaction, actor: Entity, costs: ReadonlyMap<string, number>): void {
  for (const [resourceId, cost] of costs) {
    const current = txn.entity(actor.id);
    if (!current) return;
    adjustResource(txn, current, resourceId, -cost);
  }
}

/**
 * Use an ability.
 *
 * Refusals are ordinary play — out of range, not enough focus, stunned — and
 * each returns a reason the player can read rather than failing silently.
 */
export function useAbility(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  abilityId: string,
  explicit: { target?: EntityId; at?: Position },
  rng: Rng,
): UseResult {
  const module = txn.module;
  const ability = module.find<AbilityDef>('content.abilities', abilityId);

  if (!ability) return refuse(txn, `no ability "${abilityId}"`);
  if (!actor.abilities.includes(abilityId)) return refuse(txn, `${actor.name} does not know ${abilityId}`);

  // A condition that forbids this kind of action stops it before anything else.
  if (ability.actionType && preventsAction(txn, actor, ability.actionType)) {
    return refuse(txn, `${actor.name} cannot take that action right now`);
  }

  const scope = buildScope(module, txn.state, actor);
  if (!isEmptyRequirement(ability.requires)) {
    if (!evalPredicate(compileRequirement(ability.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES })) {
      return refuse(txn, `${actor.name} does not meet the requirements for ${ability.name}`);
    }
  }
  if (ability.when && !evalPredicate(ability.when, { scope, rng, openNamespaces: OPEN_NAMESPACES })) {
    return refuse(txn, `${ability.name} cannot be used now`);
  }

  const costs = costsOf(txn, actor, ability, rng);
  const shortfall = shortfallOf(txn, actor, costs);
  if (shortfall) return refuse(txn, shortfall);

  const { targets, reason } = resolveTargets(context, actor, ability, explicit);
  if (reason) return refuse(txn, reason);
  if (targets.length === 0 && ability.targeting !== 'none') return refuse(txn, 'nothing to target');

  payCosts(txn, actor, costs);

  for (const target of targets) {
    resolveAgainst(txn, context, actor, target, ability, rng);
  }

  // A `none`-targeting ability still does whatever it declares.
  if (ability.targeting === 'none' && targets.length === 0) {
    const selfScope = buildScope(module, txn.state, actor);
    applyOps(txn, evalEffects(ability.onUse, { scope: selfScope, rng, openNamespaces: OPEN_NAMESPACES }), actor.id);
  }

  return { used: true, reason: null };
}

function refuse(txn: Transaction, reason: string): UseResult {
  txn.emit({ type: 'refused', action: 'useAbility', reason });
  return { used: false, reason };
}

/** Resolve one ability against one target. */
function resolveAgainst(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  target: Entity,
  ability: AbilityDef,
  rng: Rng,
): void {
  const module = txn.module;
  const current = txn.entity(target.id);
  if (!current || !current.alive) return;

  const scopeFor = (extra: Record<string, never> = {}) => ({
    ...buildScope(module, txn.state, actor, { target: targetScope(module, current) }),
    ...extra,
  });

  // — an attack roll, when the ability declares one ——————————
  if (ability.attack) {
    const stats = statsOf(module, actor);
    const defence = statsOf(module, current).derived[ability.attack.against] ?? 0;

    const range = Math.max(toTiles(module, ability.range), reachOf(module, actor));
    const reach = reachability(context, actor.position, current.position, range);
    const defenceWithCover = defence + coverBonus(module, reach.cover);

    const roll = check(module, rng, {
      modifier: stats.mod[ability.attack.stat] ?? 0,
      difficulty: defenceWithCover,
    });

    txn.emit({ type: 'attacked', attacker: actor.id, target: current.id, ability: ability.id, roll });

    if (!succeeded(roll)) {
      applyOps(txn, evalEffects(ability.onMiss, { scope: scopeFor(), rng }), actor.id);
      return;
    }

    const ops = evalEffects(ability.onUse, { scope: scopeFor(), rng });
    // A critical multiplies damage by whatever the module says, and then runs
    // any extra `onCritical` effects on top.
    const factor = roll.outcome === 'critical' ? criticalMultiplier(module) : 1;
    applyOps(txn, scaleDamage(ops, factor), actor.id);

    if (roll.outcome === 'critical' && ability.onCritical.length > 0) {
      applyOps(txn, evalEffects(ability.onCritical, { scope: scopeFor(), rng }), actor.id);
    }
    return;
  }

  // — a saving throw, when the ability declares one ——————————
  if (ability.savingThrow) {
    const difficulty = difficultyOf(module, ability.savingThrow.difficulty as number | undefined);
    const roll = savingThrow(module, rng, current, ability.savingThrow.save, difficulty);
    txn.emit({ type: 'saved', entity: current.id, save: ability.savingThrow.save, roll });

    const ops = evalEffects(ability.onUse, { scope: scopeFor(), rng });

    if (succeeded(roll)) {
      switch (ability.savingThrow.onSuccess) {
        case 'negates':
          break;
        case 'half':
          applyOps(txn, scaleDamage(ops, 0.5), actor.id);
          break;
        default:
          applyOps(txn, ops, actor.id);
          break;
      }
      if (ability.savingThrow.onSuccessEffects.length > 0) {
        applyOps(txn, evalEffects(ability.savingThrow.onSuccessEffects, { scope: scopeFor(), rng }), actor.id);
      }
      return;
    }

    applyOps(txn, ops, actor.id);
    return;
  }

  // — no roll: it simply happens ———————————————————————————
  applyOps(txn, evalEffects(ability.onUse, { scope: scopeFor(), rng }), actor.id);
}

/** The `target.*` half of the DSL scope. */
function targetScope(module: CompiledModule, target: Entity): Record<string, never> {
  const stats = statsOf(module, target);
  const conditions: Record<string, unknown> = {};
  for (const active of target.conditions) conditions[active.condition] = active.remaining ?? true;

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

/**
 * A basic attack with whatever the actor is wielding.
 *
 * Looks for an equipped weapon's ability, then falls back to the first ability
 * the actor knows that declares an attack roll — so `attack goblin` works
 * without the player knowing ability names.
 */
export function defaultAttackAbility(module: CompiledModule, actor: Entity): string | null {
  for (const items of Object.values(actor.equipped)) {
    for (const itemId of items) {
      const item = module.find<{ grantedAbilities: string[] }>('content.items', itemId);
      const granted = item?.grantedAbilities?.[0];
      if (granted) return granted;
    }
  }
  for (const abilityId of actor.abilities) {
    const ability = module.find<AbilityDef>('content.abilities', abilityId);
    if (ability?.attack) return abilityId;
  }
  return null;
}
