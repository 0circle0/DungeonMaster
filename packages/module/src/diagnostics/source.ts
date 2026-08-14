/**
 * JSON with source positions.
 *
 * A module is hand-edited JSON, so "`content.monsters[2].loot` does not exist"
 * is only half an answer — the author still has to find it. This parses a
 * document while recording where every value came from, so a diagnostic can say
 * *line 214, column 9* and print the offending line with a caret under it.
 *
 * It also reports syntax errors properly. `JSON.parse` gives one terse message;
 * this reports the position, what it expected, and — for the classic cases of a
 * missing brace, a trailing comma, or a single quote — what to do about it.
 */

export interface Position {
  /** 1-based, for display. */
  readonly line: number;
  readonly column: number;
  /** 0-based index into the source text. */
  readonly offset: number;
}

export interface Span {
  readonly start: Position;
  readonly end: Position;
}

export class JsonSyntaxError extends Error {
  readonly position: Position;
  readonly hint: string | null;

  constructor(message: string, position: Position, hint: string | null = null) {
    super(message);
    this.name = 'JsonSyntaxError';
    this.position = position;
    this.hint = hint;
  }
}

/** A parsed document plus a path → span index. */
export interface ParsedSource {
  readonly value: unknown;
  readonly text: string;
  /** Keyed by dotted path, e.g. `content.monsters.2.loot`. */
  readonly spans: ReadonlyMap<string, Span>;
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

class Reader {
  private index = 0;
  private line = 1;
  private lineStart = 0;
  readonly spans = new Map<string, Span>();

  constructor(private readonly text: string) {}

  get position(): Position {
    return { line: this.line, column: this.index - this.lineStart + 1, offset: this.index };
  }

  /**
   * Deliberately a method rather than a getter: TypeScript narrows a getter and
   * keeps that narrowing across `parseString()`, which advances the cursor —
   * producing a false "these types have no overlap" error.
   */
  private peek(): string | undefined {
    return this.text[this.index];
  }

  private advance(): string {
    const char = this.text[this.index]!;
    this.index += 1;
    if (char === '\n') {
      this.line += 1;
      this.lineStart = this.index;
    }
    return char;
  }

  private fail(message: string, hint: string | null = null): never {
    throw new JsonSyntaxError(message, this.position, hint);
  }

  skipWhitespace(): void {
    while (this.index < this.text.length) {
      const char = this.peek()!;
      if (WHITESPACE.has(char)) {
        this.advance();
        continue;
      }
      // Comments are not JSON, but authors write them constantly, so say so
      // rather than reporting a baffling "unexpected /".
      if (char === '/' && (this.text[this.index + 1] === '/' || this.text[this.index + 1] === '*')) {
        this.fail('comments are not allowed in JSON', 'remove the comment, or move it into a "description" field');
      }
      return;
    }
  }

  parseDocument(): unknown {
    this.skipWhitespace();
    const value = this.parseValue('');
    this.skipWhitespace();
    if (this.index < this.text.length) {
      this.fail(`unexpected ${JSON.stringify(this.peek())} after the end of the document`);
    }
    return value;
  }

  private record(path: string, start: Position): void {
    this.spans.set(path, { start, end: this.position });
  }

  parseValue(path: string): unknown {
    this.skipWhitespace();
    const start = this.position;

    if (this.index >= this.text.length) this.fail('unexpected end of file');

    const char = this.peek()!;
    let value: unknown;

    switch (char) {
      case '{':
        value = this.parseObject(path);
        break;
      case '[':
        value = this.parseArray(path);
        break;
      case '"':
        value = this.parseString();
        break;
      case "'":
        this.fail('strings must use double quotes', 'replace the single quotes with "');
        break;
      default:
        value = this.parseLiteral();
    }

    this.record(path, start);
    return value;
  }

  private parseObject(path: string): Record<string, unknown> {
    const open = this.position;
    this.advance(); // {
    const out: Record<string, unknown> = {};

    this.skipWhitespace();
    if (this.peek() === '}') {
      this.advance();
      return out;
    }

    for (;;) {
      this.skipWhitespace();

      if (this.peek() === '}') {
        this.fail(
          'trailing comma before }',
          'JSON does not allow a comma after the last property',
        );
      }
      if (this.index >= this.text.length) {
        throw new JsonSyntaxError(
          'unexpected end of file: this object is never closed',
          open,
          'add a matching }',
        );
      }
      if (this.peek() === "'") {
        this.fail(
          'property names must use double quotes, not single quotes',
          `write "name": instead of 'name':`,
        );
      }
      if (this.peek() !== '"') {
        this.fail(
          `expected a quoted property name, found ${JSON.stringify(this.peek() ?? '<eof>')}`,
          'property names must be wrapped in double quotes',
        );
      }

      const keyStart = this.position;
      const key = this.parseString();
      const childPath = path ? `${path}.${key}` : key;

      this.skipWhitespace();
      if (this.peek() !== ':') {
        this.fail(`expected ":" after property "${key}"`);
      }
      this.advance();

      out[key] = this.parseValue(childPath);
      // Record the key's own position too, so "unknown property" can point at
      // the name rather than at its value.
      this.spans.set(`${childPath}#key`, { start: keyStart, end: this.position });

      this.skipWhitespace();
      if (this.peek() === ',') {
        this.advance();
        continue;
      }
      if (this.peek() === '}') {
        this.advance();
        return out;
      }
      if (this.index >= this.text.length) {
        throw new JsonSyntaxError(
          'unexpected end of file: this object is never closed',
          open,
          'add a matching }',
        );
      }
      this.fail(
        `expected "," or "}" after the value of "${key}", found ${JSON.stringify(this.peek())}`,
        'a comma is probably missing',
      );
    }
  }

  private parseArray(path: string): unknown[] {
    const open = this.position;
    this.advance(); // [
    const out: unknown[] = [];

    this.skipWhitespace();
    if (this.peek() === ']') {
      this.advance();
      return out;
    }

    for (;;) {
      this.skipWhitespace();
      if (this.peek() === ']') {
        this.fail('trailing comma before ]', 'JSON does not allow a comma after the last element');
      }
      if (this.index >= this.text.length) {
        throw new JsonSyntaxError(
          'unexpected end of file: this array is never closed',
          open,
          'add a matching ]',
        );
      }

      out.push(this.parseValue(`${path}.${out.length}`));

      this.skipWhitespace();
      if (this.peek() === ',') {
        this.advance();
        continue;
      }
      if (this.peek() === ']') {
        this.advance();
        return out;
      }
      if (this.index >= this.text.length) {
        throw new JsonSyntaxError(
          'unexpected end of file: this array is never closed',
          open,
          'add a matching ]',
        );
      }
      this.fail(
        `expected "," or "]", found ${JSON.stringify(this.peek())}`,
        'a comma is probably missing',
      );
    }
  }

  private parseString(): string {
    this.advance(); // opening quote
    let out = '';

    for (;;) {
      if (this.index >= this.text.length) {
        this.fail('unexpected end of file inside a string', 'add a closing "');
      }
      const char = this.advance();

      if (char === '"') return out;

      if (char === '\n') {
        this.fail('a string cannot span lines', 'use \\n for a line break');
      }

      if (char === '\\') {
        const escape = this.advance();
        switch (escape) {
          case '"': out += '"'; break;
          case '\\': out += '\\'; break;
          case '/': out += '/'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const hex = this.text.slice(this.index, this.index + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              this.fail(`invalid unicode escape \\u${hex}`);
            }
            for (let i = 0; i < 4; i += 1) this.advance();
            out += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          default:
            this.fail(`invalid escape \\${escape}`, 'a backslash in text must be written \\\\');
        }
        continue;
      }

      out += char;
    }
  }

  private parseLiteral(): unknown {
    const start = this.index;
    while (this.index < this.text.length && /[^\s,\]}]/.test(this.peek()!)) this.advance();
    const raw = this.text.slice(start, this.index);

    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;

    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return Number(raw);

    if (raw === '') this.fail('expected a value');
    if (/^[A-Za-z_]/.test(raw)) {
      throw new JsonSyntaxError(
        `${JSON.stringify(raw)} is not valid JSON`,
        { line: this.line, column: start - this.lineStart + 1, offset: start },
        'text values must be wrapped in double quotes',
      );
    }
    throw new JsonSyntaxError(
      `${JSON.stringify(raw)} is not a valid number`,
      { line: this.line, column: start - this.lineStart + 1, offset: start },
      null,
    );
  }
}

/** Parse JSON, recording a span for every value. Throws {@link JsonSyntaxError}. */
export function parseJsonWithSource(text: string): ParsedSource {
  const reader = new Reader(text);
  const value = reader.parseDocument();
  return { value, text, spans: reader.spans };
}

/** Convert a 0-based offset to a line and column. */
export function positionAt(text: string, offset: number): Position {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1, offset };
}

/**
 * Render the offending line with a caret, the way a compiler would.
 *
 * Seeing the actual line is most of what makes an error easy to fix.
 */
export function excerpt(text: string, position: Position, contextLines = 1): string {
  const lines = text.split('\n');
  const from = Math.max(0, position.line - 1 - contextLines);
  const to = Math.min(lines.length, position.line + contextLines);
  const width = String(to).length;
  const out: string[] = [];

  for (let i = from; i < to; i += 1) {
    const number = String(i + 1).padStart(width, ' ');
    out.push(`${number} | ${lines[i] ?? ''}`);
    if (i + 1 === position.line) {
      out.push(`${' '.repeat(width)} | ${' '.repeat(Math.max(0, position.column - 1))}^`);
    }
  }
  return out.join('\n');
}
