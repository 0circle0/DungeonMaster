/**
 * Monster and NPC turns.
 *
 * Behaviour is declared, not coded. A creature's `behaviour` list is a set of
 * priority-ordered rules — "howl if you can, otherwise strike" — and the engine
 * picks the first whose conditions hold. That keeps tactics in the module where
 * an author can tune them, and keeps the engine from having opinions about how
 * a bog hound should fight.
 *
 * What the engine does supply is the part that needs the grid: choosing a
 * target, deciding whether to close the distance, and pathing there.
 */

import { Rng } from '@dm/core';
import { evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Predicate, Requirement } from '@dm/module';
import type { Scope } from '@dm/module';
import type { Entity } from '../../state.js';
import { buildScope, OPEN_NAMESPACES } from '../../stats.js';
import { Transaction } from '../apply.js';
import { preventsAction } from '../conditions.js';
import type { TargetingContext } from './targeting.js';
import { nearestHostile, reachOf, toTiles } from './targeting.js';
import { useAbility, defaultAttackAbility } from './attack.js';
import type { AbilityDef } from './attack.js';
import { hasBudget, spendBudget, spendMovement, provokeOpportunity } from './turn.js';
import { findPath } from '../../grid/path.js';
import { distance } from '../../grid/geometry.js';
import { key } from '../../grid/tiles.js';
import { leaveMarks, currentAlert, detectionRange } from '../../sim/senses.js';
import type { Position } from '../../grid/tiles.js';

interface BehaviourRule {
  priority: number;
  when?: Predicate;
  requires?: Requirement;
  use: string;
}

/**
 * Choose which ability to use.
 *
 * Rules are considered in priority order and the first usable one wins. A
 * creature whose rules all fail falls back to a basic attack, so a statblock
 * with no `behaviour` still fights rather than standing there.
 */
function chooseAbility(
  txn: Transaction,
  actor: Entity,
  target: Entity | null,
  rng: Rng,
): string | null {
  if (!actor.statblock) return defaultAttackAbility(txn.module, actor);

  const statblock = txn.module.find<{ behaviour?: BehaviourRule[] }>('content.monsters', actor.statblock);
  const rules = [...(statblock?.behaviour ?? [])].sort((a, b) => b.priority - a.priority);

  // Built explicitly rather than with a conditional spread: a spread produces
  // an optional property typed `X | undefined`, which the shared `Scope` index
  // signature rejects under stricter settings — and this source is compiled by
  // the editor as well as the engine.
  const extra: Scope = target ? { target: { id: target.id, name: target.name } } : {};
  const scope = buildScope(txn.module, txn.state, actor, extra);

  for (const rule of rules) {
    if (!actor.abilities.includes(rule.use)) continue;
    if (rule.when && !evalPredicate(rule.when, { scope, rng, openNamespaces: OPEN_NAMESPACES })) continue;
    if (!isEmptyRequirement(rule.requires)) {
      if (!evalPredicate(compileRequirement(rule.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES })) continue;
    }
    return rule.use;
  }

  return defaultAttackAbility(txn.module, actor);
}

/**
 * Take one creature's turn.
 *
 * Move into range if needed, then act. Deliberately simple: closing to reach
 * and using the highest-priority available ability covers almost everything a
 * declarative statblock wants, and anything cleverer belongs in `behaviour`
 * rules rather than in engine heuristics.
 */
export function takeAiTurn(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  rng: Rng,
): void {
  const current = txn.entity(actor.id);
  if (!current || !current.alive) return;

  // Only what this creature could actually notice. Without the cap it would
  // fight something on the far side of the map that it has no way of knowing
  // is there.
  const target = nearestHostile(context, current, { range: detectionRange(context, current) });
  const abilityId = chooseAbility(txn, current, target, rng);
  const ability = abilityId
    ? txn.module.find<AbilityDef>('content.abilities', abilityId)
    : undefined;

  // Something that cannot act this turn still uses up its turn.
  if (ability?.actionType && preventsAction(txn, current, ability.actionType)) return;

  if (target && ability) {
    const range = Math.max(toTiles(txn.module, ability.range), reachOf(txn.module, current));
    let actorNow = txn.entity(current.id)!;

    if (distance(actorNow.position, target.position) > range) {
      moveToward(txn, context, actorNow, target.position, range, rng);
      actorNow = txn.entity(current.id) ?? actorNow;
    }

    if (distance(actorNow.position, target.position) <= range && hasBudget(txn, ability.actionType)) {
      const result = useAbility(txn, context, actorNow, ability.id, { target: target.id }, rng);
      if (result.used) spendBudget(txn, ability.actionType);
    }
    return;
  }

  // Nothing to attack: close on whoever is nearest, so the fight comes to them.
  if (target) {
    moveToward(txn, context, current, target.position, 1, rng);
    return;
  }

  // Nothing in sight at all — but something was noticed. A creature that caught
  // a scent or heard a door go walks over to find out, which is the difference
  // between a monster that waits to be discovered and one that hunts.
  investigate(txn, context, current, rng);
}

/**
 * Go and look at whatever was noticed.
 *
 * Arriving with nothing to show for it drops the alert, so a creature does not
 * pace back to the same empty tile for ever. A trail that has gone cold is
 * forgotten the same way, by `perceiveInto`.
 */
function investigate(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  rng: Rng,
  budget?: number,
): void {
  const alert = currentAlert(context, actor, 'investigate');
  if (!alert) return;

  if (distance(actor.position, alert.at) <= 1) {
    // Standing on it and still nothing there: the lead is spent.
    txn.putEntity({
      ...actor,
      alerts: actor.alerts.filter((held) => held.sense !== alert.sense || held.of !== alert.of),
    });
    txn.emit({ type: 'custom', event: 'lostInterest', data: { entity: actor.id, sense: alert.sense } });
    return;
  }

  // Only when the trail is fresh this minute. A creature already padding
  // toward something does not cast about again every step, and saying so every
  // turn would bury the moment it first noticed you.
  if (alert.minute === txn.state.minute) {
    txn.emit({
      type: 'custom',
      event: 'investigating',
      data: { entity: actor.id, sense: alert.sense, x: alert.at.x, y: alert.at.y },
    });
  }
  moveToward(txn, context, actor, alert.at, 1, rng, budget);
}

/**
 * Creatures act on what they noticed even when nobody is fighting.
 *
 * Without this a hound could smell the party across the marsh and never do a
 * thing about it, because turns only exist inside combat.
 *
 * Paced by the clock rather than by actions: `tiles` is how far anything may
 * come while that much time passes. Tying it to elapsed minutes is what stops a
 * player learning to spam a free action to freeze the world — and what makes a
 * long rest genuinely risky, since eight hours is time enough for anything that
 * caught your scent to walk the length of the marsh.
 *
 * Every creature draws from its own stream, keyed by who it is and when, so
 * what one creature does cannot shift the dice for anything else.
 */
export function runIdleTurns(
  txn: Transaction,
  context: TargetingContext,
  rng: Rng,
  tiles: number,
): void {
  if (txn.state.combat || tiles <= 0) return;

  for (const id of Object.keys(txn.state.entities)) {
    const actor = txn.entity(id);
    if (!actor || !actor.alive) continue;
    if (actor.kind === 'character') continue;
    if (actor.map !== txn.state.currentMap) continue;
    if (actor.alerts.length === 0) continue;

    investigate(
      txn,
      { module: context.module, state: txn.state, terrain: context.terrain },
      actor,
      rng.derive(`investigate:${actor.id}:${txn.state.minute}`),
      // A tile a minute, the same pace the party walks. Sprinting is a combat
      // idea; crossing a marsh on a scent is not.
      tiles,
    );
  }
}

/**
 * Walk toward a place until within `range`, spending the movement budget.
 *
 * A place, not a creature: closing on an enemy and walking over to whatever
 * made that noise are the same movement, and only one of them has something
 * standing at the far end.
 */
function moveToward(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  goal: Position,
  range: number,
  rng: Rng,
  budgetOverride?: number,
): void {
  const map = txn.state.maps[actor.map];
  if (!map) return;

  const combat = txn.state.combat;
  const budget = budgetOverride ?? (combat ? combat.movement : Infinity);
  if (budget <= 0) return;

  const blocked = new Set<number>();
  for (const other of Object.values(txn.state.entities)) {
    if (!other.alive || other.id === actor.id || other.map !== actor.map) continue;
    blocked.add(key(other.position));
  }

  const path = findPath({
    map: map.tiles,
    terrain: context.terrain,
    from: actor.position,
    to: goal,
    modes: actor.movementModes,
    blocked,
    adjacentIsEnough: range <= 1,
  });

  if (!path.found) return;

  let spent = 0;
  for (const step of path.steps) {
    const now = txn.entity(actor.id);
    if (!now || !now.alive) return;
    if (distance(now.position, goal) <= range) break;

    const cost = context.terrain.costOf(map.tiles, step, now.movementModes);
    if (!Number.isFinite(cost) || spent + cost > budget) break;

    // Leaving a threatened tile may provoke, which can kill the mover mid-move.
    provokeOpportunity(txn, context, now, now.position, step, rng);
    const after = txn.entity(actor.id);
    if (!after || !after.alive) return;

    txn.putEntity({ ...after, position: step });
    txn.emit({ type: 'moved', entity: actor.id, from: after.position, to: step, cost });
    // A creature leaves a trail exactly as the party does — which is what makes
    // tracking a wounded beast back to its den possible.
    leaveMarks(txn, txn.entity(actor.id) ?? after, step);
    spent += cost;
  }

  if (spent > 0 && budgetOverride === undefined) spendMovement(txn, spent);
}

/**
 * Run every non-player turn until it is a party member's turn again.
 *
 * Called after the player ends their turn, so control returns to them only when
 * there is something to decide.
 */
export function runAiTurns(txn: Transaction, context: TargetingContext, rng: Rng, endTurnFn: (txn: Transaction, context: TargetingContext, rng: Rng) => void): void {
  // Bounded so a bad statblock cannot spin forever.
  for (let guard = 0; guard < 200; guard += 1) {
    const combat = txn.state.combat;
    if (!combat) return;

    const activeId = combat.order[combat.turn];
    const active = activeId ? txn.entity(activeId) : undefined;
    if (!active) return;

    // Party members decide for themselves.
    if (active.kind === 'character' && active.alive) return;

    if (active.alive) {
      takeAiTurn(txn, context, active, rng.derive(`ai:${active.id}:${combat.round}`));
    }
    endTurnFn(txn, context, rng);
  }
}
