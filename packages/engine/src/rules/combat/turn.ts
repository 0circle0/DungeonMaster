/**
 * Turn structure: initiative, the action economy, and reactions.
 *
 * What a turn *is* comes from the module. `rules.actionTypes` declares the
 * budget — one action and one quick action, or three actions, or none at all —
 * and abilities name which they consume. The engine only tracks what has been
 * spent.
 *
 * Combat begins when something hostile can see the party and ends when one side
 * is gone. It is not a mode the player enters deliberately, because on an
 * always-on grid there is no moment where it would be entered.
 */

import { Rng } from '@dm/core';
import { evalEffects, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Effect, Predicate, Requirement } from '@dm/module';
import type { Scope } from '@dm/module';
import type { Entity, EntityId } from '../../state.js';
import { buildScope, statsOf, OPEN_NAMESPACES } from '../../stats.js';
import { Transaction, applyOps } from '../apply.js';
import { tickConditions } from '../conditions.js';
import { check, savingThrow, succeeded, skillModifier, difficultyOf } from '../check.js';
import type { TargetingContext } from './targeting.js';
import { useAbility } from './attack.js';
import { recordEncounter } from '../../sim/agenda.js';
import { combatants, isHostileTo, reachOf, speedOf } from './targeting.js';
import { canPerceive } from '../../sim/senses.js';
import { distance } from '../../grid/geometry.js';
import type { Position } from '../../grid/tiles.js';

interface ActionTypeDef {
  id: string;
  perTurn: number;
}

interface ReactionDef {
  id: string;
  on: string;
  event?: string;
  priority: number;
  requires?: Requirement;
  when?: Predicate;
  chance: number;
  roll?: { skill?: string; attribute?: string; difficulty: number; opposedBy?: string };
  onSuccess: Effect[];
  onFailure: Effect[];
  effects: Effect[];
  use?: string;
  oncePerEncounter: boolean;
}

interface OpportunityDef {
  id: string;
  name: string;
  on: string;
  event?: string;
  actionType?: string;
  use?: string;
  requires?: Predicate;
  effects: Effect[];
  usesPerRound: number;
}

/** Roll initiative for everyone present and sort them. */
export function rollInitiative(
  txn: Transaction,
  participants: readonly Entity[],
  rng: Rng,
): EntityId[] {
  const stat = txn.module.source.rules.initiativeStat;

  const scored = participants.map((entity) => {
    const modifier = stat ? (statsOf(txn.module, entity).derived[stat] ?? 0) : 0;
    const roll = check(txn.module, rng.derive(`initiative:${entity.id}`), { modifier, difficulty: 0 });
    return { id: entity.id, total: roll.total };
  });

  // Ties break on entity id so the order is reproducible; a random tiebreak
  // would make two identical runs diverge on the first round.
  scored.sort((a, b) => (b.total !== a.total ? b.total - a.total : a.id.localeCompare(b.id)));
  return scored.map((entry) => entry.id);
}

/** A fresh action budget for whoever is about to act. */
function freshTurn(txn: Transaction, entity: Entity): { spent: Record<string, number>; movement: number } {
  return { spent: {}, movement: speedOf(txn.module, entity) };
}

/**
 * Put the player behind the character whose turn it is.
 *
 * Commands act as the selected character, so without this the last-selected
 * member spends every party turn — one character attacks round after round
 * while the rest of the party burns their turns on "no action left".
 */
function selectActive(txn: Transaction, next: Entity): void {
  if (next.kind !== 'character' || !txn.state.party.includes(next.id)) return;
  if (txn.state.selected === next.id) return;
  txn.set({ ...txn.state, selected: next.id });
}

/**
 * Begin combat, if anything hostile can actually perceive the party.
 *
 * Sharing a map is not enough. A dungeon holds a dozen creatures in separate
 * rooms; enrolling all of them the moment the party steps inside would put
 * everything into one initiative order and have monsters take turns against
 * someone they have never seen. Combat starts when someone is noticed, and only
 * those who noticed take part.
 */
export function maybeStartCombat(txn: Transaction, context: TargetingContext, rng: Rng): void {
  if (txn.state.combat) return;

  const present = combatants(txn.state, txn.state.currentMap);
  const party = present.filter((entity) => entity.kind === 'character');
  if (party.length === 0) return;

  if (!txn.state.maps[txn.state.currentMap]) return;

  const aware = present.filter((entity) => {
    if (!party.some((member) => isHostileTo(member, entity))) return false;
    // Fighting, not merely noticing. A creature that catches your scent across
    // the marsh has plenty to do about it — starting a fight is not one.
    return party.some((member) => canPerceive(context, entity, member, { threshold: 'aggro' }));
  });

  if (aware.length === 0) return;

  const participants = [...party, ...aware];
  const order = rollInitiative(txn, participants, rng.derive(`combat:${txn.state.minute}`));
  const first = txn.entity(order[0]!);

  txn.set({
    ...txn.state,
    combat: {
      round: 1,
      order,
      turn: 0,
      reactionsUsed: {},
      ...(first ? freshTurn(txn, first) : { spent: {}, movement: 0 }),
    },
  });

  if (first) selectActive(txn, first);

  txn.emit({ type: 'combatStarted', participants: order });
  txn.emit({ type: 'roundStarted', round: 1 });
  if (order[0]) txn.emit({ type: 'turnStarted', entity: order[0] });
}

/**
 * End combat when one side is gone — or when neither side can find the other.
 *
 * The second case is what makes running away work. Combat begins when someone
 * is noticed; it ends, symmetrically, when nobody can be noticed any more, so
 * breaking line of sight is a real escape rather than a chase that never ends.
 * The perception test needs terrain, so it only runs for callers that have it.
 */
export function maybeEndCombat(txn: Transaction, context?: TargetingContext): void {
  const combat = txn.state.combat;
  if (!combat) return;

  // Only the enrolled combatants matter: a creature asleep in another room does
  // not keep this fight going.
  const enrolled = combat.order
    .map((id) => txn.entity(id))
    .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity));

  const party = enrolled.filter((entity) => entity.kind === 'character' && entity.alive);
  const hostiles = enrolled.filter(
    (entity) => entity.alive && party.some((member) => isHostileTo(member, entity)),
  );

  // Getting away is judged at the top of a round, once everyone has had their
  // chance to give chase. Judging it the instant someone runs would let a
  // fleeing character vanish before the creature beside them could react.
  const escaped = party.length > 0 && hostiles.length > 0
    && context !== undefined
    && combat.turn === 0
    && !anyoneCanSeeAnyone(txn, context, party, hostiles);

  if (party.length > 0 && hostiles.length > 0 && !escaped) return;

  // What fought here is remembered by its kin, so the next ambush is prepared.
  const kinds = new Set<string>();
  for (const id of combat.order) {
    const entity = txn.entity(id);
    if (entity?.statblock) kinds.add(entity.statblock);
  }

  txn.set({ ...txn.state, combat: null });
  txn.emit({
    type: 'combatEnded',
    outcome: escaped ? 'fled' : party.length > 0 ? 'victory' : 'defeat',
  });

  if (party.length > 0) {
    const used = new Set<string>();
    for (const member of party) for (const ability of member.abilities) used.add(ability);
    for (const kind of kinds) recordEncounter(txn, kind, [...used]);
  }
}

/**
 * Can any of these perceive any of those?
 *
 * Deliberately the same test `maybeStartCombat` uses, so a fight cannot end and
 * immediately restart on the same tiles.
 */
function anyoneCanSeeAnyone(
  _txn: Transaction,
  context: TargetingContext,
  party: readonly Entity[],
  hostiles: readonly Entity[],
): boolean {
  return hostiles.some((hostile) =>
    party.some((member) => canPerceive(context, hostile, member, { threshold: 'aggro' })),
  );
}

/** Whose turn it is, or null outside combat. */
export function activeEntity(txn: Transaction): Entity | null {
  const combat = txn.state.combat;
  if (!combat) return null;
  const id = combat.order[combat.turn];
  return id ? (txn.entity(id) ?? null) : null;
}

/** Whether an action type still has budget this turn. */
export function hasBudget(txn: Transaction, actionType: string | undefined): boolean {
  if (!actionType) return true;
  const combat = txn.state.combat;
  if (!combat) return true;

  const definition = txn.module.find<ActionTypeDef>('rules.actionTypes', actionType);
  const allowed = definition?.perTurn ?? 1;
  return (combat.spent[actionType] ?? 0) < allowed;
}

/** Record that an action type was used. */
export function spendBudget(txn: Transaction, actionType: string | undefined): void {
  const combat = txn.state.combat;
  if (!combat || !actionType) return;
  txn.set({
    ...txn.state,
    combat: { ...combat, spent: { ...combat.spent, [actionType]: (combat.spent[actionType] ?? 0) + 1 } },
  });
}

/** Spend movement allowance. */
export function spendMovement(txn: Transaction, cost: number): void {
  const combat = txn.state.combat;
  if (!combat) return;
  txn.set({ ...txn.state, combat: { ...combat, movement: Math.max(0, combat.movement - cost) } });
}

/**
 * Advance to the next combatant, skipping the dead and ticking their conditions.
 *
 * Conditions tick at the *start* of a creature's turn, so a burning creature
 * takes damage once per round on its own turn rather than all at once.
 */
export function endTurn(txn: Transaction, context: TargetingContext, rng: Rng): void {
  const combat = txn.state.combat;
  if (!combat) {
    // Outside combat, ending a turn just ages everything one step.
    for (const entity of combatants(txn.state, txn.state.currentMap)) {
      tickConditions(txn, entity.id, rng.derive(`conditions:${entity.id}`));
    }
    return;
  }

  const finished = combat.order[combat.turn];
  if (finished) txn.emit({ type: 'turnEnded', entity: finished });

  let turn = combat.turn;
  let round = combat.round;

  // Find the next living combatant, wrapping into a new round if needed.
  for (let attempts = 0; attempts <= combat.order.length; attempts += 1) {
    turn += 1;
    if (turn >= combat.order.length) {
      turn = 0;
      round += 1;
      txn.set({ ...txn.state, combat: { ...combat, turn, round, reactionsUsed: {} } });
      txn.emit({ type: 'roundStarted', round });
    }

    const next = txn.entity(combat.order[turn]!);
    if (next && next.alive) {
      txn.set({
        ...txn.state,
        combat: {
          ...(txn.state.combat ?? combat),
          turn,
          round,
          ...freshTurn(txn, next),
        },
      });
      selectActive(txn, next);
      tickConditions(txn, next.id, rng.derive(`conditions:${next.id}:${round}`));
      txn.emit({ type: 'turnStarted', entity: next.id });

      maybeEndCombat(txn, context);
      return;
    }
  }

  // Nobody left standing.
  maybeEndCombat(txn, context);
}

/**
 * Opportunity attacks provoked by leaving a threatened tile.
 *
 * The rule is declared in `rules.opportunities`, so a module that does not want
 * them simply declares none.
 */
export function provokeOpportunity(
  txn: Transaction,
  context: TargetingContext,
  mover: Entity,
  from: Position,
  to: Position,
  rng: Rng,
): void {
  const opportunities = txn.module.all<OpportunityDef>('rules.opportunities')
    .filter((entry) => entry.on === 'moveAway');
  if (opportunities.length === 0) return;

  const combat = txn.state.combat;

  for (const other of combatants(txn.state, mover.map)) {
    if (other.id === mover.id || !isHostileTo(mover, other)) continue;

    const reach = reachOf(txn.module, other);
    // Provoked only by leaving reach, not by moving within it.
    if (distance(other.position, from) > reach) continue;
    if (distance(other.position, to) <= reach) continue;

    for (const opportunity of opportunities) {
      const used = combat?.reactionsUsed[other.id] ?? 0;
      if (used >= opportunity.usesPerRound) continue;

      const scope = buildScope(txn.module, txn.state, other, { target: { id: mover.id } as never });
      if (opportunity.requires && !evalPredicate(opportunity.requires, { scope, rng, openNamespaces: OPEN_NAMESPACES })) continue;

      if (combat) {
        txn.set({
          ...txn.state,
          combat: {
            ...(txn.state.combat),
            reactionsUsed: { ...(txn.state.combat).reactionsUsed, [other.id]: used + 1 },
          },
        });
      }

      txn.emit({ type: 'reacted', entity: other.id, reaction: opportunity.id, trigger: 'moveAway' });

      if (opportunity.effects.length > 0) {
        applyOps(txn, evalEffects(opportunity.effects, { scope, rng, openNamespaces: OPEN_NAMESPACES }), other.id);
      }

      // The usual case: the reaction *is* an attack of some kind.
      if (opportunity.use) {
        const reactor = txn.entity(other.id);
        const fleeing = txn.entity(mover.id);
        if (reactor?.alive && fleeing?.alive) {
          useAbility(txn, context, reactor, opportunity.use, { target: mover.id }, rng);
        }
      }
    }
  }
}

/**
 * Run a creature's reactions to something that happened.
 *
 * This is what makes NPCs and monsters more than attack routines: a reaction is
 * gated on the *reactor's* own memory, faction standing, and state, and may
 * involve them rolling dice of their own.
 */
export function runReactions(
  txn: Transaction,
  reactor: Entity,
  trigger: string,
  subject: Entity | null,
  rng: Rng,
): void {
  const source = reactor.statblock
    ? txn.module.find<{ reactions?: ReactionDef[] }>('content.monsters', reactor.statblock)
    : txn.module.find<{ reactions?: ReactionDef[] }>('content.npcs', reactor.id);

  const reactions = (source?.reactions ?? [])
    .filter((reaction) => reaction.on === trigger)
    .sort((a, b) => b.priority - a.priority);

  for (const reaction of reactions) {
    const extra: Scope = subject ? { target: { id: subject.id, name: subject.name } } : {};
    const scope = buildScope(txn.module, txn.state, reactor, extra);

    if (!isEmptyRequirement(reaction.requires)) {
      if (!evalPredicate(compileRequirement(reaction.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES })) continue;
    }
    if (reaction.when && !evalPredicate(reaction.when, { scope, rng, openNamespaces: OPEN_NAMESPACES })) continue;
    if (reaction.chance < 1 && !rng.chance(reaction.chance)) continue;

    txn.emit({ type: 'reacted', entity: reactor.id, reaction: reaction.id, trigger });

    if (reaction.effects.length > 0) {
      applyOps(txn, evalEffects(reaction.effects, { scope, rng, openNamespaces: OPEN_NAMESPACES }), reactor.id);
    }

    // A reaction may call for its own roll — the reactor testing their nerve.
    if (reaction.roll) {
      const modifier = reaction.roll.skill
        ? skillModifier(txn.module, reactor, reaction.roll.skill)
        : reaction.roll.attribute
          ? (statsOf(txn.module, reactor).mod[reaction.roll.attribute] ?? 0)
          : 0;

      const roll =
        reaction.roll.opposedBy && subject
          ? check(txn.module, rng, {
              modifier,
              difficulty: 10 + skillModifier(txn.module, subject, reaction.roll.opposedBy),
            })
          : check(txn.module, rng, {
              modifier,
              difficulty: difficultyOf(txn.module, reaction.roll.difficulty),
            });

      txn.emit({
        type: 'checked',
        entity: reactor.id,
        skill: reaction.roll.skill ?? null,
        attribute: reaction.roll.attribute ?? null,
        roll,
      });

      const branch = succeeded(roll) ? reaction.onSuccess : reaction.onFailure;
      if (branch.length > 0) applyOps(txn, evalEffects(branch, { scope, rng, openNamespaces: OPEN_NAMESPACES }), reactor.id);
    }
  }
}

/** Fire a trigger on everyone who might react to it. */
export function broadcastReaction(
  txn: Transaction,
  trigger: string,
  subject: Entity | null,
  rng: Rng,
): void {
  for (const entity of combatants(txn.state, txn.state.currentMap)) {
    if (subject && entity.id === subject.id) continue;
    runReactions(txn, entity, trigger, subject, rng.derive(`react:${entity.id}:${trigger}`));
  }
}

export { savingThrow };
