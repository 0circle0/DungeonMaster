/**
 * The panes around the map — the terminal's rendering of them.
 *
 * Derivation lives in `@dm/play` (`statusView`, `partyView`, `sheetView`,
 * `inventoryView`), shared with the browser; this file only paints. Each pane
 * returns rows rather than a block of text, because the same rows are either
 * joined with newlines and written to a scrolling terminal or clipped into a
 * rectangle by the full-screen shell.
 */

import pc from 'picocolors';
import type { CompiledModule } from '@dm/module';
import type { GameState, Line } from '@dm/engine';
import { statusView, partyView, sheetView, inventoryView, clockOf } from '@dm/play';
import type { ShopView } from '@dm/play';
import { wrap } from './text.js';

export { clockOf };

const BAND_PAINT = {
  ok: pc.green,
  hurt: pc.yellow,
  critical: pc.red,
} as const;

/** One-line status for the selected character. */
export function statusLines(module: CompiledModule, state: GameState): string[] {
  const view = statusView(module, state);
  if (!view) return [];

  const pools = view.resources.map((pool) => {
    const label = `${pool.name} ${pool.current}/${pool.max}`;
    // Colour the vital resource by how close it is to gone.
    if (!pool.vital) return pc.dim(label);
    return BAND_PAINT[pool.band](label);
  });

  const conditions = view.conditions.join(', ');
  const turn = view.combat?.turnName ? ` — ${view.combat.turnName}'s turn` : '';
  const combat = view.combat ? pc.red(` ⚔ round ${view.combat.round}${turn}`) : '';
  const moving = view.stance ? pc.cyan(view.stance.name.toLowerCase()) : '';
  const purse = view.purse ? pc.yellow(`${view.purse.amount}${view.purse.abbrev}`) : '';

  return [[
    pc.bold(view.name),
    `L${view.level}`,
    ...pools,
    purse,
    moving,
    pc.dim(view.clock.text),
    conditions ? pc.magenta(conditions) : '',
    combat,
  ].filter(Boolean).join('  ')];
}

const KIND_STYLE: Record<Line['kind'], (text: string) => string> = {
  prose: (text) => text,
  speech: (text) => pc.italic(text),
  combat: (text) => pc.dim(text),
  system: (text) => pc.cyan(text),
  refusal: (text) => pc.yellow(text),
  note: (text) => pc.dim(text),
};

/**
 * Render narrated lines, wrapped to a comfortable width.
 *
 * Wrapping happens before colouring so the measurement sees plain text; every
 * consumer downstream measures with `width()` instead, which strips escapes.
 */
export function lineRows(lines: readonly Line[], width = 76): string[] {
  return lines.flatMap((line) =>
    wrap(line.text, width).split('\n').map((row) => KIND_STYLE[line.kind](row)));
}

/** The party roster. */
export function partyLines(module: CompiledModule, state: GameState): string[] {
  return partyView(module, state).map((member) => {
    const marker = member.selected ? pc.cyan('▸') : ' ';
    const health = member.alive
      ? `${member.vital?.current ?? 0}/${member.vital?.max ?? 0}`
      : pc.red('fallen');
    return `  ${marker} ${member.name.padEnd(12)} L${member.level}  ${health}`;
  });
}

/** The character sheet. */
export function sheetLines(module: CompiledModule, state: GameState): string[] {
  const view = sheetView(module, state);
  if (!view) return [];

  const attributes = view.attributes
    .map((attribute) =>
      `${attribute.abbrev} ${String(attribute.score).padStart(2)} `
      + `(${attribute.modifier >= 0 ? '+' : ''}${attribute.modifier})`)
    .join('   ');

  const derived = view.derived.map((stat) => `${stat.name} ${stat.value}`).join('   ');
  const abilities = view.abilities.map((ability) => ability.name).join(', ');
  const skills = view.skills.map((skill) => `${skill.name} ${skill.rank}`).join(', ');

  return [
    `  ${pc.bold(view.name)} — level ${view.level}, ${view.xp} xp`,
    `  ${attributes}`,
    derived ? `  ${derived}` : '',
    abilities ? `  ${pc.dim('Abilities:')} ${abilities}` : '',
    skills ? `  ${pc.dim('Skills:')} ${skills}` : '',
  ].filter(Boolean);
}

/** Carried items. */
export function inventoryLines(module: CompiledModule, state: GameState): string[] {
  const carried = inventoryView(module, state);
  if (carried.length === 0) return [pc.dim('  (carrying nothing)')];

  return carried.map((item) =>
    `  ${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}`);
}

/**
 * A shopkeeper's counter.
 *
 * Prices on the right, the purse at the bottom, and — when they will not deal
 * with you — the reason instead of an empty shelf.
 */
export function shopLines(view: ShopView): string[] {
  const out: string[] = [];
  const coin = (n: number) => `${n}${view.currency.abbrev}`;

  if (view.barred) {
    out.push(pc.yellow(`  ${view.name} will not deal with you.`));
    for (const need of view.requires) out.push(pc.dim(`    needs ${need}`));
    out.push('', pc.dim(`  purse: ${coin(view.purse)}`));
    return out;
  }

  out.push(pc.bold('  For sale'));
  if (view.stock.length === 0) out.push(pc.dim('    (nothing today)'));
  for (const entry of view.stock) {
    const many = entry.quantity > 1 ? pc.dim(` ×${entry.quantity}`) : '';
    out.push(`    ${entry.name}${many}  ${pc.dim(coin(entry.price))}`);
  }

  out.push('', pc.bold('  They will buy'));
  if (view.sellable.length === 0) out.push(pc.dim('    (nothing you are carrying)'));
  for (const entry of view.sellable) {
    const many = entry.quantity > 1 ? pc.dim(` ×${entry.quantity}`) : '';
    out.push(`    ${entry.name}${many}  ${pc.dim(coin(entry.price))}`);
  }

  out.push('', pc.dim(`  purse: ${coin(view.purse)}`));
  return out;
}
