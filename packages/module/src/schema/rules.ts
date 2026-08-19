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
     * Which way the dice lean while this is on you.
     *
     * The four scopes a condition can reach: your own attacks, attacks made
     * against you, your ability checks, and your saving throws. Every swing
     * that applies is collected and reconciled by
     * `rules.resolution.swingStacking`, so being both helped and poisoned is a
     * question the ruleset answers rather than the engine.
     *
     * Not a substitute for `modifiers`, and worth choosing between rather than
     * writing both. A penalty to a defence shifts the mean and leaves the
     * critical rate alone; a swing changes the spread and moves criticals with
     * it. Giving one condition both is a double penalty that nothing will warn
     * you about.
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
     * Whether being under this hides who you are, so a witness is less likely
     * to name you. Typed rather than a magic tag the engine knows: a module
     * using `hooded` or `veiled` got no disguise reduction and no error.
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
 * How a check resolves. Written as dice notation so advantage is
 * `2d20kh1` rather than a special case buried in the engine.
 */
export const resolutionSchema = z
  .object({
    checkDice: diceNotation.default('1d20'),
    advantageDice: diceNotation.default('2d20kh1'),
    disadvantageDice: diceNotation.default('2d20kl1'),
    /**
     * What happens when a roll is handed more than one swing.
     *
     * `cancel` is the common table reading: any advantage and any
     * disadvantage together leave neither, and neither ever stacks past one.
     * `net` goes by the sign of the count, so three advantages against one
     * disadvantage still swing up.
     *
     * There is no `stack`, because `advantageDice` is a single notation:
     * there is no way to name two levels of advantage, so offering the option
     * would be offering something the ruleset cannot express.
     */
    swingStacking: z.enum(['cancel', 'net']).default('cancel'),
    /** Natural roll at or above this is a critical success; null disables crits. */
    criticalSuccessAt: z.number().int().nullable().default(20),
    criticalFailureAt: z.number().int().nullable().default(1),
    /**
     * What a critical hit multiplies damage by.
     *
     * The whole amount, modifier included, not the dice alone. Tabletop
     * convention is usually to double the dice and add the modifier once; a
     * damage op carries a rolled number rather than the expression that
     * produced it, so the distinction is not available here. It matters most
     * with a large modifier and a small die.
     */
    criticalDamageMultiplier: z.number().min(1).default(2),
    /**
     * What a successful save against `onSuccess: "half"` leaves, as a fraction.
     *
     * The mirror of `criticalDamageMultiplier`, and it was a literal `0.5` three
     * lines away from it — so a crit could be ×3 but a save could never take a
     * quarter or two thirds.
     */
    saveSuccessMultiplier: z.number().min(0).max(1).default(0.5),
    /**
     * The floor a passive score is measured from: `passiveBase + modifier`.
     *
     * D&D's convention, and the engine's until now. A `3d6` ruleset where 10 is
     * the *mean* rather than a floor needs a different number here.
     */
    passiveBase: z.number().int().default(10),
    /**
     * What "opposed" means when one side is only resisting.
     *
     * `passive` measures against `passiveBase + modifier`, which is stable and
     * cheap. `contested` has the other side roll too. The engine held both
     * readings at once — a reaction used the passive one, `opposedCheck` rolled
     * — so the same word meant two things depending on which path you were on.
     */
    opposedMode: z.enum(['passive', 'contested']).default('passive'),
    /**
     * Which way a scaled damage number is rounded — resistance, a save for
     * half, a critical. Tables disagree about this and it is systematic, not
     * incidental: at `round`, seven halved is four; at `floor` it is three.
     */
    damageRounding: z.enum(['floor', 'round', 'ceil']).default('round'),
    /**
     * Which way a reputation spill is rounded. `trunc` means a relation weight
     * of 0.4 on a ±2 deed spills nothing at all, silently — which is a balance
     * decision rather than an arithmetic one.
     */
    reputationRounding: z.enum(['floor', 'round', 'ceil', 'trunc']).default('trunc'),
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
 * What a level beyond the first adds to the vital resource.
 *
 * This was the D&D hit-point model written into the one place a character is
 * built: a die rolled per level, stacked on top of whatever
 * `rules.resources[].max` already said, for the vital resource only. The
 * default here reproduces it exactly; the other policies are the variants
 * tables actually use.
 *
 * - `roll` — roll the die, as before.
 * - `average` — take its mean, rounded up. The common table variant.
 * - `max` — take the top face.
 * - `none` — add nothing, and let `resources[].max` do the whole job. This is
 *   the honest option for a module that already scales its pools by level.
 *
 * `die` chooses whose die: the class's, or the creature's size — which is what
 * finally makes `rules.sizes[].hitDie` mean something. `bonus` is an expression
 * over the character, so "constitution modifier per level" is expressible at
 * last.
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
     * The rank a bare `skillProficiencies` entry grants. Training always meant
     * exactly 1, while `ancestry.skillBonuses` carried real numbers — so the
     * two sources of skill disagreed about what a number was.
     */
    proficiencyRank: z.number().int().min(0).default(1),
    levelVitality: levelVitalitySchema.default({}),
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
/**
 * A named quality a weapon can have: finesse, versatile, two-handed, thrown.
 *
 * `items[].properties` was an `idSchema[]` naming nothing declared anywhere —
 * tags with extra steps, and unvalidated. Making the vocabulary real means a
 * property can carry modifiers and a requirement can ask for one, which is what
 * a D&D weapon property actually is.
 */
export const itemPropertySchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    /** Additive modifiers to derived stats while a weapon with this is wielded. */
    modifiers: z.record(idSchema, ExprSchema).default({}),
    extra,
  })
  .strict();

/**
 * What money is called here.
 *
 * The engine keeps a single scalar purse; this is only what to print beside it.
 * A module that never mentions money simply never shows one.
 */
/**
 * How far the party can reach without moving.
 *
 * Reach in combat comes from `sizes[].reach`, but these three did not: talking,
 * picking things up, and handing something over were fixed at two tiles, one
 * tile, and one tile in three different files.
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
 * Searching a room, and defusing what it turns up.
 *
 * Both govern how a dungeon crawl feels — how much of a room one `search`
 * covers, and whether disarming means standing on the thing.
 */
export const searchSchema = z
  .object({
    /** How far a search reaches. Arm's length plus a step, not the whole room. */
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
     * Whether the purse can go below zero. Off, the engine clamps and a module
     * simply cannot express a debt; on, it can.
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
    currency: currencySchema.default({}),
    vitalResource: ref('rules.resources'),
    /** Attribute that breaks initiative ties, if any. */
    initiativeStat: ref('rules.derivedStats').optional(),
    /** Default size for creatures that do not declare one. */
    defaultSize: ref('rules.sizes').optional(),
    /**
     * How a creature gets about when it declares no speeds of its own, and how
     * generation decides a map is connected.
     *
     * Without this the engine took the mode named `walk`, or else whichever was
     * declared first — so a module whose modes are `glide` and `phase` got an
     * ordering dependency dressed up as a default.
     */
    defaultMovementMode: ref('rules.movementModes').optional(),
    interactionRange: interactionRangeSchema.default({}),
    search: searchSchema.default({}),
    /**
     * How an NPC's signed `disposition` becomes a stance toward the party.
     *
     * Bands are matched highest `atLeast` first. The engine used to cut at
     * exactly zero and offer only two of the three stances, so however warmly a
     * module wrote somebody they could never spawn as an ally. The default
     * reproduces that cut; adding a band above it is how you get allies.
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
