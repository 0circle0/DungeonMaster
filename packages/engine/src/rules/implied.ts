/** Conditions that hold without having been applied. */

import type { CompiledModule } from '@dm/module';
import type { Entity } from '../state.js';

interface Implier {
  implies: string[];
}

/** Conditions implied by the ones an entity already has, transitively. */
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

/** Every condition that counts right now: the ones applied, and the ones those imply. */
export function conditionsInForce(module: CompiledModule, entity: Entity): string[] {
  const implied = impliedConditions(module, entity);
  const direct = entity.conditions.map((active) => active.condition);
  return implied.length === 0 ? direct : [...direct, ...implied];
}
