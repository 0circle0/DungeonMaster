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

import { Rng } from '@dm/core';
import { evalEffects, evalExpr } from '@dm/module';
import type { CompiledModule, Effect, EffectOp, Expr, Value } from '@dm/module';
import type { GameState, Entity, EntityId, ActiveCondition } from '../state.js';
import type { GameEvent } from '../events.js';
import { buildScope, maximaOf, minimaOf, modifiersOf, OPEN_NAMESPACES } from '../stats.js';
import { TerrainIndex } from '../grid/tiles.js';
import { makeNoise } from '../sim/senses.js';
import { testConcentration } from './casting.js';
import { message } from '../narrate/systemText.js';
import { configOf } from './config.js';

/** Accumulates state changes and the events describing them. */
export class Transaction {
  private current: GameState;
  private readonly events: GameEvent[] = [];

  /**
   * Depletions currently unwinding, as `<entity>:<resource>`.
   *
   * Per-call scratch, deliberately not on `GameState`: a module whose
   * `onDepleted` pushes the same pool back to its floor would otherwise recurse
   * without end. Never serialized, so it cannot affect save equality.
   */
  readonly depleting = new Set<string>();

  constructor(
    state: GameState,
    readonly module: CompiledModule,
  ) {
    this.current = state;
  }

  get state(): GameState {
    return this.current;
  }

  /**
   * Randomness for effects that are evaluated deep inside an application.
   *
   * `evalEffects` normally runs at the top of a reduction, where the reducer's
   * own generator is in hand. A few things — an `onDepleted` that heals `1d4`,
   * a condition whose `defaultDuration` is rolled — are only reached from here.
   * Deriving from the state's own generator keeps them a pure function of the
   * state they fire in, so a replay reproduces them exactly.
   */
  rngFor(label: string): Rng {
    return Rng.fromState(this.current.rng).derive(label);
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
  onApply?: unknown[];
}

interface Interaction {
  damageType: string;
  multiplier: number;
  unless?: string[];
}

interface MonsterDef {
  damageInteractions?: Interaction[];
  conditionImmunities?: string[];
}

/**
 * Every resistance, immunity and vulnerability that applies to a creature.
 *
 * Only the statblock was consulted, and only monsters have one — so a *player
 * character* could not have a resistance at all, and `ancestries[].
 * damageInteractions` and `items[].damageInteractions` were unreachable by
 * construction rather than merely unimplemented.
 *
 * Sources compose multiplicatively: armour that halves fire on top of an
 * ancestry that already halves it leaves a quarter, which is the reading that
 * makes stacking protections worth having without making them additive-to-zero.
 */
function interactionsFor(module: CompiledModule, target: Entity): Interaction[] {
  const out: Interaction[] = [];

  if (target.statblock) {
    const statblock = module.find<MonsterDef>('content.monsters', target.statblock);
    out.push(...(statblock?.damageInteractions ?? []));
  }
  if (target.ancestry) {
    const ancestry = module.find<MonsterDef>('content.ancestries', target.ancestry);
    out.push(...(ancestry?.damageInteractions ?? []));
  }
  for (const itemIds of Object.values(target.equipped)) {
    for (const itemId of itemIds) {
      const item = module.find<MonsterDef>('content.items', itemId);
      out.push(...(item?.damageInteractions ?? []));
    }
  }
  return out;
}

/** Conditions a creature shrugs off, from its statblock or its ancestry. */
function immunitiesOf(module: CompiledModule, target: Entity): string[] {
  const out: string[] = [];
  if (target.statblock) {
    out.push(...(module.find<MonsterDef>('content.monsters', target.statblock)?.conditionImmunities ?? []));
  }
  if (target.ancestry) {
    out.push(...(module.find<MonsterDef>('content.ancestries', target.ancestry)?.conditionImmunities ?? []));
  }
  return out;
}

/**
 * Damage multiplier for a type, from the target's resistances.
 *
 * One multiplier covers resistance (0.5), immunity (0), and vulnerability (2)
 * rather than three separate mechanisms — and lets a module express healing
 * from fire as -1 without the engine knowing that is unusual.
 */
function damageMultiplier(
  module: CompiledModule,
  target: Entity,
  damageType: string | null,
  tags: readonly string[] = [],
): number {
  if (!damageType) return 1;

  let multiplier = 1;
  for (const interaction of interactionsFor(module, target)) {
    if (interaction.damageType !== damageType) continue;
    // `unless` is what makes "immune to slashing, except silvered" expressible.
    // Without it the classic beat — an ordinary blade is useless, the warded one
    // is not — had no way to be written.
    if (interaction.unless?.some((tag) => tags.includes(tag))) continue;
    multiplier *= interaction.multiplier;
  }
  return multiplier;
}

function isImmuneTo(module: CompiledModule, target: Entity, condition: string): boolean {
  return immunitiesOf(module, target).includes(condition);
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
    txn.emit({ type: 'refused', action: 'adjustResource', reason: message('refused.internal.unknownResource', { resource: resourceId }) });
    return;
  }

  const before = entity.resources[resourceId] ?? 0;
  // Both bounds depend on gear and conditions, so they are computed rather than
  // stored — see `stats.ts`.
  const max = maximaFor(txn, entity)[resourceId] ?? before;
  const min = minimaFor(txn, entity)[resourceId] ?? 0;

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

    // Being hurt is the only moment concentration is really tested, so the
    // check lives on the damage rather than on a turn boundary.
    testConcentration(txn, entity, before - after, txn.rngFor(`concentration:${entity.id}`));
  } else if (delta > 0) {
    txn.emit({ type: 'healed', entity: entity.id, amount: after - before, resource: resourceId });
  } else {
    txn.emit({ type: 'resourceChanged', entity: entity.id, resource: resourceId, from: before, to: after });
  }

  if (after <= min && before > min) {
    txn.emit({ type: 'depleted', entity: entity.id, resource: resourceId });
    runDepletion(txn, entity.id, resourceId, options.source ?? null);
  }
}

/**
 * What happens when a pool bottoms out.
 *
 * The order is the design: the module's own `onDepleted` runs **first**, and
 * death is only declared afterwards, if the character is still at the floor.
 * That is what lets `[heal 1, applyCondition downed]` mean "dropped to 0 and
 * stabilised" — the D&D shape — without the engine needing a concept of dying
 * separate from a resource running out. A resource that declares no
 * `onDepleted` behaves exactly as it did before.
 */
function runDepletion(
  txn: Transaction,
  entityId: EntityId,
  resourceId: string,
  killer: EntityId | null,
): void {
  const definition = txn.module.find<ResourceDef>('rules.resources', resourceId);
  const effects = (definition?.onDepleted ?? []) as Effect[];

  if (effects.length > 0) {
    // `onDepleted` may itself damage, heal, or kill. Without a guard, a module
    // whose effects push the same pool back down would recurse forever; the
    // mark is per-call scratch on the transaction and is never serialized.
    const mark = `${entityId}:${resourceId}`;
    if (txn.depleting.has(mark)) return;
    txn.depleting.add(mark);
    try {
      const current = txn.entity(entityId);
      if (current) {
        const scope = buildScope(txn.module, txn.state, current);
        const rng = txn.rngFor(`depleted:${entityId}:${resourceId}`);
        applyOps(txn, evalEffects(effects, { scope, rng, openNamespaces: OPEN_NAMESPACES }), entityId);
      }
    } finally {
      txn.depleting.delete(mark);
    }
  }

  // Death is not an engine concept: it is whatever the module attached to the
  // vital resource running out — but only if the module did not just pull the
  // character back off the floor.
  if (resourceId !== txn.module.source.rules.vitalResource) return;

  const after = txn.entity(entityId);
  if (!after || !after.alive) return;

  const min = minimaFor(txn, after)[resourceId] ?? 0;
  if ((after.resources[resourceId] ?? 0) > min) return;

  txn.putEntity({ ...after, alive: false });
  txn.emit({ type: 'died', entity: entityId, killer });
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

/** Minima, cached the same way and for the same reason. */
const minimaCache = new WeakMap<Entity, Record<string, number>>();

function minimaFor(txn: Transaction, entity: Entity): Record<string, number> {
  const cached = minimaCache.get(entity);
  if (cached) return cached;
  const value = minimaOf(txn.module, entity, modifiersOf(txn.module, entity.attributes));
  minimaCache.set(entity, value);
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
    txn.emit({ type: 'refused', action: 'applyCondition', reason: message('refused.internal.unknownCondition', { condition: conditionId }) });
    return;
  }

  if (isImmuneTo(txn.module, entity, conditionId)) {
    txn.emit({ type: 'conditionResisted', entity: entity.id, condition: conditionId, reason: 'immune' });
    return;
  }

  // An effect that names no duration gets the condition's own. Without this,
  // every authored `defaultDuration` was ignored and the condition lasted until
  // something removed it — so "frightened for 2 rounds" meant frightened for
  // the rest of the game.
  const applied = duration ?? durationOf(txn, definition, entity, magnitude);

  const existing = entity.conditions.find((active) => active.condition === conditionId);
  const stacking = definition.stacking ?? 'refresh';

  if (existing && stacking === 'ignore') return;

  let conditions: ActiveCondition[];
  let stacked = false;

  if (!existing || stacking === 'stack') {
    conditions = [...entity.conditions, { condition: conditionId, remaining: applied, magnitude, source }];
    stacked = Boolean(existing);
  } else if (stacking === 'extend') {
    conditions = entity.conditions.map((active) =>
      active.condition === conditionId
        ? { ...active, remaining: (active.remaining ?? 0) + (applied ?? 0) }
        : active,
    );
    stacked = true;
  } else {
    // refresh: reset the clock without adding a second instance.
    conditions = entity.conditions.map((active) =>
      active.condition === conditionId ? { ...active, remaining: applied, magnitude, source } : active,
    );
  }

  txn.putEntity({ ...entity, conditions });
  txn.emit({ type: 'conditionApplied', entity: entity.id, condition: conditionId, duration: applied, stacked });

  // `onApply` fires when the condition actually takes hold — so a second dose
  // of a `refresh` condition re-runs it, and one that was `ignore`d does not.
  const effects = (definition.onApply ?? []) as Effect[];
  if (effects.length > 0) {
    const current = txn.entity(entity.id);
    if (current) {
      const scope = { ...buildScope(txn.module, txn.state, current), magnitude: magnitude ?? 1 };
      const rng = txn.rngFor(`onApply:${entity.id}:${conditionId}`);
      applyOps(txn, evalEffects(effects, { scope, rng, openNamespaces: OPEN_NAMESPACES }), source);
    }
  }
}

/** A condition's own duration, rolled if the module wrote it as dice. */
function durationOf(
  txn: Transaction,
  definition: ConditionDef,
  entity: Entity,
  magnitude: number | null,
): number | null {
  if (definition.defaultDuration === undefined) return null;
  const scope = { ...buildScope(txn.module, txn.state, entity), magnitude: magnitude ?? 1 };
  const rng = txn.rngFor(`duration:${entity.id}:${definition.id}`);
  const value = evalExpr(definition.defaultDuration as Expr, { scope, rng, openNamespaces: OPEN_NAMESPACES });
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
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
    txn.emit({ type: 'refused', action: 'inventory', reason: message('refused.item.unknown', { item: itemId }) });
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
    txn.emit({ type: 'refused', action: 'adjustReputation', reason: message('refused.internal.unknownFaction', { faction: factionId }) });
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
    const spill = configOf(txn.module).roundReputation(delta * weight);
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

        const multiplier = damageMultiplier(txn.module, entity, op.damageType, op.tags ?? []);
        const amount = configOf(txn.module).roundDamage(op.amount * multiplier);
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

      case 'adjustCurrency': {
        // Whether the purse can go below zero is the module's call. Clamped,
        // a party that overspends is refused the difference rather than put
        // into a debt nothing else knows how to read; allowed, a module can
        // model exactly that.
        const before = txn.state.purse;
        const raw = before + op.amount;
        const after = configOf(txn.module).allowDebt ? raw : Math.max(0, raw);
        if (after === before) break;
        txn.set({ ...txn.state, purse: after });
        txn.emit({ type: 'currencyChanged', amount: after - before, purse: after });
        break;
      }

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

      default: {
        // An op the engine does not implement did nothing, quietly — which is
        // the exact failure this file exists to prevent on the content side.
        // The `never` makes it a compile error to add an op and forget the
        // case; the refusal covers a module built against a newer engine.
        const unhandled: never = op;
        txn.emit({
          type: 'refused',
          action: 'applyOps',
          reason: message('refused.internal.unknownOp', { op: (unhandled as { op: string }).op }),
        });
        break;
      }
    }
  }
}
