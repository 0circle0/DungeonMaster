/**
 * Monster and NPC turns.
 *
 * Behaviour is declared, not coded: a creature's `behaviour` list is a set of priority-ordered
 * rules and the engine picks the first whose conditions hold.
 *
 * What the engine supplies is the part that needs the grid — choosing a target, deciding whether to
 * close the distance, and pathing there.
 */

import { Rng } from '@dm/core';
import { evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Predicate, Requirement } from '@dm/module';
import type { Scope } from '@dm/module';
import type { Entity } from '../../state.js';
import { steppedTo } from '../../state.js';
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
import { key, inBounds, neighbours } from '../../grid/tiles.js';
import { leaveMarks, currentAlert, detectionRange } from '../../sim/senses.js';
import { temperamentOf } from '../../sim/temperament.js';
import type { Temperament } from '../../sim/temperament.js';
import type { Position } from '../../grid/tiles.js';

interface BehaviourRule {
  priority: number;
  when?: Predicate;
  requires?: Requirement;
  use: string;
}

/**
 * Choose which ability to use. Rules are considered in priority order and the first usable one
 * wins; a creature whose rules all fail falls back to a basic attack, so a statblock with no
 * `behaviour` still fights.
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

  // Built explicitly rather than with a conditional spread: a spread produces an optional property
  // typed `X | undefined`, which the shared `Scope` index signature rejects under the editor's
  // stricter settings.
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
 * Whether going there would take this creature off its own ground.
 *
 * Measured on the destination, not on the step, so a creature refuses the chase rather than walking
 * to the end of its rope — otherwise it could be towed one tile at a time.
 *
 * A creature with no anchor, or a module with no opinion, is never held back.
 */
function offItsGround(actor: Entity, limit: number, goal: Position): boolean {
  if (!actor.anchor || !Number.isFinite(limit)) return false;
  return distance(actor.anchor, goal) > limit;
}

/**
 * Take one creature's turn: move into range if needed, then act. Anything cleverer belongs in
 * `behaviour` rules rather than in engine heuristics.
 */
export function takeAiTurn(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  rng: Rng,
): void {
  const current = txn.entity(actor.id);
  if (!current || !current.alive) return;

  // Only what this creature could actually perceive, so it cannot fight something on the far side
  // of the map.
  const target = nearestHostile(context, current, { range: detectionRange(context, current) });
  const abilityId = chooseAbility(txn, current, target, rng);
  const ability = abilityId
    ? txn.module.find<AbilityDef>('content.abilities', abilityId)
    : undefined;

  // Something that cannot act this turn still uses up its turn.
  if (ability?.actionType && preventsAction(txn, current, ability.actionType)) return;

  const temper = temperamentOf(txn.module, current);

  if (target && ability) {
    const range = Math.max(toTiles(txn.module, ability.range), reachOf(txn.module, current));
    let actorNow = txn.entity(current.id)!;

    if (distance(actorNow.position, target.position) > range) {
      // The leash gates the chase and nothing else: a creature drawn too far from its ground breaks
      // off, but still swings at whatever is beside it.
      if (offItsGround(actorNow, temper.leashRadius, target.position)) {
        txn.emit({ type: 'custom', event: 'brokeOff', data: { entity: actorNow.id, sense: '' } });
        goHome(txn, context, actorNow, rng, temper);
        return;
      }
      moveToward(txn, context, actorNow, target.position, range, rng, undefined, temper.speeds.engage);
      actorNow = txn.entity(current.id) ?? actorNow;
    }

    if (distance(actorNow.position, target.position) <= range && hasBudget(txn, ability.actionType)) {
      const result = useAbility(txn, context, actorNow, ability.id, { target: target.id }, rng);
      if (result.used) spendBudget(txn, ability.actionType);
    }
    return;
  }

  // Nothing to attack: close on whoever is nearest.
  if (target) {
    if (offItsGround(current, temper.leashRadius, target.position)) {
      txn.emit({ type: 'custom', event: 'brokeOff', data: { entity: current.id, sense: '' } });
      goHome(txn, context, current, rng, temper);
      return;
    }
    moveToward(txn, context, current, target.position, 1, rng, undefined, temper.speeds.engage);
    return;
  }

  // Nothing in sight, but something was noticed: walk over to find out.
  investigate(txn, context, current, rng);
}

/**
 * Break off and walk back to where it started — the other half of a leash, so a creature that has
 * given up does not stand at the end of its rope.
 */
function goHome(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  rng: Rng,
  temper: Temperament,
  budget?: number,
): void {
  const home = actor.anchor;
  if (!home) return;
  if (distance(actor.position, home) === 0) return;

  moveToward(txn, context, actor, home, 0, rng, budget, temper.speeds.returning);
}

/**
 * Go and look at whatever was noticed. Arriving with nothing to show for it drops the alert, so a
 * creature does not pace back to the same empty tile forever; a cold trail is forgotten the same
 * way, by `perceiveInto`.
 */
function investigate(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  rng: Rng,
  budget?: number,
): boolean {
  const alert = currentAlert(context, actor, 'investigate');
  // Holding a lead and acting on one are different: a creature whose `investigates` list does not
  // name that sense has nothing to do here, and the return value says so, so it is free to do
  // whatever else it would.
  if (!alert) return false;

  const temper = temperamentOf(txn.module, actor);

  // A lead that would take it off its ground is declined, and the alert is dropped rather than
  // held, so it does not re-decide every turn.
  if (offItsGround(actor, temper.investigateRadius, alert.at)) {
    txn.putEntity({
      ...actor,
      alerts: actor.alerts.filter((held) => held.sense !== alert.sense || held.of !== alert.of),
    });
    txn.emit({ type: 'custom', event: 'lostInterest', data: { entity: actor.id, sense: alert.sense } });
    return true;
  }

  if (distance(actor.position, alert.at) <= 1) {
    // Standing on it and still nothing there: the lead is spent.
    txn.putEntity({
      ...actor,
      alerts: actor.alerts.filter((held) => held.sense !== alert.sense || held.of !== alert.of),
    });
    txn.emit({ type: 'custom', event: 'lostInterest', data: { entity: actor.id, sense: alert.sense } });
    return true;
  }

  // Only when the trail is fresh this minute, so a creature already moving toward something does
  // not narrate casting about every step.
  if (alert.minute === txn.state.minute) {
    txn.emit({
      type: 'custom',
      event: 'investigating',
      data: { entity: actor.id, sense: alert.sense, x: alert.at.x, y: alert.at.y },
    });
  }
  moveToward(txn, context, actor, alert.at, 1, rng, budget, temper.speeds.investigate);
  return true;
}

/**
 * Creatures act on what they noticed even when nobody is fighting, since turns only exist inside
 * combat.
 *
 * Paced by the clock rather than by actions: `tiles` is how far anything may come while that much
 * time passes. Tying it to elapsed minutes stops a free action freezing the world, and makes a long
 * rest genuinely risky.
 *
 * Every creature draws from its own stream, keyed by who it is and when, so what one creature does
 * cannot shift the dice for anything else.
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

    // How long a creature keeps caring, from `perception.curiosityMinutes`.
    const curiosity = txn.module.source.rules.perception.curiosityMinutes;
    let leads = actor.alerts;
    if (curiosity > 0 && leads.length > 0) {
      const fresh = leads.filter((alert) => txn.state.minute - alert.minute <= curiosity);
      if (fresh.length !== leads.length) txn.putEntity({ ...actor, alerts: fresh });
      leads = fresh;
    }

    const here = txn.entity(actor.id) ?? actor;
    const local = { module: context.module, state: txn.state, terrain: context.terrain };

    const chased = leads.length > 0 && investigate(
      txn,
      local,
      here,
      rng.derive(`investigate:${actor.id}:${txn.state.minute}`),
      // A tile a minute, the same pace the party walks.
      tiles,
    );
    if (chased) continue;

    // Nothing to chase: a creature with ground of its own walks about on it, and one that has
    // strayed off it heads back. Both leave a trail while they do.
    wander(txn, local, here, rng.derive(`wander:${actor.id}:${txn.state.minute}`), tiles);
  }
}

/**
 * Walk about, or walk home.
 *
 * A random step rather than a path: a creature ambling around its own patch has no destination, and
 * asking the pathfinder would cost an A* per creature per turn. Going home does use the pathfinder.
 */
function wander(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  rng: Rng,
  tiles: number,
): void {
  const home = actor.anchor;
  if (!home) return;

  const temper = temperamentOf(txn.module, actor);
  const map = txn.state.maps[actor.map];
  if (!map) return;

  // Off its ground with nothing to chase: back it goes, whatever its roaming habits, so a dungeon
  // does not empty itself into whichever room the party fought in.
  if (distance(actor.position, home) > temper.roamRadius) {
    goHome(txn, context, actor, rng, temper, Math.floor(tiles * temper.speeds.returning));
    return;
  }

  if (temper.roamRadius <= 0 || temper.wanderChance <= 0) return;

  const budget = Math.floor(tiles * temper.speeds.wander);
  if (budget <= 0) return;

  // Rolled once for the whole tick rather than once per step: per step, a creature that failed its
  // first roll would stand still for the whole stretch, so a long rest and a single minute would
  // move it equally far.
  if (!rng.chance(temper.wanderChance)) return;

  const blocked = new Set<number>();
  for (const other of Object.values(txn.state.entities)) {
    if (!other.alive || other.id === actor.id || other.map !== actor.map) continue;
    blocked.add(key(other.position));
  }

  let spent = 0;
  while (spent < budget) {
    const now = txn.entity(actor.id);
    if (!now || !now.alive) return;

    // Every open neighbour that keeps it on its ground. Gathered rather than sampled, so the choice
    // is a single draw against a stable list and two identical runs step identically.
    const open = neighbours(now.position).filter((side) => {
      if (!inBounds(map.tiles, side)) return false;
      if (blocked.has(key(side))) return false;
      if (distance(home, side) > temper.roamRadius) return false;
      return Number.isFinite(context.terrain.costOf(map.tiles, side, now.movementModes));
    });
    if (open.length === 0) return;

    const step = rng.pick(open);
    const cost = context.terrain.costOf(map.tiles, step, now.movementModes);
    if (!Number.isFinite(cost) || spent + cost > budget) return;

    txn.putEntity(steppedTo(now, step, txn.state.minute));
    txn.emit({ type: 'moved', entity: actor.id, from: now.position, to: step, cost });
    leaveMarks(txn, context.terrain, txn.entity(actor.id) ?? now, step);
    spent += cost;
  }
}

/**
 * Walk toward a place until within `range`, spending the movement budget. A place, not a creature:
 * closing on an enemy and walking over to a noise are the same movement.
 */
function moveToward(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  goal: Position,
  range: number,
  rng: Rng,
  budgetOverride?: number,
  pace = 1,
): void {
  const map = txn.state.maps[actor.map];
  if (!map) return;

  const combat = txn.state.combat;
  const allowance = budgetOverride ?? (combat ? combat.movement : Infinity);
  // Why it is moving decides how fast. A pace of zero is a creature that does not travel for that
  // reason at all.
  const budget = Number.isFinite(allowance) ? Math.floor(allowance * pace) : allowance;
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

    txn.putEntity(steppedTo(after, step, txn.state.minute));
    txn.emit({ type: 'moved', entity: actor.id, from: after.position, to: step, cost });
    // A creature leaves a trail exactly as the party does.
    leaveMarks(txn, context.terrain, txn.entity(actor.id) ?? after, step);
    spent += cost;
  }

  // Charged at what it actually walked: `pace` shapes how far it was willing to go, not how cheap
  // the ground was.
  if (spent > 0 && budgetOverride === undefined) spendMovement(txn, spent);
}

/**
 * Run every non-player turn until it is a party member's turn again. Called after the player ends
 * their turn, so control returns only when there is something to decide.
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
