/** Condition lifecycle. */

import { Rng } from '@dm/core';
import { evalEffects, evalExpr } from '@dm/module';
import type { CompiledModule, Effect, Expr } from '@dm/module';
import type { ActiveCondition, Entity, EntityId } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps } from './apply.js';
import { savingThrow, succeeded } from './check.js';
import type { Swing } from './check.js';
import { conditionsInForce } from './implied.js';

/** The four ways a condition can lean a roll. */
export type SwingScope = 'ownAttacks' | 'attacksAgainstSelf' | 'checks' | 'saves';

interface ConditionDef {
  id: string;
  onTick: Effect[];
  onExpire: Effect[];
  prevents: string[];
  implies: string[];
  swings?: Partial<Record<SwingScope, Swing>>;
  savingThrow?: {
    save: string;
    difficulty?: unknown;
    timing: 'onApply' | 'endOfTurn' | 'startOfTurn' | 'both';
  };
}

/** Which timings a save-ends pass covers. */
function savesAt(
  definition: ConditionDef | undefined,
  when: 'startOfTurn' | 'endOfTurn',
): boolean {
  const timing = definition?.savingThrow?.timing;
  return timing === when || timing === 'both';
}

/** Give an entity its saves against the conditions that allow one. */
export function rollConditionSaves(
  txn: Transaction,
  entityId: EntityId,
  when: 'startOfTurn' | 'endOfTurn',
  rng: Rng,
): void {
  const entity = txn.entity(entityId);
  if (!entity || !entity.alive || entity.conditions.length === 0) return;

  for (const active of entity.conditions) {
    const definition = txn.module.find<ConditionDef>('rules.conditions', active.condition);
    if (!savesAt(definition, when)) continue;

    const current = txn.entity(entityId);
    if (!current || !current.alive) break;

    const difficulty = difficultyFor(txn, definition!, current, active.magnitude ?? 1);
    const roll = savingThrow(txn.module, rng, current, definition!.savingThrow!.save, difficulty);
    txn.emit({
      type: 'checked', entity: entityId, skill: null, attribute: definition!.savingThrow!.save, roll,
    });
    if (!succeeded(roll)) continue;

    const shaken = txn.entity(entityId);
    if (!shaken) break;
    txn.putEntity({
      ...shaken,
      conditions: shaken.conditions.filter((other) => other !== active),
    });
    txn.emit({
      type: 'conditionRemoved', entity: entityId, condition: active.condition, reason: 'saved',
    });
  }
}

/** A condition's save difficulty, which the module may write as a formula. */
function difficultyFor(
  txn: Transaction,
  definition: ConditionDef,
  entity: Entity,
  magnitude: number,
): number | undefined {
  const declared = definition.savingThrow?.difficulty;
  if (declared === undefined) return undefined;
  const scope = { ...buildScope(txn.module, txn.state, entity), magnitude };
  const value = evalExpr(declared as Expr, {
    scope, rng: txn.rngFor(`saveDc:${entity.id}:${definition.id}`), openNamespaces: OPEN_NAMESPACES,
  });
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;
}

/** Whether a condition forbids an action type, e.g. `stunned` blocking actions. */
export function preventsAction(txn: Transaction, entity: Entity, actionType: string): boolean {
  for (const id of conditionsInForce(txn.module, entity)) {
    const definition = txn.module.find<ConditionDef>('rules.conditions', id);
    if (definition?.prevents.includes(actionType)) return true;
  }
  return false;
}

/** Every swing an entity's conditions impose on one kind of roll. */
export function swingsFrom(
  module: CompiledModule,
  entity: Entity,
  scope: SwingScope,
): Swing[] {
  const out: Swing[] = [];
  for (const id of conditionsInForce(module, entity)) {
    const definition = module.find<ConditionDef>('rules.conditions', id);
    const swing = definition?.swings?.[scope];
    if (swing) out.push(swing);
  }
  return out;
}

/** Advance every condition on one entity by a round. */
export function tickConditions(txn: Transaction, entityId: EntityId, rng: Rng): void {
  const entity = txn.entity(entityId);
  if (!entity || entity.conditions.length === 0) return;

  // 1.
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

  // 2.
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

  // Always write the aged conditions back, or the decremented durations are discarded.
  txn.putEntity({ ...after, conditions: surviving });
  if (expired.length === 0) return;

  // 3.
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
