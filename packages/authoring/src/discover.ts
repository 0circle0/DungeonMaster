/** Hidden places are discovered by a thread-based formula. */

/** Five values describing a hidden-place discovery formula. */
export interface Rumoured {
  /** Thread whose clues make the place discoverable. */
  readonly thread: string;
  /** Difficulty when the party knows none of the clues. */
  readonly base: number;
  /** Difficulty reduction per clue known. */
  readonly step: number;
  /** Number of clues in the thread; sets the floor. */
  readonly entries: number;
  readonly skill?: string;
}

export interface Discover {
  readonly skill: string;
  readonly difficulty: unknown;
}

/** Lowest difficulty reached when the party knows all clues in the thread. */
export function floorOf(spec: Rumoured): number {
  return spec.base - spec.step * spec.entries;
}

/** Difficulty for a hidden place given how many clues are already known. */
export function dcKnowing(spec: Rumoured, known: number): number {
  return Math.max(floorOf(spec), spec.base - spec.step * known);
}

/** Build the hidden/discovery fields that anchor a place to a lore thread. */
export function rumoured(spec: Rumoured): { hidden: true; discover: Discover } {
  return {
    hidden: true,
    discover: {
      skill: spec.skill ?? 'perception',
      difficulty: {
        max: [
          floorOf(spec),
          {
            sub: [
              spec.base,
              { mul: [spec.step, { ref: `threads.${spec.thread}.known` }] },
            ],
          },
        ],
      },
    },
  };
}

/** Read the supported hidden-place formula back into the five-value form. */
export function readRumoured(discover: unknown): Rumoured | null {
  if (typeof discover !== 'object' || discover === null) return null;
  const skill = (discover as Record<string, unknown>)['skill'];
  const difficulty = (discover as Record<string, unknown>)['difficulty'];
  if (typeof difficulty !== 'object' || difficulty === null) return null;

  const max = (difficulty as Record<string, unknown>)['max'];
  if (!Array.isArray(max) || max.length !== 2) return null;
  const [floor, sloped] = max as [unknown, unknown];
  if (typeof floor !== 'number') return null;

  const sub = (sloped as Record<string, unknown> | null)?.['sub'];
  if (!Array.isArray(sub) || sub.length !== 2) return null;
  const [base, scaled] = sub as [unknown, unknown];
  if (typeof base !== 'number') return null;

  const mul = (scaled as Record<string, unknown> | null)?.['mul'];
  if (!Array.isArray(mul) || mul.length !== 2) return null;
  const [step, reference] = mul as [unknown, unknown];
  if (typeof step !== 'number' || step === 0) return null;

  const ref = (reference as Record<string, unknown> | null)?.['ref'];
  if (typeof ref !== 'string') return null;
  const thread = /^threads\.(.+)\.known$/.exec(ref)?.[1];
  if (!thread) return null;

  // Recover the clue count from the floor; a non-integer value is not a supported formula.
  const entries = (base - floor) / step;
  if (!Number.isInteger(entries) || entries < 0) return null;

  return {
    thread,
    base,
    step,
    entries,
    ...(typeof skill === 'string' ? { skill } : {}),
  };
}

/** Extract the thread name from a hidden-place formula regardless of form. */
export function threadAnchored(discover: unknown): string | null {
  const found = /"threads\.([^".]+)\.known"/.exec(JSON.stringify(discover ?? null));
  return found?.[1] ?? null;
}

/** The arrival text and clue taught when the party notices a place. */
export interface Noticing {
  readonly id: string;
  /** Short description shown when the place is noticed. */
  readonly description: string;
  /** Clue taught when this is triggered. */
  readonly clue: string;
  /** Repeat mode for the notice trigger. */
  readonly mode?: 'once' | 'always';
}

/** Create an arrival trigger that teaches a clue. */
export function noticing(spec: Noticing): Record<string, unknown> {
  return {
    id: spec.id,
    mode: spec.mode ?? 'once',
    on: 'enter',
    description: spec.description,
    effects: [{ learnLore: { entry: spec.clue } }],
  };
}
