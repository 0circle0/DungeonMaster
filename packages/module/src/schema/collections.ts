/**
 * The element schema behind every collection.
 *
 * `COLLECTION_PATHS` says *where* the collections are; this says *what one
 * entry looks like*, by walking down to the array's element type. Two callers
 * want the same answer and used to derive it separately: the editor, to
 * generate a form per content type, and the incremental validator, to check one
 * entry without parsing the whole document.
 *
 * Deriving it rather than listing it is what keeps both honest — a collection
 * added to the schema is picked up by each of them with no second edit.
 */

import { z } from 'zod';
import { gameModuleSchema, COLLECTION_PATHS } from './module.js';
import type { CollectionPath } from './module.js';

/**
 * Strip the wrappers zod uses for optionality, defaults and refinement.
 *
 * They nest arbitrarily — `.optional().default(x).describe(y)` — so this loops
 * rather than unwrapping once, with a bound so a malformed schema cannot hang
 * the caller.
 */
export function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (let guard = 0; guard < 20; guard += 1) {
    const def = current._def as { typeName?: string; [key: string]: unknown };
    switch (def.typeName) {
      case 'ZodOptional':
      case 'ZodNullable':
      case 'ZodDefault':
      case 'ZodReadonly':
      case 'ZodCatch':
        current = def['innerType'] as z.ZodTypeAny;
        continue;
      case 'ZodEffects':
        current = def['schema'] as z.ZodTypeAny;
        continue;
      default:
        return current;
    }
  }
  return current;
}

/**
 * Every collection's element schema, keyed by its `section.collection` path.
 *
 * Built once at module load — walking the zod AST is not free and the schema
 * never changes at runtime.
 */
const derived = (() => {
  const schemas = new Map<CollectionPath, z.ZodTypeAny>();
  const minima = new Map<CollectionPath, number>();
  const rootShape = gameModuleSchema.shape as Record<string, z.ZodTypeAny>;

  for (const path of COLLECTION_PATHS) {
    const [section, name] = path.split('.') as [string, string];

    const sectionSchema = rootShape[section];
    if (!sectionSchema) continue;
    const sectionObject = unwrapSchema(sectionSchema);
    if ((sectionObject._def as { typeName?: string }).typeName !== 'ZodObject') continue;

    const collectionSchema = (sectionObject as z.ZodObject<z.ZodRawShape>).shape[name];
    if (!collectionSchema) continue;

    const arraySchema = unwrapSchema(collectionSchema);
    const arrayDef = arraySchema._def as {
      typeName?: string;
      type?: z.ZodTypeAny;
      minLength?: { value: number } | null;
    };
    if (arrayDef.typeName !== 'ZodArray' || !arrayDef.type) continue;

    schemas.set(path, arrayDef.type);
    const min = arrayDef.minLength?.value ?? 0;
    if (min > 0) minima.set(path, min);
  }
  return { schemas, minima };
})();

export const COLLECTION_SCHEMAS: ReadonlyMap<CollectionPath, z.ZodTypeAny> = derived.schemas;

/**
 * Collections the schema insists are non-empty — today `rules.attributes` and
 * `rules.resources`, because a character has to be made of something.
 *
 * The incremental parser needs these: it checks a document with the collections
 * lifted out, and an emptied list would trip a minimum the real document meets.
 */
export const COLLECTION_MIN_LENGTHS: ReadonlyMap<CollectionPath, number> = derived.minima;

/** The element schema for one collection, or `undefined` if the path is not one. */
export function collectionSchema(path: string): z.ZodTypeAny | undefined {
  return COLLECTION_SCHEMAS.get(path as CollectionPath);
}
