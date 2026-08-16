/**
 * Content tags.
 *
 * `hash64` is the recipe the module hash has always used, lifted here so the
 * mod format can share it rather than keep a second copy that drifts. Two
 * 32-bit FNV-1a passes over different salts give a 64-bit hex tag.
 *
 * **This is change detection, not security.** It identifies a version; it
 * authenticates nothing. A mod is arbitrary code, and the only thing standing
 * between a hostile mod and the player is the sandbox — never this tag.
 */

import { hashString } from './rng.js';

/**
 * The separator between the text and its salt.
 *
 * It is a NUL byte, not a space. The original `hashModule` had the byte written
 * *literally* into its source, which is why `packages/module/src/compile.ts`
 * still reads as binary to `grep`. Every module hash recorded in every save
 * depends on this exact byte, so it is built here with `fromCharCode` rather
 * than pasted in — same hash, and this file stays plain ASCII.
 */
const SALT_SEPARATOR = String.fromCharCode(0);

/** A 64-bit content tag as 16 lowercase hex characters. */
export function hash64(text: string): string {
  const a = hashString(text);
  const b = hashString(`${text}${SALT_SEPARATOR}salt`);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Stable stringify: object keys sorted, so a hash tracks content rather than
 * whichever order an editor happened to serialize. `undefined` values are
 * dropped, array order is preserved because it is meaningful.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
