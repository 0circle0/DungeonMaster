/**
 * Tone → CSS variable.
 *
 * The *decision* of which tone a thing gets is `@dm/play`'s; what a tone looks
 * like is this app's. The terminal makes the same split with picocolors.
 */

import type { Tone } from '@dm/play';

export function toneVar(tone: Tone | null): string | undefined {
  return tone ? `var(--tone-${tone})` : undefined;
}
