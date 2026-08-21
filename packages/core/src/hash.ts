/** Content tags. */

import { hashString } from './rng.js';

/** The separator between the text and its salt. */
const SALT_SEPARATOR = String.fromCharCode(0);

/** A 64-bit content tag as 16 lowercase hex characters. */
export function hash64(text: string): string {
  const a = hashString(text);
  const b = hashString(`${text}${SALT_SEPARATOR}salt`);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Stable JSON: keys sorted, `undefined` dropped, array order preserved. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
