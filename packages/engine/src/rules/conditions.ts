/**
 * Condition lifecycle.
 *
 * Everything that expires runs through one tick, which is what stops durations
 * leaking. A condition applied by a spell, a trap, or a terrain tile is the
 * same object and ages the same way.
 *
 * Order within a tick matters and is fixed: `onTick` effects fire first, then
 * durations decrease, then anything at zero expires and fires `onExpire`. A
 * poison that deals damage on the round it wears off is the correct reading —
 * it was still active for that round.
 */

import { Rng } from '@dm/core';
import { evalEffects } from '@dm/module';
import type { Effect } from '@dm/module';
import type { ActiveCondition, Entity, EntityId } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps } from './apply.js';

interface ConditionDef {
  id: string;
  onTick: Effect[];
  onExpire: Effect[];
  prevents: string[];
  implies: string[];
}

/** Whether a condition forbids an action type, e.g. `stunned` blocking actions. */
export function preventsAction(txn: Transaction, entity: Entity, actionType: string): boolean {
  for (const active of entity.conditions) {
    const definition = txn.module.find<ConditionDef>('rules.conditions', active.condition);
    if (definition?.prevents.includes(actionType)) return true;
  }
  return false;
}

/** Conditions implied by the ones an entity already has, transitively. */
export function impliedConditions(txn: Transaction, entity: Entity): string[] {
  const out = new Set<string>();
  const queue = entity.conditions.map((active) => active.condition);

  while (queue.length > 0) {
    const current = queue.pop()!;
    const definition = txn.module.find<ConditionDef>('rules.conditions', current);
    for (const implied of definition?.implies ?? []) {
      if (out.has(implied)) continue;
      out.add(implied);
      queue.push(implied);
    }
  }
  return [...out];
}

/**
 * Advance every condition on one entity by a round.
 *
 * `rng` is passed in rather than drawn from state because a tick happens inside
 * a turn that already has its own sub-stream — ticking must not perturb the
 * dice the turn itself will roll.
 */
export function tickConditions(txn: Transaction, entityId: EntityId, rng: Rng): void {
  const entity = txn.entity(entityId);
  if (!entity || entity.conditions.length === 0) return;

  // 1. Effects fire while the condition is still active.
  for (const active of entity.conditions) {
    const definition = txn.module.find<ConditionDef>('rules.conditions', active.condition);
    if (!definition || definition.onTick.length === 0) continue;

    const current = txn.entity(entityId);
    if (!current || !current.alive) break;

    const scope = {
      ...buildScope(txn.module, txn.state, current),
      magnitude: active.magnitude ?? 1,
    };
    applyOps(txn, evalEffects(definition.onTick, { scope, rng, openNamespaces: OPEN_NAMESPACES }), active.source);
  }

  // 2. Age them, and collect what has run out.
  const after = txn.entity(entityId);
  if (!after) return;

  const surviving: ActiveCondition[] = [];
  const expired: string[] = [];

  for (const active of after.conditions) {
    if (active.remaining === null) {
      // Null duration means "until removed" — it never ages out.
      surviving.push(active);
      continue;
    }
    const remaining = active.remaining - 1;
    if (remaining > 0) surviving.push({ ...active, remaining });
    else expired.push(active.condition);
  }

  // Always write the aged conditions back. Returning early when nothing
  // expired would discard the decremented durations, and conditions would
  // tick forever without ever running out.
  txn.putEntity({ ...after, conditions: surviving });
  if (expired.length === 0) return;

  // 3. Expiry effects run once the condition is already gone, so an `onExpire`
  // that reapplies it does not immediately expire again.
  for (const conditionId of expired) {
    txn.emit({ type: 'conditionRemoved', entity: entityId, condition: conditionId, reason: 'expired' });

    const definition = txn.module.find<ConditionDef>('rules.conditions', conditionId);
    if (!definition || definition.onExpire.length === 0) continue;

    const current = txn.entity(entityId);
    if (!current) break;
    const scope = buildScope(txn.module, txn.state, current);
    applyOps(txn, evalEffects(definition.onExpire, { scope, rng, openNamespaces: OPEN_NAMESPACES }));
  }
}

/** Tick every entity on the current map. */
export function tickAllConditions(txn: Transaction, rng: Rng): void {
  for (const id of Object.keys(txn.state.entities)) {
    const entity = txn.state.entities[id];
    if (!entity || !entity.alive) continue;
    if (entity.map !== txn.state.currentMap) continue;
    tickConditions(txn, id, rng.derive(`conditions:${id}`));
  }
}
