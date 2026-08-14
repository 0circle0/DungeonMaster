/**
 * The ruleset — defined entirely in data.
 *
 * This is where "nothing is hardcoded" is enforced. The engine has no idea what
 * Might is, that hit points exist, that armour class is `10 + agility`, or that
 * checks roll a d20. All of it is declared here and evaluated through the DSL,
 * so a module can ship a dice-pool system or six alien attributes without the
 * engine changing.
 */

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
  movementModeSchema,
  languageSchema,
  alignmentSchema,
  spellcastingSchema,
  opportunitySchema,
  coverSchema,
} from './tactical.js';

/**
 * A character attribute.
 *
 * `modifier` is a DSL expression evaluated with `{ value }` in scope, so the
 * familiar `floor((score - 10) / 2)` is a content decision rather than an
 * engine constant.
 */
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

/**
 * A depletable pool such as hit points or focus.
 *
 * Generalising these means the engine never mentions "HP". A module that wants
 * stamina, sanity, or heat adds a resource; nothing in the engine changes.
 */
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

/**
 * How a check resolves. Written as dice notation so advantage is
 * `2d20kh1` rather than a special case buried in the engine.
 */
export const resolutionSchema = z
  .object({
    checkDice: diceNotation.default('1d20'),
    advantageDice: diceNotation.default('2d20kh1'),
    disadvantageDice: diceNotation.default('2d20kl1'),
    /** Natural roll at or above this is a critical success; null disables crits. */
    criticalSuccessAt: z.number().int().nullable().default(20),
    criticalFailureAt: z.number().int().nullable().default(1),
    /** A critical hit multiplies damage dice by this. */
    criticalDamageMultiplier: z.number().min(1).default(2),
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

export const progressionSchema = z
  .object({
    maxLevel: z.number().int().min(1).default(20),
    levels: z.array(levelSchema).min(1),
    /** Proficiency-style bonus by level, if the module uses one. */
    proficiency: ExprSchema.optional(),
  })
  .strict()
  .refine(
    (p) => p.levels.every((l, i) => i === 0 || l.xpRequired >= p.levels[i - 1]!.xpRequired),
    { message: 'levels must be ordered by non-decreasing xpRequired' },
  );

/** What a turn is made of. Even the action economy is data. */
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

/**
 * A named rung on the skill ladder — novice, adept, master.
 *
 * Mastery is what lets loot and gates ask for competence rather than a bare
 * number, so content reads as "requires journeyman smithing" instead of
 * "requires rank >= 3".
 */
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
    masteryTiers: z.array(masteryTierSchema).default([]),
    rests: z.array(restSchema).default([]),
    resolution: resolutionSchema.default({}),
    progression: progressionSchema,

    // The tactical layer. Every one of these is an empty list by default, so a
    // module takes on only the complexity it actually wants.
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
    /** Resource consumed when a character is reduced to zero, e.g. `hp`. */
    vitalResource: ref('rules.resources'),
    /** Attribute that breaks initiative ties, if any. */
    initiativeStat: ref('rules.derivedStats').optional(),
    /** Default size for creatures that do not declare one. */
    defaultSize: ref('rules.sizes').optional(),
    extra,
  })
  .strict();

export type Attribute = z.infer<typeof attributeSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type DerivedStat = z.infer<typeof derivedStatSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Rules = z.infer<typeof rulesSchema>;
