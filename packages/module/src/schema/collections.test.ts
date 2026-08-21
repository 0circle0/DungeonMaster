/** The premise incremental validation rests on. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { gameModuleSchema, COLLECTION_PATHS } from './module.js';
import { COLLECTION_SCHEMAS, unwrapSchema } from './collections.js';

/** Every shipped module, so the claim is tested at 20 KB and at 2.9 MB alike. */
const MODULES = ['minimal', 'core_fantasy', 'greenmarch', 'aurendel'] as const;

const moduleDoc = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../../modules/${name}/module.json`, import.meta.url)),
      'utf8',
    ),
  ) as Record<string, unknown>;

const ENTRY_SCHEMAS = new Set(COLLECTION_SCHEMAS.values());

/** Does a collection's element schema sit anywhere under this one? */
function reachesACollection(schema: z.ZodTypeAny, depth = 0, seen = new Set<z.ZodTypeAny>()): boolean {
  if (depth > 12 || seen.has(schema)) return false;
  seen.add(schema);
  if (ENTRY_SCHEMAS.has(schema)) return true;

  const unwrapped = unwrapSchema(schema);
  if (unwrapped !== schema) return reachesACollection(unwrapped, depth + 1, seen);

  const def = schema._def as { typeName?: string; [key: string]: unknown };
  if (def.typeName === 'ZodObject') {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    return Object.values(shape).some((child) => reachesACollection(child, depth + 1, seen));
  }
  if (def.typeName === 'ZodArray' && def['type']) {
    return reachesACollection(def['type'] as z.ZodTypeAny, depth + 1, seen);
  }
  return false;
}

/** Every refinement above the entry level, split by whether it spans a collection. */
function refinementsAboveEntries(): { spanning: string[]; singleton: string[] } {
  const spanning: string[] = [];
  const singleton: string[] = [];
  const seen = new Set<z.ZodTypeAny>();

  const walk = (schema: z.ZodTypeAny, path: string, depth: number): void => {
    if (depth > 12 || seen.has(schema)) return;
    seen.add(schema);

    if (ENTRY_SCHEMAS.has(schema)) return;

    const def = schema._def as { typeName?: string; [key: string]: unknown };

    if (def.typeName === 'ZodEffects') {
      const inner = def['schema'] as z.ZodTypeAny;
      (reachesACollection(inner) ? spanning : singleton).push(path || '<root>');
      walk(inner, path, depth + 1);
      return;
    }

    const unwrapped = unwrapSchema(schema);
    if (unwrapped !== schema) {
      walk(unwrapped, path, depth + 1);
      return;
    }

    if (def.typeName === 'ZodObject') {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      for (const [key, child] of Object.entries(shape)) {
        walk(child, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }

    if (def.typeName === 'ZodArray' && def['type']) {
      walk(def['type'] as z.ZodTypeAny, `${path}[]`, depth + 1);
    }
  };

  walk(gameModuleSchema, '', 0);
  return { spanning, singleton };
}

describe('collection element schemas', () => {
  it('covers every declared collection path', () => {
    expect([...COLLECTION_SCHEMAS.keys()].sort()).toEqual([...COLLECTION_PATHS].sort());
  });

  it('resolves to object schemas carrying an id', () => {
    for (const [path, schema] of COLLECTION_SCHEMAS) {
      const unwrapped = unwrapSchema(schema);
      const shape = (unwrapped as z.ZodObject<z.ZodRawShape>).shape;
      expect(shape, `${path} should be an object schema`).toBeDefined();
      expect(Object.keys(shape), `${path} should carry an id`).toContain('id');
    }
  });

  // The load-bearing one.
  it('has no refinement reaching across collection entries', () => {
    expect(refinementsAboveEntries().spanning).toEqual([]);
  });

  /** Pinned rather than asserted empty. */
  it('refines only these singletons above the entry level', () => {
    expect(refinementsAboveEntries().singleton).toEqual(['rules.progression']);
  });

  it.each(MODULES)('parses one entry of %s the same way the whole document does', (name) => {
    const doc = moduleDoc(name);
    const whole = gameModuleSchema.safeParse(doc);
    expect(whole.success).toBe(true);
    if (!whole.success) return;

    let checked = 0;
    for (const [path, schema] of COLLECTION_SCHEMAS) {
      const [section, key] = path.split('.') as [string, string];
      const raw = (doc[section] as Record<string, unknown> | undefined)?.[key];
      if (!Array.isArray(raw) || raw.length === 0) continue;

      const parsedWhole = (whole.data as unknown as Record<string, Record<string, unknown[]>>)[
        section
      ]?.[key];

      raw.forEach((entry, i) => {
        const alone = schema.safeParse(entry);
        expect(alone.success, `${path}[${i}] should parse alone`).toBe(true);
        if (!alone.success) return;
        expect(alone.data, `${path}[${i}] should match the whole-document parse`).toEqual(
          parsedWhole?.[i],
        );
        checked += 1;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });
});
