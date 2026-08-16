/**
 * Memory, gossip, and learning.
 *
 * This is where emergence comes from. A deed is not a global fact: it is
 * witnessed by particular people, spreads imperfectly through particular
 * settlements, distorts as it travels, and fades unless something renews it.
 * Two runs of the same module diverge because *who knows what* diverges.
 *
 * Every knob here is a GM decision. `mode` sets who is driving:
 *
 *   - `simulated` — the engine runs witnessing, spread, and decay on its own;
 *   - `manual` — nothing propagates unless content says so explicitly, for a
 *     GM who wants the story to land exactly as written;
 *   - `hybrid` — the engine simulates, but anything a rule states explicitly
 *     wins over what the simulation would have done.
 *
 * The point of `hybrid` is that a GM should be able to let the world run itself
 * and still pin the beats that matter.
 */

import { z } from 'zod';
import { PredicateSchema } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, extra } from './common.js';

/** How a memory's strength falls off with time. */
export const forgettingCurveSchema = z.enum([
  'none', // perfect recall, forever
  'linear', // steady decline to the floor
  'exponential', // sharp at first, then a long tail — how people actually forget
  'threshold', // total recall until the span elapses, then nothing
]);

export const forgettingSchema = z
  .object({
    curve: forgettingCurveSchema.default('exponential'),
    /** In-world days for a memory to lose half its strength. */
    halfLifeDays: z.number().min(0).default(30),
    /**
     * Strength below which a memory is gone. A floor above zero is how a module
     * says some things are never forgotten.
     */
    floor: z.number().min(0).max(1).default(0.05),
    /** Recalling a memory renews it, which is why grudges outlive kindnesses. */
    reinforceOnRecall: z.number().min(0).max(1).default(0.25),
    /** Multiplier per point of a deed's own memorability. */
    memorabilityWeight: z.number().min(0).default(1),
    /**
     * How much longer somebody remembers a deed of a kind they care about.
     *
     * The engine doubled the half-life for anything in an NPC's `caresAbout`,
     * bypassing `memorabilityWeight` on the very next line — two knobs for one
     * idea, one of them invisible.
     */
    caresAboutMultiplier: z.number().min(0).default(2),
    /**
     * What "half-life" means for the `linear` curve, as a multiple of
     * `halfLifeDays`: strength runs down to the floor over `halfLifeDays ×
     * this`. Two makes it agree with the exponential curve at the halfway
     * mark, which is why it is the default and why it needed saying out loud.
     */
    linearSpanMultiplier: z.number().min(0.01).default(2),
    /** Deed kinds exempt from forgetting entirely. */
    neverForget: z.array(ref('narrative.deedKinds')).default([]),
    extra,
  })
  .strict();

/**
 * How news travels.
 *
 * Spread is per-hop rather than global: a rumour moves from someone who knows
 * to someone who does not, losing fidelity each time. That is what produces
 * the case where a village two days away has heard a garbled version, and the
 * next village has heard nothing.
 */
export const gossipSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Fraction of a settlement's people who learn a known rumour per day. */
    spreadPerDay: z.number().min(0).max(1).default(0.25),
    /** How many retellings before a rumour stops moving. 0 disables spread. */
    maxHops: z.number().int().min(0).default(4),
    /** Strength retained per hop. */
    hopRetention: z.number().min(0).max(1).default(0.75),
    /** Chance per hop that a detail changes — who did it, or how badly. */
    distortionPerHop: z.number().min(0).max(1).default(0.15),
    /**
     * Whether a rumour needs someone to physically travel between settlements.
     * With this off, news teleports, which suits a game with fast couriers.
     */
    requiresTravel: z.boolean().default(true),
    /** Multiplier on spread between settlements of hostile factions. */
    crossFactionRate: z.number().min(0).max(1).default(0.4),
    /** Minimum severity worth repeating; small deeds die where they happen. */
    minimumSeverity: z.number().min(0).default(1),
    /**
     * What a listener's `gullibility` is multiplied by when deciding whether a
     * rumour takes. At the default of 2, a gullibility of 0.5 is the neutral
     * point — which an author reading "0..1" would never have guessed, and
     * which silently halved every spread rate they set.
     */
    gullibilityScale: z.number().min(0).default(2),
    /**
     * Strength kept by a rumour that came out garbled. `distortionPerHop`
     * decides *whether* a retelling distorts; this is *how much* it costs.
     */
    garbledRetention: z.number().min(0).max(1).default(0.5),
    /** Rumours that spread even when nobody survived to tell it. */
    spreadsWithoutWitness: z.boolean().default(false),
    extra,
  })
  .strict();

/**
 * Who sees what.
 *
 * "Deadmen tell no tales" is the setting that makes stealth and massacre
 * mechanically distinct: kill every witness and the deed never enters the
 * social system at all.
 */
export const witnessSchema = z
  .object({
    /**
     * Same location by default; a wider radius includes neighbouring places.
     *
     * With `requiresLineOfSight` off, zero means everyone present — the engine
     * used to floor this at twelve tiles, which made the schema's own default
     * unreachable and imported a sight constant from before senses existed.
     */
    radius: z.number().int().min(0).default(0),
    /** Sneaking and darkness can prevent witnessing. */
    requiresLineOfSight: z.boolean().default(true),
    /** A witness who dies before telling anyone never spreads it. */
    deadMenTellNoTales: z.boolean().default(true),
    /** Chance a witness recognises the party rather than "some travellers". */
    identificationChance: z.number().min(0).max(1).default(0.8),
    /** Being hooded or disguised subtracts from that. */
    disguiseReduction: z.number().min(0).max(1).default(0.5),
    /** Surviving creatures of the victim's faction always learn of it. */
    factionAlwaysLearns: z.boolean().default(false),
    extra,
  })
  .strict();

/**
 * Simulated learning: creatures and factions adapt to how the party fights.
 *
 * This is the other half of emergence. Memory changes how people *feel*;
 * learning changes what they *do* — the third goblin ambush prepares for the
 * fireball that killed the first two.
 */
export const learningSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Encounters with a creature kind before its tactics shift. */
    encountersBeforeAdapting: z.number().int().min(1).default(3),
    /** Chance an adapted creature picks a counter-tactic on a given turn. */
    adaptationStrength: z.number().min(0).max(1).default(0.5),
    /** Knowledge shared across a faction rather than held per creature. */
    sharedWithinFaction: z.boolean().default(true),
    /** Only creatures above this intellect learn; beasts never do. */
    minimumIntellect: z.number().int().optional(),
    /** What they learn to counter. */
    tracks: z
      .array(z.enum(['damageTypes', 'abilities', 'tactics', 'partyComposition']))
      .default(['damageTypes', 'abilities']),
    /** Adaptations decay too, if the party stays away long enough. */
    forgetAfterDays: z.number().int().min(0).default(90),
    extra,
  })
  .strict();

/**
 * A named override the GM can drop on any of the above.
 *
 * This is the escape hatch that makes `hybrid` mode usable: let the simulation
 * run, but state that *this* deed always reaches *these* people, or that this
 * NPC never forgets one particular thing.
 */
export const memoryRuleSchema = z
  .object({
    id: idSchema,
    name: displayName.optional(),
    description: description.default(''),
    /** Which deeds it applies to; empty means all of them. */
    deedKinds: z.array(ref('narrative.deedKinds')).default([]),
    when: PredicateSchema.optional(),
    /** Force these NPCs to know it, regardless of witnessing or distance. */
    alwaysKnownBy: z.array(ref('content.npcs')).default([]),
    /** These never learn of it, whatever the simulation says. */
    neverKnownBy: z.array(ref('content.npcs')).default([]),
    /** Override the global spread and decay for these deeds. */
    spreadPerDay: z.number().min(0).max(1).optional(),
    halfLifeDays: z.number().min(0).optional(),
    distortionPerHop: z.number().min(0).max(1).optional(),
    /** Skip the simulation entirely for these deeds. */
    manualOnly: z.boolean().default(false),
    extra,
  })
  .strict();

export const memoryModelSchema = z
  .object({
    /** Who drives propagation: the engine, the content, or both. */
    mode: z.enum(['simulated', 'manual', 'hybrid']).default('hybrid'),
    forgetting: forgettingSchema.default({}),
    gossip: gossipSchema.default({}),
    witness: witnessSchema.default({}),
    learning: learningSchema.default({}),
    /** Targeted overrides, applied in order after the global settings. */
    rules: z.array(memoryRuleSchema).default([]),
    extra,
  })
  .strict();

export type MemoryModel = z.infer<typeof memoryModelSchema>;
export type Gossip = z.infer<typeof gossipSchema>;
export type Learning = z.infer<typeof learningSchema>;
