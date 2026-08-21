/** Tone → CSS variable. */

import type { Tone } from '@dm/play';

export function toneVar(tone: Tone | null): string | undefined {
  return tone ? `var(--tone-${tone})` : undefined;
}
