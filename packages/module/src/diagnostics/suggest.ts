/** "Did you mean…?" */

/** Damerau-Levenshtein distance, bounded: it stops once the distance exceeds `limit`. */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let beforePrevious: number[] = [];

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = current[j - 1]! + 1;
      const deletion = previous[j]! + 1;
      let best = Math.min(substitution, insertion, deletion);

      // Transposition: the two characters are swapped.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, beforePrevious[j - 2]! + 1);
      }

      current[j] = best;
      if (best < rowMin) rowMin = best;
    }

    if (rowMin > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }

  return previous[b.length]!;
}

/** The closest candidate, or null when nothing is close enough to be worth guessing. */
export function closest(word: string, candidates: Iterable<string>): string | null {
  const lower = word.toLowerCase();
  const threshold = Math.max(1, Math.min(3, Math.floor(word.length / 3) + 1));

  let best: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (candidate === word) return candidate;

    // A pure case difference, or one string containing the other, is the intended word.
    const candidateLower = candidate.toLowerCase();
    if (candidateLower === lower) return candidate;

    const distance = editDistance(lower, candidateLower, threshold);
    if (distance <= threshold && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/** Up to `count` nearest candidates, for when several are plausible. */
export function nearest(word: string, candidates: Iterable<string>, count = 3): string[] {
  const lower = word.toLowerCase();
  const scored: { candidate: string; distance: number }[] = [];

  for (const candidate of candidates) {
    scored.push({ candidate, distance: editDistance(lower, candidate.toLowerCase()) });
  }

  return scored
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))
    .slice(0, count)
    .map((entry) => entry.candidate);
}

/** Format a suggestion, falling back to listing what is allowed. */
export function suggestionFor(word: string, candidates: readonly string[]): string {
  const match = closest(word, candidates);
  if (match) return `did you mean "${match}"?`;
  if (candidates.length === 0) return '';
  if (candidates.length <= 8) return `valid options are: ${candidates.join(', ')}`;
  return `closest options: ${nearest(word, candidates).join(', ')}`;
}
