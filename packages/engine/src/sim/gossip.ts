/**
 * Rumour and forgetting.
 *
 * A deed spreads from people who know it to people who do not, losing fidelity
 * with each retelling, and fades unless something renews it. Both run once a
 * day on the world clock, whether or not the party is anywhere near.
 *
 * Every knob comes from `narrative.memory`. `mode` decides who is driving:
 * `simulated` lets the engine run it, `manual` freezes it so content controls
 * every propagation, and `hybrid` simulates but lets targeted rules overrule
 * the result — which is what lets a GM let the world run and still pin the
 * beats that matter.
 */

import { Rng } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import type { Entity } from '../state.js';
import { Transaction } from '../rules/apply.js';
import { npcIdOf } from '../character.js';

/** Mutable shape of the memory table, for building the next one. */
type MemoryTable = Record<string, Record<string, { at: number; strength: number; hops: number }>>;

export interface MemoryModel {
  mode: 'simulated' | 'manual' | 'hybrid';
  forgetting: {
    curve: 'none' | 'linear' | 'exponential' | 'threshold';
    halfLifeDays: number;
    floor: number;
    reinforceOnRecall: number;
    memorabilityWeight: number;
    neverForget: string[];
  };
  gossip: {
    enabled: boolean;
    spreadPerDay: number;
    maxHops: number;
    hopRetention: number;
    distortionPerHop: number;
    requiresTravel: boolean;
    crossFactionRate: number;
    minimumSeverity: number;
    spreadsWithoutWitness: boolean;
  };
  rules: {
    id: string;
    deedKinds: string[];
    alwaysKnownBy: string[];
    neverKnownBy: string[];
    spreadPerDay?: number;
    halfLifeDays?: number;
    distortionPerHop?: number;
    manualOnly: boolean;
  }[];
}

/** A shallow-per-npc copy, so building the next table never mutates the last. */
function structuredCloneMemory(
  memory: Readonly<Record<string, Readonly<Record<string, { readonly at: number; readonly strength: number; readonly hops: number }>>>>,
): MemoryTable {
  const out: MemoryTable = {};
  for (const [npc, held] of Object.entries(memory)) out[npc] = { ...held };
  return out;
}

export function memoryModel(module: CompiledModule): MemoryModel {
  return module.source.narrative.memory as unknown as MemoryModel;
}

/**
 * The key an entity's memories are filed under.
 *
 * Named NPCs are persistent, so their memories belong to the *character*, not
 * to whichever entity instance happens to represent them. Monsters are
 * transient and keep theirs on the instance.
 */
export function memoryKeyOf(entity: Entity): string {
  return entity.kind === 'npc' ? npcIdOf(entity) : entity.id;
}

/** Rules that apply to a deed kind. */
function rulesFor(model: MemoryModel, kind: string) {
  return model.rules.filter((rule) => rule.deedKinds.length === 0 || rule.deedKinds.includes(kind));
}

/** Strength remaining after a number of days, per the configured curve. */
export function retention(
  curve: MemoryModel['forgetting']['curve'],
  days: number,
  halfLife: number,
  floor: number,
): number {
  if (curve === 'none' || halfLife <= 0) return 1;
  if (curve === 'threshold') return days <= halfLife ? 1 : 0;
  if (curve === 'linear') return Math.max(floor, 1 - days / (halfLife * 2));
  // Exponential: sharp at first, then a long tail — how people actually forget.
  return Math.max(floor, Math.pow(0.5, days / halfLife));
}

/** NPC ids that could plausibly hear something, from module content. */
function populace(module: CompiledModule): { id: string; gullibility: number; faction?: string }[] {
  return module
    .all<{ id: string; gullibility: number; faction?: string }>('content.npcs')
    .map((npc) => ({ id: npc.id, gullibility: npc.gullibility ?? 0.5, ...(npc.faction ? { faction: npc.faction } : {}) }));
}

/**
 * Spread rumours by one day.
 *
 * Spread is per-hop rather than global: a rumour moves from someone who knows
 * to someone who does not, weakening each time. That is what produces the case
 * where a village two days away has a garbled version and the next has heard
 * nothing at all.
 */
export function spreadRumours(txn: Transaction, day: number, rng: Rng): void {
  const model = memoryModel(txn.module);
  if (model.mode === 'manual' || !model.gossip.enabled) return;

  const people = populace(txn.module);
  if (people.length === 0) return;

  const memory: MemoryTable = structuredCloneMemory(txn.state.memory);
  let changed = false;

  for (const deed of txn.state.deeds) {
    const applicable = rulesFor(model, deed.kind);
    if (applicable.some((rule) => rule.manualOnly)) continue;

    const kind = txn.module.find<{ severity: number; distortion: number; faction?: string }>(
      'narrative.deedKinds',
      deed.kind,
    );
    if (!kind) continue;
    if (Math.abs(kind.severity) < model.gossip.minimumSeverity) continue;

    const spreadRate = applicable.find((rule) => rule.spreadPerDay !== undefined)?.spreadPerDay
      ?? model.gossip.spreadPerDay;
    const distortion = applicable.find((rule) => rule.distortionPerHop !== undefined)?.distortionPerHop
      ?? model.gossip.distortionPerHop;

    const barred = new Set(applicable.flatMap((rule) => rule.neverKnownBy));

    // Anyone who already knows and has not retold it too many times.
    const tellers = people.filter((person) => {
      const held = memory[person.id]?.[deed.id];
      return held !== undefined && held.hops < model.gossip.maxHops;
    });
    if (tellers.length === 0 && !model.gossip.spreadsWithoutWitness) continue;

    for (const teller of tellers) {
      const held = memory[teller.id]![deed.id]!;

      for (const listener of people) {
        if (listener.id === teller.id) continue;
        if (barred.has(listener.id)) continue;
        if (memory[listener.id]?.[deed.id]) continue;

        // Hostile factions gossip less freely with each other.
        const crossFaction = teller.faction && listener.faction && teller.faction !== listener.faction;
        const rate = spreadRate * (crossFaction ? model.gossip.crossFactionRate : 1) * (listener.gullibility * 2);

        if (!rng.derive(`${deed.id}:${teller.id}:${listener.id}:${day}`).chance(rate)) continue;

        memory[listener.id] = {
          ...(memory[listener.id] ?? {}),
          [deed.id]: {
            at: txn.state.minute,
            strength: held.strength * model.gossip.hopRetention,
            hops: held.hops + 1,
          },
        };
        changed = true;
        txn.emit({ type: 'rumourSpread', deed: deed.id, to: listener.id, hops: held.hops + 1 });
        void distortion;
      }
    }
  }

  if (changed) txn.set({ ...txn.state, memory });
}

/**
 * Age every memory by one day.
 *
 * A memory below the floor is dropped entirely, which is what lets an NPC
 * genuinely forget rather than carrying a vanishingly small trace forever.
 */
export function decayMemories(txn: Transaction, _day: number, _rng: Rng): void {
  const model = memoryModel(txn.module);
  const perDay = txn.module.source.world.time.minutesPerDay;
  const neverForget = new Set(model.forgetting.neverForget);

  const memory: MemoryTable = {};
  let changed = false;

  for (const [npcId, held] of Object.entries(txn.state.memory)) {
    const kept: Record<string, { at: number; strength: number; hops: number }> = {};

    for (const [deedId, record] of Object.entries(held)) {
      const deed = txn.state.deeds.find((entry) => entry.id === deedId);
      if (!deed) continue;

      if (neverForget.has(deed.kind)) {
        kept[deedId] = record;
        continue;
      }

      const applicable = rulesFor(model, deed.kind);
      // A rule that names this person pins *their* memory specifically; one
      // that names nobody applies to the deed generally.
      const pinned = applicable.find(
        (rule) => rule.halfLifeDays !== undefined && rule.alwaysKnownBy.includes(npcId),
      )?.halfLifeDays
        ?? applicable.find(
          (rule) => rule.halfLifeDays !== undefined && rule.alwaysKnownBy.length === 0,
        )?.halfLifeDays;

      const npc = txn.module.find<{ memorySpan: number }>('content.npcs', npcId);
      const halfLife = pinned
        ?? Math.min(model.forgetting.halfLifeDays, npc?.memorySpan ?? Infinity);

      const elapsedDays = (txn.state.minute - deed.at) / perDay;
      const strength = retention(model.forgetting.curve, elapsedDays, halfLife, model.forgetting.floor)
        * Math.pow(model.gossip.hopRetention, record.hops);

      if (strength <= 0) {
        changed = true;
        txn.emit({ type: 'memoryFaded', npc: npcId, deed: deedId });
        continue;
      }

      if (Math.abs(strength - record.strength) > 0.001) changed = true;
      kept[deedId] = { ...record, strength };
    }

    if (Object.keys(kept).length > 0) memory[npcId] = kept;
    else if (Object.keys(held).length > 0) changed = true;
  }

  if (changed) txn.set({ ...txn.state, memory });
}

/**
 * Faction standing drifts back toward neutral.
 *
 * Without this, a single early outrage would define a run forever. The rate is
 * per faction, so a long-memoried order forgives more slowly than a rabble.
 */
export function driftFactions(txn: Transaction): void {
  const factions = txn.module.all<{ id: string; decayPerDay: number }>('content.factions');
  const reputation = { ...txn.state.reputation };
  let changed = false;

  for (const faction of factions) {
    const rate = faction.decayPerDay ?? 0;
    if (rate <= 0) continue;

    const standing = reputation[faction.id] ?? 0;
    if (standing === 0) continue;

    const moved = standing > 0
      ? Math.max(0, standing - rate)
      : Math.min(0, standing + rate);

    if (moved !== standing) {
      reputation[faction.id] = moved;
      changed = true;
    }
  }

  if (changed) txn.set({ ...txn.state, reputation });
}
