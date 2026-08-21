/** Deeds and who saw them. */

import { Rng } from '@dm/core';
import type { CompiledModule, MemoryModel } from '@dm/module';
import type { Entity, Deed } from '../state.js';
import { Transaction, adjustReputation } from '../rules/apply.js';
import { TerrainIndex } from '../grid/tiles.js';
import { distance } from '../grid/geometry.js';
import { canPerceiveTile } from './senses.js';
import { memoryKeyOf } from './gossip.js';

interface DeedKindDef {
  id: string;
  name: string;
  severity: number;
  faction?: string;
  memorability: number;
  distortion: number;
}

/** The module's witness settings. */
function witnessConfig(module: CompiledModule): MemoryModel['witness'] {
  return module.source.narrative.memory.witness;
}

/** Who could see this happen. */
export function witnessesOf(
  txn: Transaction,
  terrain: TerrainIndex,
  at: Entity,
  radiusOverride?: number,
): string[] {
  const config = witnessConfig(txn.module);
  const map = txn.state.maps[at.map];
  if (!map) return [];

  const out: string[] = [];
  const context = { module: txn.module, state: txn.state, terrain };

  // A witness perceives the act, which happens on a tile — not the actor, who may already have walked away.
  const declared = radiusOverride ?? (config.radius > 0 ? config.radius : undefined);
  const range = declared === undefined ? {} : { range: declared };

  // "Requires line of sight" means the sense that travels in lines.
  const sighted = txn.module.source.rules.perception?.sightSense;
  const options = sighted === undefined ? range : { ...range, sense: sighted };

  for (const other of Object.values(txn.state.entities)) {
    if (other.id === at.id) continue;
    if (other.map !== at.map) continue;
    if (config.deadMenTellNoTales && !other.alive) continue;
    // Party members are not witnesses against themselves.
    if (other.kind === 'character') continue;

    if (!config.requiresLineOfSight) {
      // No sight required means presence alone; `radius: 0` means everyone here.
      const radius = radiusOverride ?? config.radius;
      if (radius === 0 || distance(other.position, at.position) <= radius) out.push(other.id);
      continue;
    }

    if (canPerceiveTile(context, other, at.position, options)) out.push(other.id);
  }

  return out;
}

/** Record a deed. */
/** Whether this actor is going unrecognised. */
function isDisguised(txn: Transaction, actor: Entity): boolean {
  for (const active of actor.conditions) {
    const condition = txn.module.find<{ concealsIdentity?: boolean }>(
      'rules.conditions',
      active.condition,
    );
    if (condition?.concealsIdentity === true) return true;
  }
  return false;
}

export function recordDeed(
  txn: Transaction,
  terrain: TerrainIndex,
  kindId: string,
  actor: Entity,
  subject: string | null,
  rng: Rng,
): Deed | null {
  const kind = txn.module.find<DeedKindDef>('narrative.deedKinds', kindId);
  if (!kind) return null;

  const config = witnessConfig(txn.module);
  const seen = witnessesOf(txn, terrain, actor);

  // Being seen is not being recognised, and `disguiseReduction` makes it less so still.
  const hooded = isDisguised(txn, actor);
  const chance = hooded
    ? config.identificationChance * (1 - config.disguiseReduction)
    : config.identificationChance;
  const identified = seen.filter(() => rng.chance(chance));

  const deed: Deed = {
    id: `deed:${kindId}:${txn.state.minute}`,
    kind: kindId,
    actor: actor.id,
    subject,
    at: txn.state.minute,
    location: txn.state.currentMap,
    witnesses: identified,
    severity: kind.severity,
  };

  txn.set({ ...txn.state, deeds: [...txn.state.deeds, deed] });
  txn.emit({ type: 'deedDone', deed: deed.id, kind: kindId, witnesses: identified });

  // Witnesses know it immediately; everyone else has to hear about it.
  const known = { at: txn.state.minute, strength: 1, hops: 0 };
  const memory = { ...txn.state.memory };
  for (const witness of identified) {
    const entity = txn.entity(witness);
    const memoryKey = entity ? memoryKeyOf(entity) : witness;
    memory[memoryKey] = { ...(memory[memoryKey] ?? {}), [deed.id]: known };
  }
  if (config.factionAlwaysLearns && kind.faction) {
    for (const npc of txn.module.all<{ id: string; faction?: string }>('content.npcs')) {
      if (npc.faction !== kind.faction) continue;
      memory[npc.id] = { ...(memory[npc.id] ?? {}), [deed.id]: known };
    }
  }
  txn.set({ ...txn.state, memory });

  // Reputation only moves when the deed is actually known to someone.
  if (kind.faction && kind.severity !== 0 && (identified.length > 0 || config.factionAlwaysLearns)) {
    adjustReputation(txn, kind.faction, kind.severity);
  }

  return deed;
}

/** Whether an NPC knows about a deed of a given kind, and how strongly. */
export function knowledgeOf(
  txn: Transaction,
  npcId: string,
  kindId: string,
): { strength: number; at: number; hops: number } | null {
  const held = txn.state.memory[npcId];
  if (!held) return null;

  let best: { strength: number; at: number; hops: number } | null = null;
  for (const [deedId, record] of Object.entries(held)) {
    const deed = txn.state.deeds.find((entry) => entry.id === deedId);
    if (!deed || deed.kind !== kindId) continue;
    if (!best || record.strength > best.strength) best = record;
  }
  return best;
}
