/**
 * What the player could do right now, as a quiet line of suggestions.
 *
 * Drawn from the same affordance list the browser's buttons come from — which
 * is both a real improvement to the terminal and the proof that the
 * abstraction is UI-agnostic rather than React-shaped.
 */

import pc from 'picocolors';
import { affordances } from '@dm/play';
import type { PlayContext } from '@dm/play';

/** `you can: attack the bog hound · search · listen` — or nothing. */
export function hintLines(context: PlayContext): string[] {
  const offered = affordances(context)
    .filter((entry) => !entry.blocked)
    // The always-available fillers would drown the interesting ones.
    .filter((entry) => !['stance', 'rest', 'look', 'search', 'wait'].includes(entry.kind))
    .slice(0, 4);

  if (offered.length === 0) return [];
  const listed = offered.map((entry) => entry.label.toLowerCase()).join(' · ');
  return [pc.dim(`  you can: ${listed}`)];
}
