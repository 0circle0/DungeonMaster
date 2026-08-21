/** A difficulty that moves with what a faction thinks of you. */

export interface StandingOptions {
  /** The most the check can move in either direction. */
  readonly span?: number;
  /** Points of standing per point of difficulty. */
  readonly per?: number;
}

/** A `requirement` DSL expression, ready to be a `check.dc`. */
export function standingDc(
  base: number,
  faction: string,
  options: StandingOptions = {},
): Record<string, unknown> {
  const span = options.span ?? 6;
  const per = options.per ?? 5;
  return {
    sub: [
      base,
      { clamp: [{ div: [{ ref: `reputation.${faction}`, else: 0 }, per] }, -span, span] },
    ],
  };
}

/** What the check actually comes to at a given standing — for a preview. */
export function dcAt(
  base: number,
  standing: number,
  options: StandingOptions = {},
): number {
  const span = options.span ?? 6;
  const per = options.per ?? 5;
  const shift = standing / per;
  return base - Math.max(-span, Math.min(span, shift));
}
