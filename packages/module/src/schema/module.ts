/**
 * The module document: an entire game as one JSON file.
 *
 * This is the unit that gets authored, validated, shared, and played. A save
 * records the module id, version, and content hash it was created against, so
 * loading a save into a module that has since changed fails loudly instead of
 * corrupting a character.
 */

import { z } from 'zod';
import { PredicateSchema } from '../dsl/schema.js';
import { idSchema, versionSchema, displayName, description, ref, tags } from './common.js';
import { rulesSchema } from './rules.js';
import { contentSchema } from './content.js';
import { worldSchema } from './world.js';
import { narrativeSchema } from './narrative.js';

/** The module format's own version, bumped when the schema breaks compatibility. */
export const FORMAT_VERSION = 1;

export const moduleMetaSchema = z
  .object({
    title: displayName,
    author: z.string().max(200).default(''),
    description: description.default(''),
    tags,
    /** Free-form, for the editor's gallery. */
    license: z.string().max(200).default(''),
  })
  .strict();

/** How a character is built at the start of a game. */
export const creationSchema = z
  .object({
    /** Points to spend across attributes. */
    attributePoints: z.number().int().min(0).default(27),
    /** Cost of raising an attribute to each value; index is the target score. */
    attributeCosts: z.record(z.string(), z.number().int()).default({}),
    startingLevel: z.number().int().min(1).default(1),
    skillRanks: z.number().int().min(0).default(4),
    /** Restrict the choices offered; empty means everything is allowed. */
    allowedAncestries: z.array(ref('content.ancestries')).default([]),
    allowedClasses: z.array(ref('content.classes')).default([]),
    startingItems: z
      .array(
        z
          .object({ item: ref('content.items'), quantity: z.number().int().min(1).default(1) })
          .strict(),
      )
      .default([]),
    startingCurrency: z.number().int().min(0).default(0),
  })
  .strict();

export const startSchema = z
  .object({
    /** How many characters the player controls. */
    partySize: z.number().int().min(1).max(8).default(4),
    creation: creationSchema.default({}),
    /** Where play begins: a region for story mode, or a dungeon to dive straight in. */
    startingArea: ref('world.areas').optional(),
    startingPoi: ref('world.pointsOfInterest').optional(),
    startingDungeon: ref('world.dungeons').optional(),
    /** Text-grammar pool for the opening scene. */
    openingTextKey: idSchema.optional(),
    /** Flags set on a new game. */
    initialFlags: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    /** Ends the game when it becomes true. */
    victoryWhen: PredicateSchema.optional(),
    defeatWhen: PredicateSchema.optional(),
  })
  .strict();

export const gameModuleSchema = z
  .object({
    /** Format version, so a future reader knows how to migrate this document. */
    format: z.number().int().min(1).default(FORMAT_VERSION),
    id: idSchema,
    version: versionSchema,
    /** Engine range this module expects, e.g. `^1.0.0`. */
    engine: z.string().default('^1.0.0'),
    /**
     * Base module to layer on, as `id@version`. The named module is loaded
     * first and this document is merged over it, so a pack can ship twelve
     * monsters instead of forking an entire game.
     */
    extends: z
      .string()
      .regex(/^[a-z][a-z0-9_]*@\d+\.\d+\.\d+$/, 'must look like "core_fantasy@1.0.0"')
      .nullable()
      .default(null),
    meta: moduleMetaSchema,
    rules: rulesSchema,
    content: contentSchema.default({}),
    world: worldSchema.default({}),
    narrative: narrativeSchema.default({}),
    start: startSchema.default({}),
  })
  .strict();

/** A module as authored, before compilation resolves and indexes it. */
export type GameModule = z.infer<typeof gameModuleSchema>;
export type ModuleMeta = z.infer<typeof moduleMetaSchema>;
export type Creation = z.infer<typeof creationSchema>;
export type Start = z.infer<typeof startSchema>;

/** Every addressable collection, as `section.collection` paths. */
export const COLLECTION_PATHS = [
  'rules.attributes',
  'rules.resources',
  'rules.derivedStats',
  'rules.damageTypes',
  'rules.conditions',
  'rules.actionTypes',
  'rules.equipmentSlots',
  'rules.itemProperties',
  'rules.masteryTiers',
  'rules.rests',
  'rules.savingThrows',
  'rules.sizes',
  'rules.creatureTypes',
  'rules.senses',
  'rules.stances',
  'rules.movementModes',
  'rules.languages',
  'rules.alignments',
  'rules.opportunities',
  'rules.coverTypes',
  'content.abilities',
  'content.skills',
  'content.ancestries',
  'content.classes',
  'content.items',
  'content.lootTables',
  'content.monsters',
  'content.traps',
  'content.factions',
  'content.npcs',
  'world.terrains',
  'world.palettes',
  'world.biomes',
  'world.areas',
  'world.pointsOfInterest',
  'world.gates',
  'world.roomTemplates',
  'world.encounterTables',
  'world.dungeons',
  'world.maps',
  'narrative.textGrammar',
  'narrative.dialogues',
  'narrative.quests',
  'narrative.arcs',
  'narrative.deedKinds',
  // `narrative.memory` is deliberately absent: it is a settings block edited as
  // one section, not a collection of independently addressable entries. Its
  // `rules` list is nested inside it.
] as const;

export type CollectionPath = (typeof COLLECTION_PATHS)[number];
