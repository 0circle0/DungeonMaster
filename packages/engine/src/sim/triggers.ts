/**
 * Triggers: things that happen because you went somewhere.
 *
 * The interesting part is repetition. A set piece fires once; an ambush can fire every visit; a
 * ritual repeats until it is completed; ambience loops on a cooldown; a shifting barrow resets
 * itself. All five are the same declaration with a different `mode`.
 *
 * `remember` decides whether the world keeps a record, which is what makes a ransacked shrine stay
 * ransacked across visits.
 */

import { Rng } from '@dm/core';
import { evalEffects, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Effect, Predicate, Requirement } from '@dm/module';
import type { Entity } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps } from '../rules/apply.js';

export interface TriggerDef {
  id: string;
  mode: 'once' | 'everyEntry' | 'untilComplete' | 'loop' | 'restart';
  on: string;
  event?: string;
  requires?: Requirement;
  when?: Predicate;
  cooldownMinutes: number;
  completeWhen?: Predicate;
  remember: boolean;
  chance: number;
  effects: Effect[];
  textKey?: string;
}

/** Where a trigger lives, so `restart` knows what to reset. */
export interface TriggerSource {
  /** Content id of the place or thing the triggers hang off. */
  readonly id: string;
  readonly kind: 'biome' | 'area' | 'poi' | 'room' | 'dungeon';
}

/**
 * Whether a trigger should fire now. Separated from firing so the decision can be tested on its own
 * — the modes are where the bugs live.
 */
export function shouldFire(
  txn: Transaction,
  trigger: TriggerDef,
  actor: Entity,
  rng: Rng,
): boolean {
  const lastFired = txn.state.firedTriggers[trigger.id];
  const now = txn.state.minute;

  switch (trigger.mode) {
    case 'once':
      // Only ever once for this save, which is what `remember` records.
      if (lastFired !== undefined) return false;
      break;

    case 'loop':
      if (lastFired !== undefined && now - lastFired < trigger.cooldownMinutes) return false;
      break;

    case 'untilComplete': {
      // Repeats until its completion condition holds, then stops for good.
      if (!trigger.completeWhen) break;
      const scope = buildScope(txn.module, txn.state, actor);
      if (evalPredicate(trigger.completeWhen, { scope, rng, openNamespaces: OPEN_NAMESPACES })) return false;
      break;
    }

    case 'everyEntry':
    case 'restart':
    default:
      break;
  }

  const scope = buildScope(txn.module, txn.state, actor);
  if (!isEmptyRequirement(trigger.requires)) {
    if (!evalPredicate(compileRequirement(trigger.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES })) return false;
  }
  if (trigger.when && !evalPredicate(trigger.when, { scope, rng, openNamespaces: OPEN_NAMESPACES })) return false;

  // Chance is rolled last, so a trigger that fails its gate does not consume randomness and shift
  // everything downstream.
  if (trigger.chance < 1 && !rng.chance(trigger.chance)) return false;

  return true;
}

/**
 * Fire the triggers on a place for one occasion. `on` names the occasion — entering, resting,
 * finishing a fight — and only triggers declaring that occasion are considered.
 */
export function runTriggers(
  txn: Transaction,
  triggers: readonly TriggerDef[],
  occasion: string,
  source: TriggerSource,
  actor: Entity,
  rng: Rng,
  customEvent?: string,
): void {
  for (const trigger of triggers) {
    if (trigger.on !== occasion) continue;
    if (occasion === 'custom' && trigger.event !== customEvent) continue;

    const triggerRng = rng.derive(`trigger:${trigger.id}`);
    let willFire = shouldFire(txn, trigger, actor, triggerRng);

    // A mod gets the last word on whether a module trigger fires. `replace` decides it outright;
    // anything else just observes.
    if (txn.mods?.has('trigger.shouldFire', occasion)) {
      const outcome = txn.mods.run(
        txn,
        'trigger.shouldFire',
        { triggerId: trigger.id, occasion, actorId: actor.id, willFire },
        triggerRng,
      );
      if (outcome.replaced) willFire = !willFire;
    }

    if (!willFire) continue;

    // A restart wipes what the world remembered about this place, so returning to an unfinished
    // barrow finds it reordered rather than half-cleared.
    if (trigger.mode === 'restart') {
      forgetTriggersFrom(txn, source, trigger.id);
    }

    if (trigger.remember) {
      txn.set({
        ...txn.state,
        firedTriggers: { ...txn.state.firedTriggers, [trigger.id]: txn.state.minute },
      });
    }

    txn.emit({ type: 'triggerFired', trigger: trigger.id, at: source.id });

    if (trigger.textKey) {
      txn.emit({ type: 'narrate', textKey: trigger.textKey, context: { where: source.id } });
    }

    if (trigger.effects.length > 0) {
      const current = txn.entity(actor.id) ?? actor;
      const scope = buildScope(txn.module, txn.state, current);
      applyOps(txn, evalEffects(trigger.effects, { scope, rng, openNamespaces: OPEN_NAMESPACES }), current.id);
    }
  }
}

/**
 * Forget that a place's triggers ever fired. Trigger ids are namespaced by their source in
 * practice, but a module may reuse one, so the restarting trigger itself is kept — otherwise a
 * `restart` would immediately be eligible to fire again.
 */
function forgetTriggersFrom(txn: Transaction, source: TriggerSource, keep: string): void {
  const remaining: Record<string, number> = {};
  const prefix = `${source.kind}:${source.id}:`;

  for (const [id, at] of Object.entries(txn.state.firedTriggers)) {
    if (id === keep || !id.startsWith(prefix)) remaining[id] = at;
  }
  txn.set({ ...txn.state, firedTriggers: remaining });
}

/** Collect the triggers that apply to a place, biome first so ambience is shared. */
export function triggersFor(
  txn: Transaction,
  sources: readonly { collection: string; id: string }[],
): TriggerDef[] {
  const out: TriggerDef[] = [];
  for (const source of sources) {
    const entry = txn.module.find<{ triggers?: TriggerDef[]; completionTriggers?: TriggerDef[] }>(
      source.collection,
      source.id,
    );
    out.push(...(entry?.triggers ?? []), ...(entry?.completionTriggers ?? []));
  }
  return out;
}
