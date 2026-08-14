/**
 * Measuring and cutting coloured text.
 *
 * Everything drawn here may already carry colour by the time it is placed, and
 * an escape sequence occupies no columns. A pane that measured `.length` would
 * clip a red word four characters early and pad the row wrong, so width is
 * always counted on the text with its escapes stripped.
 */

// The only escapes this codebase emits are SGR colour runs, from picocolors.
const SGR = /\u001b\[[0-9;]*m/g;
const RESET = '\u001b[0m';

/** The text without its colour escapes. */
export function stripAnsi(text: string): string {
  return text.replace(SGR, '');
}

/** How many columns the text occupies once drawn. */
export function width(text: string): number {
  return stripAnsi(text).length;
}

/**
 * Clip to a column count, keeping colour intact.
 *
 * Escapes are carried through free of charge and a reset is appended when the
 * cut lands inside a coloured run, so a truncated row cannot bleed its colour
 * into the rest of the screen.
 */
export function truncate(text: string, max: number): string {
  if (max <= 0) return '';
  if (width(text) <= max) return text;

  // Its own sticky copy: `SGR` is shared with `stripAnsi`, and walking a global
  // regex by hand while another function is matching on it is a trap.
  const escape = /\u001b\[[0-9;]*m/y;

  let out = '';
  let columns = 0;
  let coloured = false;

  for (let i = 0; i < text.length;) {
    escape.lastIndex = i;
    const match = escape.exec(text);
    if (match) {
      out += match[0];
      coloured = match[0] !== RESET;
      i += match[0].length;
      continue;
    }

    if (columns >= max) break;
    out += text[i];
    columns += 1;
    i += 1;
  }

  return coloured ? out + RESET : out;
}

/** Pad to a column count, or clip to it. */
export function padTo(text: string, columns: number): string {
  const size = width(text);
  if (size > columns) return truncate(text, columns);
  return text + ' '.repeat(columns - size);
}

/** Wrap text at word boundaries, indenting continuations. */
export function wrap(text: string, max: number, indent = '  '): string {
  const words = text.split(/\s+/);
  const rows: string[] = [];
  let row = '';

  for (const word of words) {
    if (row === '') row = word;
    else if (width(`${row} ${word}`) <= max - indent.length) row += ` ${word}`;
    else {
      rows.push(row);
      row = word;
    }
  }
  if (row) rows.push(row);

  return rows.map((line) => indent + line).join('\n');
}

/** Wrap and split, for panes that place one row at a time. */
export function wrapLines(text: string, max: number, indent = '  '): string[] {
  return wrap(text, max, indent).split('\n');
}
