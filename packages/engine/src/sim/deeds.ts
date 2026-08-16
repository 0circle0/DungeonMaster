/**
 * Deeds and who saw them.
 *
 * A deed is not a global fact. It is witnessed by particular people, and only
 * those people can spread or act on it. That single decision is what makes
 * stealth and massacre mechanically different: kill every witness and the deed
 * never enters the social system at all.
 *
 * Witnessing uses the same field of view the map is drawn with, so a wall that
 * hides you from a creature also hides what you did from it.
 */

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

/**
 * The module's witness settings.
 *
 * A read, not a merge: `compileModule` runs the document through Zod, so every
 * default in `witnessSchema` is already present by the time the engine sees it.
 * Re-stating them here would be a second source of truth, and the two would
 * drift the first time one of them changed.
 */
function witnessConfig(module: CompiledModule): MemoryModel['witness'] {
  return module.source.narrative.memory.witness;
}

/**
 * Who could see this happen.
 *
 * Only the living count when `deadMenTellNoTales` is set — a witness who dies
 * in the same fight never carries the story anywhere.
 */
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

  // A witness perceives the *act*, which happens on a tile — not the actor, who
  // may already have walked away by the time this is asked.
  //
  // An explicit override wins; a module that declares a witness radius gets it;
  // otherwise each sense reaches as far as it reaches.
  const declared = radiusOverride ?? (config.radius > 0 ? config.radius : undefined);
  const range = declared === undefined ? {} : { range: declared };

  // "Requires line of sight" means exactly that: the sense that travels in
  // lines. Catching a scent tells a creature something happened, not what.
  const sighted = txn.module.source.rules.perception?.sightSense;
  const options = sighted === undefined ? range : { ...range, sense: sighted };

  for (const other of Object.values(txn.state.entities)) {
    if (other.id === at.id) continue;
    if (other.map !== at.map) continue;
    if (config.deadMenTellNoTales && !other.alive) continue;
    // Party members are not witnesses against themselves.
    if (other.kind === 'character') continue;

    if (!config.requiresLineOfSight) {
      // A module that says sight is not required is asking for presence alone,
      // and `radius: 0` means exactly that: everyone here. The engine used to
      // floor this at twelve tiles — the sight constant from before senses were
      // declarable — which made the schema's own default unreachable.
      const radius = radiusOverride ?? config.radius;
      if (radius === 0 || distance(other.position, at.position) <= radius) out.push(other.id);
      continue;
    }

    if (canPerceiveTile(context, other, at.position, options)) out.push(other.id);
  }

  return out;
}

/**
 * Record a deed.
 *
 * The severity and the faction that cares come from the module's `deedKinds`,
 * so what counts as an outrage is a content decision. Reputation only moves if
 * somebody was there to see it.
 */
/**
 * Whether this actor is going unrecognised.
 *
 * A disguise is whatever the module says it is: any condition declaring
 * `concealsIdentity`. The engine knows nothing about hoods, and now it does not
 * know a magic word for them either — the relationship is typed, so a module
 * that gets it wrong fails to load rather than quietly never disguising anyone.
 */
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

  // Being seen is not the same as being recognised — and being hooded makes it
  // less so still. `disguiseReduction` was read into the config and never
  // applied, so a cloak was scenery.
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
  //
  // Memories are filed under the *persistent* key — a named NPC's content id —
  // so what Vess knows survives her entity being respawned, while a monster's
  // knowledge dies with it.
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
