/** The element schema behind every collection. */

import { z } from 'zod';
import { gameModuleSchema, COLLECTION_PATHS } from './module.js';
import type { CollectionPath } from './module.js';

/** Strip the wrappers zod uses for optionality, defaults and refinement. */
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

/** Every collection's element schema, keyed by its `section.collection` path. */
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

/** Collections the schema insists are non-empty, which the incremental parser must respect. */
export const COLLECTION_MIN_LENGTHS: ReadonlyMap<CollectionPath, number> = derived.minima;

/** The element schema for one collection, or `undefined` if the path is not one. */
export function collectionSchema(path: string): z.ZodTypeAny | undefined {
  return COLLECTION_SCHEMAS.get(path as CollectionPath);
}
