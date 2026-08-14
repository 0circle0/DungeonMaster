/**
 * The full-screen shell.
 *
 * Composes the same pure pane functions the scrolling shell uses into a fixed
 * layout, and repaints once per submitted line. That "once per line" is the
 * decision the whole file rests on: the game is turn-based, so readline can
 * stay in ordinary cooked mode with its line editing and history intact, and
 * this never has to fight it for stdin. The cost is no arrow-key movement,
 * which a turn-based game does not need.
 */

import pc from 'picocolors';
import type { CompiledModule } from '@dm/module';
import type { GameState, Line } from '@dm/engine';
import type { TerrainIndex } from '@dm/engine';
import { Screen } from './screen.js';
import { layout, MIN_COLUMNS, MIN_ROWS } from './layout.js';
import type { Layout } from './layout.js';
import { mapLines, mapHeader, mapLegend } from '../render/map.js';
import { statusLines, lineRows, partyLines } from '../render/panes.js';
import { objectiveLine } from '../render/journal.js';
import { padTo, truncate, width } from '../render/text.js';

export interface Frame {
  readonly module: CompiledModule;
  readonly state: GameState;
  readonly terrain: TerrainIndex;
  readonly seed: number;
  /** Everything narrated so far. */
  readonly transcript: readonly Line[];
  /** How far back through the transcript the player has scrolled. */
  readonly scroll: number;
  /** A panel taking over the map — the journal, the sheet, the overview. */
  readonly panel: { readonly title: string; readonly lines: readonly string[] } | null;
  /** Numbered replies while a conversation is open. */
  readonly options: readonly string[];
}

export class Tui {
  private readonly screen: Screen;
  private current: Layout;

  constructor(screen = new Screen()) {
    this.screen = screen;
    this.current = layout(screen.columns, screen.rows);
  }

  get layout(): Layout { return this.current; }

  /** Whether this terminal is worth taking over at all. */
  static fits(columns: number, rows: number): boolean {
    return columns >= MIN_COLUMNS && rows >= MIN_ROWS;
  }

  start(): void {
    this.screen.enter();
  }

  stop(): void {
    this.screen.restore();
  }

  /** Recompute for a resized terminal, and force a full repaint. */
  resize(): void {
    this.current = layout(this.screen.columns, this.screen.rows);
    this.screen.invalidate();
  }

  /** How many transcript rows are on screen, for paging. */
  logHeight(): number {
    return Math.max(1, this.current.log.height - 1);
  }

  /** How many rows a transcript takes once wrapped to the log's width. */
  transcriptHeight(transcript: readonly Line[]): number {
    return lineRows(transcript, Math.max(20, this.current.log.width - 2)).length;
  }

  draw(frame: Frame): void {
    this.current = layout(this.screen.columns, this.screen.rows);
    const view = this.current;

    if (!view.usable) {
      const notice = `terminal too small — needs ${MIN_COLUMNS}x${MIN_ROWS}, `
        + `has ${view.columns}x${view.rows}`;
      this.screen.paint([notice], view.rows - 1);
      return;
    }

    const rows: string[] = new Array<string>(view.rows - 1).fill('');
    const put = (row: number, text: string): void => {
      if (row >= 0 && row < rows.length) rows[row] = text;
    };

    // — the map, and the pane beside it ————————————————————
    // A panel takes the whole width: it is what the player asked to look at,
    // and squeezing an overview of a map into two thirds of the screen is how
    // `map` ends up telling you less than the map already on screen did.
    const panelWidth = view.columns;

    const mapBlock = frame.panel
      ? [...frame.panel.lines]
      : mapLines({
        module: frame.module, state: frame.state, terrain: frame.terrain,
        viewport: view.viewport, cellWidth: view.cellWidth,
      });

    put(view.header.y, frame.panel
      ? `  ${pc.bold(frame.panel.title)}${pc.dim('   — any command returns to the map')}`
      : truncate(mapHeader(frame.module, frame.state), view.header.width));

    const bodyWidth = frame.panel ? panelWidth : view.map.width;
    for (let index = 0; index < view.map.height; index += 1) {
      put(view.map.y + index, truncate(mapBlock[index] ?? '', bodyWidth));
    }

    if (view.side.width > 0 && !frame.panel) {
      const column = this.sidePane(frame, view);
      for (let index = 0; index < view.side.height; index += 1) {
        const existing = rows[view.side.y + index] ?? '';
        const text = truncate(column[index] ?? '', view.side.width - 2);
        put(view.side.y + index, padTo(existing, view.side.x) + pc.dim('│ ') + text);
      }
    }

    // — the transcript ————————————————————————————————————
    const log = this.logPane(frame, view);
    put(view.log.y, pc.dim(`  ${'─'.repeat(Math.max(0, view.columns - 4))}`));
    for (let index = 0; index < view.log.height - 1; index += 1) {
      put(view.log.y + 1 + index, truncate(log[index] ?? '', view.log.width));
    }

    // — the one line that says how everyone is doing ———————
    const status = statusLines(frame.module, frame.state)[0] ?? '';
    const objective = view.side.width > 0 ? '' : objectiveLine(frame.module, frame.state);
    const together = objective
      ? `${status}  ${pc.dim('│')}  ${objective}`
      : status;
    put(view.status.y, `  ${truncate(together, view.status.width - 2)}`);

    this.screen.paint(rows, view.promptRow);
  }

  /** Party, what they are doing, and what the glyphs mean. */
  private sidePane(frame: Frame, view: Layout): string[] {
    const inner = view.side.width - 2;
    const out: string[] = [];

    out.push(pc.dim('Party'));
    for (const member of partyLines(frame.module, frame.state)) out.push(member.slice(2));

    const objective = objectiveLine(frame.module, frame.state);
    if (objective) {
      out.push('', pc.dim('Doing'));
      out.push(...wrapPlain(objective, inner));
    }

    // The legend goes last and only if there is room left for it — knowing who
    // is hurt matters more than being reminded what `.` means.
    const legend = mapLegend({
      module: frame.module, state: frame.state, terrain: frame.terrain,
      viewport: view.viewport,
    });
    const spare = view.side.height - out.length - 2;
    if (spare > 1 && legend.length > 0) {
      out.push('', pc.dim('Map'));
      for (const row of legend) {
        for (const entry of row.trim().split('   ')) {
          if (out.length >= view.side.height) break;
          out.push(entry);
        }
      }
    }

    return out;
  }

  /** The tail of the transcript, plus any replies on offer. */
  private logPane(frame: Frame, view: Layout): string[] {
    const wrapped = lineRows(frame.transcript, view.log.width - 2);
    const replies = frame.options.map((text, index) => `  ${pc.cyan(`${index + 1}.`)} ${text}`);

    const all = [...wrapped, ...replies];
    const height = view.log.height - 1;

    if (frame.scroll <= 0) return all.slice(Math.max(0, all.length - height));

    // Scrolled back, so one row goes to saying so — and the window shrinks by
    // that row rather than hiding a line of transcript underneath the notice.
    const body = Math.max(1, height - 1);
    const end = Math.max(body, all.length - frame.scroll);
    return [
      pc.dim(`  ↑ scrolled back — "scroll down" for the newest`),
      ...all.slice(Math.max(0, end - body), end),
    ];
  }
}

/** Wrap uncoloured-ish text to a width, measuring what is actually drawn. */
function wrapPlain(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let row = '';

  for (const word of words) {
    if (row === '') row = word;
    else if (width(`${row} ${word}`) <= max) row += ` ${word}`;
    else { out.push(row); row = word; }
  }
  if (row) out.push(row);
  return out;
}
