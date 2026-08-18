/**
 * The filter box, given a grammar.
 *
 * A substring match over 597 points of interest is a way of finding one thing.
 * Bulk editing needs the other question — *which* of these are undead, which
 * have no loot table, which are above level 8 — because a selection you cannot
 * describe is a selection you have to build by hand, one shift-click at a time.
 *
 * Deliberately small. Terms are separated by spaces and all of them must match;
 * there is no `or`, no parentheses, no precedence to learn. Anything that is
 * not recognised as a term is treated as text to look for, so typing a name
 * still works and nothing an author types is ever an error.
 */

export type Term =
  /** Bare text: matches the id, the name, or the description. */
  | { readonly kind: 'text'; readonly text: string }
  /** `tag:undead` — the tags list contains this. */
  | { readonly kind: 'tag'; readonly value: string }
  /** `has:loot` / `missing:loot` — the field is present and non-empty, or is not. */
  | { readonly kind: 'present'; readonly field: string; readonly want: boolean }
  /** `level>3`, `xp=0`, `kind:weapon` — compare one field. */
  | {
      readonly kind: 'compare';
      readonly field: string;
      readonly op: '=' | '!=' | '>' | '<' | '>=' | '<=';
      readonly value: string;
    };

/** `level>=3` and `kind:weapon` both land here; `:` is a friendlier `=`. */
const COMPARE = /^([A-Za-z][\w.]*)\s*(>=|<=|!=|[=><:])\s*(.*)$/;

export function parseQuery(input: string): readonly Term[] {
  const terms: Term[] = [];

  // Quoted runs stay together, so `name:"The Deep Cell"` is one term.
  const pieces = input.match(/"[^"]*"|\S+/g) ?? [];

  for (const raw of pieces) {
    const piece = raw.replace(/"/g, '');
    if (!piece) continue;

    const lower = piece.toLowerCase();
    if (lower.startsWith('tag:')) {
      terms.push({ kind: 'tag', value: piece.slice(4).toLowerCase() });
      continue;
    }
    if (lower.startsWith('has:')) {
      terms.push({ kind: 'present', field: piece.slice(4), want: true });
      continue;
    }
    if (lower.startsWith('missing:')) {
      terms.push({ kind: 'present', field: piece.slice(8), want: false });
      continue;
    }

    const match = COMPARE.exec(piece);
    if (match) {
      const [, field = '', rawOp = '=', value = ''] = match;
      if (value !== '') {
        terms.push({
          kind: 'compare',
          field,
          op: rawOp === ':' ? '=' : (rawOp as '=' | '!=' | '>' | '<' | '>=' | '<='),
          value,
        });
        continue;
      }
    }

    terms.push({ kind: 'text', text: lower });
  }

  return terms;
}

/** Read a dotted field off an entry, so `map.width` works as well as `level`. */
function fieldOf(entry: Record<string, unknown>, field: string): unknown {
  let current: unknown = entry;
  for (const segment of field.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Present *and* worth having: an empty list or a blank string is not there. */
function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function compare(value: unknown, op: string, want: string): boolean {
  const wantNumber = Number(want);
  if (typeof value === 'number' && !Number.isNaN(wantNumber)) {
    switch (op) {
      case '=':
        return value === wantNumber;
      case '!=':
        return value !== wantNumber;
      case '>':
        return value > wantNumber;
      case '<':
        return value < wantNumber;
      case '>=':
        return value >= wantNumber;
      case '<=':
        return value <= wantNumber;
    }
  }

  // Everything else compares as text, case-insensitively — an author filtering
  // for `kind:weapon` should not have to know how the value is stored.
  const text = value === undefined || value === null ? '' : String(value).toLowerCase();
  const target = want.toLowerCase();
  switch (op) {
    case '=':
      return text === target;
    case '!=':
      return text !== target;
    case '>':
      return text > target;
    case '<':
      return text < target;
    case '>=':
      return text >= target;
    case '<=':
      return text <= target;
    default:
      return false;
  }
}

export function matchesQuery(entry: Record<string, unknown>, terms: readonly Term[]): boolean {
  return terms.every((term) => {
    switch (term.kind) {
      case 'text': {
        const haystack = [entry['id'], entry['name'], entry['description']]
          .filter((v) => typeof v === 'string')
          .join(' ')
          .toLowerCase();
        return haystack.includes(term.text);
      }
      case 'tag': {
        const tags = entry['tags'];
        return Array.isArray(tags) && tags.some((t) => String(t).toLowerCase() === term.value);
      }
      case 'present':
        return isPresent(fieldOf(entry, term.field)) === term.want;
      case 'compare':
        return compare(fieldOf(entry, term.field), term.op, term.value);
    }
  });
}

/** What the box can do, for the placeholder and the help line. */
export const QUERY_HELP = 'text · tag:undead · level>3 · kind:weapon · has:loot · missing:faction';
