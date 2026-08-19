/**
 * Conditions that hold without having been applied.
 *
 * `implies` describes a condition that supersedes another: being unconscious
 * is being prone, without anyone having to remember to apply prone as well.
 *
 * This lives on its own rather than in `conditions.ts` because both the
 * condition lifecycle and the stat pipeline need it, and `conditions.ts`
 * already depends on `check.ts`, which depends on `stats.ts`. A shared leaf
 * with no imports of its own is the version of that with no cycle in it.
 */

import type { CompiledModule } from '@dm/module';
import type { Entity } from '../state.js';

interface Implier {
  implies: string[];
}

/**
 * Conditions implied by the ones an entity already has, transitively.
 *
 * Never one it already holds directly. `unconscious implies prone` on a
 * creature that is also prone in its own right must not count prone twice, or
 * a condition would be worth more for having arrived by two routes.
 */
export function impliedConditions(module: CompiledModule, entity: Entity): string[] {
  const held = new Set(entity.conditions.map((active) => active.condition));
  const out = new Set<string>();
  const queue = [...held];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const definition = module.find<Implier>('rules.conditions', current);
    for (const implied of definition?.implies ?? []) {
      if (held.has(implied) || out.has(implied)) continue;
      out.add(implied);
      queue.push(implied);
    }
  }
  return [...out];
}

/**
 * Every condition that counts right now: the ones applied, and the ones those
 * imply.
 *
 * An implied condition has no lifecycle of its own. It does not tick, it does
 * not expire, and it cannot be saved against or removed on its own -- it holds
 * for exactly as long as the condition implying it does. That is what
 * `implies` has always meant by superseding, and it is why this is a derived
 * view rather than entries written into `entity.conditions`: writing them
 * there would mean removal had to know why each one arrived.
 */
export function conditionsInForce(module: CompiledModule, entity: Entity): string[] {
  const implied = impliedConditions(module, entity);
  const direct = entity.conditions.map((active) => active.condition);
  return implied.length === 0 ? direct : [...direct, ...implied];
}
