/**
 * Static maps: hand-authored, identical across seeds.
 *
 * A generated map answers "what might be here"; a static map answers "this is here". Castles, shops
 * and set-piece rooms are authored as a grid of ids — one id per cell, one grid per layer — and the
 * engine uses them verbatim.
 *
 * On disk a static map is a folder (`maps/<id>/` beside `module.json`): a `map.json` manifest plus
 * one CSV per layer, assembled into this shape at load. In the assembled document the grids are
 * plain 2-D arrays, which is what makes the ordinary machinery work unchanged — `collectRefs`
 * proves every cell resolves, `hashModule` hashes the content, and `extends` merges maps by id.
 *
 * Layers are ordered by draw order, and the kind of a layer decides which collection its cells
 * resolve against.
 */

import { z } from 'zod';
import { idSchema, displayName, description, ref, tags, extra } from './common.js';

/**
 * Which collection each layer kind's cells resolve against. `markers` is null: marker ids are free
 * names ("entry", "door", "spawn") rather than references.
 */
export const LAYER_TARGETS = {
  terrain: 'world.terrains',
  items: 'content.items',
  monsters: 'content.monsters',
  npcs: 'content.npcs',
  gates: 'world.gates',
  traps: 'content.traps',
  markers: null,
} as const;

export type LayerKind = keyof typeof LAYER_TARGETS;

export const LAYER_KINDS = Object.keys(LAYER_TARGETS) as readonly LayerKind[];

/** A grid whose non-empty cells must resolve in `target`. */
function cellsOf(target: string) {
  return z.array(z.array(z.union([z.literal(''), ref(target)])));
}

function layerBranch(kind: LayerKind, cells: z.ZodTypeAny) {
  return z
    .object({
      kind: z.literal(kind),
      /** Names the layer in the editor and its CSV file on disk. */
      name: idSchema.optional(),
      cells,
      extra,
    })
    .strict();
}

/**
 * A plain union rather than a discriminated one, deliberately: the compiler's `collectRefs` walks
 * `ZodUnion` by descending the first branch that parses, which is what turns every non-empty cell
 * into a checked reference. Each branch's `kind` literal makes the match unambiguous.
 */
export const mapLayerSchema = z.union([
  layerBranch('terrain', cellsOf(LAYER_TARGETS.terrain)),
  layerBranch('items', cellsOf(LAYER_TARGETS.items)),
  layerBranch('monsters', cellsOf(LAYER_TARGETS.monsters)),
  layerBranch('npcs', cellsOf(LAYER_TARGETS.npcs)),
  layerBranch('gates', cellsOf(LAYER_TARGETS.gates)),
  layerBranch('traps', cellsOf(LAYER_TARGETS.traps)),
  layerBranch(
    'markers',
    z.array(z.array(z.string().regex(/^$|^[a-z][a-z0-9_]*$/, 'marker ids are lowercase snake'))),
  ),
]);

export const staticMapSchema = z
  .object({
    id: idSchema,
    name: displayName.optional(),
    description: description.default(''),
    tags,
    /**
     * The marker id the party arrives at. Required (via lint) when an area, POI or dungeon uses
     * this map directly; a map only ever stamped into a generated dungeon as a room needs `door`
     * markers instead.
     */
    entry: idSchema.default('entry'),
    layers: z.array(mapLayerSchema).min(1),
    extra,
  })
  .strict()
  .superRefine((map, ctx) => {
    // Every layer must be the same rectangle — a sparse layer is authored as empty cells, never as
    // missing rows.
    const first = map.layers[0]!.cells as string[][];
    const height = first.length;
    const width = first[0]?.length ?? 0;

    map.layers.forEach((layer, i) => {
      const cells = layer.cells as string[][];
      if (cells.length !== height) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['layers', i, 'cells'],
          message: `layer is ${cells.length} rows; every layer must match the first (${height})`,
        });
        return;
      }
      cells.forEach((row, y) => {
        if (row.length !== width) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['layers', i, 'cells', y],
            message: `row is ${row.length} cells; every row must be the same width (${width})`,
          });
        }
      });
    });

    // The base terrain layer makes the tiles total; without one there is no ground to stand on.
    const base = map.layers.find((layer) => layer.kind === 'terrain');
    if (!base) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layers'],
        message: 'a static map needs at least one terrain layer',
      });
      return;
    }
    const baseIndex = map.layers.indexOf(base);
    (base.cells as string[][]).forEach((row, y) => {
      const gap = row.findIndex((cell) => cell === '');
      if (gap !== -1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['layers', baseIndex, 'cells', y, gap],
          message:
            'the first terrain layer must be fully filled; later terrain layers may be sparse',
        });
      }
    });
  });

export type MapLayer = z.infer<typeof mapLayerSchema>;
export type StaticMap = z.infer<typeof staticMapSchema>;
