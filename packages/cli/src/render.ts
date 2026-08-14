/**
 * Drawing the game.
 *
 * Every pane lives in `render/` and produces rows — one string per screen line.
 * That single shape is the seam between the two front ends: the scrolling shell
 * joins the rows with newlines and writes them, while the full-screen shell
 * clips them into a rectangle. Neither one formats anything itself, so they
 * cannot drift apart.
 *
 * The functions here are the joined-string form, kept because that is what a
 * scrolling terminal wants and what the tests were written against.
 */

import type { CompiledModule } from '@dm/module';
import type { GameState, Line } from '@dm/engine';
import { mapLines } from './render/map.js';
import type { RenderOptions } from './render/map.js';
import {
  statusLines, lineRows, partyLines, sheetLines, inventoryLines,
} from './render/panes.js';
import { journalLines } from './render/journal.js';

export type { RenderOptions };
export { mapLines } from './render/map.js';
export {
  statusLines, lineRows, partyLines, sheetLines, inventoryLines, clockOf,
} from './render/panes.js';
export { journalLines, objectiveLine } from './render/journal.js';
export { exitLines } from './render/exits.js';
export { wrap, wrapLines, stripAnsi, width, truncate, padTo } from './render/text.js';

/** Draw the current map. */
export function renderMap(options: RenderOptions): string {
  return mapLines(options).join('\n');
}

/** One-line status for the selected character. */
export function renderStatus(module: CompiledModule, state: GameState): string {
  return statusLines(module, state).join('\n');
}

/** Render narrated lines, wrapped to a comfortable width. */
export function renderLines(lines: readonly Line[], width = 76): string {
  return lineRows(lines, width).join('\n');
}

/** The party roster. */
export function renderParty(module: CompiledModule, state: GameState): string {
  return partyLines(module, state).join('\n');
}

/** The character sheet. */
export function renderSheet(module: CompiledModule, state: GameState): string {
  return sheetLines(module, state).join('\n');
}

/** Carried items. */
export function renderInventory(module: CompiledModule, state: GameState): string {
  return inventoryLines(module, state).join('\n');
}

/** Active and finished quests. */
export function renderJournal(module: CompiledModule, state: GameState, seed = 0): string {
  return journalLines(module, state, seed).join('\n');
}
