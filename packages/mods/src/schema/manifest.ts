/** The mod manifest. */

import { z } from 'zod';
import { idSchema, versionSchema, displayName, description } from '@dm/module';

export const MOD_FORMAT_VERSION = 1;

/** A 64-bit content tag, the shape `hash64` produces. */
export const hashTagSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, 'must be a 16-character content hash');

/** Where a mod attaches, and how it composes with the core implementation. */
export const hookDeclSchema = z
  .object({
    hook: z.string().min(1).max(64),
    /** `before` runs ahead of the core implementation, `after` behind it, and `replace` instead of it. */
    mode: z.enum(['before', 'after', 'replace']).default('after'),
    /** Higher runs first within a mode. */
    priority: z.number().int().min(-1000).max(1000).default(0),
    /** Narrows the hook to one action type, effect op, occasion, or event. */
    match: z.string().max(64).optional(),
  })
  .strict();

export type HookDecl = z.infer<typeof hookDeclSchema>;

/** Anti-hang budgets. */
export const limitsSchema = z
  .object({
    /** QuickJS interrupt ticks per call. */
    steps: z.number().int().min(1_000).max(100_000_000).default(2_000_000),
    memoryBytes: z
      .number()
      .int()
      .min(1 << 20)
      .max(256 << 20)
      .default(32 << 20),
  })
  .strict();

export type ModLimits = z.infer<typeof limitsSchema>;

export const modManifestSchema = z
  .object({
    format: z.number().int().min(1).default(MOD_FORMAT_VERSION),
    id: idSchema,
    /** Engine mods change play; editor mods change the studio. */
    target: z.enum(['engine', 'editor']),
    version: versionSchema,
    /** Content tag over the manifest (minus this field) and every other file. */
    hash: hashTagSchema,
    meta: z
      .object({
        title: displayName,
        author: z.string().max(200).default(''),
        description: description.default(''),
        license: z.string().max(200).default(''),
        homepage: z.string().max(400).default(''),
      })
      .strict(),
    /** Semver range, same convention as `gameModuleSchema.engine`. */
    engine: z.string().default('^1.0.0'),
    dependencies: z
      .array(
        z
          .object({
            id: idSchema,
            /** Absent means any version of that mod will do. */
            hash: hashTagSchema.optional(),
          })
          .strict(),
      )
      .default([]),
    /** Ordering hints beyond `priority`. */
    loadAfter: z.array(idSchema).default([]),
    entry: z
      .string()
      .regex(/^[a-z0-9_][a-z0-9_./-]*\.js$/, 'must be a relative .js path')
      .default('main.js'),
    /** Declared rather than discovered. */
    hooks: z.array(hookDeclSchema).min(1),
    limits: limitsSchema.default({}),
    /** Prose the mod adds, keyed. */
    systemText: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type ModManifest = z.infer<typeof modManifestSchema>;

/** `<id>-<hash>` — a mod's identity, and its folder name. */
export function modIdentity(manifest: Pick<ModManifest, 'id' | 'hash'>): string {
  return `${manifest.id}-${manifest.hash}`;
}

/** Split `<id>-<hash>` back apart. */
export function parseModIdentity(value: string): { id: string; hash: string } | null {
  const at = value.lastIndexOf('-');
  if (at <= 0) return null;
  const id = value.slice(0, at);
  const hash = value.slice(at + 1);
  if (!idSchema.safeParse(id).success) return null;
  if (!hashTagSchema.safeParse(hash).success) return null;
  return { id, hash };
}
