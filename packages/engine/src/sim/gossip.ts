/**
 * Rumour and forgetting.
 *
 * A deed spreads from people who know it to people who do not, losing fidelity with each retelling,
 * and fades unless something renews it. Both run once a day on the world clock, whether or not the
 * party is near.
 *
 * Every knob comes from `narrative.memory`. `mode` decides who is driving: `simulated`, `manual`,
 * or `hybrid`, where the engine simulates but targeted rules overrule the result.
 */

import { Rng } from '@dm/core';
import type { CompiledModule, MemoryModel } from '@dm/module';
import { Transaction } from '../rules/apply.js';

/** Mutable shape of the memory table, for building the next one. */
type MemoryTable = Record<string, Record<string, { at: number; strength: number; hops: number }>>;

export type { MemoryModel };

/** A shallow-per-npc copy, so building the next table never mutates the last. */
function structuredCloneMemory(
  memory: Readonly<Record<string, Readonly<Record<string, { readonly at: number; readonly strength: number; readonly hops: number }>>>>,
): MemoryTable {
  const out: MemoryTable = {};
  for (const [npc, held] of Object.entries(memory)) out[npc] = { ...held };
  return out;
}

export function memoryModel(module: CompiledModule): MemoryModel {
  return module.source.narrative.memory;
}

/**
 * The key an entity's memories are filed under. Named NPCs are persistent, so their memories belong
 * to the character rather than the entity instance; monsters keep theirs on the instance.
 */
export { memoryKeyOf } from '../state.js';

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
  /**
   * How far a `linear` curve runs, as a multiple of the half-life. Passed in rather than read from
   * the module, so this stays a pure function of the numbers.
   */
  linearSpan = 2,
): number {
  if (curve === 'none' || halfLife <= 0) return 1;
  if (curve === 'threshold') return days <= halfLife ? 1 : 0;
  if (curve === 'linear') return Math.max(floor, 1 - days / (halfLife * linearSpan));
  // Exponential: sharp at first, then a long tail.
  return Math.max(floor, Math.pow(0.5, days / halfLife));
}

/** NPC ids that could plausibly hear something, from module content. */
function populace(module: CompiledModule): { id: string; gullibility: number; faction?: string }[] {
  return module
    .all<{ id: string; gullibility: number; faction?: string }>('content.npcs')
    .map((npc) => ({ id: npc.id, gullibility: npc.gullibility, ...(npc.faction ? { faction: npc.faction } : {}) }));
}

/**
 * Spread rumours by one day. Spread is per-hop rather than global: a rumour moves from someone who
 * knows to someone who does not, weakening each time, so a village two days away has a garbled
 * version and the next has heard nothing.
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

        // `requiresTravel` says a rumour does not leap between places on its own.
        if (model.gossip.requiresTravel && !together(txn, teller.id, listener.id)) continue;

        // Hostile factions gossip less freely with each other.
        const crossFaction = teller.faction && listener.faction && teller.faction !== listener.faction;
        // How fast news leaves the place it happened, from the place's `rumourReach`.
        const reach = rumourReachOf(txn, deed.location);
        const rate = spreadRate * reach
          * (crossFaction ? model.gossip.crossFactionRate : 1)
          * (listener.gullibility * model.gossip.gullibilityScale);

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

        // The story distorts as it travels: `distortion` on the deed kind and `distortionPerHop` on
        // the model weaken the memory a garbled retelling leaves.
        const garbled = rng
          .derive(`garble:${deed.id}:${listener.id}`)
          .chance(Math.min(1, distortion + kind.distortion));
        if (garbled) {
          const record = memory[listener.id]![deed.id]!;
          memory[listener.id]![deed.id] = {
            ...record,
            strength: record.strength * model.gossip.garbledRetention,
          };
        }
      }
    }
  }

  if (changed) txn.set({ ...txn.state, memory });
}

/**
 * Where a person belongs, as the module names it.
 *
 * The declared `home` rather than whatever map they are standing on: a map id and a point-of-
 * interest id are different vocabularies, and comparing one to the other would make everybody a
 * stranger to everybody.
 *
 * Null means the module has not placed them, and an unplaced person is not separated from anyone.
 */
function homeOfNpc(txn: Transaction, npcId: string): string | null {
  return txn.module.find<{ home?: string }>('content.npcs', npcId)?.home ?? null;
}

/** Whether news can pass between two people without anybody travelling. */
function together(txn: Transaction, a: string, b: string): boolean {
  const here = homeOfNpc(txn, a);
  const there = homeOfNpc(txn, b);
  // Unplaced people are not held apart by a geography the module never gave.
  if (here === null || there === null) return true;
  return here === there;
}

/**
 * How readily news leaves a place, as the place itself declares.
 *
 * A deed records `state.currentMap` as its location and map ids are minted `poi:<id>` / `area:<id>`
 * / `dungeon:<id>`, so the prefix has to be stripped before looking the id up in
 * `world.pointsOfInterest`.
 *
 * Only a point of interest declares a reach. Standing at a POI with no interior leaves `currentMap`
 * on the area, so that deed takes the area's silence rather than the POI's reach — the map is what
 * the deed knows.
 */
function rumourReachOf(txn: Transaction, location: string | null): number {
  if (!location) return 1;
  const split = location.indexOf(':');
  if (split < 0 || location.slice(0, split) !== 'poi') return 1;
  const poi = txn.module.find<{ rumourReach?: number }>(
    'world.pointsOfInterest', location.slice(split + 1));
  return poi?.rumourReach ?? 1;
}

/**
 * Age every memory by one day. A memory below the floor is dropped entirely, so an NPC genuinely
 * forgets rather than carrying a vanishing trace forever.
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
      // A rule that names this person pins their memory specifically; one that names nobody applies
      // to the deed generally.
      const pinned = applicable.find(
        (rule) => rule.halfLifeDays !== undefined && rule.alwaysKnownBy.includes(npcId),
      )?.halfLifeDays
        ?? applicable.find(
          (rule) => rule.halfLifeDays !== undefined && rule.alwaysKnownBy.length === 0,
        )?.halfLifeDays;

      const npc = txn.module.find<{ memorySpan: number; caresAbout?: string[] }>(
        'content.npcs',
        npcId,
      );

      // How memorable the deed is, and how much this module weighs that. Someone who cares about
      // this kind of thing remembers it longer still.
      const kind = txn.module.find<{ memorability: number }>('narrative.deedKinds', deed.kind);
      const memorability = Math.max(0, kind?.memorability ?? 1);
      const personal = npc?.caresAbout?.includes(deed.kind)
        ? model.forgetting.caresAboutMultiplier
        : 1;
      const weighted = 1 + (memorability - 1) * model.forgetting.memorabilityWeight;

      const halfLife = (pinned
        ?? Math.min(model.forgetting.halfLifeDays, npc?.memorySpan ?? Infinity))
        * Math.max(0.01, weighted) * personal;

      const elapsedDays = (txn.state.minute - deed.at) / perDay;
      const strength = retention(
        model.forgetting.curve, elapsedDays, halfLife,
        model.forgetting.floor, model.forgetting.linearSpanMultiplier,
      )
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
 * Faction standing drifts back toward neutral, so a single early outrage does not define a run
 * forever. The rate is per faction.
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
