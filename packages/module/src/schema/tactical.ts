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

    /**
     * How fast this sense travels, in tiles per minute. Zero arrives at once.
     *
     * **This is a speed, not a bonus to anyone's reach.** A signal given off at
     * a place has only got `spreadPerMinute` tiles away for each minute since,
     * so a creature further out than that simply cannot perceive it yet however
     * keen its nose. Sight and sound leave this at zero and are heard the
     * instant they happen; a smell does not, which is why walking into a
     * dungeon starts filling it rather than filling it.
     *
     * It is also what makes a trail worth more than the thing that left it: an
     * old trace has been spreading longer, so it reaches you while the fresh
     * one beside its owner has not got anywhere yet.
     */
    spreadPerMinute: z.number().min(0).default(0),
    /**
     * Signal left at the far edge of reach, once it has spread that far.
     *
     * The same scent over more ground is weaker. Eased from full strength at
     * the source to this at the limit of the sense, so it thins with distance
     * rather than switching over at the first tile.
     */
    spreadRetention: z.number().min(0).max(1).default(0.5),

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
    impressionTextKey: ref('narrative.textGrammar').optional(),
    faintImpressionTextKey: ref('narrative.textGrammar').optional(),
    /**
     * What stopping to use this sense reads like when it turns nothing up.
     *
     * A sense that says nothing at all reads to a player as a broken command,
     * so there is always a line; this is how a module writes its own.
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
    /**
     * The least a creature can ever give off, whatever its stance or skill.
     *
     * Above zero, perfect stealth is impossible — which is a design opinion
     * about whether a skill should be a win condition, and so the module's to
     * hold rather than the engine's.
     */
    minimumEmission: z.number().min(0).max(1).default(0.01),

    /**
     * How many traces one tile keeps, per sense. The oldest fall off.
     *
     * A thousand of a thing crossing one tile is still, to a nose, "they came
     * through here" — the thousandth trace says nothing the first did not. Two
     * of them passing in opposite directions is genuinely two things, which is
     * why this is a small number rather than one.
     *
     * It is a performance bound as much as a storage one: every trace on every
     * tile is read for every sense, for every creature, every turn.
     */
    maxMarksPerTile: z.number().int().min(1).default(4),
    extra,
  })
  .strict();

/**
 * What a creature does when nobody is telling it what to do.
 *
 * Perception answers *what can it tell is there*; this answers *what does it
 * bother to do about it*. The two are deliberately separate: a hound and a
 * shopkeeper standing in the same doorway smell the same street, and only one
 * of them goes to look.
 *
 * Every default here reproduces the engine's older behaviour exactly — nothing
 * wanders, nothing is leashed, and a fight ends the moment nobody can be
 * perceived. A world comes alive by opting in.
 */
export const temperamentSchema = z
  .object({
    /**
     * How far from where it was placed it will wander, in module units.
     *
     * Zero is a creature with no territory, which is one that stands where it
     * was put. That is the default, and it is what every creature did before
     * this existed.
     */
    roamRadius: z.number().min(0).default(0),

    /**
     * How far from that same spot a lead may pull it. Absent is no limit.
     *
     * Separate from `roamRadius` because catching a scent is exactly the reason
     * to leave your own patch of ground.
     */
    investigateRadius: z.number().min(0).optional(),

    /**
     * How far it will chase before it gives up and turns for home. Absent is no
     * limit, which is what makes a chase trainable across a whole map.
     *
     * This gates **pursuit only**. A leashed creature with something in reach
     * still fights; it simply will not follow you any further.
     */
    leashRadius: z.number().min(0).optional(),

    /** Odds it moves at all on a given idle step. Zero never wanders. */
    wanderChance: z.number().min(0).max(1).default(0),

    /**
     * Rounds it stays in a fight after nobody can perceive anybody.
     *
     * Zero ends the fight at the end of the round somebody breaks away, which
     * is what made stepping around a corner a complete escape. One or two is
     * enough that a corner is a tactic rather than an exit.
     */
    disengageTurns: z.number().int().min(0).default(0),

    /**
     * Multipliers on how fast it moves for each reason it moves.
     *
     * Zero never moves that way at all: a shopkeeper sets `wander` to zero and
     * stays behind the counter however interesting the street gets.
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
     * Which senses it acts on, best first. Absent means all of them, strongest
     * signal first, which is what the engine did before.
     *
     * An empty list is a creature that notices everything and investigates
     * none of it. Order is preference, not strength: a wolf listing smell
     * first follows its nose past something it can plainly see.
     */
    investigates: z.array(ref('rules.senses')).optional(),

    /**
     * Whether a trace left on the ground is worth following.
     *
     * False is a creature that can smell you perfectly well but has no idea
     * what a footprint means — it acts on what is there now, never on what
     * passed through an hour ago.
     */
    followsTrails: z.boolean().default(true),

    /**
     * Whose presence it registers at all.
     *
     * Defaults to enemies only, which is exactly the filter perception used to
     * apply with no way to say otherwise — so a shopkeeper perceived nothing
     * whatever and no wolf could track a deer. Widening it is what lets
     * creatures notice each other.
     */
    notices: z.array(z.enum(['hostile', 'neutral', 'ally'])).default(['hostile']),
    extra,
  })
  .strict();

/**
 * The same thing as a per-creature override, where every field is genuinely
 * absent rather than defaulted.
 *
 * Written out rather than derived with `.partial()`, which is shallow: it would
 * leave `speeds` carrying its inner defaults, so a wolf that only wanted to say
 * "I lope when I wander" would silently reset its investigate, engage and
 * return speeds to one. An override has to be able to say nothing at all about
 * a field, and that is not expressible in the schema it overrides.
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
    /**
     * Which action a spell component actually is, so silence and manacles work.
     *
     * The engine used to look for action types named exactly `speak` and
     * `gesture`. Nothing validated that — a module naming its own `vocalize`
     * got components that could never be blocked, silently and only in play.
     * As refs, a wrong id is a load error instead.
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
export type Temperament = z.infer<typeof temperamentSchema>;
export type TemperamentOverride = z.infer<typeof temperamentOverrideSchema>;
