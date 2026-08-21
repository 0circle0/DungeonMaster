/** Passive rules: what an ancestry is and what a carried thing does. */

import { Rng } from '@dm/core';
import { evalEffects, evalPredicate } from '@dm/module';
import type { Effect, Predicate } from '@dm/module';
import type { Entity } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps } from '../rules/apply.js';

interface PassiveRule {
  when?: Predicate;
  then: Effect[];
}

interface AncestryDef {
  traits?: PassiveRule[];
}

interface ItemDef {
  procs?: PassiveRule[];
}

/** Every passive rule that currently applies to one creature. */
function rulesFor(txn: Transaction, entity: Entity): PassiveRule[] {
  const out: PassiveRule[] = [];

  if (entity.ancestry) {
    const ancestry = txn.module.find<AncestryDef>('content.ancestries', entity.ancestry);
    out.push(...(ancestry?.traits ?? []));
  }

  // Carried, not merely equipped: a proc on a charm in your pack is still on you.
  for (const stack of entity.inventory) {
    const item = txn.module.find<ItemDef>('content.items', stack.item);
    out.push(...(item?.procs ?? []));
  }
  return out;
}

/** Run the passive rules on one creature. */
export function runPassives(txn: Transaction, entityId: string, rng: Rng): void {
  const entity = txn.entity(entityId);
  if (!entity || !entity.alive) return;

  // Mods are consulted even when an entity has no passives of its own.
  if (txn.mods?.has('passives')) {
    const outcome = txn.mods.run(txn, 'passives', { entityId }, rng.derive(`modPassive:${entityId}`));
    if (outcome.replaced) return;
  }

  const rules = rulesFor(txn, entity);
  if (rules.length === 0) return;

  for (const [index, rule] of rules.entries()) {
    const current = txn.entity(entityId);
    if (!current || !current.alive) return;

    const scope = buildScope(txn.module, txn.state, current);
    const context = { scope, rng: rng.derive(`passive:${index}`), openNamespaces: OPEN_NAMESPACES };

    try {
      if (rule.when && !evalPredicate(rule.when, context)) continue;
    } catch {
      // A malformed condition hides the rule rather than stopping the turn.
      continue;
    }
    if (rule.then.length === 0) continue;

    applyOps(txn, evalEffects(rule.then, context), current.id);
  }
}

/** Run them for the whole party, which is where they are asked from. */
export function runPartyPassives(txn: Transaction, rng: Rng): void {
  for (const id of txn.state.party) runPassives(txn, id, rng.derive(`passives:${id}`));
}
