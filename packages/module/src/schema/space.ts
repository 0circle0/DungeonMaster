/** Space: terrain, maps, and position. */

import { z } from 'zod';
import { EffectSchema, diceNotation } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, tags, extra } from './common.js';

/** A kind of ground. */
export const terrainSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,

    /** Single character used to draw it on a text map. */
    glyph: z.string().min(1).max(2).default('.'),

    /** Suggested colour when drawn on a text map. */
    color: z
      .enum(['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'])
      .optional(),

    passable: z.boolean().default(true),
    /** Blocks line of sight, and therefore field of view and witnessing. */
    opaque: z.boolean().default(false),

    /** Tiles of movement consumed to enter. */
    moveCost: z.number().min(0).default(1),

    /** Only creatures with one of these movement modes may enter. */
    requiresMode: z.array(ref('rules.movementModes')).default([]),

    /** Cover granted to a creature standing behind this. */
    providesCover: ref('rules.coverTypes').optional(),

    /** Fires when a creature enters — lava, caltrops, a pressure plate. */
    onEnter: z.array(EffectSchema).default([]),
    /** Fires at the end of a turn spent standing here. */
    onOccupy: z.array(EffectSchema).default([]),

    /** Light emitted, in tiles. */
    lightRadius: z.number().min(0).default(0),

    /** How well this ground keeps a trace, per sense. */
    marks: z.record(ref('rules.senses'), z.number().min(0).max(1)).optional(),

    /** A door-like terrain that a gate can be attached to. */
    isDoor: z.boolean().default(false),
    extra,
  })
  .strict();

/** How a space is drawn. */
export const paletteSchema = z
  .object({
    id: idSchema,
    name: displayName.optional(),
    floor: ref('world.terrains'),
    wall: ref('world.terrains'),
    door: ref('world.terrains').optional(),
    /** Terrain laid over the floor, either sprinkled or in patches. */
    scatter: z
      .array(
        z
          .object({
            terrain: ref('world.terrains'),
            /** Fraction of the open floor this covers. */
            frequency: z.number().min(0).max(1).default(0.05),
            distribution: z.enum(['speckle', 'patch']).default('speckle'),
            /** `patch` only: tiles across a typical blob. */
            scale: z.number().int().min(2).max(64).default(8),
            /** `patch` only: 1 gives smooth outlines, 3 a ragged coast. */
            octaves: z.number().int().min(1).max(4).default(2),
            /** Laid in a band around a patch — a shore, a verge, a scree slope. */
            edgeTerrain: ref('world.terrains').optional(),
            edgeWidth: z.number().int().min(0).max(4).default(1),
            /** Lower is laid first, and a later entry never overwrites it. */
            priority: z.number().int().default(0),
          })
          .strict(),
      )
      .default([]),
    /** Fills the space beyond the walls, e.g. rock, void, open sky. */
    exterior: ref('world.terrains').optional(),
    extra,
  })
  .strict();

/** A position on a map. */
export const positionSchema = z
  .object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
  })
  .strict();

/** How a space is sized and drawn. */
export const mapSpecObject = z
  .object({
    /** Dice notation, so size varies per instance. */
    width: diceNotation.default('7'),
    height: diceNotation.default('7'),
    palette: ref('world.palettes').optional(),
    /** A hand-built map used exactly as authored. */
    static: ref('world.maps').optional(),
    /** Hand-authored tiles, as rows of palette glyphs. */
    layout: z.array(z.string()).default([]),
    /** Maps a glyph in `layout` to a terrain, beyond the palette's own. */
    legend: z.record(z.string(), ref('world.terrains')).default({}),
    extra,
  })
  .strict();

export const mapSpecSchema = mapSpecObject
  .superRefine((spec, ctx) => {
    if (spec.layout.length === 0) return;
    // A ragged layout would silently produce a jagged map; rows must be equal.
    const width = spec.layout[0]!.length;
    if (spec.layout.some((row) => row.length !== width)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layout'],
        message: 'every row of a layout must be the same length',
      });
    }
  });

export type Terrain = z.infer<typeof terrainSchema>;
export type Palette = z.infer<typeof paletteSchema>;
export type MapSpec = z.infer<typeof mapSpecSchema>;
export type Position = z.infer<typeof positionSchema>;
