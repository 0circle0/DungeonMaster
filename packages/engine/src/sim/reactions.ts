/**
 * Turning events into reactions.
 *
 * `content.monsters[].reactions` and `content.npcs[].reactions` declare twelve
 * triggers — `seePlayer`, `allyHurt`, `allyKilled`, `selfHurt`, `lowHealth`,
 * `combatStart`, `combatEnd`, `turnStart`, `witnessDeed`, `questComplete`,
 * `itemShown`, `custom` — and exactly one of them was ever broadcast. Eleven
 * were schema that read like a feature and behaved like a comment. Greenmarch's
 * wight has kept a death-wail and a memory of thieves since it was written, and
 * neither had ever fired.
 *
 * The dispatch is **event-driven** rather than hooked at each origin. Damage
 * alone arrives from six places — a player ability, an AI ability, a trap,
 * terrain, a condition tick, and a resource bottoming out — and hooking all six
 * is six edits that rot. `damaged` is one event, emitted once, from all of them.
 *
 * It also cannot be driven from inside `adjustResource`: reaction effects call
 * `applyOps`, which calls `adjustResource`, and the only thing standing between
 * that and unbounded recursion would be a scratch set meant for something else.
 */

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

/**
 * Fan a batch of events out to whoever declared a reaction to them.
 *
 * `died` is deliberately absent: `allyKilled` is still broadcast from
 * `performAbility`, where it has always been. Moving its timing is a separate
 * change from making eleven dead triggers live, and tangling the two would make
 * a regression in either impossible to bisect.
 */
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

        // "Ally" is read the way `isHostileTo` reads every other question about
        // sides: anyone who is not hostile to the victim. That makes a monster
        // pack care about its own without a module declaring a faction, and
        // keeps one definition of whose side somebody is on.
        for (const entity of bystanders(txn, victim)) {
          if (isHostileTo(entity, victim)) continue;
          runReactions(txn, entity, 'allyHurt', victim, rng.derive(`allyHurt:${entity.id}`));
        }
        break;
      }

      case 'deedDone': {
        // Exactly the people who saw it, which is the whole point of the
        // witness roll in `recordDeed` — not everyone standing about. The
        // event carries the deed's id rather than its doer, so who to be
        // annoyed at comes back out of the log.
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
        // `deed` and `startQuest` are the reducer's own vocabulary and are
        // handled there; re-broadcasting them here would fire a reaction on the
        // machinery rather than on the event the content meant.
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

/**
 * Reactions to being noticed.
 *
 * Split from the event fan-out because noticing is not an event: it is a
 * difference between two perception passes, which `perceiveAll` computes and
 * now returns. Passing the pairs in rather than importing `runReactions` into
 * `sim/senses.ts` is deliberate — `rules/combat/turn.ts` already imports
 * `canPerceive` from there, so the reverse edge would close a cycle.
 */
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
