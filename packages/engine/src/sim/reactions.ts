/** Turning events into reactions. */

import { Rng } from '@dm/core';
import type { Entity } from '../state.js';
import type { GameEvent } from '../events.js';
import { Transaction } from '../rules/apply.js';
import { runReactions } from '../rules/combat/turn.js';
import { combatants, isHostileTo } from '../rules/combat/targeting.js';

/** Everyone present who might react, the subject excepted. */
function bystanders(txn: Transaction, subject: Entity | null): readonly Entity[] {
  return combatants(txn.state, txn.state.currentMap)
    .filter((entity) => !subject || entity.id !== subject.id);
}

/** Fan a batch of events out to whoever declared a reaction to them. */
export function dispatchReactions(
  txn: Transaction,
  events: readonly GameEvent[],
  rng: Rng,
): void {
  for (const event of events) {
    switch (event.type) {
      case 'turnStarted': {
        const actor = txn.entity(event.entity);
        if (actor) runReactions(txn, actor, 'turnStart', null, rng.derive(`turnStart:${actor.id}`));
        break;
      }

      case 'combatStarted': {
        for (const id of event.participants) {
          const entity = txn.entity(id);
          if (entity) runReactions(txn, entity, 'combatStart', null, rng.derive(`combatStart:${id}`));
        }
        break;
      }

      case 'combatEnded': {
        for (const entity of bystanders(txn, null)) {
          runReactions(txn, entity, 'combatEnd', null, rng.derive(`combatEnd:${entity.id}`));
        }
        break;
      }

      case 'damaged': {
        const victim = txn.entity(event.entity);
        if (!victim) break;
        const source = event.source ? txn.entity(event.source) ?? null : null;

        runReactions(txn, victim, 'selfHurt', source, rng.derive(`selfHurt:${victim.id}`));

        // "Ally" is anyone not hostile to the victim, as `isHostileTo` reads it.
        for (const entity of bystanders(txn, victim)) {
          if (isHostileTo(entity, victim)) continue;
          runReactions(txn, entity, 'allyHurt', victim, rng.derive(`allyHurt:${entity.id}`));
        }
        break;
      }

      case 'deedDone': {
        // Exactly the people who saw it, which is the point of the witness roll in `recordDeed`.
        const deed = txn.state.deeds.find((entry) => entry.id === event.deed);
        const actor = deed ? txn.entity(deed.actor) ?? null : null;
        for (const id of event.witnesses) {
          const witness = txn.entity(id);
          if (witness) runReactions(txn, witness, 'witnessDeed', actor, rng.derive(`witness:${id}`));
        }
        break;
      }

      case 'questCompleted': {
        for (const entity of bystanders(txn, null)) {
          runReactions(txn, entity, 'questComplete', null, rng.derive(`questDone:${entity.id}`));
        }
        break;
      }

      case 'custom': {
        // `deed` and `startQuest` are the reducer's own vocabulary and are handled there.
        if (event.event === 'deed' || event.event === 'startQuest') break;
        for (const entity of bystanders(txn, null)) {
          runReactions(
            txn, entity, 'custom', null,
            rng.derive(`custom:${event.event}:${entity.id}`), event.event,
          );
        }
        break;
      }

      default:
        break;
    }
  }
}

/** Reactions to being noticed. */
export function dispatchNoticed(
  txn: Transaction,
  noticed: readonly { readonly observer: string; readonly subject: string }[],
  rng: Rng,
): void {
  for (const { observer, subject } of noticed) {
    const watcher = txn.entity(observer);
    const seen = txn.entity(subject);
    if (watcher && seen) {
      runReactions(txn, watcher, 'seePlayer', seen, rng.derive(`seePlayer:${observer}:${subject}`));
    }
  }
}
