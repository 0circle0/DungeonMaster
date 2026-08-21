/** What the ground does to whoever is standing on it. */

import { Rng } from '@dm/core';
import { evalEffects } from '@dm/module';
import type { Effect } from '@dm/module';
import type { EntityId } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps } from '../rules/apply.js';
import { terrainAt } from '../grid/tiles.js';
import type { Position } from '../grid/tiles.js';

/** Run a terrain's own effects on whoever is standing on it. */
export function runTerrain(
  txn: Transaction,
  actorId: EntityId,
  when: 'onEnter' | 'onOccupy',
  at: Position,
  rng: Rng,
): void {
  const actor = txn.entity(actorId);
  const map = actor ? txn.state.maps[actor.map] : undefined;
  if (!actor || !map) return;

  const definition = txn.module.find<{ onEnter?: Effect[]; onOccupy?: Effect[] }>(
    'world.terrains',
    terrainAt(map.tiles, at),
  );
  const effects = definition?.[when] ?? [];
  if (effects.length === 0) return;

  const scope = { ...buildScope(txn.module, txn.state, actor), target: { id: actor.id } };
  applyOps(txn, evalEffects(effects, { scope, rng, openNamespaces: OPEN_NAMESPACES }), null);
}
