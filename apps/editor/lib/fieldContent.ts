/** Whether a field has anything in it, which decides whether the form draws a box. */

import type { FieldSpec } from './schema';

/** Kinds that draw a bordered box rather than a single labelled row. */
export const CONTAINER_KINDS: ReadonlySet<FieldSpec['kind']> = new Set([
  'object',
  'array',
  'record',
  'dsl',
  'unknown',
]);

export function rendersAsGroup(spec: FieldSpec): boolean {
  return CONTAINER_KINDS.has(spec.kind);
}

/** Did the author put anything here? */
export function hasContent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'string') return raw !== '';
  if (typeof raw === 'object') return Object.keys(raw).length > 0;
  return true;
}
