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
import { skillCheck, succeeded } from '../rules/check.js';

export interface GateDef {
  id: string;
  name: string;
  kind: string;
  requires?: Requirement;
  bypass?: {
    skill: string;
    difficulty: number;
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
  | { readonly opened: false; readonly missing: readonly string[] };

/** Plain-language description of what a requirement is asking for. */
export function describeRequirement(requirement: Requirement | undefined): string[] {
  if (isEmptyRequirement(requirement)) return [];
  const r = requirement!;
  const out: string[] = [];

  if (r.description) out.push(r.description);
  for (const item of r.items ?? []) out.push(`the ${item.item.replace(/_/g, ' ')}`);
  for (const skill of r.skills ?? []) {
    out.push(`${skill.skill.replace(/_/g, ' ')} ${skill.minTier ?? skill.minRank}`);
  }
  for (const quest of r.quests ?? []) out.push(`${quest.quest.replace(/_/g, ' ')} ${quest.status}`);
  for (const faction of r.factions ?? []) {
    out.push(`standing with the ${faction.faction.replace(/_/g, ' ')}`);
  }
  if (typeof r.minLevel === 'number') out.push(`level ${r.minLevel}`);
  for (const ability of r.abilities ?? []) out.push(`the ${ability.replace(/_/g, ' ')} ability`);

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
    txn.emit({ type: 'refused', action: 'open', reason: `no gate "${gateId}"` });
    return { opened: false, missing: [] };
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
  if (gate.bypass && options.force !== false) {
    const roll = skillCheck(txn.module, rng, actor, gate.bypass.skill, gate.bypass.difficulty);
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
  }

  // — blocked ——————————————————————————————————————————————
  const missing = [
    ...describeRequirement(gate.requires),
    ...gate.opensWith.map((ability) => `the ${ability.replace(/_/g, ' ')} ability`),
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
