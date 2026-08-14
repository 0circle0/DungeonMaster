/**
 * The terminal, taken over and given back.
 *
 * Eight escape sequences and a row cache, hand-rolled rather than pulled in:
 * `ink` wants to own the render loop, which is exactly the thing that would
 * stop `render/` staying a set of pure functions shared with the scrolling
 * shell. Forty lines of escape codes is the smaller object.
 *
 * The one part that has to be right is {@link Screen.restore}. A crash that
 * leaves somebody in the alternate buffer with a hidden cursor is the worst
 * failure this file can have, so every way a process can end is wired to it and
 * the handler is idempotent.
 */

const ESC = '\u001b[';
const ENTER_ALT = `${ESC}?1049h`;
const LEAVE_ALT = `${ESC}?1049l`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const RESET = `${ESC}0m`;
const CLEAR_ALL = `${ESC}2J`;

/** Move the cursor. Both are 1-based, as the terminal counts them. */
const cursorTo = (row: number, column: number): string => `${ESC}${row};${column}H`;
/** Clear from the cursor to the end of the line. */
const CLEAR_LINE = `${ESC}0K`;

export class Screen {
  private readonly out: NodeJS.WriteStream;
  private previous: string[] = [];
  private restored = false;
  private entered = false;

  constructor(out: NodeJS.WriteStream = process.stdout) {
    this.out = out;
  }

  get columns(): number { return this.out.columns ?? 80; }
  get rows(): number { return this.out.rows ?? 24; }

  /** Take the screen, and arrange to give it back however this ends. */
  enter(): void {
    if (this.entered) return;
    this.entered = true;
    this.out.write(ENTER_ALT + HIDE_CURSOR + CLEAR_ALL);

    const give = (): void => this.restore();
    process.on('exit', give);
    // Each signal is handled by name rather than left to the default: an
    // unhandled SIGINT terminates the process *without* running `exit`
    // handlers, which is precisely the case that strands somebody in the
    // alternate buffer with no cursor.
    process.on('SIGINT', () => { this.restore(); process.exit(130); });
    process.on('SIGTERM', () => { this.restore(); process.exit(143); });
    process.on('SIGHUP', () => { this.restore(); process.exit(129); });
    process.on('uncaughtException', (error: unknown) => {
      this.restore();
      process.stderr.write(`${(error as Error)?.stack ?? String(error)}\n`);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason: unknown) => {
      this.restore();
      process.stderr.write(`${String(reason)}\n`);
      process.exit(1);
    });
  }

  /**
   * Give the terminal back.
   *
   * Guarded rather than counted: this runs from `exit`, from signal handlers,
   * and from the normal path, and all of those can happen in one shutdown.
   */
  restore(): void {
    if (this.restored || !this.entered) return;
    this.restored = true;
    this.out.write(SHOW_CURSOR + RESET + LEAVE_ALT);
  }

  /** Throw away the cached frame, so the next paint rewrites every row. */
  invalidate(): void {
    this.previous = [];
    if (this.entered) this.out.write(CLEAR_ALL);
  }

  /**
   * Paint a frame.
   *
   * Only rows that actually changed are rewritten, which is what keeps a
   * redraw from flickering. The prompt row is never touched — readline owns it,
   * and painting over it would fight the line editor for the cursor.
   */
  paint(rows: readonly string[], promptRow: number): void {
    if (!this.entered) return;

    let frame = '';
    for (let index = 0; index < rows.length; index += 1) {
      const row = index + 1;
      if (row >= promptRow + 1) break;

      const line = rows[index] ?? '';
      if (this.previous[index] === line) continue;
      frame += cursorTo(row, 1) + CLEAR_LINE + line;
    }

    // Rows the frame no longer reaches — the screen grew shorter, or a pane did.
    for (let index = rows.length; index < this.previous.length; index += 1) {
      const row = index + 1;
      if (row >= promptRow + 1) break;
      frame += cursorTo(row, 1) + CLEAR_LINE;
    }

    if (frame) this.out.write(frame);
    this.previous = [...rows];

    // Leave the cursor where readline is about to draw. `rl.prompt` writes at
    // the cursor rather than at any particular row, so without this the prompt
    // lands on the end of whatever was painted last and eats it.
    this.out.write(cursorTo(promptRow + 1, 1) + CLEAR_LINE);
  }
}
