/**
 * Shell commands, answered once for both front ends.
 *
 * `map`, `journal`, `exits` and the rest produce a block of text that the
 * scrolling shell prints and the full-screen shell shows as a panel over the
 * map. Deciding what they say in one place is what keeps the two from drifting
 * — and the drift that matters is the silent kind, where a command works in one
 * shell and does nothing in the other.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import pc from 'picocolors';
import type { MetaCommand } from '@dm/play';
import { HELP, traderNearby, shopView } from '@dm/play';
import type { Session } from '@dm/play';
import { serialize, deserialize } from '@dm/play';
import { mapOverview, mapLegend } from '../render/map.js';
import { sheetLines, inventoryLines, shopLines } from '../render/panes.js';
import { journalLines } from '../render/journal.js';
import { exitLines } from '../render/exits.js';

export type MetaOutcome =
  | { readonly kind: 'panel'; readonly title: string; readonly lines: readonly string[] }
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'scroll'; readonly by: number }
  | { readonly kind: 'quit' };

export interface MetaContext {
  /** Columns and rows available to a panel, so the overview can scale to fit. */
  readonly width: number;
  readonly height: number;
  readonly cellWidth?: 1 | 2;
}

export function runMeta(
  session: Session,
  command: MetaCommand,
  context: MetaContext,
): MetaOutcome {
  const { module, state, terrain, seed } = session;

  switch (command.kind) {
    case 'quit':
      return { kind: 'quit' };

    case 'help':
      return { kind: 'panel', title: 'Commands', lines: HELP.split('\n') };

    case 'map': {
      // Deliberately not the viewport that is already on screen — the whole
      // map, scaled down, with a legend and the ways out of it. Reprinting the
      // viewport is why this command used to look like it did nothing.
      const options = {
        module, state, terrain,
        ...(context.cellWidth ? { cellWidth: context.cellWidth } : {}),
      };

      // Measure what goes under the map before drawing the map, so the drawing
      // gets exactly the rows that are left rather than a guessed reservation.
      const trailer = [
        ...mapLegend(options),
        '',
        ...exitLines(module, state, terrain),
      ];

      return {
        kind: 'panel',
        title: 'The map',
        lines: [
          ...mapOverview({
            ...options,
            width: context.width,
            height: Math.max(6, context.height - trailer.length - 1),
          }),
          ...trailer,
        ],
      };
    }

    case 'exits':
      return { kind: 'panel', title: 'Ways from here', lines: exitLines(module, state, terrain) };

    case 'sheet':
      return { kind: 'panel', title: 'Character', lines: sheetLines(module, state) };

    case 'inventory':
      return { kind: 'panel', title: 'Carried', lines: inventoryLines(module, state) };

    case 'shop': {
      const npc = traderNearby({ module, state });
      if (!npc) return { kind: 'note', text: pc.dim('  nobody here is trading') };
      const view = shopView(module, state, npc);
      if (!view) return { kind: 'note', text: pc.dim('  nobody here is trading') };
      return { kind: 'panel', title: view.name, lines: shopLines(view) };
    }

    case 'journal':
      return { kind: 'panel', title: 'Journal', lines: journalLines(module, state, seed) };

    case 'scroll':
      return { kind: 'scroll', by: command.by };

    case 'save':
      writeFileSync(command.path, serialize(session, 0), 'utf8');
      return { kind: 'note', text: pc.dim(`  saved to ${command.path}`) };

    case 'load':
      try {
        const error = deserialize(session, readFileSync(command.path, 'utf8'));
        return {
          kind: 'note',
          text: error ? pc.yellow(`  ${error}`) : pc.dim(`  loaded ${command.path}`),
        };
      } catch (error) {
        return { kind: 'note', text: pc.yellow(`  ${(error as Error).message}`) };
      }
  }
}
