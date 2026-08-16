/**
 * Tone → CSS variable.
 *
 * The *decision* of which tone a thing gets is `@dm/play`'s; what a tone looks
 * like is this app's — which is why the tone names carry no colour of their own.
 */

import type { Tone } from '@dm/play';

export function toneVar(tone: Tone | null): string | undefined {
  return tone ? `var(--tone-${tone})` : undefined;
}
