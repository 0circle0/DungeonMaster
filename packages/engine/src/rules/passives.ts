/**
 * Passive rules: what an ancestry is and what a carried thing does.
 *
 * `ancestries[].traits` and `items[].procs` are the same shape — a `RuleSchema`
 * of `{ when?, then }` — and both were accepted, validated, and run by nothing.
 * A dwarf's stoutness and a cloak's ward were flavour text with a JSON body.
 *
 * They are evaluated rather than applied-once because they are *passive*: the
 * condition is re-asked, so "while bloodied" means while bloodied. A rule that
 * should fire once says so by setting a flag in its own `when`, exactly as a
 * trigger does.
 */

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

  // Carried, not merely equipped: a proc on a charm in your pack is still on
  // you. An item that should only work in hand says so with its own `when`.
  for (const stack of entity.inventory) {
    const item = txn.module.find<ItemDef>('content.items', stack.item);
    out.push(...(item?.procs ?? []));
  }
  return out;
}

/**
 * Run the passive rules on one creature.
 *
 * A rule with no `when` fires every time it is asked, which is what a module
 * means by an unconditional passive — and why most of them carry one.
 */
export function runPassives(txn: Transaction, entityId: string, rng: Rng): void {
  const entity = txn.entity(entityId);
  if (!entity || !entity.alive) return;

  // Mods run alongside the module's own passives, and are consulted even when
  // an entity has none of its own — a mod granting a trait to everything would
  // otherwise be invisible on entities the module never gave traits to.
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
      // A malformed condition hides the rule rather than stopping the turn —
      // the same courtesy quest availability already extends.
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
