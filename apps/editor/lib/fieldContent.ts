/**
 * Whether a field has anything in it — the question the generated form has to
 * ask before it decides to draw a box.
 *
 * The schema defaults nearly every collection to `[]` or `{}`, and
 * `lib/schema.ts` reports a `.default()` as optional *with* a default value. The
 * form then renders `value ?? defaultValue`, so a key that is not in the
 * document at all arrives here looking like an empty array. A requirement has
 * nineteen such clauses, and an author who has gated nothing still gets
 * nineteen bordered boxes saying "none".
 *
 * So emptiness is decided on the **raw** value, before any default is painted
 * over it. That is the whole trick, and it is why every caller must pass
 * `object[key]` rather than the value it is about to render.
 */

import type { FieldSpec } from './schema';

/**
 * Kinds that draw a bordered box rather than a single labelled row.
 *
 * Only these are worth folding away: a scalar is one line, and hiding
 * `minLevel` — the clause an author reaches for most — behind a dropdown would
 * cost more than the box it saved.
 */
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

/**
 * Did the author put anything here?
 *
 * Structural only, and deliberately not "does this differ from the schema
 * default" — that would make a section vanish the moment someone typed the
 * default back in, and it would import compilation semantics into a question
 * about drawing.
 *
 * `0` and `false` count as content. They are things an author wrote down;
 * treating them as absence would put `oneWay: false` out of reach of everything
 * except the raw JSON editor.
 */
export function hasContent(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'string') return raw !== '';
  if (typeof raw === 'object') return Object.keys(raw).length > 0;
  return true;
}
