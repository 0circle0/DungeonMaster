/**
 * The ruleset, defined entirely in data.
 *
 * The engine does not know what Might is, that hit points exist, that armour class is `10 +
 * agility`, or that checks roll a d20. All of it is declared here and evaluated through the DSL, so
 * a module can ship a dice-pool system or six alien attributes without engine changes.
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
  temperamentSchema,
  movementModeSchema,
  languageSchema,
  alignmentSchema,
  spellcastingSchema,
  opportunitySchema,
  coverSchema,
} from './tactical.js';

/**
 * A character attribute. `modifier` is a DSL expression evaluated with `{ value }` in scope, so
 * `floor((score - 10) / 2)` is a content decision rather than an engine constant.
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
 * A depletable pool such as hit points or focus. Generalised so the engine never mentions HP: a
 * module that wants stamina, sanity or heat adds a resource.
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

/** Which way a roll leans. Named once: conditions and abilities both use it. */
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
    /**
     * Senses this shuts off, e.g. `blinded` closing `sight`. The sense's own `ignores` is the
     * exception, which is what blindsight is; neither half means anything without the other.
     *
     * A bare id rather than a `ref`, matching `ignores` on the other side. A checked reference
     * would make the composer's `damage` section depend on `movement`, which already reaches back
     * to `damage` through `skills`. The semantic rules check the link instead; see
     * `diagnostics/rules.ts`.
     */
    suppressesSenses: z.array(idSchema).optional(),
    /**
     * Which way the dice lean while this condition is applied.
     *
     * Four scopes: the bearer's attacks, attacks against them, their ability checks, and their
     * saving throws. Every swing that applies is collected and reconciled by
     * `rules.resolution.swingStacking`.
     *
     * Not a substitute for `modifiers`, and worth choosing between: a penalty to a defence shifts
     * the mean and leaves the critical rate alone, while a swing changes the spread and moves
     * criticals with it.
     */
    swings: z
      .object({
        ownAttacks: swingSchema.optional(),
        attacksAgainstSelf: swingSchema.optional(),
        checks: swingSchema.optional(),
        saves: swingSchema.optional(),
      })
      .strict()
      .optional(),
    /**
     * Whether being under this hides who you are, so a witness is less likely to name you. Typed
     * rather than a tag the engine recognises by name.
     */
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

/**
 * How a check resolves. Written as dice notation, so advantage is `2d20kh1` rather than an engine
 * special case.
 */
export const resolutionSchema = z
  .object({
    checkDice: diceNotation.default('1d20'),
    advantageDice: diceNotation.default('2d20kh1'),
    disadvantageDice: diceNotation.default('2d20kl1'),
    /**
     * What happens when a roll is handed more than one swing.
     *
     * `cancel` is the common table reading: any advantage and any disadvantage together leave
     * neither, and neither stacks past one. `net` goes by the sign of the count, so three
     * advantages against one disadvantage still swing up.
     *
     * There is no `stack`: `advantageDice` is a single notation, so two levels of advantage cannot
     * be named.
     */
    swingStacking: z.enum(['cancel', 'net']).default('cancel'),
    /** Natural roll at or above this is a critical success; null disables crits. */
    criticalSuccessAt: z.number().int().nullable().default(20),
    criticalFailureAt: z.number().int().nullable().default(1),
    /**
     * Which kinds of roll a critical and a fumble can happen on. `criticalSuccessAt` is all or
     * nothing; this is the narrower dial. The default lists all three, so with `check` in the list
     * a natural 20 picks a lock no amount of skill could open.
     */
    criticalScope: z
      .array(z.enum(['attack', 'save', 'check']))
      .default(['attack', 'save', 'check']),
    /**
     * What a critical hit multiplies damage by: the whole amount, modifier included, not the dice
     * alone. A damage op carries a rolled number rather than the expression that produced it, so
     * the tabletop convention of doubling only the dice is not available here.
     */
    criticalDamageMultiplier: z.number().min(1).default(2),
    /**
     * What a successful save against `onSuccess: "half"` leaves, as a fraction. The mirror of
     * `criticalDamageMultiplier`.
     */
    saveSuccessMultiplier: z.number().min(0).max(1).default(0.5),
    /**
     * The floor a passive score is measured from: `passiveBase + modifier`. A `3d6` ruleset where
     * 10 is the mean rather than a floor needs a different number.
     */
    passiveBase: z.number().int().default(10),
    /**
     * What "opposed" means when one side is only resisting. `passive` measures against `passiveBase
     * + modifier`; `contested` has the other side roll too.
     */
    opposedMode: z.enum(['passive', 'contested']).default('passive'),
    /**
     * Which way a scaled damage number is rounded — resistance, a save for half, a critical. At
     * `round`, seven halved is four; at `floor`, three.
     */
    damageRounding: z.enum(['floor', 'round', 'ceil']).default('round'),
    /**
     * Which way a reputation spill is rounded. Under `trunc` a relation weight of 0.4 on a ±2 deed
     * spills nothing.
     */
    reputationRounding: z.enum(['floor', 'round', 'ceil', 'trunc']).default('trunc'),
    /**
     * What a weapon attack adds, when the ruleset wants more than the bare attribute modifier.
     *
     * `actor.attackMod` is the modifier for whichever attribute the attack resolved to, and
     * `actor.proficiency` is the module's own curve. Omitted, an attack adds the attribute modifier
     * alone, so a weapon never improves with level.
     *
     * The mirror of `spellcasting.attackBonus`.
     */
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

/**
 * What a level beyond the first adds to the vital resource, on top of `rules.resources[].max`.
 *
 * - `roll` — roll the die.
 * - `average` — its mean, rounded up.
 * - `max` — the top face.
 * - `none` — add nothing, leaving `resources[].max` to do the whole job.
 *
 * `die` chooses whose die: the class's, or the creature's size, which is what
 * `rules.sizes[].hitDie` feeds. `bonus` is an expression over the character, so "constitution
 * modifier per level" is expressible.
 */
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
    /**
     * The rank a bare `skillProficiencies` entry grants. Without it, training meant exactly 1 while
     * `ancestry.skillBonuses` carried arbitrary numbers.
     */
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

/**
 * A named rung on the skill ladder — novice, adept, master. Lets loot and gates ask for competence
 * rather than a bare rank number.
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
/**
 * A named quality a weapon can have: finesse, versatile, two-handed, thrown. Declaring the
 * vocabulary means a property can carry modifiers and a requirement can ask for one.
 */
export const itemPropertySchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Additive modifiers to derived stats while a weapon with this is wielded. */
    modifiers: z.record(idSchema, ExprSchema).default({}),
    /**
     * Attributes a weapon with this property may attack with, on top of the one the ability names.
     * The best of them is used, for the attack roll and for the weapon's damage.
     *
     * This is what finesse is: a choice of which attribute the roll uses, which `modifiers` cannot
     * express.
     *
     * It belongs to the property rather than the ability, so the weapon decides and one authored
     * `strike` serves everyone.
     */
    attackStats: z.array(ref('rules.attributes')).optional(),
    extra,
  })
  .strict();

/**
 * What money is called here. The engine keeps a single scalar purse; this is what to print beside
 * it.
 */
/**
 * How far the party can reach without moving. Combat reach comes from `sizes[].reach`; talking,
 * picking things up and handing something over are set here.
 */
export const interactionRangeSchema = z
  .object({
    /** Chebyshev tiles you can hold a conversation across. */
    talk: z.number().int().min(0).default(2),
    /** Tiles you can pick something up from, or hand it over. */
    reach: z.number().int().min(0).default(1),
  })
  .strict();

/**
 * Searching a room, and defusing what it turns up: how much of a room one `search` covers, and
 * whether disarming means standing on the thing.
 */
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
    /**
     * Whether the purse can go below zero. Off, the engine clamps and a debt cannot be expressed.
     */
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

    // The tactical layer. Each of these is an empty list by default, so a module takes on only the
    // complexity it wants.
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
    /**
     * What creatures do when nothing is telling them what to do. Beside `perception`, which decides
     * what a creature can tell is there. Per-creature `temperament` overrides any of it.
     */
    temperament: temperamentSchema.default({}),
    /** Resource consumed when a character is reduced to zero, e.g. `hp`. */
    currency: currencySchema.default({}),
    vitalResource: ref('rules.resources'),
    /** Attribute that breaks initiative ties, if any. */
    initiativeStat: ref('rules.derivedStats').optional(),
    /** Default size for creatures that do not declare one. */
    defaultSize: ref('rules.sizes').optional(),
    /**
     * How a creature gets about when it declares no speeds of its own, and how generation decides a
     * map is connected. Without it the engine took the mode named `walk`, or else whichever was
     * declared first.
     */
    defaultMovementMode: ref('rules.movementModes').optional(),
    interactionRange: interactionRangeSchema.default({}),
    search: searchSchema.default({}),
    /**
     * How an NPC's signed `disposition` becomes a stance toward the party. Bands are matched
     * highest `atLeast` first. The default cuts at zero and offers two stances; adding a band above
     * it is how an NPC can spawn as an ally.
     */
    dispositionBands: z
      .array(
        z
          .object({
            id: idSchema,
            /** Lowest disposition in this band. Omit for the catch-all below them all. */
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
