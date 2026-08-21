/** Shared schema building blocks. */

import { z } from 'zod';

/** `iron_sword`, `crypt_03` — lowercase snake, stable across versions. */
export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'ids are lowercase letters, digits, and underscores');

/** Semantic version, e.g. `1.0.0`. */
export const versionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/, 'must be a semantic version such as "1.0.0"');

/** Human-facing display text. */
export const displayName = z.string().min(1).max(200);
export const description = z.string().max(4000);

/** A reference to an entry in another collection. */
export function ref(collection: string, help?: string) {
  return idSchema.describe(help ? `ref:${collection}|${help}` : `ref:${collection}`);
}

/** Extract the target collection from a `ref:` marker. */
export function refTarget(description: string | undefined): string | null {
  if (!description?.startsWith('ref:')) return null;
  const rest = description.slice(4);
  const bar = rest.indexOf('|');
  return bar < 0 ? rest : rest.slice(0, bar);
}

/** The sentence after the collection, if the field carries one. */
export function refHelp(description: string | undefined): string | null {
  if (!description?.startsWith('ref:')) return null;
  const bar = description.indexOf('|');
  return bar < 0 ? null : description.slice(bar + 1);
}

/** A weighted table row, used for encounters, loot, and text variation. */
export function weighted<T extends z.ZodTypeAny>(entry: T) {
  return z
    .object({
      weight: z.number().min(0).default(1),
      value: entry,
    })
    .strict();
}

/** An open bag of author-defined data. */
export const extra = z.record(z.string(), z.unknown()).default({});

/** Free-form tags used for filtering and for narrative conditions. */
export const tags = z.array(idSchema).default([]);
