/**
 * Gates: barriers and how they open.
 *
 * A locked door, a warded seal, a riddle, and a toll are the same shape — a
 * requirement that opens it, an optional roll to force it, and effects either
 * way. That uniformity is why the world can be gated by a key, a spell, a
 * faction rank, or a completed quest without any of them being special.
 *
 * When a gate refuses, the party is told *what is missing*. A door that says
 * only "it is locked" is a dead end; one that says "the brass key, or a steady
 * hand with picks" is a lead.
 */

import { Rng } from '@dm/core';
import { evalEffects, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Effect, Requirement } from '@dm/module';
import type { Entity } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps, changeInventory } from '../rules/apply.js';
import { skillCheck, succeeded, difficultyFrom } from '../rules/check.js';
import { message, literal } from '../narrate/systemText.js';
import type { Message } from '../narrate/systemText.js';

export interface GateDef {
  id: string;
  name: string;
  kind: string;
  requires?: Requirement;
  bypass?: {
    skill: string;
    difficulty: unknown;
    onSuccess: Effect[];
    onFailure: Effect[];
    retryable: boolean;
  };
  opensWith: string[];
  onOpen: Effect[];
  onBlocked: Effect[];
  blockedTextKey?: string;
  staysOpen: boolean;
}

export type GateOutcome =
  | { readonly opened: true; readonly how: 'requirement' | 'bypass' | 'ability' }
  | { readonly opened: false; readonly missing: readonly Message[] };

/** Plain-language description of what a requirement is asking for. */
export function describeRequirement(requirement: Requirement | undefined): Message[] {
  if (isEmptyRequirement(requirement)) return [];
  const r = requirement!;
  const out: Message[] = [];

  // The requirement's own `description` is authored prose, so it passes
  // through; everything else is the engine naming a thing, and that is keyed.
  if (r.description) out.push(literal(r.description));
  for (const item of r.items ?? []) {
    out.push(message('requirement.item', { item: item.item.replace(/_/g, ' ') }));
  }
  for (const skill of r.skills ?? []) {
    out.push(message('requirement.skill', {
      skill: skill.skill.replace(/_/g, ' '),
      rank: skill.minTier ?? skill.minRank ?? '',
    }));
  }
  for (const quest of r.quests ?? []) {
    out.push(message('requirement.quest', {
      quest: quest.quest.replace(/_/g, ' '),
      status: quest.status,
    }));
  }
  for (const faction of r.factions ?? []) {
    out.push(message('requirement.faction', { faction: faction.faction.replace(/_/g, ' ') }));
  }
  if (typeof r.minLevel === 'number') out.push(message('requirement.level', { level: r.minLevel }));
  for (const ability of r.abilities ?? []) {
    out.push(message('requirement.ability', { ability: ability.replace(/_/g, ' ') }));
  }

  return out;
}

/**
 * Try to open a gate.
 *
 * Order matters: meeting the requirement outright is tried first, then an
 * ability that opens it, and only then a roll to force it. Someone holding the
 * key should never be asked to pick the lock.
 */
export function openGate(
  txn: Transaction,
  gateId: string,
  actor: Entity,
  rng: Rng,
  options: { force?: boolean } = {},
): GateOutcome {
  const gate = txn.module.find<GateDef>('world.gates', gateId);
  if (!gate) {
    txn.emit({ type: 'refused', action: 'open', reason: message('refused.open.unknownGate', { gate: gateId }) });
    return { opened: false, missing: [] };
  }

  // Already standing open. Returning here must not re-run `onOpen`, re-consume
  // the key, or re-roll the lockpick — walking back through a door you opened
  // is not a second opening.
  if (gate.staysOpen && txn.state.flags[`gate:${gate.id}:open`] === true) {
    return { opened: true, how: 'requirement' };
  }

  const scope = buildScope(txn.module, txn.state, actor);

  // — the requirement, met outright ————————————————————————
  if (!isEmptyRequirement(gate.requires)) {
    if (evalPredicate(compileRequirement(gate.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES })) {
      // A key marked `consume` is spent opening the door.
      for (const item of gate.requires!.items ?? []) {
        if (item.consume) changeInventory(txn, txn.entity(actor.id) ?? actor, item.item, -item.quantity);
      }
      return succeed(txn, gate, actor, 'requirement', rng);
    }
  } else if (gate.opensWith.length === 0 && !gate.bypass) {
    // Nothing gates it at all — an unlocked door.
    return succeed(txn, gate, actor, 'requirement', rng);
  }

  // — an ability that opens it ————————————————————————————
  for (const abilityId of gate.opensWith) {
    if (actor.abilities.includes(abilityId)) {
      return succeed(txn, gate, actor, 'ability', rng);
    }
  }

  // — forcing it ——————————————————————————————————————————
  // A gate that is not `retryable` gives one attempt ever. The requirement and
  // ability paths above are deliberately still open, so failing to pick a lock
  // never bars you from coming back with the key.
  const spent = txn.state.flags[`gate:${gate.id}:tried`] === true;
  if (gate.bypass && options.force !== false && !(spent && !gate.bypass.retryable)) {
    const difficulty = difficultyFrom(
      txn.module, txn.state, actor, gate.bypass.difficulty, rng.derive('bypassDc'),
    );
    const roll = skillCheck(txn.module, rng, actor, gate.bypass.skill, difficulty);
    txn.emit({ type: 'checked', entity: actor.id, skill: gate.bypass.skill, attribute: null, roll });

    if (succeeded(roll)) {
      if (gate.bypass.onSuccess.length > 0) {
        applyOps(txn, evalEffects(gate.bypass.onSuccess, { scope, rng, openNamespaces: OPEN_NAMESPACES }), actor.id);
      }
      return succeed(txn, gate, actor, 'bypass', rng);
    }

    // Failing can have its own consequence — noise, a sprung trap.
    if (gate.bypass.onFailure.length > 0) {
      applyOps(txn, evalEffects(gate.bypass.onFailure, { scope, rng, openNamespaces: OPEN_NAMESPACES }), actor.id);
    }
    if (!gate.bypass.retryable) {
      txn.set({ ...txn.state, flags: { ...txn.state.flags, [`gate:${gate.id}:tried`]: true } });
    }
  }

  // — blocked ——————————————————————————————————————————————
  const missing: Message[] = [
    ...describeRequirement(gate.requires),
    ...gate.opensWith.map((ability) =>
      message('requirement.ability', { ability: ability.replace(/_/g, ' ') })),
  ];

  if (gate.onBlocked.length > 0) {
    applyOps(txn, evalEffects(gate.onBlocked, { scope, rng, openNamespaces: OPEN_NAMESPACES }), actor.id);
  }
  if (gate.blockedTextKey) {
    txn.emit({ type: 'narrate', textKey: gate.blockedTextKey, context: { gate: gate.id } });
  }
  txn.emit({ type: 'gateBlocked', gate: gate.id, missing });

  return { opened: false, missing };
}

function succeed(
  txn: Transaction,
  gate: GateDef,
  actor: Entity,
  how: 'requirement' | 'bypass' | 'ability',
  rng: Rng,
): GateOutcome {
  // `staysOpen` is the whole difference between a door and a turnstile, and it
  // is recorded here rather than on a tile because a gate can bar a road or a
  // point of interest that has no tile at all. The exits panel and the
  // affordance list have always read this flag to decide whether a way is
  // barred; until now nothing wrote it, so every gate the party opened went on
  // reading as locked for the rest of the run.
  if (gate.staysOpen) {
    txn.set({ ...txn.state, flags: { ...txn.state.flags, [`gate:${gate.id}:open`]: true } });
  }

  if (gate.onOpen.length > 0) {
    const current = txn.entity(actor.id) ?? actor;
    const scope = buildScope(txn.module, txn.state, current);
    applyOps(txn, evalEffects(gate.onOpen, { scope, rng, openNamespaces: OPEN_NAMESPACES }), current.id);
  }
  txn.emit({ type: 'gateOpened', gate: gate.id, how });
  return { opened: true, how };
}

/** Mark a gate on the current map as open, so it stays that way. */
export function markGateOpen(txn: Transaction, tile: number): void {
  const map = txn.state.maps[txn.state.currentMap];
  const gate = map?.gates[tile];
  if (!map || !gate) return;

  txn.set({
    ...txn.state,
    maps: {
      ...txn.state.maps,
      [map.id]: { ...map, gates: { ...map.gates, [tile]: { ...gate, open: true } } },
    },
  });
}
