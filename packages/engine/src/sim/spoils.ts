/** What the dead leave behind. */

import { Rng } from '@dm/core';
import type { ItemStack } from '../state.js';
import type { GameEvent } from '../events.js';
import { Transaction } from '../rules/apply.js';
import { TerrainIndex, key as packKey } from '../grid/tiles.js';
import { skillCheck, succeeded } from '../rules/check.js';
import { rollLoot } from '../world/populate.js';
import { freeNear, partyScopes } from './enter.js';

interface MonsterDef {
  loot?: string;
  conditionalLoot?: string[];
}

interface LootTableDef {
  bonusRollSkill?: string;
  bonusRolls: { onSuccess: number; onCritical: number };
}

/** Extra draws earned by a scavenging skill: one for a success and two for a critical. */
function bonusRollsFor(
  txn: Transaction,
  tableId: string,
  finderId: string | null,
  rng: Rng,
): number {
  const table = txn.module.find<LootTableDef>('content.lootTables', tableId);
  const skill = table?.bonusRollSkill;
  const finder = finderId ? txn.entity(finderId) : undefined;
  if (!skill || !finder) return 0;

  const roll = skillCheck(txn.module, rng, finder, skill, undefined);
  txn.emit({ type: 'checked', entity: finder.id, skill, attribute: null, roll });
  if (!succeeded(roll)) return 0;
  const bonus = table?.bonusRolls;
  return roll.outcome === 'critical' ? (bonus?.onCritical ?? 2) : (bonus?.onSuccess ?? 1);
}

/** Drop what the newly dead were carrying, onto the ground where they fell. */
export function dropDeathLoot(
  txn: Transaction,
  terrain: TerrainIndex,
  events: readonly GameEvent[],
  rng: Rng,
): void {
  for (const event of events) {
    if (event.type !== 'died') continue;

    const corpse = txn.entity(event.entity);
    if (!corpse || !corpse.statblock) continue;

    const statblock = txn.module.find<MonsterDef>('content.monsters', corpse.statblock);
    if (!statblock) continue;

    // The creature's own table, then any table the finder additionally qualifies for.
    const tables = [statblock.loot, ...(statblock.conditionalLoot ?? [])]
      .filter((id): id is string => Boolean(id));
    if (tables.length === 0) continue;

    const map = txn.state.maps[corpse.map];
    if (!map) continue;

    const scopes = partyScopes(txn);
    const corpseRng = rng.derive(`spoils:${corpse.id}`);
    const dropped: ItemStack[] = [];

    for (const tableId of tables) {
      const tableRng = corpseRng.derive(tableId);
      const bonusRolls = bonusRollsFor(txn, tableId, event.killer, tableRng.derive('scavenge'));

      for (const draw of rollLoot(txn.module, tableId, scopes, tableRng, { bonusRolls })) {
        dropped.push({ item: draw.item, quantity: draw.quantity });
        // A dropped unique is flagged out of every future draw.
        if (draw.unique) {
          txn.set({
            ...txn.state,
            flags: { ...txn.state.flags, [`unique:${draw.item}`]: true },
          });
        }
      }
    }

    if (dropped.length === 0) continue;

    const at = freeNear(txn, terrain, corpse.map, corpse.position);
    const tile = packKey(at);
    const current = txn.state.maps[corpse.map];
    if (!current) continue;

    txn.set({
      ...txn.state,
      maps: {
        ...txn.state.maps,
        [current.id]: {
          ...current,
          items: { ...current.items, [tile]: [...(current.items[tile] ?? []), ...dropped] },
        },
      },
    });

    txn.emit({
      type: 'droppedLoot',
      from: corpse.id,
      at,
      items: dropped.map((stack) => ({ item: stack.item, quantity: stack.quantity })),
    });
  }
}
