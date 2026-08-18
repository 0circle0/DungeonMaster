/**
 * A difficulty that moves with what a faction thinks of you.
 *
 * At standing 0 the check is `base`. Every `per` points moves it a point in
 * your favour, to a maximum of `span` either way — so the whole range is
 * `base ± span`.
 *
 * The clamp is the design, not an implementation detail. No amount of goodwill
 * makes a hard thing automatic and no amount of hostility makes it impossible,
 * because a gate is shut until you have the key and a *person* is merely
 * harder. There is always a roll.
 */

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

/**
 * What the check actually comes to at a given standing — for a preview.
 *
 * Fractional between steps, and deliberately so: the DSL's `div` is real
 * division, not integer division, so a standing of -27 against `per: 5` gives
 * 19.4 rather than 19. That is what the shipped expressions already do, and
 * this exists to predict them rather than to improve on them — a preview that
 * rounded would disagree with the roll. Worth knowing when showing a DC to
 * anybody: 19.4 needs a 20.
 */
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
