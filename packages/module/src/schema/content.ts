/**
 * Authored content: what populates a world. Everything here is addressed by id and cross-references
 * other collections through `ref()`, so the compiler can prove a class's starting weapon and a
 * monster's loot table exist before play begins.
 */

import { z } from 'zod';
import { ExprSchema, PredicateSchema, EffectSchema, RuleSchema, diceNotation } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, tags, weighted, extra } from './common.js';
import { damageInteractionSchema, temperamentOverrideSchema } from './tactical.js';
import { requirementSchema } from './requirement.js';

/** An activatable ability: a spell, a class power, or an item's use effect. */
export const abilitySchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    /** Which action it consumes, e.g. `action` or `quick`. */
    actionType: ref('rules.actionTypes').optional(),
    /** Resource cost, e.g. 2 focus. */
    costs: z.record(ref('rules.resources'), ExprSchema).default({}),
    /** Reach in rooms; 0 means the actor's own square. */
    range: z.number().int().min(0).default(0),
    /** Rounds before it can be used again. */
    cooldown: z.number().int().min(0).default(0),
    /** Gate on level, development, items, quests, or story flags. */
    requires: requirementSchema.optional(),
    /** Extra condition beyond the requirement. */
    when: PredicateSchema.optional(),
    /** Number of targets; the engine picks according to `targeting`. */
    targeting: z.enum(['self', 'single', 'allEnemies', 'allAllies', 'all', 'none']).default('single'),
    /** Rolled against the target's defence; omit for auto-hit abilities. */
    attack: z
      .object({
        stat: ref('rules.attributes'),
        against: ref('rules.derivedStats'),
      })
      .strict()
      .optional(),
    /**
     * Which way this ability's own attack roll leans, always. A property of the ability itself
     * rather than of circumstance, so it applies every time and needs no condition to carry it.
     * Combined with every other swing by `rules.resolution.swingStacking`.
     */
    swing: z.enum(['advantage', 'disadvantage']).optional(),
    /** A save the target makes instead of the caster rolling to hit. */
    savingThrow: z
      .object({
        save: ref('rules.savingThrows'),
        difficulty: ExprSchema.optional(),
        /** What a successful save earns. */
        onSuccess: z.enum(['none', 'half', 'negates', 'partial']).default('negates'),
        /** Effects applied only when the save succeeds. */
        onSuccessEffects: z.array(EffectSchema).default([]),
        /** Which way the target's save against this leans, always. */
        swing: z.enum(['advantage', 'disadvantage']).optional(),
      })
      .strict()
      .optional(),

    /** Spell mechanics. Omitted entirely for non-magical abilities. */
    spellLevel: z.number().int().min(0).optional(),
    concentration: z.boolean().default(false),
    ritual: z.boolean().default(false),
    castingTime: z.string().default(''),
    duration: z.string().default(''),
    components: z.array(z.enum(['verbal', 'somatic', 'material', 'focus'])).default([]),
    materialComponent: ref('content.items').optional(),
    /** Shape and size of the affected area. */
    areaOfEffect: z
      .object({
        shape: z.enum(['sphere', 'cube', 'cone', 'line', 'cylinder', 'aura']),
        size: z.number().min(0),
        /** Everyone in the area, or only enemies. */
        affects: z.enum(['all', 'enemies', 'allies', 'others']).default('all'),
        /**
         * Half-angle of a cone, in degrees. 45 each side is a quarter-circle blast; narrower is a
         * jet, wider is a wash.
         */
        angle: z.number().min(1).max(180).default(45),
      })
      .strict()
      .optional(),
    /** Extra effect per level above the spell's base, for upcasting. */
    upcast: z.array(EffectSchema).default([]),

    /** What it does on use, or on a hit when `attack` is present. */
    onUse: z.array(EffectSchema).default([]),
    onMiss: z.array(EffectSchema).default([]),
    onCritical: z.array(EffectSchema).default([]),
    extra,
  })
  .strict();

export const skillSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    attribute: ref('rules.attributes'),
    tags,
    extra,
  })
  .strict();

export const ancestrySchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    /** Additive tweaks to starting attributes. */
    attributeBonuses: z.record(ref('rules.attributes'), z.number().int()).default({}),
    grantedAbilities: z.array(ref('content.abilities')).default([]),
    skillBonuses: z.record(ref('content.skills'), z.number().int()).default({}),
    /** Passive effects applied at creation. */
    traits: z.array(RuleSchema).default([]),
    size: ref('rules.sizes').optional(),
    creatureType: ref('rules.creatureTypes').optional(),
    speeds: z.record(ref('rules.movementModes'), z.number().int()).default({}),
    senses: z.record(ref('rules.senses'), z.number().int()).default({}),
    languages: z.array(ref('rules.languages')).default([]),
    damageInteractions: z.array(damageInteractionSchema).default([]),
    extra,
  })
  .strict();

export const characterClassSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    /** Rolled per level for the vital resource. */
    hitDie: diceNotation,
    attributeBonuses: z.record(ref('rules.attributes'), z.number().int()).default({}),
    /** The attribute this class's abilities key off. */
    primaryAttribute: ref('rules.attributes'),
    /**
     * Skills the class starts trained in. A bare id grants `rules.progression.proficiencyRank`; `{
     * skill, rank }` states the rank exactly, for a module with a rank ladder.
     */
    skillProficiencies: z
      .array(
        z.union([
          ref('content.skills'),
          z.object({ skill: ref('content.skills'), rank: z.number().int().min(0) }).strict(),
        ]),
      )
      .default([]),
    startingItems: z
      .array(
        z
          .object({ item: ref('content.items'), quantity: z.number().int().min(1).default(1) })
          .strict(),
      )
      .default([]),
    /** Abilities unlocked at each level. */
    abilitiesByLevel: z.record(z.string(), z.array(ref('content.abilities'))).default({}),
    /** Saves this class is trained in. */
    saveProficiencies: z.array(ref('rules.savingThrows')).default([]),
    /** Spell list and casting progression, when the class casts. */
    spellcasting: z
      .object({
        castingAttribute: ref('rules.attributes'),
        spellList: z.array(ref('content.abilities')).default([]),
        /** Multiplier on the slot table, for half-casters. */
        progression: z.number().min(0).max(1).default(1),
        knownByLevel: z.record(z.string(), z.number().int().min(0)).default({}),
      })
      .strict()
      .optional(),
    extra,
  })
  .strict();

export const itemKindSchema = z.enum([
  'weapon',
  'armor',
  'shield',
  'consumable',
  'trinket',
  'tool',
  'key',
  'treasure',
  'material',
]);

export const itemSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    kind: itemKindSchema,
    tags,
    value: z.number().int().min(0).default(0),
    weight: z.number().min(0).default(0),
    stackable: z.boolean().default(false),
    /** Where it equips; omit for items that are only carried. */
    slot: ref('rules.equipmentSlots').optional(),
    /** Damage dealt when used as a weapon. */
    damage: z
      .object({
        dice: diceNotation,
        damageType: ref('rules.damageTypes'),
        /** Attribute added to the damage roll. */
        stat: ref('rules.attributes').optional(),
      })
      .strict()
      .optional(),
    /** Additive modifiers to derived stats while equipped. */
    modifiers: z.record(ref('rules.derivedStats'), ExprSchema).default({}),
    /**
     * Skill ranks added while equipped.
     *
     * Read by both the roll and the gate: a lens worth `{"lore": 2}` improves every lore check and
     * satisfies a `minRank` requirement the wearer could not meet unaided.
     *
     * `.optional()` rather than `.default({})`: a defaulted field is written into every parsed item
     * and so changes the hash of every module, which makes `load()` reject every existing save. See
     * the hash test in `compile.test.ts`.
     */
    skillBonuses: z.record(ref('content.skills'), z.number().int()).optional(),
    /** Consumables and wands: what happens on use. */
    onUse: z.array(EffectSchema).default([]),
    consumedOnUse: z.boolean().default(false),
    /** Passive triggers while carried or equipped. */
    procs: z.array(RuleSchema).default([]),
    grantedAbilities: z.array(ref('content.abilities')).default([]),

    /** Magic-item detail. */
    rarity: z.enum(['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact']).optional(),
    requiresAttunement: z.boolean().default(false),
    attunementRequires: z.array(idSchema).default([]),
    /** Limited uses that recharge. */
    charges: z
      .object({
        max: z.number().int().min(1),
        rechargeOn: ref('rules.rests').optional(),
        rechargeAmount: diceNotation.optional(),
        /** Destroyed when the last charge is spent on a failed roll. */
        destroyOnEmpty: z.boolean().default(false),
      })
      .strict()
      .optional(),
    /** Reach, thrown, two-handed, finesse — named by the module. */
    properties: z.array(ref('rules.itemProperties')).default([]),
    /** Resistances granted while worn. */
    damageInteractions: z.array(damageInteractionSchema).default([]),
    /** Who can use it at all. */
    usableBy: z.array(ref('content.classes')).default([]),
    extra,
  })
  .strict();

/**
 * One possible drop. `requires` makes loot respond to character development; an entry the party
 * does not qualify for is removed from the draw rather than rolled and discarded, so the odds stay
 * meaningful.
 */
export const lootEntrySchema = z
  .object({
    item: ref('content.items'),
    quantity: diceNotation.default('1'),
    requires: requirementSchema.optional(),
    /** Whose development is tested: the killer, or the whole party. */
    requirementScope: z.enum(['finder', 'party', 'anyMember']).default('anyMember'),
    /** Only ever drops once across a save, for unique gear. */
    unique: z.boolean().default(false),
  })
  .strict();

export const lootTableSchema = z
  .object({
    id: idSchema,
    name: displayName.optional(),
    description: description.default(''),
    /** How many draws to make. */
    rolls: diceNotation.default('1'),
    entries: z.array(weighted(lootEntrySchema)).min(1),
    /** Chance the table yields nothing at all. */
    emptyChance: z.number().min(0).max(1).default(0),
    /** Gate the whole table. */
    requires: requirementSchema.optional(),
    /** Extra draws granted by a scavenging-style skill. */
    bonusRollSkill: ref('content.skills').optional(),
    /** What that skill is worth, in extra draws. */
    bonusRolls: z
      .object({
        onSuccess: z.number().int().min(0).default(1),
        onCritical: z.number().int().min(0).default(2),
      })
      .strict()
      .default({}),
  })
  .strict();

/**
 * A reaction: how a creature or person responds to what happens around them. Anything with
 * reactions can roll dice, spend resources, take offence, and act on memory.
 */
export const reactionSchema = z
  .object({
    id: idSchema,
    description: description.default(''),
    /** What it responds to. */
    on: z
      .enum([
        'seePlayer', 'allyHurt', 'allyKilled', 'selfHurt', 'lowHealth',
        'combatStart', 'combatEnd', 'turnStart', 'witnessDeed',
        'questComplete', 'itemShown', 'custom',
      ])
      .default('turnStart'),
    event: z.string().optional(),
    priority: z.number().int().default(0),
    /** Gated on the reacting actor's own state, memory, and faction ties. */
    requires: requirementSchema.optional(),
    when: PredicateSchema.optional(),
    chance: z.number().min(0).max(1).default(1),
    /** The reactor rolls: intimidation, a saving throw, a spot check. */
    roll: z
      .object({
        skill: ref('content.skills').optional(),
        attribute: ref('rules.attributes').optional(),
        difficulty: ExprSchema.default(12),
        /** Contest the party's roll instead of a fixed difficulty. */
        opposedBy: ref('content.skills').optional(),
      })
      .strict()
      .optional(),
    onSuccess: z.array(EffectSchema).default([]),
    onFailure: z.array(EffectSchema).default([]),
    /** Runs regardless of any roll. */
    effects: z.array(EffectSchema).default([]),
    /** Use an ability as the response. */
    use: ref('content.abilities').optional(),
    textKey: ref('narrative.textGrammar').optional(),
    /** Fires at most once per encounter. */
    oncePerEncounter: z.boolean().default(false),
  })
  .strict();

/** How a monster chooses its action; declarative so it stays inspectable. */
export const behaviourSchema = z
  .object({
    /** Higher priority rules are considered first. */
    priority: z.number().int().default(0),
    when: PredicateSchema.optional(),
    requires: requirementSchema.optional(),
    use: ref('content.abilities'),
  })
  .strict();

export const monsterSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    level: z.number().int().min(0).default(1),
    xp: z.number().int().min(0).default(0),
    attributes: z.record(ref('rules.attributes'), z.number().int()),
    /** Overrides the computed maximum, for hand-tuned creatures. */
    resourceOverrides: z.record(ref('rules.resources'), ExprSchema).default({}),
    derivedOverrides: z.record(ref('rules.derivedStats'), ExprSchema).default({}),
    abilities: z.array(ref('content.abilities')).default([]),
    behaviour: z.array(behaviourSchema).default([]),
    /** How it responds to the world, not just how it attacks. */
    reactions: z.array(reactionSchema).default([]),
    loot: ref('content.lootTables').optional(),
    /** Extra tables drawn only when the finder qualifies. */
    conditionalLoot: z.array(ref('content.lootTables', 'Drawn as well as loot, and only when the finder qualifies.')).default([]),
    /** Faction whose standing changes when this creature is killed. */
    faction: ref('content.factions').optional(),
    /** How it reads in prose: "a hulking", "two skittering". */
    descriptors: z.array(z.string()).default([]),

    // Tactical detail. All optional: a module that declares no sizes or saving throws never fills
    // these in.
    size: ref('rules.sizes').optional(),
    creatureType: ref('rules.creatureTypes').optional(),
    alignment: ref('rules.alignments').optional(),
    /** Resistances, immunities, and vulnerabilities in one table. */
    damageInteractions: z.array(damageInteractionSchema).default([]),
    conditionImmunities: z.array(ref('rules.conditions')).default([]),
    /** Saving throw bonuses beyond the attribute modifier. */
    saveBonuses: z.record(ref('rules.savingThrows'), z.number().int()).default({}),
    skillBonuses: z.record(ref('content.skills'), z.number().int()).default({}),
    senses: z.record(ref('rules.senses'), z.number().int()).default({}),
    speeds: z.record(ref('rules.movementModes'), z.number().int()).default({}),
    /**
     * What it does when nothing is telling it what to do — wandering, giving chase, giving up.
     * Anything left out falls back to `rules.temperament`. Distinct from `behaviour`, which is how
     * it picks an attack once a fight is happening.
     */
    temperament: temperamentOverrideSchema.optional(),
    languages: z.array(ref('rules.languages')).default([]),
    /** Roughly how hard it fights, for encounter budgeting in the editor. */
    challenge: z.number().min(0).optional(),
    /** Legendary or lair actions: extra turns outside initiative. */
    specialTurns: z
      .array(
        z
          .object({
            id: idSchema,
            name: displayName,
            use: ref('content.abilities'),
            /** Times per round. */
            uses: z.number().int().min(1).default(1),
            when: PredicateSchema.optional(),
          })
          .strict(),
      )
      .default([]),
    extra,
  })
  .strict();

export const trapSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    /** Check to notice it before it fires. */
    detect: z.object({ skill: ref('content.skills'), difficulty: ExprSchema }).strict(),
    disarm: z.object({ skill: ref('content.skills'), difficulty: ExprSchema }).strict(),
    onTrigger: z.array(EffectSchema).default([]),
    onDisarm: z.array(EffectSchema).default([]),
    /** Whether it fires once or persists. */
    reusable: z.boolean().default(false),
  })
  .strict();

export const factionSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    /** Standing at the start of a new game. */
    initialStanding: z.number().int().default(0),
    /** How a change here bleeds into other factions, -1..1. */
    relations: z.record(ref('content.factions'), z.number().min(-1).max(1)).default({}),
    /** Named thresholds: hostile, neutral, honoured. */
    ranks: z
      .array(z.object({ id: idSchema, name: displayName, atLeast: z.number().int() }).strict())
      .default([]),
    /** Reputation lost per in-world day, pulling standing back toward zero. */
    decayPerDay: z.number().min(0).default(0),
  })
  .strict();

export const npcSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    faction: ref('content.factions').optional(),
    /** Reuses a monster's statblock when the NPC can fight. */
    statblock: ref('content.monsters').optional(),
    dialogue: ref('narrative.dialogues').optional(),
    /**
     * Where they can normally be found. A checked reference, so a typo is a load error. Naming a
     * home is enough to place someone; listing them in that place's `residents` says the same thing
     * from the other end.
     */
    home: ref('world.pointsOfInterest', 'Enough to place them: the engine gathers everyone whose home is here when the party arrives.').optional(),
    /** How readily they believe rumours about the party, 0..1. */
    gullibility: z.number().min(0).max(1).default(0.5),
    /** How long they remember a deed, in in-world days. */
    memorySpan: z.number().int().min(0).default(90),
    /** Starting attitude toward the party, -100..100. */
    disposition: z.number().int().min(-100).max(100).default(0),
    /**
     * What they do when nobody is talking to them: whether they keep to their counter or walk the
     * lane, and what they look into. Anything left out falls back to `rules.temperament`.
     */
    temperament: temperamentOverrideSchema.optional(),
    /** They act too: reactions to deeds, quests, and what they are shown. */
    reactions: z.array(reactionSchema).default([]),
    /** Quests they can hand out, gated per quest. */
    offersQuests: z.array(ref('narrative.quests')).default([]),
    /** What they will trade, and what it takes to be sold to. */
    shop: z
      .object({
        lootTable: ref('content.lootTables').optional(),
        buysTags: z.array(idSchema).default([]),
        priceMultiplier: z.number().min(0).default(1),
        requires: requirementSchema.optional(),
      })
      .strict()
      .optional(),
    /** Deeds they will remember most sharply. */
    caresAbout: z.array(ref('narrative.deedKinds')).default([]),
  })
  .strict();

export const contentSchema = z
  .object({
    abilities: z.array(abilitySchema).default([]),
    skills: z.array(skillSchema).default([]),
    ancestries: z.array(ancestrySchema).default([]),
    classes: z.array(characterClassSchema).default([]),
    items: z.array(itemSchema).default([]),
    lootTables: z.array(lootTableSchema).default([]),
    monsters: z.array(monsterSchema).default([]),
    traps: z.array(trapSchema).default([]),
    factions: z.array(factionSchema).default([]),
    npcs: z.array(npcSchema).default([]),
  })
  .strict();

export type Ability = z.infer<typeof abilitySchema>;
export type Item = z.infer<typeof itemSchema>;
export type Monster = z.infer<typeof monsterSchema>;
export type Faction = z.infer<typeof factionSchema>;
export type Reaction = z.infer<typeof reactionSchema>;
export type LootTable = z.infer<typeof lootTableSchema>;
export type Content = z.infer<typeof contentSchema>;
