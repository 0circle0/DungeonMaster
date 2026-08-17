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
    openingTextKey: ref('narrative.textGrammar').optional(),
    /**
     * How the rest of the party keeps up with whoever is leading.
     *
     * Party cohesion, previously two invented numbers in `moveFollowers`.
     */
    partyFollow: z
      .object({
        /** Beyond this many tiles, a follower hurries. */
        catchUpDistance: z.number().int().min(0).default(3),
        /** Steps a hurrying follower takes in one go. */
        catchUpSteps: z.number().int().min(1).default(2),
      })
      .strict()
      .default({}),
    /** Flags set on a new game. */
    initialFlags: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    /** Ends the game when it becomes true. */
    victoryWhen: PredicateSchema.optional(),
    defeatWhen: PredicateSchema.optional(),
  })
  .strict();

/**
 * A mod this game expects, pinned to the exact build it was authored against.
 *
 * `id` and `hash` are separate fields rather than one `"thorns-3f2a…"` string,
 * and that is load-bearing: `mergeModules` merges by `id`, so a combined string
 * would make a base pinning one version and a patch pinning another look like
 * two different mods, and **both** would survive the merge. Split, the existing
 * merge does the right thing and `$delete` works — a pack drops an inherited
 * mod with `{ "id": "thorns", "$delete": true }`.
 */
export const moduleModSchema = z
  .object({
    id: idSchema,
    /** The build this game was authored against. Drift warns; it does not block. */
    hash: z.string().regex(/^[0-9a-f]{16}$/, 'must be a 16-character mod content hash'),
    target: z.enum(['engine', 'editor']).default('engine'),
    /** Forced on, and play is blocked when it is missing. */
    required: z.boolean().default(false),
    /** Shown when the mod is missing or drifted — the author's own words. */
    note: z.string().max(400).default(''),
  })
  .strict();

export type ModuleMod = z.infer<typeof moduleModSchema>;

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
    /**
     * Mods this game expects.
     *
     * ⚠️ `.optional()`, and it must stay that way. `compileModule` hashes
     * `parsed.data`, so a `.default([])` here would insert `mods: []` into
     * every document zod has ever parsed, changing the hash of every module —
     * and `load()` in the engine refuses a save whose recorded module hash no
     * longer matches. Every existing save would stop loading. `compile.test.ts`
     * pins the shipped modules' hashes to catch exactly that.
     *
     * The section does participate in the hash once an author adds it, which is
     * the point: changing a required mod pin has to surface as drift on an old
     * save rather than pass silently.
     */
    mods: z.array(moduleModSchema).optional(),
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
  'narrative.lore',
  'narrative.loreThreads',
  'narrative.deedKinds',
  // `narrative.memory` is deliberately absent: it is a settings block edited as
  // one section, not a collection of independently addressable entries. Its
  // `rules` list is nested inside it.
] as const;

export type CollectionPath = (typeof COLLECTION_PATHS)[number];
