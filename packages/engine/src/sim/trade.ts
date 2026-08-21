/** Buying and selling. */

import { Rng } from '@dm/core';
import type { Requirement } from '@dm/module';
import { isEmptyRequirement, compileRequirement, evalPredicate } from '@dm/module';
import type { Entity } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, changeInventory } from '../rules/apply.js';
import { describeRequirement } from './gates.js';
import { rollLoot, singleScope } from '../world/populate.js';
import { message, joinMessages } from '../narrate/systemText.js';
import type { Message } from '../narrate/systemText.js';

export interface ShopDef {
  lootTable?: string;
  buysTags: string[];
  priceMultiplier: number;
  requires?: Requirement;
}

interface NpcDef {
  id: string;
  name: string;
  shop?: ShopDef;
}

interface ItemDef {
  id: string;
  name: string;
  kind: string;
  value: number;
  tags?: string[];
}

export interface StockEntry {
  readonly item: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
}

/** Which in-world day it is, which is how often a shop turns over. */
function dayOf(txn: Transaction): number {
  return Math.floor(txn.state.minute / txn.module.source.world.time.minutesPerDay);
}

export function shopOf(txn: Transaction, npcId: string): ShopDef | null {
  return txn.module.find<NpcDef>('content.npcs', npcId)?.shop ?? null;
}

/** Whether this shopkeeper will deal with the party, and what it would take. */
export function shopBarred(
  txn: Transaction,
  npcId: string,
  actor: Entity,
  rng: Rng,
): { barred: boolean; requires: readonly Message[] } {
  const shop = shopOf(txn, npcId);
  if (!shop || isEmptyRequirement(shop.requires)) return { barred: false, requires: [] };

  const scope = buildScope(txn.module, txn.state, actor);
  let met = false;
  try {
    met = evalPredicate(compileRequirement(shop.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES });
  } catch {
    met = false;
  }
  if (met) return { barred: false, requires: [] };

  const described = describeRequirement(shop.requires);
  const requires = shop.requires?.description ? described.slice(0, 1) : described;
  return { barred: true, requires };
}

/** What a thing costs to buy, and what it fetches when sold. */
export function priceOf(module: Transaction['module'], itemId: string, shop: ShopDef): {
  buy: number;
  sell: number;
} {
  const value = module.find<ItemDef>('content.items', itemId)?.value ?? 0;
  const multiplier = shop.priceMultiplier > 0 ? shop.priceMultiplier : 1;
  return {
    buy: Math.ceil(value * multiplier),
    sell: Math.floor(value / multiplier),
  };
}

/** What is on the shelf today. */
export function shopStock(txn: Transaction, npcId: string): readonly StockEntry[] {
  const shop = shopOf(txn, npcId);
  if (!shop?.lootTable) return [];

  const day = dayOf(txn);
  const leader = txn.entity(txn.state.selected);
  const scope = leader ? buildScope(txn.module, txn.state, leader) : {};
  const rng = Rng.fromSeed(txn.state.seed).derive(`shop:${npcId}:day${day}`);

  const out: StockEntry[] = [];
  for (const draw of rollLoot(txn.module, shop.lootTable, singleScope(scope), rng)) {
    const item = txn.module.find<ItemDef>('content.items', draw.item);
    if (!item || item.value <= 0) continue;

    const sold = Number(txn.state.flags[soldKey(npcId, day, draw.item)] ?? 0);
    const left = draw.quantity - sold;
    if (left <= 0) continue;

    out.push({
      item: draw.item,
      name: item.name,
      price: priceOf(txn.module, draw.item, shop).buy,
      quantity: left,
    });
  }
  // Sorted, so the shelf reads the same way twice.
  return out.sort((a, b) => a.item.localeCompare(b.item));
}

function soldKey(npcId: string, day: number, itemId: string): string {
  return `shop:${npcId}:${day}:${itemId}`;
}

/** What this shopkeeper will take off your hands, and for how much. */
export function sellable(txn: Transaction, npcId: string, actor: Entity): readonly StockEntry[] {
  const shop = shopOf(txn, npcId);
  if (!shop) return [];

  const out: StockEntry[] = [];
  for (const stack of actor.inventory) {
    const item = txn.module.find<ItemDef>('content.items', stack.item);
    if (!item || item.value <= 0) continue;
    if (!buys(shop, item)) continue;

    out.push({
      item: item.id,
      name: item.name,
      price: priceOf(txn.module, item.id, shop).sell,
      quantity: stack.quantity,
    });
  }
  return out.sort((a, b) => a.item.localeCompare(b.item));
}

/** Whether a shopkeeper deals in this. */
function buys(shop: ShopDef, item: ItemDef): boolean {
  if (shop.buysTags.length === 0) return true;
  const qualities = [...(item.tags ?? []), item.kind];
  return shop.buysTags.some((tag) => qualities.includes(tag));
}

/** Buy one thing, if it is on the shelf and the purse can bear it. */
export function buyItem(
  txn: Transaction,
  npcId: string,
  actor: Entity,
  itemId: string,
  quantity: number,
  rng: Rng,
): boolean {
  const shop = shopOf(txn, npcId);
  if (!shop) {
    txn.emit({ type: 'refused', action: 'buy', reason: message('refused.buy.noStock') });
    return false;
  }

  const gate = shopBarred(txn, npcId, actor, rng);
  if (gate.barred) {
    const reason = gate.requires.length > 0
      ? message('refused.trade.barred', { missing: joinMessages(txn.module, gate.requires) })
      : message('refused.trade.barred.plain');
    txn.emit({ type: 'refused', action: 'buy', reason });
    return false;
  }

  const entry = shopStock(txn, npcId).find((stock) => stock.item === itemId);
  if (!entry) {
    txn.emit({ type: 'refused', action: 'buy', reason: message('refused.buy.noSuchItem') });
    return false;
  }

  const wanted = Math.max(1, Math.min(quantity, entry.quantity));
  const cost = entry.price * wanted;
  if (cost > txn.state.purse) {
    txn.emit({ type: 'refused', action: 'buy', reason: message('refused.buy.tooExpensive') });
    return false;
  }

  const day = dayOf(txn);
  const key = soldKey(npcId, day, itemId);
  txn.set({
    ...txn.state,
    purse: txn.state.purse - cost,
    flags: { ...txn.state.flags, [key]: Number(txn.state.flags[key] ?? 0) + wanted },
  });
  // No `currencyChanged` here: `traded` already carries the price.
  changeInventory(txn, txn.entity(actor.id) ?? actor, itemId, wanted);
  txn.emit({ type: 'traded', npc: npcId, item: itemId, quantity: wanted, price: cost, bought: true });
  return true;
}

/** Sell one thing, if they deal in it. */
export function sellItem(
  txn: Transaction,
  npcId: string,
  actor: Entity,
  itemId: string,
  quantity: number,
  rng: Rng,
): boolean {
  const shop = shopOf(txn, npcId);
  if (!shop) {
    txn.emit({ type: 'refused', action: 'sell', reason: message('refused.sell.notBuying') });
    return false;
  }

  const gate = shopBarred(txn, npcId, actor, rng);
  if (gate.barred) {
    txn.emit({ type: 'refused', action: 'sell', reason: message('refused.trade.barred.plain') });
    return false;
  }

  const current = txn.entity(actor.id) ?? actor;
  const entry = sellable(txn, npcId, current).find((stock) => stock.item === itemId);
  if (!entry) {
    txn.emit({ type: 'refused', action: 'sell', reason: message('refused.sell.unwanted') });
    return false;
  }

  const offered = Math.max(1, Math.min(quantity, entry.quantity));
  const paid = entry.price * offered;

  changeInventory(txn, current, itemId, -offered);
  txn.set({ ...txn.state, purse: txn.state.purse + paid });
  txn.emit({ type: 'traded', npc: npcId, item: itemId, quantity: offered, price: paid, bought: false });
  return true;
}
