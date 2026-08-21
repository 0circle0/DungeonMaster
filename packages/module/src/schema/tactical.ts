/**
 * The tactical layer: saving throws, resistances, spell slots, concentration, size and reach,
 * senses, movement modes, opportunity attacks.
 *
 * None of it is hardcoded — each is a declared list a module fills in, so a game can have three
 * saving throws or nine, spell slots or spell points or neither. If a rulebook would list it as a
 * table, it belongs here as data.
 */

import { z } from 'zod';
import { ExprSchema, PredicateSchema, EffectSchema, diceNotation } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, tags, extra } from './common.js';

/**
 * A saving throw. Declared in data, so a module can ship the six D&D saves, Fortitude/Reflex/Will,
 * or none.
 */
export const savingThrowSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    attribute: ref('rules.attributes'),
    /** Difficulty when nothing sets one explicitly. */
    defaultDifficulty: ExprSchema.optional(),
    extra,
  })
  .strict();

/** A creature size, carrying the numbers that depend on it. */
export const sizeSchema = z
  .object({
    id: idSchema,
    name: displayName,
    /** Space occupied, in feet or whatever unit the module uses. */
    space: z.number().min(0).default(5),
    /** Natural reach before weapons. */
    reach: z.number().min(0).default(5),
    /** Multiplier on carrying capacity. */
    carryMultiplier: z.number().min(0).default(1),
    /** Hit-die step, for modules that scale HP by size. */
    hitDie: diceNotation.optional(),
    extra,
  })
  .strict();

/** Beast, undead, aberration — used by spells and features that target a type. */
export const creatureTypeSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    extra,
  })
  .strict();

/**
 * A way of noticing things: sight, hearing, smell, tremorsense.
 *
 * Every sense answers one question — how strong is the signal here — as a number from zero to one.
 * The thresholds below carve that into bands, which separates noticing something from going to look
 * at it from attacking it, and lets a cold trail be faint at arm's length.
 */
export const senseSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Default range when a creature has it without one specified. */
    defaultRange: z.number().min(0).default(60),
    /** Ignores these conditions when perceiving, e.g. blindsight ignoring darkness. */
    ignores: z.array(idSchema).default([]),

    /**
     * `line` travels straight and needs an unobstructed path — sight, and sound. `field` seeps
     * around corners through open space, which is how a smell reaches down a corridor you cannot
     * see along.
     */
    propagation: z.enum(['line', 'field']).default('line'),

    /**
     * What stops it. `opaque` blocks sight; `impassable` blocks everything else, so a reed bed or
     * an open doorway hides you from view while carrying your noise and scent.
     */
    blockedBy: z.enum(['opaque', 'impassable', 'nothing']).default('opaque'),

    /**
     * `cliff` is full strength to the edge of range and nothing beyond. `linear` fades with
     * distance, so how close something is decides what a creature does about it.
     */
    falloff: z.enum(['cliff', 'linear']).default('cliff'),

    /**
     * Minutes a trace left on the ground stays perceptible. Zero leaves none, which is right for
     * sight.
     */
    lingerMinutes: z.number().min(0).default(0),

    /**
     * How fast this sense travels, in tiles per minute. Zero arrives at once.
     *
     * A speed, not a bonus to reach: a signal has only got `spreadPerMinute` tiles from its source
     * for each minute since, so a creature further out cannot perceive it yet. Sight and sound
     * leave this at zero.
     *
     * It is also why an old trace can reach an observer while a fresh one beside its owner has not.
     */
    spreadPerMinute: z.number().min(0).default(0),
    /**
     * Signal left at the far edge of reach, once it has spread that far. Eased from full strength
     * at the source to this at the limit of the sense, rather than switching over at the first
     * tile.
     */
    spreadRetention: z.number().min(0).max(1).default(0.5),

    /**
     * Minutes a creature remembers having perceived something. Zero forgets at once, which is right
     * for sight.
     */
    rememberMinutes: z.number().min(0).default(0),

    /**
     * Text grammar keys for what noticing something with this sense reads like: one for a strong
     * impression, one for a faint or stale one. Without them the engine falls back to a plain line.
     * `{direction}` is interpolated with where it lies.
     */
    impressionTextKey: ref('narrative.textGrammar').optional(),
    faintImpressionTextKey: ref('narrative.textGrammar').optional(),
    /**
     * What stopping to use this sense reads like when it turns nothing up. There is always a line,
     * since silence reads as a broken command; this is how a module writes its own.
     */
    emptyTextKey: ref('narrative.textGrammar').optional(),

    /** Signal needed to notice at all, to go and look, and to fight. Ordered. */
    thresholds: z
      .object({
        detect: z.number().min(0).max(1).default(0),
        investigate: z.number().min(0).max(1).default(0),
        aggro: z.number().min(0).max(1).default(0),
      })
      .strict()
      .default({}),
    extra,
  })
  .strict()
  .refine((s) => s.thresholds.detect <= s.thresholds.investigate
    && s.thresholds.investigate <= s.thresholds.aggro, {
    message: 'thresholds must be ordered: detect ≤ investigate ≤ aggro',
    path: ['thresholds'],
  });

/**
 * How a creature is moving, and therefore what it gives off. A stance sets what you emit to each
 * sense and a declared skill shifts it; there is no roll, so the same approach always sounds the
 * same.
 */
export const stanceSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Multiplies movement allowance: creeping is slow, running is not. */
    speedMultiplier: z.number().min(0).default(1),
    /** What this stance gives off to each sense, as a multiplier. Absent means one. */
    emits: z.record(ref('rules.senses'), z.number().min(0)).default({}),
    /** Skill whose ranks quieten this stance further. */
    concealedBy: ref('content.skills').optional(),
    /** Emission removed per rank of that skill. */
    concealmentPerPoint: z.number().min(0).default(0),
    extra,
  })
  .strict();

/**
 * How perception behaves overall: which sense draws the map, and how long a creature stays curious
 * about something it noticed and lost.
 */
export const perceptionSchema = z
  .object({
    /** The sense used to draw the map and describe a room. */
    sightSense: ref('rules.senses').optional(),
    /** How long a creature keeps looking for something it noticed. */
    curiosityMinutes: z.number().min(0).default(10),
    /** Stance a creature uses when it has chosen none. */
    defaultStance: ref('rules.stances').optional(),
    /**
     * The least a creature can ever give off, whatever its stance or skill. Above zero, perfect
     * stealth is impossible.
     */
    minimumEmission: z.number().min(0).max(1).default(0.01),

    /**
     * How many traces one tile keeps, per sense; the oldest fall off.
     *
     * A small number rather than one, because two creatures passing in opposite directions is
     * genuinely two things.
     *
     * A performance bound as much as a storage one: every trace on every tile is read for every
     * sense, for every creature, every turn.
     */
    maxMarksPerTile: z.number().int().min(1).default(4),
    extra,
  })
  .strict();

/**
 * What a creature does when nobody is telling it what to do.
 *
 * Perception answers what it can tell is there; this answers what it does about it.
 *
 * Every default reproduces the engine's older behaviour: nothing wanders, nothing is leashed, and a
 * fight ends the moment nobody can be perceived.
 */
export const temperamentSchema = z
  .object({
    /**
     * How far from where it was placed it will wander, in module units. Zero is a creature that
     * stands where it was put, which is the default.
     */
    roamRadius: z.number().min(0).default(0),

    /**
     * How far from that same spot a lead may pull it. Absent is no limit. Separate from
     * `roamRadius` because catching a scent is a reason to leave its own ground.
     */
    investigateRadius: z.number().min(0).optional(),

    /**
     * How far it will chase before turning for home. Absent is no limit. Gates pursuit only: a
     * leashed creature with something in reach still fights.
     */
    leashRadius: z.number().min(0).optional(),

    /** Odds it moves at all on a given idle step. Zero never wanders. */
    wanderChance: z.number().min(0).max(1).default(0),

    /**
     * Rounds it stays in a fight after nobody can perceive anybody. Zero ends the fight at the end
     * of the round somebody breaks away; one or two makes a corner a tactic rather than an exit.
     */
    disengageTurns: z.number().int().min(0).default(0),

    /**
     * Multipliers on how fast it moves for each reason it moves. Zero never moves that way at all:
     * a shopkeeper sets `wander` to zero and stays behind the counter.
     */
    speeds: z
      .object({
        wander: z.number().min(0).default(1),
        investigate: z.number().min(0).default(1),
        engage: z.number().min(0).default(1),
        returning: z.number().min(0).default(1),
      })
      .strict()
      .default({}),

    /**
     * Which senses it acts on, best first. Absent means all of them, strongest signal first. An
     * empty list notices everything and investigates none of it. Order is preference, not strength.
     */
    investigates: z.array(ref('rules.senses')).optional(),

    /**
     * Whether a trace left on the ground is worth following. False is a creature that acts on what
     * is there now, never on what passed through an hour ago.
     */
    followsTrails: z.boolean().default(true),

    /**
     * Whose presence it registers at all. Defaults to enemies only, which is the filter perception
     * applied with no way to say otherwise. Widening it is what lets creatures notice each other.
     */
    notices: z.array(z.enum(['hostile', 'neutral', 'ally'])).default(['hostile']),
    extra,
  })
  .strict();

/**
 * The same thing as a per-creature override, where every field is genuinely absent rather than
 * defaulted.
 *
 * Written out rather than derived with `.partial()`, which is shallow: that would leave `speeds`
 * carrying its inner defaults, so a creature overriding only its wander speed would silently reset
 * the others to one.
 */
export const temperamentOverrideSchema = z
  .object({
    roamRadius: z.number().min(0).optional(),
    investigateRadius: z.number().min(0).optional(),
    leashRadius: z.number().min(0).optional(),
    wanderChance: z.number().min(0).max(1).optional(),
    disengageTurns: z.number().int().min(0).optional(),
    speeds: z
      .object({
        wander: z.number().min(0).optional(),
        investigate: z.number().min(0).optional(),
        engage: z.number().min(0).optional(),
        returning: z.number().min(0).optional(),
      })
      .strict()
      .optional(),
    investigates: z.array(ref('rules.senses')).optional(),
    followsTrails: z.boolean().optional(),
    notices: z.array(z.enum(['hostile', 'neutral', 'ally'])).optional(),
    extra,
  })
  .strict();

/** Walk, fly, swim, burrow, climb. */
export const movementModeSchema = z
  .object({
    id: idSchema,
    name: displayName,
    /** Speed when a creature has the mode but no explicit rate. */
    defaultSpeed: z.number().min(0).default(30),
    /** Difficult terrain and similar costs. */
    terrainMultiplier: z.number().min(0).default(1),
    /** Falls when the mode is lost, e.g. flight while unconscious. */
    fallsWhenDisabled: z.boolean().default(false),
    extra,
  })
  .strict();

export const languageSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    script: z.string().default(''),
    /** Rare languages gate dialogue and readable content. */
    exotic: z.boolean().default(false),
    extra,
  })
  .strict();

export const alignmentSchema = z
  .object({
    id: idSchema,
    name: displayName,
    abbrev: z.string().max(4).default(''),
    extra,
  })
  .strict();

/**
 * How damage of a type is modified for a creature. A single multiplier covers resistance (0.5),
 * immunity (0), vulnerability (2) and healing from damage (-1).
 */
export const damageInteractionSchema = z
  .object({
    damageType: ref('rules.damageTypes'),
    multiplier: z.number().default(1),
    /** Ignored when the damage carries one of these tags, e.g. silvered. */
    unless: z.array(idSchema).default([]),
    extra,
  })
  .strict();

/**
 * Spellcasting. `mode` chooses the economy: Vancian slots, a points pool, both, or neither. A
 * module using only the Focus pool leaves this out.
 */
export const spellcastingSchema = z
  .object({
    mode: z.enum(['none', 'slots', 'points', 'both']).default('none'),
    /** Highest spell level the module uses. */
    maxSpellLevel: z.number().int().min(0).default(9),
    /** Slots per caster level: `slotTable["3"] = [4, 2]` is four 1st and two 2nd. */
    slotTable: z.record(z.string(), z.array(z.number().int().min(0))).default({}),
    /** Resource spent when `mode` includes points. */
    pointResource: ref('rules.resources').optional(),
    /** Point cost per spell level, indexed by level. */
    pointCosts: z.record(z.string(), z.number().int().min(0)).default({}),
    /** Spell save DC and attack bonus, as formulas over the caster. */
    saveDifficulty: ExprSchema.optional(),
    attackBonus: ExprSchema.optional(),
    /** Casting again while concentrating drops the first spell. */
    concentration: z
      .object({
        enabled: z.boolean().default(true),
        /** Save made when damaged while concentrating. */
        savingThrow: ref('rules.savingThrows').optional(),
        /** Usually max(10, half the damage taken). */
        difficulty: ExprSchema.optional(),
        /** Concentrating on more than one spell at a time. */
        maxConcurrent: z.number().int().min(1).default(1),
      })
      .strict()
      .default({}),
    /** Recovered on which rest kinds. */
    recoverOn: z.array(ref('rules.rests')).default([]),
    ritualCasting: z.boolean().default(false),
    /**
     * Which action a spell component is, so silence and manacles work. Refs rather than the engine
     * looking for action types named `speak` and `gesture`, so a wrong id is a load error.
     */
    componentActionTypes: z
      .object({
        verbal: ref('rules.actionTypes').optional(),
        somatic: ref('rules.actionTypes').optional(),
      })
      .strict()
      .default({}),
    extra,
  })
  .strict();

/**
 * Reactions triggered by someone else's action — opportunity attacks, shield, counterspell.
 * Declared rather than built in, so a module can remove them.
 */
export const opportunitySchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** What provokes it. */
    on: z
      .enum(['moveAway', 'castSpell', 'rangedAttack', 'standUp', 'beHit', 'allyHit', 'custom'])
      .default('moveAway'),
    event: z.string().optional(),
    /** Action type it consumes, usually a reaction. */
    actionType: ref('rules.actionTypes').optional(),
    /** Ability used to respond; omit for a plain weapon attack. */
    use: ref('content.abilities').optional(),
    requires: PredicateSchema.optional(),
    effects: z.array(EffectSchema).default([]),
    /** Uses per round, across all provocations. */
    usesPerRound: z.number().int().min(1).default(1),
    extra,
  })
  .strict();

/** Cover, and anything else that adjusts a roll situationally. */
export const coverSchema = z
  .object({
    id: idSchema,
    name: displayName,
    /** Bonus to the defender's guard-equivalent. */
    defenceBonus: z.number().int().default(0),
    /** Blocks line of effect entirely. */
    blocksTargeting: z.boolean().default(false),
    extra,
  })
  .strict();

export type SavingThrow = z.infer<typeof savingThrowSchema>;
export type Size = z.infer<typeof sizeSchema>;
export type Spellcasting = z.infer<typeof spellcastingSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type Temperament = z.infer<typeof temperamentSchema>;
export type TemperamentOverride = z.infer<typeof temperamentOverrideSchema>;
