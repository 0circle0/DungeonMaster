/**
 * The mod manifest.
 *
 * A mod is a directory whose folder name is `<id>-<hash>`, holding a `mod.json`
 * and the JavaScript it runs. Mods are **not** packaged with a game: a game
 * declares which ones it needs, and the mods themselves are shared and
 * installed independently.
 *
 * Two things this schema deliberately does not do:
 *
 *   - **It does not restrict what a mod may do to the game.** There is no
 *     capability allow-list for reading state or emitting directives.
 *     Invincibility, one-hit kills, rewriting combat — all legitimate. This is
 *     a D&D engine, not a rules referee, and arbitrary limits here would only
 *     limit the engine.
 *   - **It does not describe permissions for I/O.** There is no `net`, `fs`, or
 *     `time` capability because the sandbox has no such binding to grant. Their
 *     absence is structural rather than a policy someone could relax.
 *
 * `limits` is the one budget, and it is an anti-hang measure rather than a
 * gameplay restriction: without it a `while (true)` in a shared mod freezes the
 * player's tab.
 */

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
    /**
     * `before` runs ahead of the core implementation, `after` behind it, and
     * `replace` instead of it. A `replace` handler may still return
     * `{ kind: 'core' }` to fall through — override with super.
     */
    mode: z.enum(['before', 'after', 'replace']).default('after'),
    /** Higher runs first within a mode. */
    priority: z.number().int().min(-1000).max(1000).default(0),
    /**
     * Narrows the hook to one action type, effect op, occasion, or event.
     * This is what keeps the hot path cheap: without a match the runtime has
     * to cross the sandbox boundary for every candidate.
     */
    match: z.string().max(64).optional(),
  })
  .strict();

export type HookDecl = z.infer<typeof hookDeclSchema>;

/**
 * Anti-hang budgets. Not a sandbox permission model — see the file comment.
 */
export const limitsSchema = z
  .object({
    /**
     * QuickJS interrupt ticks per call. Generous by default: a mod being slow
     * should be a warning long before it is an error.
     */
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
    /**
     * Engine mods change play; editor mods change the studio. They are separate
     * because they run against different hosts, and a paired feature normally
     * ships as one of each.
     */
    target: z.enum(['engine', 'editor']),
    version: versionSchema,
    /**
     * Content tag over the manifest (minus this field) and every other file.
     * Recomputed on load and never trusted; a mismatch warns rather than
     * blocks, because this value sits in a file the author can edit.
     */
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
    /**
     * Ordering hints beyond `priority`, for when a mod needs to observe the
     * state another mod has already changed. A cycle is a load error.
     */
    loadAfter: z.array(idSchema).default([]),
    entry: z
      .string()
      .regex(/^[a-z0-9_][a-z0-9_./-]*\.js$/, 'must be a relative .js path')
      .default('main.js'),
    /**
     * Declared rather than discovered. The host indexes these before it
     * evaluates a single line of mod code, which is what makes the runtime's
     * hot-path gate a `Set` lookup instead of a boundary crossing.
     */
    hooks: z.array(hookDeclSchema).min(1),
    limits: limitsSchema.default({}),
    /**
     * Prose the mod adds, keyed. Mod text goes through the same resolution as
     * `narrative.systemText` so the engine's no-literal-prose rule holds for
     * mods too.
     */
    systemText: z.record(z.string(), z.string()).default({}),
  })
  .strict();

export type ModManifest = z.infer<typeof modManifestSchema>;

/** `<id>-<hash>` — a mod's identity, and its folder name. */
export function modIdentity(manifest: Pick<ModManifest, 'id' | 'hash'>): string {
  return `${manifest.id}-${manifest.hash}`;
}

/** Split `<id>-<hash>` back apart. Returns null if it is not that shape. */
export function parseModIdentity(value: string): { id: string; hash: string } | null {
  const at = value.lastIndexOf('-');
  if (at <= 0) return null;
  const id = value.slice(0, at);
  const hash = value.slice(at + 1);
  if (!idSchema.safeParse(id).success) return null;
  if (!hashTagSchema.safeParse(hash).success) return null;
  return { id, hash };
}
