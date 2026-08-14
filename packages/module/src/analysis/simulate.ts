/**
 * Memory timeline preview.
 *
 * Loot and encounter previews used to live here too. They now call the engine's
 * own `rollLoot` and `rollEncounter`, because a preview with a second copy of
 * the odds drifts from actual play — and a Balance view that lies is worse than
 * none. What remains is the memory timeline, which models the declared gossip
 * parameters rather than duplicating engine logic.
 */

import { Rng } from '@dm/core';

// ---------------------------------------------------------------------------
// Memory timeline
// ---------------------------------------------------------------------------

export interface SeedDeed {
  readonly kind: string;
  /** Day the deed happened. */
  readonly day: number;
  /** Who saw it directly. */
  readonly witnesses: readonly string[];
  /** Overrides the deed kind's own severity. */
  readonly severity?: number;
}

export interface Knower {
  readonly npc: string;
  /** 0..1 — how strongly it is held today. */
  readonly strength: number;
  /** Retellings between the deed and this person. */
  readonly hops: number;
  /** Accumulated chance the details are wrong. */
  readonly distortion: number;
}

export interface TimelineDay {
  readonly day: number;
  readonly knowers: readonly Knower[];
}

export interface TimelineResult {
  readonly deed: string;
  readonly days: readonly TimelineDay[];
  /** Everyone who ever heard, whether or not they still remember. */
  readonly everKnew: readonly string[];
}

interface MemoryConfig {
  mode?: string;
  forgetting?: {
    curve?: string;
    halfLifeDays?: number;
    floor?: number;
    neverForget?: string[];
  };
  gossip?: {
    enabled?: boolean;
    spreadPerDay?: number;
    maxHops?: number;
    hopRetention?: number;
    distortionPerHop?: number;
    minimumSeverity?: number;
  };
  rules?: {
    deedKinds?: string[];
    alwaysKnownBy?: string[];
    neverKnownBy?: string[];
    spreadPerDay?: number;
    halfLifeDays?: number;
    manualOnly?: boolean;
  }[];
}

/** Strength remaining after `days`, per the configured curve. */
function retention(curve: string, days: number, halfLife: number, floor: number): number {
  if (curve === 'none' || halfLife <= 0) return 1;
  if (curve === 'threshold') return days <= halfLife ? 1 : 0;
  if (curve === 'linear') return Math.max(floor, 1 - days / (halfLife * 2));
  // Exponential: sharp at first, then a long tail.
  return Math.max(floor, Math.pow(0.5, days / halfLife));
}

/**
 * Propagate one deed through the population, day by day.
 *
 * A preview of the declared model rather than the engine itself — the engine
 * does not exist yet. It reads the same parameters the engine will, so tuning
 * the dials here tunes the real thing.
 */
export function simulateMemory(
  memory: MemoryConfig,
  npcs: readonly { id: string; memorySpan?: number; gullibility?: number }[],
  deed: SeedDeed,
  options: { days?: number; seed?: number } = {},
): TimelineResult {
  const days = options.days ?? 90;
  const rng = Rng.fromSeed(options.seed ?? 1);

  const forgetting = memory.forgetting ?? {};
  const gossip = memory.gossip ?? {};
  const curve = forgetting.curve ?? 'exponential';
  const floor = forgetting.floor ?? 0.05;
  const neverForget = new Set(forgetting.neverForget ?? []);

  // Targeted rules override the global settings for this deed kind.
  const applicable = (memory.rules ?? []).filter(
    (rule) => (rule.deedKinds?.length ?? 0) === 0 || rule.deedKinds!.includes(deed.kind),
  );
  const alwaysKnow = new Set(applicable.flatMap((r) => r.alwaysKnownBy ?? []));
  const neverKnow = new Set(applicable.flatMap((r) => r.neverKnownBy ?? []));
  const manualOnly = applicable.some((r) => r.manualOnly === true);

  /**
   * A rule that names people scopes its overrides to them.
   *
   * "Vess never forgets a theft" should pin *Vess's* memory, not lengthen the
   * memory of everyone who ever hears about it. A rule with no named people
   * applies to the deed generally.
   */
  const pinnedFor = new Map<string, number>();
  let deedWideHalfLife: number | undefined;
  for (const rule of applicable) {
    if (rule.halfLifeDays === undefined) continue;
    const named = rule.alwaysKnownBy ?? [];
    if (named.length > 0) {
      for (const npc of named) pinnedFor.set(npc, rule.halfLifeDays);
    } else {
      deedWideHalfLife = rule.halfLifeDays;
    }
  }
  const halfLife = deedWideHalfLife ?? forgetting.halfLifeDays ?? 30;
  const spreadPerDay = applicable.find((r) => r.spreadPerDay !== undefined)?.spreadPerDay
    ?? gossip.spreadPerDay
    ?? 0.25;

  const spreads =
    !manualOnly &&
    memory.mode !== 'manual' &&
    gossip.enabled !== false &&
    (deed.severity ?? 0) >= (gossip.minimumSeverity ?? 0);

  const maxHops = gossip.maxHops ?? 4;
  const hopRetention = gossip.hopRetention ?? 0.75;
  const distortionPerHop = gossip.distortionPerHop ?? 0.15;

  /** learnedOn: the day each person heard, with their hop count. */
  const learned = new Map<string, { day: number; hops: number; distortion: number }>();

  for (const witness of deed.witnesses) {
    if (neverKnow.has(witness)) continue;
    learned.set(witness, { day: deed.day, hops: 0, distortion: 0 });
  }
  for (const npc of alwaysKnow) {
    if (neverKnow.has(npc)) continue;
    if (!learned.has(npc)) learned.set(npc, { day: deed.day, hops: 0, distortion: 0 });
  }

  const timeline: TimelineDay[] = [];
  const candidates = npcs.filter((n) => !neverKnow.has(n.id));

  for (let day = deed.day; day < deed.day + days; day += 1) {
    // Spread: anyone who knows may tell someone who does not.
    if (spreads && day > deed.day) {
      const tellers = [...learned.entries()].filter(([, info]) => info.hops < maxHops);
      for (const [, info] of tellers) {
        for (const npc of candidates) {
          if (learned.has(npc.id)) continue;
          const willingness = (npc.gullibility ?? 0.5) * 2;
          if (rng.nextFloat() < spreadPerDay * willingness) {
            learned.set(npc.id, {
              day,
              hops: info.hops + 1,
              distortion: Math.min(1, info.distortion + distortionPerHop),
            });
          }
        }
      }
    }

    const knowers: Knower[] = [];
    for (const [npc, info] of learned) {
      const elapsed = day - info.day;
      // An NPC's own span normally caps the half-life, but a rule that pins
      // one for them is an explicit GM decision and overrides it — that is the
      // whole point of a targeted override.
      const pinned = pinnedFor.get(npc) ?? (deedWideHalfLife !== undefined ? deedWideHalfLife : undefined);
      const span = npcs.find((n) => n.id === npc)?.memorySpan;
      const effectiveHalfLife =
        pinned !== undefined ? pinned
        : span !== undefined ? Math.min(halfLife, span)
        : halfLife;

      const base = neverForget.has(deed.kind)
        ? 1
        : retention(curve, elapsed, effectiveHalfLife, floor);
      // Each retelling weakens the memory as well as distorting it.
      const strength = base * Math.pow(hopRetention, info.hops);

      if (strength <= 0) continue;
      knowers.push({ npc, strength, hops: info.hops, distortion: info.distortion });
    }

    knowers.sort((a, b) => b.strength - a.strength || a.npc.localeCompare(b.npc));
    timeline.push({ day, knowers });
  }

  return { deed: deed.kind, days: timeline, everKnew: [...learned.keys()] };
}
