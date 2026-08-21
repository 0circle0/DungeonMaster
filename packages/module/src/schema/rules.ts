/** The ruleset, defined entirely in data. */

import { z } from 'zod';
import { ExprSchema, EffectSchema, diceNotation } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, tags, extra } from './common.js';
import {
  savingThrowSchema,
  sizeSchema,
  creatureTypeSchema,
  senseSchema,
  stanceSchema,
  perceptionSchema,
  temperamentSchema,
  movementModeSchema,
  languageSchema,
  alignmentSchema,
  spellcastingSchema,
  opportunitySchema,
  coverSchema,
} from './tactical.js';

/** A character attribute. */
export const attributeSchema = z
  .object({
    id: idSchema,
    name: displayName,
    abbrev: z.string().min(1).max(6),
    description: description.default(''),
    min: z.number().int().default(1),
    max: z.number().int().default(20),
    default: z.number().int().default(10),
    modifier: ExprSchema,
  })
  .strict()
  .refine((a) => a.min <= a.default && a.default <= a.max, {
    message: 'default must lie between min and max',
  });

/** A depletable pool such as hit points or focus. */
export const resourceSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Evaluated with the character in scope, e.g. class die + endurance per level. */
    max: ExprSchema,
    min: ExprSchema.default(0),
    /** Starting value; defaults to full. */
    initial: ExprSchema.optional(),
    /** Fraction of max restored by a rest, 0..1. */
    restoreOnShortRest: z.number().min(0).max(1).default(0),
    restoreOnLongRest: z.number().min(0).max(1).default(1),
    /** Reaching min triggers these, which is how death is expressed. */
    onDepleted: z.array(EffectSchema).default([]),
  })
  .strict();

/** A stat computed from attributes and gear, e.g. Guard, Initiative, Speed. */
export const derivedStatSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    formula: ExprSchema,
  })
  .strict();

export const damageTypeSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
  })
  .strict();

/** How a second application of the same condition behaves. */
export const stackingSchema = z.enum([
  'refresh', // reset the duration
  'extend', // add to the duration
  'stack', // independent instances
  'ignore', // the first application wins
]);

/** Which way a roll leans. */
export const swingSchema = z.enum(['advantage', 'disadvantage']);

export const conditionSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    stacking: stackingSchema.default('refresh'),
    /** Omitted means it lasts until removed. */
    defaultDuration: ExprSchema.optional(),
    onApply: z.array(EffectSchema).default([]),
    /** Runs once per round; this is how poison and bleeding tick. */
    onTick: z.array(EffectSchema).default([]),
    onExpire: z.array(EffectSchema).default([]),
    /** Additive modifiers to derived stats while active. */
    modifiers: z.record(idSchema, ExprSchema).default({}),
    /** Actions the condition forbids, e.g. `stunned` blocking `action`. */
    prevents: z.array(idSchema).default([]),
    /** Senses this shuts off, e.g. `blinded` closing `sight`. */
    suppressesSenses: z.array(idSchema).optional(),
    /** Which way the dice lean while this condition is applied. */
    swings: z
      .object({
        ownAttacks: swingSchema.optional(),
        attacksAgainstSelf: swingSchema.optional(),
        checks: swingSchema.optional(),
        saves: swingSchema.optional(),
      })
      .strict()
      .optional(),
    /** Whether being under this hides who you are, so a witness is less likely to name you. */
    concealsIdentity: z.boolean().default(false),
    /** A save each round to shake it off. */
    savingThrow: z
      .object({
        save: ref('rules.savingThrows'),
        difficulty: ExprSchema,
        /** When the save is made: on application, at end of turn, or both. */
        timing: z.enum(['onApply', 'endOfTurn', 'startOfTurn', 'both']).default('endOfTurn'),
      })
      .strict()
      .optional(),
    /** Conditions this one supersedes, e.g. unconscious implying prone. */
    implies: z.array(idSchema).default([]),
    extra,
  })
  .strict();

/** How a check resolves. */
export const resolutionSchema = z
  .object({
    checkDice: diceNotation.default('1d20'),
    advantageDice: diceNotation.default('2d20kh1'),
    disadvantageDice: diceNotation.default('2d20kl1'),
    /** What happens when a roll is handed more than one swing. */
    swingStacking: z.enum(['cancel', 'net']).default('cancel'),
    /** Natural roll at or above this is a critical success; null disables crits. */
    criticalSuccessAt: z.number().int().nullable().default(20),
    criticalFailureAt: z.number().int().nullable().default(1),
    /** Which kinds of roll a critical and a fumble can happen on. */
    criticalScope: z
      .array(z.enum(['attack', 'save', 'check']))
      .default(['attack', 'save', 'check']),
    /** What a critical hit multiplies damage by: the whole amount, modifier included. */
    criticalDamageMultiplier: z.number().min(1).default(2),
    /** What a successful save against `onSuccess: "half"` leaves, as a fraction. */
    saveSuccessMultiplier: z.number().min(0).max(1).default(0.5),
    /** The floor a passive score is measured from: `passiveBase + modifier`. */
    passiveBase: z.number().int().default(10),
    /** What "opposed" means when one side is only resisting. */
    opposedMode: z.enum(['passive', 'contested']).default('passive'),
    /** Which way a scaled damage number is rounded — resistance, a save for half, a critical. */
    damageRounding: z.enum(['floor', 'round', 'ceil']).default('round'),
    /** Which way a reputation spill is rounded. */
    reputationRounding: z.enum(['floor', 'round', 'ceil', 'trunc']).default('trunc'),
    /** What a weapon attack adds, when the ruleset wants more than the bare attribute modifier. */
    attackBonus: ExprSchema.optional(),
    defaultDifficulty: z.number().int().default(12),
    /** Named difficulties content can refer to instead of raw numbers. */
    difficulties: z.record(idSchema, z.number().int()).default({}),
  })
  .strict();

export const levelSchema = z
  .object({
    level: z.number().int().min(1),
    xpRequired: z.number().int().min(0),
    /** Applied on reaching this level. */
    grants: z.array(EffectSchema).default([]),
  })
  .strict();

/** What a level beyond the first adds to the vital resource, on top of `rules.resources[].max`. */
export const levelVitalitySchema = z
  .object({
    policy: z.enum(['roll', 'average', 'max', 'none']).default('roll'),
    die: z.enum(['class', 'size']).default('class'),
    bonus: ExprSchema.default(0),
  })
  .strict();

export const progressionSchema = z
  .object({
    maxLevel: z.number().int().min(1).default(20),
    levels: z.array(levelSchema).min(1),
    /** Proficiency-style bonus by level, if the module uses one. */
    proficiency: ExprSchema.optional(),
    /** The rank a bare `skillProficiencies` entry grants. */
    proficiencyRank: z.number().int().min(0).default(1),
    levelVitality: levelVitalitySchema.default({}),
  })
  .strict()
  .refine(
    (p) => p.levels.every((l, i) => i === 0 || l.xpRequired >= p.levels[i - 1]!.xpRequired),
    { message: 'levels must be ordered by non-decreasing xpRequired' },
  );

/** What a turn is made of. */
export const actionTypeSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Uses available per turn. */
    perTurn: z.number().int().min(0).default(1),
  })
  .strict();

export const restSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** In world-clock minutes. */
    duration: z.number().int().min(0).default(60),
    /** Which restore fraction on resources applies. */
    kind: z.enum(['short', 'long']).default('short'),
    effects: z.array(EffectSchema).default([]),
    /** Chance of being interrupted while in a dangerous place. */
    interruptChance: z.number().min(0).max(1).default(0),
  })
  .strict();

/** A named rung on the skill ladder — novice, adept, master. */
export const masteryTierSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Skill rank at which this tier is reached. */
    atRank: z.number().int().min(0),
  })
  .strict();

/** Equipment slots, so gear layout is a module decision. */
/** A named quality a weapon can have: finesse, versatile, two-handed, thrown. */
export const itemPropertySchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Additive modifiers to derived stats while a weapon with this is wielded. */
    modifiers: z.record(idSchema, ExprSchema).default({}),
    /** Attributes a weapon with this property may attack with, on top of the one the ability names. */
    attackStats: z.array(ref('rules.attributes')).optional(),
    extra,
  })
  .strict();

/** What money is called here. */
/** How far the party can reach without moving. */
export const interactionRangeSchema = z
  .object({
    /** Chebyshev tiles you can hold a conversation across. */
    talk: z.number().int().min(0).default(2),
    /** Tiles you can pick something up from, or hand it over. */
    reach: z.number().int().min(0).default(1),
  })
  .strict();

/** Searching a room, and defusing what it turns up. */
export const searchSchema = z
  .object({
    /** How far a search reaches. */
    trapRadius: z.number().int().min(0).default(2),
    /** How close you must be to disarm what you found. */
    disarmReach: z.number().int().min(0).default(1),
  })
  .strict();

export const currencySchema = z
  .object({
    name: displayName.default('coins'),
    abbrev: z.string().max(6).default('c'),
    /** Whether the purse can go below zero. */
    allowNegative: z.boolean().default(false),
  })
  .strict();

export const equipmentSlotSchema = z
  .object({
    id: idSchema,
    name: displayName,
    /** How many items fit, e.g. two rings. */
    capacity: z.number().int().min(1).default(1),
  })
  .strict();

export const rulesSchema = z
  .object({
    attributes: z.array(attributeSchema).min(1),
    resources: z.array(resourceSchema).min(1),
    derivedStats: z.array(derivedStatSchema).default([]),
    damageTypes: z.array(damageTypeSchema).default([]),
    conditions: z.array(conditionSchema).default([]),
    actionTypes: z.array(actionTypeSchema).default([]),
    equipmentSlots: z.array(equipmentSlotSchema).default([]),
    itemProperties: z.array(itemPropertySchema).default([]),
    masteryTiers: z.array(masteryTierSchema).default([]),
    rests: z.array(restSchema).default([]),
    resolution: resolutionSchema.default({}),
    progression: progressionSchema,

    // The tactical layer.
    savingThrows: z.array(savingThrowSchema).default([]),
    sizes: z.array(sizeSchema).default([]),
    creatureTypes: z.array(creatureTypeSchema).default([]),
    senses: z.array(senseSchema).default([]),
    stances: z.array(stanceSchema).default([]),
    movementModes: z.array(movementModeSchema).default([]),
    languages: z.array(languageSchema).default([]),
    alignments: z.array(alignmentSchema).default([]),
    opportunities: z.array(opportunitySchema).default([]),
    coverTypes: z.array(coverSchema).default([]),
    spellcasting: spellcastingSchema.default({}),
    perception: perceptionSchema.default({}),
    /** What creatures do when nothing is telling them what to do. */
    temperament: temperamentSchema.default({}),
    /** Resource consumed when a character is reduced to zero, e.g. `hp`. */
    currency: currencySchema.default({}),
    vitalResource: ref('rules.resources'),
    /** Attribute that breaks initiative ties, if any. */
    initiativeStat: ref('rules.derivedStats').optional(),
    /** Default size for creatures that do not declare one. */
    defaultSize: ref('rules.sizes').optional(),
    /** How a creature moves when it declares no speeds, and how generation reads connectivity. */
    defaultMovementMode: ref('rules.movementModes').optional(),
    interactionRange: interactionRangeSchema.default({}),
    search: searchSchema.default({}),
    /** How an NPC's signed `disposition` becomes a stance toward the party. */
    dispositionBands: z
      .array(
        z
          .object({
            id: idSchema,
            /** Lowest disposition in this band. */
            atLeast: z.number().optional(),
            stance: z.enum(['ally', 'neutral', 'hostile']),
          })
          .strict(),
      )
      .default([
        { id: 'neutral', atLeast: 0, stance: 'neutral' },
        { id: 'hostile', stance: 'hostile' },
      ]),
    extra,
  })
  .strict();

export type Attribute = z.infer<typeof attributeSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type DerivedStat = z.infer<typeof derivedStatSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Rules = z.infer<typeof rulesSchema>;
