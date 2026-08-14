/**
 * The tactical layer: the vocabulary a D&D-shaped game needs.
 *
 * Saving throws, resistances, spell slots, concentration, size and reach,
 * senses, movement modes, opportunity attacks. None of it is hardcoded — each
 * is a declared list a module fills in, so a game can have three saving throws
 * or nine, spell slots or spell points or neither.
 *
 * The rule this file follows is that if a table in a rulebook would list it,
 * it belongs here as data rather than as an engine assumption.
 */

import { z } from 'zod';
import { ExprSchema, PredicateSchema, EffectSchema, diceNotation } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, tags, extra } from './common.js';

/**
 * A saving throw. Naming them in data is what lets a module ship the six D&D
 * saves, or Fortitude/Reflex/Will, or none at all.
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

/**
 * A creature size. Carries the numbers that depend on it, so "Large" means
 * something to the engine rather than being a label.
 */
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
 * A way of noticing things: sight, hearing, smell — or tremorsense, or a
 * wraith's nose for fear.
 *
 * Every sense answers one question, *how strong is the signal here*, as a
 * number from zero to one. The thresholds below carve that into bands, which is
 * what separates noticing something from going to look at it from attacking it,
 * and what lets a cold trail be faint at arm's length — something no plain
 * radius can say.
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
     * `line` travels straight and needs an unobstructed path — sight, and sound.
     * `field` seeps around corners through open space, which is how a smell
     * finds its way down a corridor you cannot see along.
     */
    propagation: z.enum(['line', 'field']).default('line'),

    /**
     * What stops it. `opaque` is what blocks sight; `impassable` is what blocks
     * everything else, so a reed bed or an open doorway hides you from view
     * while carrying your noise and your scent perfectly well.
     */
    blockedBy: z.enum(['opaque', 'impassable', 'nothing']).default('opaque'),

    /**
     * `cliff` is full strength to the edge of range and nothing beyond — a thing
     * is either in view or it is not. `linear` fades with distance, so how close
     * something is decides what a creature does about it.
     */
    falloff: z.enum(['cliff', 'linear']).default('cliff'),

    /**
     * Minutes a trace left on the ground stays perceptible. Zero leaves none,
     * which is right for sight: nothing lingers where you were seen.
     */
    lingerMinutes: z.number().min(0).default(0),

    /** Tiles a lingering trace spreads outward per minute as it thins. */
    spreadPerMinute: z.number().min(0).default(0),

    /**
     * Minutes a creature remembers having perceived something. Zero forgets at
     * once, which is right for sight — what you can still see needs no memory.
     */
    rememberMinutes: z.number().min(0).default(0),

    /**
     * Text grammar keys for what noticing something with this sense reads like:
     * one for a strong impression, one for a faint or stale one. Without them
     * the engine falls back to a plain line, which works but says nothing about
     * your world.
     *
     * `{direction}` is interpolated with where it lies.
     */
    impressionTextKey: idSchema.optional(),
    faintImpressionTextKey: idSchema.optional(),
    /**
     * What stopping to use this sense reads like when it turns nothing up.
     *
     * A sense that says nothing at all reads to a player as a broken command,
     * so there is always a line; this is how a module writes its own.
     */
    emptyTextKey: idSchema.optional(),

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
 * How a creature is moving, and therefore what it gives off.
 *
 * Sneaking is not a roll. A stance sets what you emit to each sense and a
 * declared skill shifts it, so the same approach always sounds the same and a
 * player can learn the rules by playing rather than by losing a coin flip.
 */
export const stanceSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Multiplies movement allowance: creeping is slow, running is not. */
    speedMultiplier: z.number().min(0).default(1),
    /**
     * What this stance gives off to each sense, as a multiplier. Absent means
     * one — exactly as noticeable as standing still.
     */
    emits: z.record(ref('rules.senses'), z.number().min(0)).default({}),
    /** Skill whose ranks quieten this stance further. */
    concealedBy: ref('content.skills').optional(),
    /** Emission removed per rank of that skill. */
    concealmentPerPoint: z.number().min(0).default(0),
    extra,
  })
  .strict();

/**
 * How perception behaves overall.
 *
 * Only the parts the engine cannot infer: which sense draws the map, and how
 * long a creature stays curious about something it noticed and lost.
 */
export const perceptionSchema = z
  .object({
    /** The sense used to draw the map and describe a room. */
    sightSense: ref('rules.senses').optional(),
    /** How long a creature keeps looking for something it noticed. */
    curiosityMinutes: z.number().min(0).default(10),
    /** Stance a creature uses when it has chosen none. */
    defaultStance: ref('rules.stances').optional(),
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
 * How damage of a type is modified for a creature.
 *
 * A single multiplier covers resistance (0.5), immunity (0), vulnerability (2),
 * and the healing-from-fire case (-1) without three separate mechanisms.
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
 * Spellcasting.
 *
 * `mode` chooses the economy: Vancian slots, a points pool, both, or neither.
 * A module using the Focus pool from the reference ruleset simply leaves this
 * out entirely.
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
    extra,
  })
  .strict();

/**
 * Reactions triggered by someone else's action — opportunity attacks, shield,
 * counterspell. Declared rather than built in, so a module can remove them.
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
