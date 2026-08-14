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

  if (ways.places.length > 0) {
    out.push(pc.dim('  Here'));
    for (const place of ways.places) {
      const away = duration(place.travelMinutes);
      const locked = place.barred ? pc.yellow('  (barred)') : '';
      out.push(`    ${pc.cyan('enter')} ${place.name}${away ? pc.dim(`  ${away}`) : ''}${locked}`);
    }
  }

  if (ways.roads.length > 0) {
    if (out.length > 0) out.push('');
    out.push(pc.dim('  Roads'));
    for (const road of ways.roads) {
      const away = duration(road.travelMinutes);
      const gated = road.barred ? pc.yellow('  (barred)') : '';
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
