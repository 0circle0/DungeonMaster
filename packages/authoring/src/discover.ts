/**
 * Secrets: places found by knowing things, and things a place gives up.
 *
 * A hidden place is not a locked door. Knowing the clues does not open it —
 * it makes finding it *method* rather than luck, by lowering the check every
 * time the party learns another piece of the thread. That intent is stored as
 * a formula, not a number:
 *
 * ```json
 * { "max": [ 6, { "sub": [ 18, { "mul": [ 3, { "ref": "threads.kings_under.known" } ] } ] } ] }
 * ```
 *
 * DC 18 knowing nothing, three easier per clue, and never below 6. Nobody
 * writes that by hand — Aurendel's 36 rumoured places all came out of a
 * five-argument helper — and typing an expression tree into a JSON box is not
 * authoring. So it is five values here too, and the reverse direction as well,
 * because a place that already has a formula has to be editable.
 */

/** The five values a hidden place is described by. */
export interface Rumoured {
  /** The lore thread whose clues make it findable. */
  readonly thread: string;
  /** The check knowing none of the clues. */
  readonly base: number;
  /** How much easier each clue makes it. */
  readonly step: number;
  /** How many clues the thread has, which sets the floor. */
  readonly entries: number;
  readonly skill?: string;
}

export interface Discover {
  readonly skill: string;
  readonly difficulty: unknown;
}

/** The floor: knowing everything is as easy as it gets, and it is not free. */
export function floorOf(spec: Rumoured): number {
  return spec.base - spec.step * spec.entries;
}

/** What the check comes to knowing `known` of the clues. */
export function dcKnowing(spec: Rumoured, known: number): number {
  return Math.max(floorOf(spec), spec.base - spec.step * known);
}

/**
 * The `hidden` + `discover` a place takes to be a thread's anchor.
 *
 * Returned as fields to merge rather than a whole entry, because the place
 * already exists — this is the one thing about it that changes.
 */
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

/**
 * The five values back out of a formula, or null if it is not one of ours.
 *
 * A place hidden behind a plain number, or behind something hand-written, is
 * left alone rather than reinterpreted — the editor shows the raw field
 * instead of pretending it understands it.
 */
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

  // The floor is `base - step * entries`, so the clue count comes back out of
  // it. A floor that does not divide evenly was not written by `rumoured`.
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

/**
 * The thread a place is anchored to, however its formula was written.
 *
 * Looser than `readRumoured` on purpose: it only wants the thread name, so a
 * hand-written formula still reports which thread it belongs to. This is the
 * same link `dmkit/lint.py` follows, and it is the only one there is — nothing
 * records a thread's anchors anywhere else.
 */
export function threadAnchored(discover: unknown): string | null {
  const found = /"threads\.([^".]+)\.known"/.exec(JSON.stringify(discover ?? null));
  return found?.[1] ?? null;
}

/** What a place gives up on arrival, with nobody standing next to it. */
export interface Noticing {
  readonly id: string;
  /** One sentence: what they see, close up, that they could not from away. */
  readonly description: string;
  /** The clue it teaches. */
  readonly clue: string;
  /** `once` is almost always right — a thing is only noticed the first time. */
  readonly mode?: 'once' | 'always';
}

/**
 * An arrival trigger that teaches a clue.
 *
 * Some facts have nobody standing next to them: a ship in the middle of the
 * ice does not talk, and which way it is pointed is the whole of what it has
 * to say. 114 of Aurendel's places carry one of these.
 */
export function noticing(spec: Noticing): Record<string, unknown> {
  return {
    id: spec.id,
    mode: spec.mode ?? 'once',
    on: 'enter',
    description: spec.description,
    effects: [{ learnLore: { entry: spec.clue } }],
  };
}
