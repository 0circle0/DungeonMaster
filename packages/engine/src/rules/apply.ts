/**
 * Applying effects: the bridge from the DSL to game state.
 *
 * Content describes what should happen as data; `evalEffects` turns that into
 * `EffectOp[]`; this turns those into state changes and events. It is the only
 * place a module's declared intent becomes a fact about the world.
 *
 * The engine deliberately gets the last word. An op is a *request* — "damage
 * this entity by 7" — and this validates it before applying: the dead take no
 * damage, resources clamp to their bounds, immune creatures shrug off
 * conditions, and unknown ids are refused rather than crashing. Content is
 * written by hand and will be wrong sometimes; a module should not be able to
 * corrupt a save.
 */

import type { CompiledModule, EffectOp, Value } from '@dm/module';
import type { GameState, Entity, EntityId, ActiveCondition } from '../state.js';
import type { GameEvent } from '../events.js';
import { maximaOf, modifiersOf } from '../stats.js';
import { TerrainIndex } from '../grid/tiles.js';
import { makeNoise } from '../sim/senses.js';

/** Accumulates state changes and the events describing them. */
export class Transaction {
  private current: GameState;
  private readonly events: GameEvent[] = [];

  constructor(
    state: GameState,
    readonly module: CompiledModule,
  ) {
    this.current = state;
  }

  get state(): GameState {
    return this.current;
  }

  set(next: GameState): void {
    this.current = next;
  }

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  entity(id: EntityId): Entity | undefined {
    return this.current.entities[id];
  }

  /** Replace one entity. */
  putEntity(next: Entity): void {
    this.current = { ...this.current, entities: { ...this.current.entities, [next.id]: next } };
  }

  finish(): { state: GameState; events: GameEvent[] } {
    return { state: this.current, events: this.events };
  }
}

/** Coerce a DSL value into an entity id, or null when it is not one. */
function asEntityId(value: Value, state: GameState): EntityId | null {
  if (typeof value !== 'string') return null;
  return state.entities[value] ? (value) : null;
}

interface ResourceDef {
  id: string;
  min?: unknown;
  onDepleted?: unknown[];
}

interface ConditionDef {
  id: string;
  stacking: 'refresh' | 'extend' | 'stack' | 'ignore';
  defaultDuration?: unknown;
}

interface MonsterDef {
  damageInteractions?: { damageType: string; multiplier: number; unless?: string[] }[];
  conditionImmunities?: string[];
}

/**
 * Damage multiplier for a type, from the target's resistances.
 *
 * One multiplier covers resistance (0.5), immunity (0), and vulnerability (2)
 * rather than three separate mechanisms — and lets a module express healing
 * from fire as -1 without the engine knowing that is unusual.
 */
function damageMultiplier(module: CompiledModule, target: Entity, damageType: string | null): number {
  if (!damageType || !target.statblock) return 1;
  const statblock = module.find<MonsterDef>('content.monsters', target.statblock);
  const interaction = statblock?.damageInteractions?.find((entry) => entry.damageType === damageType);
  return interaction ? interaction.multiplier : 1;
}

function isImmuneTo(module: CompiledModule, target: Entity, condition: string): boolean {
  if (!target.statblock) return false;
  const statblock = module.find<MonsterDef>('content.monsters', target.statblock);
  return statblock?.conditionImmunities?.includes(condition) ?? false;
}

/** Change a resource, clamped, emitting the right events including depletion. */
export function adjustResource(
  txn: Transaction,
  entity: Entity,
  resourceId: string,
  delta: number,
  options: { damageType?: string | null; source?: EntityId | null; raw?: number } = {},
): void {
  const definition = txn.module.find<ResourceDef>('rules.resources', resourceId);
  if (!definition) {
    txn.emit({ type: 'refused', action: 'adjustResource', reason: `no resource "${resourceId}"` });
    return;
  }

  const before = entity.resources[resourceId] ?? 0;
  // The maximum depends on gear and conditions, so it is computed rather than
  // stored — see `stats.ts`.
  const max = maximaFor(txn, entity)[resourceId] ?? before;
  const min = 0;

  const after = Math.max(min, Math.min(max, before + delta));
  if (after === before) return;

  const updated: Entity = { ...entity, resources: { ...entity.resources, [resourceId]: after } };
  txn.putEntity(updated);

  if (delta < 0 && options.damageType !== undefined) {
    txn.emit({
      type: 'damaged',
      entity: entity.id,
      amount: before - after,
      damageType: options.damageType ?? null,
      raw: options.raw ?? before - after,
      resource: resourceId,
      source: options.source ?? null,
    });
  } else if (delta > 0) {
    txn.emit({ type: 'healed', entity: entity.id, amount: after - before, resource: resourceId });
  } else {
    txn.emit({ type: 'resourceChanged', entity: entity.id, resource: resourceId, from: before, to: after });
  }

  if (after <= min && before > min) {
    txn.emit({ type: 'depleted', entity: entity.id, resource: resourceId });

    // Death is not an engine concept: it is whatever the module attached to the
    // vital resource running out.
    if (resourceId === txn.module.source.rules.vitalResource) {
      txn.putEntity({ ...updated, alive: false });
      txn.emit({ type: 'died', entity: entity.id, killer: options.source ?? null });
    }
  }
}

/**
 * Resource maxima, cached per entity object.
 *
 * Maxima depend on gear and conditions so they are computed rather than stored,
 * but a burst of ops against one entity would otherwise recompute them per op.
 * The cache is keyed on the entity object, so any change invalidates it.
 */
const maximaCache = new WeakMap<Entity, Record<string, number>>();

function maximaFor(txn: Transaction, entity: Entity): Record<string, number> {
  const cached = maximaCache.get(entity);
  if (cached) return cached;
  const value = maximaOf(txn.module, entity, modifiersOf(txn.module, entity.attributes));
  maximaCache.set(entity, value);
  return value;
}

/** Apply a condition, honouring immunity and the declared stacking rule. */
export function applyCondition(
  txn: Transaction,
  entity: Entity,
  conditionId: string,
  duration: number | null,
  magnitude: number | null,
  source: EntityId | null,
): void {
  const definition = txn.module.find<ConditionDef>('rules.conditions', conditionId);
  if (!definition) {
    txn.emit({ type: 'refused', action: 'applyCondition', reason: `no condition "${conditionId}"` });
    return;
  }

  if (isImmuneTo(txn.module, entity, conditionId)) {
    txn.emit({ type: 'conditionResisted', entity: entity.id, condition: conditionId, reason: 'immune' });
    return;
  }

  const existing = entity.conditions.find((active) => active.condition === conditionId);
  const stacking = definition.stacking ?? 'refresh';

  if (existing && stacking === 'ignore') return;

  let conditions: ActiveCondition[];
  let stacked = false;

  if (!existing || stacking === 'stack') {
    conditions = [...entity.conditions, { condition: conditionId, remaining: duration, magnitude, source }];
    stacked = Boolean(existing);
  } else if (stacking === 'extend') {
    conditions = entity.conditions.map((active) =>
      active.condition === conditionId
        ? { ...active, remaining: (active.remaining ?? 0) + (duration ?? 0) }
        : active,
    );
    stacked = true;
  } else {
    // refresh: reset the clock without adding a second instance.
    conditions = entity.conditions.map((active) =>
      active.condition === conditionId ? { ...active, remaining: duration, magnitude, source } : active,
    );
  }

  txn.putEntity({ ...entity, conditions });
  txn.emit({ type: 'conditionApplied', entity: entity.id, condition: conditionId, duration, stacked });
}

export function removeCondition(txn: Transaction, entity: Entity, conditionId: string): void {
  if (!entity.conditions.some((active) => active.condition === conditionId)) return;
  txn.putEntity({
    ...entity,
    conditions: entity.conditions.filter((active) => active.condition !== conditionId),
  });
  txn.emit({ type: 'conditionRemoved', entity: entity.id, condition: conditionId, reason: 'removed' });
}

/** Add or remove carried items, merging stacks. */
export function changeInventory(
  txn: Transaction,
  entity: Entity,
  itemId: string,
  delta: number,
): void {
  if (delta === 0) return;
  if (!txn.module.has('content.items', itemId)) {
    txn.emit({ type: 'refused', action: 'inventory', reason: `no item "${itemId}"` });
    return;
  }

  const held = entity.inventory.find((stack) => stack.item === itemId)?.quantity ?? 0;
  const next = Math.max(0, held + delta);
  const actual = next - held;
  if (actual === 0) return;

  const inventory = next === 0
    ? entity.inventory.filter((stack) => stack.item !== itemId)
    : held === 0
      ? [...entity.inventory, { item: itemId, quantity: next }]
      : entity.inventory.map((stack) => (stack.item === itemId ? { ...stack, quantity: next } : stack));

  txn.putEntity({ ...entity, inventory });
  txn.emit(
    actual > 0
      ? { type: 'itemGained', entity: entity.id, item: itemId, quantity: actual }
      : { type: 'itemLost', entity: entity.id, item: itemId, quantity: -actual },
  );
}

export function adjustReputation(txn: Transaction, factionId: string, delta: number): void {
  if (!txn.module.has('content.factions', factionId)) {
    txn.emit({ type: 'refused', action: 'adjustReputation', reason: `no faction "${factionId}"` });
    return;
  }
  const before = txn.state.reputation[factionId] ?? 0;
  const after = before + delta;
  if (after === before) return;

  txn.set({ ...txn.state, reputation: { ...txn.state.reputation, [factionId]: after } });
  txn.emit({ type: 'reputationChanged', faction: factionId, from: before, to: after });

  // Standing with one faction bleeds into its allies and rivals.
  const faction = txn.module.find<{ relations?: Record<string, number> }>('content.factions', factionId);
  for (const [other, weight] of Object.entries(faction?.relations ?? {})) {
    const spill = Math.trunc(delta * weight);
    if (spill === 0) continue;
    const otherBefore = txn.state.reputation[other] ?? 0;
    txn.set({ ...txn.state, reputation: { ...txn.state.reputation, [other]: otherBefore + spill } });
    txn.emit({ type: 'reputationChanged', faction: other, from: otherBefore, to: otherBefore + spill });
  }
}

/**
 * Apply a list of effect ops.
 *
 * Ops are applied in order and each reads the state the previous one left, so
 * content can rely on sequencing — damage then check whether the target died.
 */
export function applyOps(txn: Transaction, ops: readonly EffectOp[], source: EntityId | null = null): void {
  for (const op of ops) {
    switch (op.op) {
      case 'damage': {
        const target = asEntityId(op.target, txn.state);
        const entity = target ? txn.entity(target) : undefined;
        if (!entity) break;
        // The dead take no further damage; without this, area effects would
        // "kill" a corpse repeatedly and emit a death event each time.
        if (!entity.alive) break;

        const multiplier = damageMultiplier(txn.module, entity, op.damageType);
        const amount = Math.round(op.amount * multiplier);
        if (amount === 0) break;

        adjustResource(txn, entity, txn.module.source.rules.vitalResource, -amount, {
          damageType: op.damageType,
          source,
          raw: op.amount,
        });
        break;
      }

      case 'heal': {
        const target = asEntityId(op.target, txn.state);
        const entity = target ? txn.entity(target) : undefined;
        // Healing the dead does nothing; raising is a separate effect.
        if (!entity || !entity.alive) break;
        adjustResource(txn, entity, txn.module.source.rules.vitalResource, Math.abs(op.amount));
        break;
      }

      case 'adjustResource': {
        const target = asEntityId(op.target, txn.state);
        const entity = target ? txn.entity(target) : undefined;
        if (!entity) break;
        adjustResource(txn, entity, op.resource, op.amount);
        break;
      }

      case 'applyCondition': {
        const target = asEntityId(op.target, txn.state);
        const entity = target ? txn.entity(target) : undefined;
        if (!entity || !entity.alive) break;
        applyCondition(txn, entity, op.condition, op.duration, op.magnitude, source);
        break;
      }

      case 'removeCondition': {
        const target = asEntityId(op.target, txn.state);
        const entity = target ? txn.entity(target) : undefined;
        if (!entity) break;
        removeCondition(txn, entity, op.condition);
        break;
      }

      case 'grantItem':
      case 'removeItem': {
        const target = asEntityId(op.target, txn.state);
        const entity = target ? txn.entity(target) : undefined;
        if (!entity) break;
        changeInventory(txn, entity, op.item, op.op === 'grantItem' ? op.quantity : -op.quantity);
        break;
      }

      case 'setFlag': {
        txn.set({ ...txn.state, flags: { ...txn.state.flags, [op.flag]: op.value } });
        txn.emit({ type: 'flagSet', flag: op.flag, value: op.value });
        break;
      }

      case 'adjustReputation':
        adjustReputation(txn, op.faction, op.amount);
        break;

      case 'move': {
        const target = asEntityId(op.target, txn.state);
        const entity = target ? txn.entity(target) : undefined;
        if (!entity) break;
        // Teleporting to a named place is resolved by the caller, which knows
        // about maps; here it only records the intent as a custom event.
        txn.emit({ type: 'custom', event: 'moveRequested', data: { entity: entity.id, to: op.to } });
        break;
      }

      case 'emit':
        txn.emit({ type: 'custom', event: op.event, data: op.data });
        break;

      case 'noise': {
        // Where the sound came from: the named source, or whoever acted.
        const maker = op.source ? txn.entity(op.source) : source ? txn.entity(source) : undefined;
        if (maker) {
          makeNoise(
            txn,
            new TerrainIndex(txn.module),
            op.sense,
            maker.position,
            maker.map,
            op.loudness,
            maker.id,
          );
        }
        break;
      }

      default:
        break;
    }
  }
}
