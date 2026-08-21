/** The world: where things are, what happens when you go there, and what stops you getting in. */

import { z } from 'zod';
import { ExprSchema, PredicateSchema, EffectSchema, diceNotation } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, tags, weighted, extra } from './common.js';
import { requirementSchema } from './requirement.js';
import { terrainSchema, paletteSchema, mapSpecSchema, positionSchema } from './space.js';
import { staticMapSchema } from './staticmap.js';

/** How an automatic event behaves on repeat visits. */
export const triggerModeSchema = z.enum([
  'once', // ever, for this save
  'everyEntry', // fires each time the party arrives
  'untilComplete', // repeats until its completion condition holds, then stops
  'loop', // repeats on a cooldown, forever
  'restart', // resets the location's own state, then fires
]);

/** An automatic event. */
export const triggerSchema = z
  .object({
    id: idSchema,
    description: description.default(''),
    mode: triggerModeSchema.default('once'),
    /** Who or what sets it off. */
    on: z
      .enum(['enter', 'exit', 'rest', 'search', 'combatStart', 'combatEnd', 'timePass', 'custom'])
      .default('enter'),
    /** Custom event name, when `on` is `custom`. */
    event: z.string().optional(),
    /** Gate on party state, memory, faction standing, and so on. */
    requires: requirementSchema.optional(),
    /** Extra condition beyond the requirement. */
    when: PredicateSchema.optional(),
    /** For `loop`: in-world minutes before it can fire again. */
    cooldownMinutes: z.number().int().min(0).default(0),
    /** For `untilComplete`: what counts as done. */
    completeWhen: PredicateSchema.optional(),
    /** Persist that this fired, so the world remembers between visits. */
    remember: z.boolean().default(true),
    /** Probability it fires at all, for ambient events. */
    chance: z.number().min(0).max(1).default(1),
    effects: z.array(EffectSchema).default([]),
    /** Prose pool to narrate when it fires. */
    textKey: ref('narrative.textGrammar').optional(),
  })
  .strict();

/** A barrier. */
export const gateSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    kind: z.enum(['lock', 'ward', 'puzzle', 'toll', 'story', 'hazard']).default('lock'),
    /** Meeting this opens it outright — the key, the password, the rank. */
    requires: requirementSchema.optional(),
    /** Forcing it: a skill check, for when the party lacks the requirement. */
    bypass: z
      .object({
        skill: ref('content.skills'),
        difficulty: ExprSchema,
        /** Failing badly enough may spring a trap or raise an alarm. */
        onSuccess: z.array(EffectSchema).default([]),
        onFailure: z.array(EffectSchema).default([]),
        /** Whether a failed attempt can be retried. */
        retryable: z.boolean().default(true),
      })
      .strict()
      .optional(),
    /** A magical opening: casting the right ability rather than turning a key. */
    opensWith: z.array(ref('content.abilities')).default([]),
    onOpen: z.array(EffectSchema).default([]),
    /** Shown and run when the party is turned away. */
    onBlocked: z.array(EffectSchema).default([]),
    blockedTextKey: ref('narrative.textGrammar').optional(),
    /** Stays open once opened, rather than relocking behind you. */
    staysOpen: z.boolean().default(true),
  })
  .strict();

/** What a room can be, before the generator fills it in. */
export const roomTemplateSchema = z
  .object({
    id: idSchema,
    name: displayName,
    tags,
    descriptionKey: ref('narrative.textGrammar'),
    weight: z.number().min(0).default(1),
    role: z
      .enum(['entrance', 'corridor', 'chamber', 'vault', 'boss', 'shrine', 'lair'])
      .default('chamber'),
    minExits: z.number().int().min(1).default(1),
    maxExits: z.number().int().min(1).default(4),
    encounterChance: z.number().min(0).max(1).default(0.3),
    trapChance: z.number().min(0).max(1).default(0.1),
    lootChance: z.number().min(0).max(1).default(0.25),
    /** Override the trap roll entirely, rather than letting the room's `role` decide. */
    alwaysEncounter: z.boolean().default(false),
    neverEncounter: z.boolean().default(false),
    neverTrap: z.boolean().default(false),
    requires: requirementSchema.optional(),
    triggers: z.array(triggerSchema).default([]),
    /** Shape and size of the room's tiles. */
    map: mapSpecSchema.default({}),
    extra,
  })
  .strict()
  .refine((r) => r.minExits <= r.maxExits, { message: 'minExits must not exceed maxExits' });

export const encounterEntrySchema = z
  .object({
    monster: ref('content.monsters'),
    count: diceNotation.default('1'),
    /** Scale the count with party level, for encounters that stay relevant. */
    scaleWithLevel: z.boolean().default(false),
  })
  .strict();

/** One possible encounter, with its odds. */
export const encounterGroupSchema = z
  .object({
    id: idSchema,
    name: displayName.optional(),
    weight: z.number().min(0).default(1),
    requires: requirementSchema.optional(),
    entries: z.array(encounterEntrySchema).min(1),
    /** Fires when this group is rolled, before combat begins. */
    onEncounter: z.array(EffectSchema).default([]),
    textKey: ref('narrative.textGrammar').optional(),
    /** Not every encounter is a fight. */
    hostile: z.boolean().default(true),
  })
  .strict();

export const encounterTableSchema = z
  .object({
    id: idSchema,
    name: displayName.optional(),
    description: description.default(''),
    minDepth: z.number().int().min(0).default(0),
    maxDepth: z.number().int().min(0).default(999),
    /** Odds that any encounter happens when this table is consulted. */
    chance: z.number().min(0).max(1).default(1),
    /** Nothing happened: the weight given to a quiet result. */
    emptyWeight: z.number().min(0).default(0),
    /** Levels per extra creature for entries that scale. */
    scalePerLevels: z.number().int().min(1).default(2),
    groups: z.array(encounterGroupSchema).min(1),
  })
  .strict()
  .refine((t) => t.minDepth <= t.maxDepth, { message: 'minDepth must not exceed maxDepth' });

/** A themed environment: which rooms, monsters, and loot belong together. */
export const biomeSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    layer: z.enum(['overworld', 'underworld', 'both']).default('underworld'),
    roomTemplates: z.array(ref('world.roomTemplates')).default([]),
    encounterTables: z.array(ref('world.encounterTables')).default([]),
    lootTables: z.array(ref('content.lootTables')).default([]),
    traps: z.array(ref('content.traps')).default([]),
    ambienceKey: ref('narrative.textGrammar').optional(),
    /** Applies to every area in this biome, so weather and dread are set once. */
    triggers: z.array(triggerSchema).default([]),
    /** Default palette for anything generated in this biome. */
    palette: ref('world.palettes').optional(),
    extra,
  })
  .strict();

/** What kind of place a point of interest is. */
export const poiKindSchema = z.enum([
  'settlement',
  'shrine',
  'ruin',
  'camp',
  'dungeonEntrance',
  'landmark',
  'crossing',
  'lair',
  'market',
  'wilds',
]);

/** Somewhere the party can go. */
export const pointOfInterestSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    area: ref('world.areas'),
    kind: poiKindSchema.default('landmark'),
    descriptionKey: ref('narrative.textGrammar').optional(),

    /** Barred until the gate opens. */
    gate: ref('world.gates').optional(),
    /** Hidden until found, by a check or by a trigger. */
    hidden: z.boolean().default(false),
    discover: z
      .object({ skill: ref('content.skills'), difficulty: ExprSchema })
      .strict()
      .optional(),

    triggers: z.array(triggerSchema).default([]),
    encounterTables: z.array(ref('world.encounterTables')).default([]),
    /** Odds of an encounter per visit here, overriding the table's own. */
    encounterChance: z.number().min(0).max(1).optional(),

    residents: z.array(ref('content.npcs', 'Anyone this place names, plus anyone who names it as home.')).default([]),
    loot: z.array(ref('content.lootTables')).default([]),
    /** Entering leads into a generated dungeon. */
    dungeon: ref('world.dungeons').optional(),
    /** Settlements: what can be done here. */
    services: z.array(z.enum(['inn', 'market', 'temple', 'smith', 'guild', 'stable', 'healer'])).default([]),
    /** How fast news spreads from here, as a multiplier on rumour reach. */
    rumourReach: z.number().min(0).default(1),
    controllingFaction: ref('content.factions').optional(),
    /** In-world minutes to reach from the area's centre. */
    travelMinutes: z.number().int().min(0).default(0),
    /** Where it sits on the area's map. */
    position: positionSchema.optional(),
    /** The interior, for places you walk around inside. */
    map: mapSpecSchema.optional(),
    extra,
  })
  .strict();

/** A named place on the map. */
export const areaSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    biome: ref('world.biomes'),
    layer: z.enum(['overworld', 'underworld']).default('overworld'),
    descriptionKey: ref('narrative.textGrammar').optional(),

    /** Neighbours and what it costs to walk there. */
    connections: z
      .array(
        z
          .object({
            to: ref('world.areas'),
            travelMinutes: z.number().int().min(0).default(60),
            /** A pass that must be opened before the route is usable. */
            gate: ref('world.gates').optional(),
            /** One-way routes: a cliff you can descend but not climb. */
            oneWay: z.boolean().default(false),
            encounterTables: z.array(ref('world.encounterTables')).default([]),
          })
          .strict(),
      )
      .default([]),

    triggers: z.array(triggerSchema).default([]),
    encounterTables: z.array(ref('world.encounterTables')).default([]),
    controllingFaction: ref('content.factions').optional(),
    dangerLevel: z.number().int().min(0).default(1),
    /** Odds of a wandering encounter on entering, as an expression over `dangerLevel`. */
    encounterChance: ExprSchema.default({
      min: [0.75, { mul: [{ ref: 'dangerLevel' }, 0.15] }],
    }),
    /** Suggested party level, used by the editor's balance warnings. */
    recommendedLevel: z.number().int().min(1).optional(),
    requires: requirementSchema.optional(),
    /** The walkable map for this area. */
    map: mapSpecSchema.default({}),
    /** Where the party arrives. */
    entryPoint: positionSchema.optional(),
    extra,
  })
  .strict();

/** Parameters the dungeon generator reads. */
export const dungeonGenSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    biome: ref('world.biomes'),
    roomCount: diceNotation.default('8'),
    depth: diceNotation.default('1'),
    branchiness: z.number().min(0).max(1).default(0.35),
    lockedDoorChance: z.number().min(0).max(1).default(0.15),
    /** Gates the generator may place on interior doors. */
    doorGates: z.array(ref('world.gates')).default([]),
    guaranteedRoles: z.array(z.string()).default(['entrance', 'boss']),
    /** Whether the room the party arrives in is quiet — no encounter, no trap. */
    safeEntrance: z.boolean().default(true),
    bossTable: ref('world.encounterTables', 'Drawn in the boss room. Without one the deepest room generates like any other.').optional(),
    completionTriggers: z.array(triggerSchema).default([]),
    /** Overrides the biome's palette for this dungeon. */
    palette: ref('world.palettes').optional(),
    /** Tiles of corridor between rooms. */
    corridorLength: diceNotation.default('3d3'),
    /** How a `winding` corridor wanders: the chance of carrying on, and a turn's penalty. */
    winding: z
      .object({
        continueChance: z.number().min(0).max(1).default(0.6),
        turnPenalty: z.number().min(0).default(0.4),
      })
      .strict()
      .default({}),
    /** Room size when a template declares no map spec of its own. */
    roomSize: diceNotation.default('2d3+3'),
    /** How the dungeon is made: `rooms`, `bsp`, or `caverns`. */
    algorithm: z.enum(['rooms', 'bsp', 'caverns']).default('rooms'),
    /** Tuning for `bsp`: the smallest leaf the space is cut into. */
    bsp: z.object({ minLeaf: z.number().int().min(2).default(5) }).strict().default({}),
    /** Tuning for `caverns`: starting rock, smoothing passes, and the birth threshold. */
    caverns: z
      .object({
        fill: z.number().min(0).max(1).default(0.45),
        smoothingPasses: z.number().int().min(0).default(4),
        birthThreshold: z.number().int().min(1).max(8).default(5),
      })
      .strict()
      .default({}),
    /** A hand-built `world.maps` entry used as the whole dungeon, identical across seeds. */
    staticMap: ref('world.maps').optional(),
    /** Static dungeons only: roll the biome's encounter tables once per `spawn` marker. */
    rollEncounters: z.boolean().default(false),
    /** What the passages are like. */
    corridor: z
      .object({
        /** `l` elbows, `straight` runs, or `winding` burrows. */
        style: z.enum(['l', 'straight', 'winding']).default('l'),
        /** Tiles wide. */
        width: z.number().int().min(1).max(3).default(1),
      })
      .strict()
      .default({}),
    /** Map bounds, dice notation. */
    width: diceNotation.optional(),
    height: diceNotation.optional(),
    extra,
  })
  .strict();

/** The world clock. */
export const timeSchema = z
  .object({
    minutesPerDay: z.number().int().min(1).default(1440),
    /** How long an hour is, alongside `minutesPerDay`. */
    minutesPerHour: z.number().int().min(1).default(60),
    daysPerMonth: z.number().int().min(1).default(30),
    monthNames: z.array(displayName).default([]),
    dayPhases: z
      .array(
        z.object({ id: idSchema, name: displayName, startMinute: z.number().int().min(0) }).strict(),
      )
      .default([]),
    startMinute: z.number().int().min(0).default(480),
    /** What an action costs in world-clock minutes, by action id. */
    actionMinutes: z.record(z.string(), z.number().int().min(0)).default({
      search: 10,
      disarm: 10,
      sense: 1,
      wait: 10,
    }),
    /** Minutes spent crossing one tile out of combat. */
    minutesPerTile: z.number().int().min(0).default(0),
  })
  .strict();

export const worldSchema = z
  .object({
    terrains: z.array(terrainSchema).default([]),
    palettes: z.array(paletteSchema).default([]),
    biomes: z.array(biomeSchema).default([]),
    areas: z.array(areaSchema).default([]),
    pointsOfInterest: z.array(pointOfInterestSchema).default([]),
    gates: z.array(gateSchema).default([]),
    roomTemplates: z.array(roomTemplateSchema).default([]),
    encounterTables: z.array(encounterTableSchema).default([]),
    dungeons: z.array(dungeonGenSchema).default([]),
    /** Hand-authored maps, identical across seeds. */
    maps: z.array(staticMapSchema).default([]),
    time: timeSchema.default({}),
    /** What generation does for a room that names no template. */
    generationDefaults: z
      .object({
        encounterChance: z.number().min(0).max(1).default(0.3),
        lootChance: z.number().min(0).max(1).default(0.25),
        trapChance: z.number().min(0).max(1).default(0.1),
      })
      .strict()
      .default({}),
  })
  .strict();

export type Trigger = z.infer<typeof triggerSchema>;
export type Gate = z.infer<typeof gateSchema>;
export type Area = z.infer<typeof areaSchema>;
export type PointOfInterest = z.infer<typeof pointOfInterestSchema>;
export type Biome = z.infer<typeof biomeSchema>;
export type RoomTemplate = z.infer<typeof roomTemplateSchema>;
export type EncounterTable = z.infer<typeof encounterTableSchema>;
export type World = z.infer<typeof worldSchema>;
export type { StaticMap, MapLayer, LayerKind } from './staticmap.js';
export type { Terrain, Palette, MapSpec, Position } from './space.js';
export { weighted };
