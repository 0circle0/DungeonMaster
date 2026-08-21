/** The tactical layer: saves, resistances, slots, senses, movement and opportunities. */

import { z } from 'zod';
import { ExprSchema, PredicateSchema, EffectSchema, diceNotation } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, tags, extra } from './common.js';

/** A saving throw. */
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

/** A way of noticing things: sight, hearing, smell, tremorsense. */
export const senseSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Default range when a creature has it without one specified. */
    defaultRange: z.number().min(0).default(60),
    /** Ignores these conditions when perceiving, e.g. blindsight ignoring darkness. */
    ignores: z.array(idSchema).default([]),

    /** `line` travels straight and needs an unobstructed path — sight, and sound. */
    propagation: z.enum(['line', 'field']).default('line'),

    /** What stops it. */
    blockedBy: z.enum(['opaque', 'impassable', 'nothing']).default('opaque'),

    /** `cliff` is full strength to the edge of range and nothing beyond. */
    falloff: z.enum(['cliff', 'linear']).default('cliff'),

    /** Minutes a trace left on the ground stays perceptible. */
    lingerMinutes: z.number().min(0).default(0),

    /** How fast this sense travels, in tiles per minute. */
    spreadPerMinute: z.number().min(0).default(0),
    /** Signal left at the far edge of reach, once it has spread that far. */
    spreadRetention: z.number().min(0).max(1).default(0.5),

    /** Minutes a creature remembers having perceived something. */
    rememberMinutes: z.number().min(0).default(0),

    /** Text grammar keys for a strong and a faint impression from this sense. */
    impressionTextKey: ref('narrative.textGrammar').optional(),
    faintImpressionTextKey: ref('narrative.textGrammar').optional(),
    /** What stopping to use this sense reads like when it turns nothing up. */
    emptyTextKey: ref('narrative.textGrammar').optional(),

    /** Signal needed to notice at all, to go and look, and to fight. */
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

/** How a creature is moving, and therefore what it gives off. */
export const stanceSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Multiplies movement allowance: creeping is slow, running is not. */
    speedMultiplier: z.number().min(0).default(1),
    /** What this stance gives off to each sense, as a multiplier. */
    emits: z.record(ref('rules.senses'), z.number().min(0)).default({}),
    /** Skill whose ranks quieten this stance further. */
    concealedBy: ref('content.skills').optional(),
    /** Emission removed per rank of that skill. */
    concealmentPerPoint: z.number().min(0).default(0),
    extra,
  })
  .strict();

/** How perception behaves overall: which sense draws the map, and how long curiosity lasts. */
export const perceptionSchema = z
  .object({
    /** The sense used to draw the map and describe a room. */
    sightSense: ref('rules.senses').optional(),
    /** How long a creature keeps looking for something it noticed. */
    curiosityMinutes: z.number().min(0).default(10),
    /** Stance a creature uses when it has chosen none. */
    defaultStance: ref('rules.stances').optional(),
    /** The least a creature can ever give off, whatever its stance or skill. */
    minimumEmission: z.number().min(0).max(1).default(0.01),

    /** How many traces one tile keeps, per sense; the oldest fall off. */
    maxMarksPerTile: z.number().int().min(1).default(4),
    extra,
  })
  .strict();

/** What a creature does when nobody is telling it what to do. */
export const temperamentSchema = z
  .object({
    /** How far from where it was placed it will wander, in module units. */
    roamRadius: z.number().min(0).default(0),

    /** How far from that same spot a lead may pull it. */
    investigateRadius: z.number().min(0).optional(),

    /** How far it will chase before turning for home. */
    leashRadius: z.number().min(0).optional(),

    /** Odds it moves at all on a given idle step. */
    wanderChance: z.number().min(0).max(1).default(0),

    /** Rounds it stays in a fight after nobody can perceive anybody. */
    disengageTurns: z.number().int().min(0).default(0),

    /** Multipliers on how fast it moves for each reason it moves. */
    speeds: z
      .object({
        wander: z.number().min(0).default(1),
        investigate: z.number().min(0).default(1),
        engage: z.number().min(0).default(1),
        returning: z.number().min(0).default(1),
      })
      .strict()
      .default({}),

    /** Which senses it acts on, best first. */
    investigates: z.array(ref('rules.senses')).optional(),

    /** Whether a trace left on the ground is worth following. */
    followsTrails: z.boolean().default(true),

    /** Whose presence it registers at all. */
    notices: z.array(z.enum(['hostile', 'neutral', 'ally'])).default(['hostile']),
    extra,
  })
  .strict();

/** The same thing as a per-creature override, with every field genuinely absent. */
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

/** How damage of a type is modified for a creature. */
export const damageInteractionSchema = z
  .object({
    damageType: ref('rules.damageTypes'),
    multiplier: z.number().default(1),
    /** Ignored when the damage carries one of these tags, e.g. silvered. */
    unless: z.array(idSchema).default([]),
    extra,
  })
  .strict();

/** Spellcasting. */
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
    /** Which action a spell component is, so silence and manacles work. */
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

/** Reactions triggered by someone else's action — opportunity attacks, shield, counterspell. */
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
