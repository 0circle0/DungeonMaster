/**
 * The layout is pure so that it can be tested at sizes nobody will remember to
 * try by hand. Panes overlapping, or a row painted over the prompt, is the kind
 * of bug that only shows up in one window size.
 */

import { describe, it, expect } from 'vitest';
import { layout, MIN_COLUMNS, MIN_ROWS } from './layout.js';

const SIZES: readonly (readonly [number, number])[] = [
  [80, 24], [120, 40], [100, 30], [60, 20], [200, 60], [89, 24],
];

describe('the screen layout', () => {
  it('refuses a terminal too small to be worth taking over', () => {
    expect(layout(MIN_COLUMNS - 1, MIN_ROWS).usable).toBe(false);
    expect(layout(MIN_COLUMNS, MIN_ROWS - 1).usable).toBe(false);
    expect(layout(MIN_COLUMNS, MIN_ROWS).usable).toBe(true);
  });

  it('never paints over the row readline owns', () => {
    for (const [columns, rows] of SIZES) {
      const view = layout(columns, rows);
      expect(view.promptRow, `${columns}x${rows}`).toBe(rows - 1);
      for (const pane of [view.header, view.map, view.side, view.log, view.status]) {
        expect(pane.y + pane.height, `${columns}x${rows}`).toBeLessThanOrEqual(view.promptRow);
      }
    }
  });

  it('stacks its panes without gaps or overlap', () => {
    for (const [columns, rows] of SIZES) {
      const view = layout(columns, rows);
      expect(view.map.y, `${columns}x${rows}`).toBe(view.header.y + view.header.height);
      expect(view.log.y, `${columns}x${rows}`).toBe(view.map.y + view.map.height);
      expect(view.status.y, `${columns}x${rows}`).toBe(view.log.y + view.log.height);
      expect(view.status.y + view.status.height).toBe(view.promptRow);
    }
  });

  it('keeps every pane inside the terminal', () => {
    for (const [columns, rows] of SIZES) {
      const view = layout(columns, rows);
      for (const pane of [view.header, view.map, view.side, view.log, view.status]) {
        expect(pane.x + pane.width, `${columns}x${rows}`).toBeLessThanOrEqual(columns);
        expect(pane.height).toBeGreaterThanOrEqual(0);
      }
      expect(view.map.width + view.side.width).toBe(columns);
    }
  });

  // Two cramped columns are worse than one good one, so the side pane folds
  // away rather than shrinking indefinitely.
  it('folds the side pane away on a narrow terminal', () => {
    expect(layout(80, 24).side.width).toBe(0);
    expect(layout(120, 40).side.width).toBeGreaterThan(0);
  });

  it('gives the map a viewport that fits the space it has', () => {
    for (const [columns, rows] of SIZES) {
      const view = layout(columns, rows);
      expect(view.viewport.width * view.cellWidth, `${columns}x${rows}`)
        .toBeLessThanOrEqual(view.map.width);
      expect(view.viewport.height).toBe(view.map.height);
      expect(view.viewport.width).toBeGreaterThan(0);
      expect(view.viewport.height).toBeGreaterThan(0);
    }
  });

  // A terminal cell is about twice as tall as it is wide, so single-width tiles
  // draw a squashed map — but only take the second column when there is room.
  it('uses square tiles when there is width for them', () => {
    expect(layout(200, 60).cellWidth).toBe(2);
    expect(layout(60, 20).cellWidth).toBe(1);
  });
});
