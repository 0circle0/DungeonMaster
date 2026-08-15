/**
 * Where you can go from here — the terminal's rendering of it.
 *
 * All derivation lives in `@dm/play`'s `waysFromHere`, shared with the browser
 * front end; this file only paints. If the two shells ever disagree about what
 * an exit is, the bug is there, once, not here twice.
 */

import pc from 'picocolors';
import type { CompiledModule } from '@dm/module';
import type { GameState, TerrainIndex } from '@dm/engine';
import { waysFromHere, duration } from '@dm/play';

/** Roads, places, and — in a maze — which way is still unwalked. */
export function exitLines(
  module: CompiledModule,
  state: GameState,
  terrain: TerrainIndex,
): string[] {
  const ways = waysFromHere(module, state, terrain);
  const out: string[] = [];

  // "(barred)" with no reason is the least useful thing this panel can say —
  // the derivation already carries what it would take, so print it. A toll the
  // party can afford should read as a price, not as a wall.
  const bar = (barred: boolean, requires: readonly string[]) =>
    barred ? pc.yellow(`  (${requires.length > 0 ? requires.join(', ') : 'barred'})`) : '';

  if (ways.places.length > 0) {
    out.push(pc.dim('  Here'));
    for (const place of ways.places) {
      const away = duration(place.travelMinutes);
      const locked = bar(place.barred, place.requires);
      out.push(`    ${pc.cyan('enter')} ${place.name}${away ? pc.dim(`  ${away}`) : ''}${locked}`);
    }
  }

  if (ways.roads.length > 0) {
    if (out.length > 0) out.push('');
    out.push(pc.dim('  Roads'));
    for (const road of ways.roads) {
      const away = duration(road.travelMinutes);
      const gated = bar(road.barred, road.requires);
      out.push(`    ${pc.cyan('travel')} ${road.name}${away ? pc.dim(`  ${away}`) : ''}${gated}`);
    }
  }

  if (ways.frontier) {
    if (out.length > 0) out.push('');
    out.push(pc.dim('  Unexplored'));
    out.push(`    ${pc.cyan(ways.frontier.direction)}${pc.dim(`  ${ways.frontier.tiles} tiles off`)}`);
  }

  if (out.length === 0) return [pc.dim('  Nowhere from here but the way you came.')];
  return out;
}
