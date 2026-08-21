/** What a mod hands back. */

import { z } from 'zod';

/** A path into `GameState`, e.g. `['entities', 'e:1', 'hp']`. */
export const statePathSchema = z.array(z.union([z.string(), z.number().int()])).min(1).max(16);

export const statePatchSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), path: statePathSchema, value: z.unknown() }).strict(),
  z.object({ op: z.literal('delete'), path: statePathSchema }).strict(),
]);

export type StatePatch = z.infer<typeof statePatchSchema>;

export const modDirectiveSchema = z.discriminatedUnion('kind', [
  /** Effect ops, run through `applyOps` exactly as the module DSL's are. */
  z.object({ kind: z.literal('ops'), ops: z.array(z.unknown()) }).strict(),
  /** Direct state writes. */
  z.object({ kind: z.literal('patch'), patches: z.array(statePatchSchema) }).strict(),
  /** A `custom` game event, visible to triggers, quests, and other mods. */
  z
    .object({
      kind: z.literal('event'),
      event: z.string().min(1).max(64),
      data: z.record(z.string(), z.unknown()).default({}),
    })
    .strict(),
  /** Refuse the action being hooked, with a keyed reason. */
  z
    .object({
      kind: z.literal('refuse'),
      action: z.string().min(1).max(64),
      textKey: z.string().min(1).max(128),
      params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
    })
    .strict(),
  /** Put a line in the transcript. */
  z
    .object({
      kind: z.literal('say'),
      textKey: z.string().min(1).max(128),
      params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
      /** How it reads: ordinary prose, a system note, or a refusal-coloured line. */
      tone: z.enum(['prose', 'note', 'refusal']).default('prose'),
    })
    .strict(),
  /** Write into this mod's own namespaced bag on `GameState`. */
  z
    .object({
      kind: z.literal('modState'),
      key: z.string().min(1).max(64),
      value: z.unknown(),
    })
    .strict(),
  /** Only meaningful from a `replace` handler: run the core implementation after all. */
  z.object({ kind: z.literal('core') }).strict(),
]);

export type ModDirective = z.infer<typeof modDirectiveSchema>;

/** A handler returns any number of directives, or nothing at all. */
export const modDirectivesSchema = z.array(modDirectiveSchema);

/** Reject values that survive `JSON.stringify` in a shape that lies. */
export function checkJsonSafe(value: unknown, path = 'value'): string | null {
  if (value === null) return null;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return null;
    case 'number':
      if (Number.isNaN(value)) return `${path} is NaN, which serializes to null and would desync a replay`;
      if (!Number.isFinite(value)) return `${path} is ${value > 0 ? 'Infinity' : '-Infinity'}, which serializes to null`;
      return null;
    case 'object': {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const issue = checkJsonSafe(value[i], `${path}[${i}]`);
          if (issue) return issue;
        }
        return null;
      }
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        const issue = checkJsonSafe(inner, `${path}.${key}`);
        if (issue) return issue;
      }
      return null;
    }
    default:
      return `${path} is a ${typeof value}, which cannot be saved`;
  }
}

/** Bytes a single mod may hold in `state.modState`. */
export const MOD_STATE_BUDGET = 64 * 1024;
