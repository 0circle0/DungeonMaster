/**
 * Dice notation: parsing and rolling.
 *
 * Grammar (whitespace insensitive, case insensitive):
 *
 *   expr  := term (('+' | '-') term)*
 *   term  := dice | integer
 *   dice  := [count] 'd' sides [keep]
 *   keep  := ('kh' | 'kl') [n]        keep highest / lowest n, default 1
 *
 * Examples: `1d20`, `d6`, `2d6+3`, `4d6kh3`, `2d20kh1` (advantage), `1d8+1d4-1`.
 *
 * Parsing is separated from rolling so content can be validated at load time —
 * a typo in a monster's damage string is a load error, not a crash mid-combat.
 * Rolls return every individual face because the combat log narrates them.
 */

export interface DiceTerm {
  readonly kind: 'dice';
  readonly count: number;
  readonly sides: number;
  /** Keep the highest or lowest `keepCount` dice; null keeps all of them. */
  readonly keep: { readonly mode: 'highest' | 'lowest'; readonly count: number } | null;
  /** -1 when the term was subtracted. */
  readonly sign: 1 | -1;
}

export interface ConstantTerm {
  readonly kind: 'constant';
  readonly value: number;
  readonly sign: 1 | -1;
}

export type Term = DiceTerm | ConstantTerm;

export interface DiceExpr {
  readonly source: string;
  readonly terms: readonly Term[];
}

/** One die's outcome, including dice dropped by a keep clause. */
export interface DieRoll {
  readonly sides: number;
  readonly value: number;
  readonly dropped: boolean;
}

export interface RollResult {
  readonly total: number;
  readonly dice: readonly DieRoll[];
  /** Sum of the constant terms, for rendering "17 (14 + 3)". */
  readonly modifier: number;
  readonly expr: DiceExpr;
}

export class DiceParseError extends Error {
  constructor(source: string, reason: string) {
    super(`Invalid dice notation ${JSON.stringify(source)}: ${reason}`);
    this.name = 'DiceParseError';
  }
}

/** Guard rails against content that would hang or overflow the roller. */
const MAX_COUNT = 1000;
const MAX_SIDES = 1_000_000;

const TERM_RE = /^(\d*)d(\d+)(?:k([hl])(\d*))?$/;

/**
 * Parse dice notation into a reusable expression.
 * Throws {@link DiceParseError} on malformed input.
 */
export function parseDice(source: string): DiceExpr {
  const cleaned = source.replace(/\s+/g, '').toLowerCase();
  if (cleaned === '') throw new DiceParseError(source, 'expression is empty');

  // Split on +/- while keeping the operators. A leading sign is allowed.
  const pieces = cleaned.split(/(?=[+-])/);
  const terms: Term[] = [];

  for (const piece of pieces) {
    let sign: 1 | -1 = 1;
    let body = piece;
    if (body.startsWith('+')) body = body.slice(1);
    else if (body.startsWith('-')) {
      sign = -1;
      body = body.slice(1);
    }

    if (body === '') throw new DiceParseError(source, 'dangling operator');

    if (/^\d+$/.test(body)) {
      terms.push({ kind: 'constant', value: Number(body), sign });
      continue;
    }

    const m = TERM_RE.exec(body);
    if (!m) throw new DiceParseError(source, `cannot parse term ${JSON.stringify(body)}`);

    const count = m[1] === '' ? 1 : Number(m[1]);
    const sides = Number(m[2]);

    if (count < 1) throw new DiceParseError(source, 'die count must be at least 1');
    if (count > MAX_COUNT) throw new DiceParseError(source, `die count ${count} exceeds ${MAX_COUNT}`);
    if (sides < 1) throw new DiceParseError(source, 'a die needs at least 1 side');
    if (sides > MAX_SIDES) throw new DiceParseError(source, `die size ${sides} exceeds ${MAX_SIDES}`);

    let keep: DiceTerm['keep'] = null;
    if (m[3] !== undefined) {
      const keepCount = m[4] === '' || m[4] === undefined ? 1 : Number(m[4]);
      if (keepCount < 1) throw new DiceParseError(source, 'keep count must be at least 1');
      if (keepCount > count) {
        throw new DiceParseError(source, `cannot keep ${keepCount} of ${count} dice`);
      }
      keep = { mode: m[3] === 'h' ? 'highest' : 'lowest', count: keepCount };
    }

    terms.push({ kind: 'dice', count, sides, keep, sign });
  }

  return { source, terms };
}

/** Minimal RNG surface the roller needs, so callers can pass any compatible generator. */
export interface DiceRng {
  nextInt(min: number, max: number): number;
}

/** Roll a parsed expression. */
export function rollDice(expr: DiceExpr, rng: DiceRng): RollResult {
  const dice: DieRoll[] = [];
  let total = 0;
  let modifier = 0;

  for (const term of expr.terms) {
    if (term.kind === 'constant') {
      modifier += term.sign * term.value;
      total += term.sign * term.value;
      continue;
    }

    const rolled: number[] = [];
    for (let i = 0; i < term.count; i++) rolled.push(rng.nextInt(1, term.sides));

    let keptIndices: Set<number> | null = null;
    if (term.keep) {
      // Sort indices by value, stable on index so ties drop deterministically.
      const order = rolled
        .map((value, index) => ({ value, index }))
        .sort((a, b) => (a.value === b.value ? a.index - b.index : b.value - a.value));
      const slice = term.keep.mode === 'highest'
        ? order.slice(0, term.keep.count)
        : order.slice(order.length - term.keep.count);
      keptIndices = new Set(slice.map((e) => e.index));
    }

    rolled.forEach((value, index) => {
      const dropped = keptIndices !== null && !keptIndices.has(index);
      dice.push({ sides: term.sides, value, dropped });
      if (!dropped) total += term.sign * value;
    });
  }

  return { total, dice, modifier, expr };
}

/** Convenience: parse and roll in one step. Prefer caching the parse in hot paths. */
export function roll(source: string, rng: DiceRng): RollResult {
  return rollDice(parseDice(source), rng);
}

/** Lowest possible total. Used to sanity-check content and to bound AI search. */
export function minRoll(expr: DiceExpr): number {
  return boundRoll(expr, 'min');
}

/** Highest possible total. */
export function maxRoll(expr: DiceExpr): number {
  return boundRoll(expr, 'max');
}

function boundRoll(expr: DiceExpr, bound: 'min' | 'max'): number {
  let total = 0;
  for (const term of expr.terms) {
    if (term.kind === 'constant') {
      total += term.sign * term.value;
      continue;
    }
    const kept = term.keep ? term.keep.count : term.count;
    const perDie = bound === 'min' ? 1 : term.sides;
    // A negated term inverts which extreme produces the bound.
    const extreme = term.sign === 1 ? perDie : (bound === 'min' ? term.sides : 1);
    total += term.sign * kept * extreme;
  }
  return total;
}

/** Mean total, for content balance tooling. */
export function averageRoll(expr: DiceExpr): number {
  let total = 0;
  for (const term of expr.terms) {
    if (term.kind === 'constant') {
      total += term.sign * term.value;
      continue;
    }
    if (!term.keep) {
      total += term.sign * term.count * ((term.sides + 1) / 2);
    } else {
      // No closed form worth the complexity here; order statistics are
      // approximated well enough for balance tooling by scaling the mean.
      const mean = (term.sides + 1) / 2;
      const spread = (term.sides - 1) / 2;
      const bias = term.keep.mode === 'highest' ? 1 : -1;
      const drops = term.count - term.keep.count;
      const shift = drops === 0 ? 0 : bias * spread * (drops / (term.count + 1));
      total += term.sign * term.keep.count * (mean + shift);
    }
  }
  return total;
}
