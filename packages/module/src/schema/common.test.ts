/** The `ref:` marker, which is doing two jobs in one string. */

import { describe, it, expect } from 'vitest';
import { ref, refTarget, refHelp } from './common.js';
import { gameModuleSchema } from './module.js';

describe('ref markers', () => {
  it('reads back a plain reference', () => {
    const marker = ref('content.items').description;
    expect(refTarget(marker)).toBe('content.items');
    expect(refHelp(marker)).toBeNull();
  });

  it('reads back a reference carrying help', () => {
    const marker = ref('content.npcs', 'Who hands it over.').description;
    expect(refTarget(marker)).toBe('content.npcs');
    expect(refHelp(marker)).toBe('Who hands it over.');
  });

  it('keeps a pipe inside the help text', () => {
    const marker = ref('content.items', 'a | b | c').description;
    expect(refTarget(marker)).toBe('content.items');
    expect(refHelp(marker)).toBe('a | b | c');
  });

  it('says nothing about a description that is not a reference', () => {
    expect(refTarget('a plain sentence')).toBeNull();
    expect(refHelp('a plain sentence')).toBeNull();
    expect(refTarget(undefined)).toBeNull();
    expect(refHelp(undefined)).toBeNull();
  });

  /** Every marker in the real schema still resolves to a collection. */
  it('resolves every marker in the schema to a bare collection path', () => {
    const seen = new Set<string>();
    const walk = (schema: unknown, depth: number): void => {
      if (depth > 12 || typeof schema !== 'object' || schema === null) return;
      const def = (schema as { _def?: Record<string, unknown> })._def;
      if (!def) return;

      const description = (schema as { description?: string }).description;
      if (description?.startsWith('ref:')) {
        const target = refTarget(description);
        if (target) seen.add(target);
        expect(target, description).not.toContain('|');
        expect(target, description).not.toContain(' ');
      }

      for (const key of ['innerType', 'schema', 'type', 'valueType', 'keyType']) {
        if (def[key]) walk(def[key], depth + 1);
      }
      const shape = (schema as { shape?: Record<string, unknown> }).shape;
      if (shape) for (const child of Object.values(shape)) walk(child, depth + 1);
      for (const option of (def['options'] as unknown[] | undefined) ?? []) walk(option, depth + 1);
    };

    walk(gameModuleSchema, 0);
    expect(seen.size).toBeGreaterThan(20);
  });
});
