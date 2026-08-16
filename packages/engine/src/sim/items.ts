/**
 * Carrying, wearing, and using things.
 *
 * Items live in one of two places — a character's inventory, or a tile on the
 * map — and move between them. Equipment is a third state layered on the first:
 * an equipped sword is still carried, which is why `equipped` holds ids rather
 * than removing the stack.
 *
 * Slot capacity comes from `rules.equipmentSlots`, so a module deciding you have
 * two hands, or four, or none, needs no engine change.
 */

import { Rng, parseDice, rollDice } from '@dm/core';
import { evalEffects } from '@dm/module';
import type { Effect, Scope } from '@dm/module';
import type { Entity } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps, changeInventory } from '../rules/apply.js';
import { key as packKey } from '../grid/tiles.js';
import { distance } from '../grid/geometry.js';
import { message } from '../narrate/systemText.js';

interface ItemDef {
  id: string;
  name: string;
  slot?: string;
  onUse: Effect[];
  consumedOnUse: boolean;
  usableBy: string[];
  requiresAttunement: boolean;
  /** Limited uses that come back on a rest — a wand, a staff, a horn. */
  charges?: {
    max: number;
    rechargeOn?: string;
    rechargeAmount?: string;
    destroyOnEmpty: boolean;
  };
}

interface SlotDef {
  id: string;
  name: string;
  capacity: number;
}

/** Items on the tile the actor is standing on, and those beside it. */
export function itemsWithinReach(
  txn: Transaction,
  actor: Entity,
): { tile: number; item: string; quantity: number }[] {
  const map = txn.state.maps[actor.map];
  if (!map) return [];

  const out: { tile: number; item: string; quantity: number }[] = [];
  for (const [tileKey, stacks] of Object.entries(map.items)) {
    const tile = Number(tileKey);
    const at = { x: tile & 0xffff, y: tile >>> 16 };
    // Reachable means underfoot or adjacent — no picking things up across a room.
    if (distance(at, actor.position) > txn.module.source.rules.interactionRange.reach) continue;
    for (const stack of stacks) out.push({ tile, item: stack.item, quantity: stack.quantity });
  }
  return out;
}

/** Move items between a tile and an inventory. */
function setTileItems(
  txn: Transaction,
  mapId: string,
  tile: number,
  stacks: readonly { item: string; quantity: number }[],
): void {
  const map = txn.state.maps[mapId];
  if (!map) return;

  const items = { ...map.items };
  if (stacks.length === 0) delete items[tile];
  else items[tile] = stacks;

  txn.set({ ...txn.state, maps: { ...txn.state.maps, [mapId]: { ...map, items } } });
}

/** Pick something up. */
export function takeItem(
  txn: Transaction,
  actor: Entity,
  itemId: string | undefined,
  quantity?: number,
): boolean {
  const reachable = itemsWithinReach(txn, actor);
  if (reachable.length === 0) {
    txn.emit({ type: 'refused', action: 'take', reason: message('refused.take.nothingHere') });
    return false;
  }

  // No item named: take everything within reach, which is what a player means
  // by "take" standing on a pile.
  const wanted = itemId
    ? reachable.filter((entry) => entry.item === itemId)
    : reachable;

  if (wanted.length === 0) {
    const name = txn.module.find<ItemDef>('content.items', itemId ?? '')?.name ?? itemId ?? '';
    txn.emit({ type: 'refused', action: 'take', reason: message('refused.take.noSuchItem', { item: name }) });
    return false;
  }

  for (const entry of wanted) {
    const amount = quantity !== undefined ? Math.min(quantity, entry.quantity) : entry.quantity;
    const map = txn.state.maps[actor.map];
    if (!map) break;

    const remaining = (map.items[entry.tile] ?? [])
      .map((stack) =>
        stack.item === entry.item ? { ...stack, quantity: stack.quantity - amount } : stack,
      )
      .filter((stack) => stack.quantity > 0);

    setTileItems(txn, actor.map, entry.tile, remaining);
    changeInventory(txn, txn.entity(actor.id) ?? actor, entry.item, amount);
  }
  return true;
}

/** Put something down on the tile the actor is standing on. */
export function dropItem(
  txn: Transaction,
  actor: Entity,
  itemId: string,
  quantity?: number,
): boolean {
  const current = txn.entity(actor.id) ?? actor;
  const held = current.inventory.find((stack) => stack.item === itemId);

  if (!held) {
    txn.emit({ type: 'refused', action: 'drop', reason: message('refused.item.notCarried') });
    return false;
  }

  const amount = Math.min(quantity ?? held.quantity, held.quantity);

  // Dropping something you are wearing takes it off first.
  unequipItem(txn, current, itemId, { quiet: true });

  changeInventory(txn, txn.entity(actor.id) ?? current, itemId, -amount);

  const map = txn.state.maps[actor.map];
  if (map) {
    const tile = packKey(current.position);
    const existing = map.items[tile] ?? [];
    const merged = existing.some((stack) => stack.item === itemId)
      ? existing.map((stack) =>
          stack.item === itemId ? { ...stack, quantity: stack.quantity + amount } : stack,
        )
      : [...existing, { item: itemId, quantity: amount }];
    setTileItems(txn, actor.map, tile, merged);
  }

  return true;
}

/** Wear or wield something. */
export function equipItem(
  txn: Transaction,
  actor: Entity,
  itemId: string,
  slotOverride?: string,
): boolean {
  const item = txn.module.find<ItemDef>('content.items', itemId);
  if (!item) {
    txn.emit({ type: 'refused', action: 'equip', reason: message('refused.item.unknown', { item: itemId }) });
    return false;
  }

  const current = txn.entity(actor.id) ?? actor;
  if (!current.inventory.some((stack) => stack.item === itemId)) {
    txn.emit({ type: 'refused', action: 'equip', reason: message('refused.item.notCarried') });
    return false;
  }

  const slotId = slotOverride ?? item.slot;
  if (!slotId) {
    txn.emit({ type: 'refused', action: 'equip', reason: message('refused.equip.notWearable', { item: item.name }) });
    return false;
  }

  // A module may restrict who can use a thing.
  if (item.usableBy.length > 0 && current.characterClass
    && !item.usableBy.includes(current.characterClass)) {
    txn.emit({ type: 'refused', action: 'equip', reason: message('refused.equip.notAllowed', { item: item.name }) });
    return false;
  }

  const slot = txn.module.find<SlotDef>('rules.equipmentSlots', slotId);
  const capacity = slot?.capacity ?? 1;
  const worn = current.equipped[slotId] ?? [];

  if (worn.includes(itemId)) return true;

  // A full slot displaces its oldest occupant, which is friendlier than
  // refusing and making the player unequip by hand.
  const next = worn.length >= capacity ? [...worn.slice(1), itemId] : [...worn, itemId];
  const displaced = worn.length >= capacity ? worn[0] : undefined;

  txn.putEntity({ ...current, equipped: { ...current.equipped, [slotId]: next } });

  if (displaced) {
    txn.emit({ type: 'itemUnequipped', entity: current.id, item: displaced, slot: slotId });
  }
  txn.emit({ type: 'itemEquipped', entity: current.id, item: itemId, slot: slotId });
  return true;
}

export function unequipItem(
  txn: Transaction,
  actor: Entity,
  itemId: string,
  options: { quiet?: boolean } = {},
): boolean {
  const current = txn.entity(actor.id) ?? actor;

  for (const [slotId, worn] of Object.entries(current.equipped)) {
    if (!worn.includes(itemId)) continue;

    const next = worn.filter((id) => id !== itemId);
    txn.putEntity({ ...current, equipped: { ...current.equipped, [slotId]: next } });
    if (!options.quiet) {
      txn.emit({ type: 'itemUnequipped', entity: current.id, item: itemId, slot: slotId });
    }
    return true;
  }

  if (!options.quiet) {
    txn.emit({ type: 'refused', action: 'unequip', reason: message('refused.unequip.notWorn') });
  }
  return false;
}

/** Use a carried item — drink the potion, read the scroll. */
export function useItem(
  txn: Transaction,
  actor: Entity,
  itemId: string,
  target: string | undefined,
  rng: Rng,
): boolean {
  const item = txn.module.find<ItemDef>('content.items', itemId);
  if (!item) {
    txn.emit({ type: 'refused', action: 'useItem', reason: message('refused.item.unknown', { item: itemId }) });
    return false;
  }

  const current = txn.entity(actor.id) ?? actor;
  if (!current.inventory.some((stack) => stack.item === itemId)) {
    txn.emit({ type: 'refused', action: 'useItem', reason: message('refused.item.notCarried') });
    return false;
  }

  if (item.onUse.length === 0) {
    txn.emit({ type: 'refused', action: 'useItem', reason: message('refused.use.nothingHappens', { item: item.name.toLowerCase() }) });
    return false;
  }

  // A wand with nothing left in it. Charges are counted per character per item
  // in `flags` rather than as item instances, which the engine has no concept
  // of — so the case that matters (the party owns one wand) works, and the
  // limit is one charged copy each.
  const charges = item.charges;
  if (charges) {
    const key = chargeKey(current.id, itemId);
    const left = Number(txn.state.flags[key] ?? charges.max);
    if (left <= 0) {
      txn.emit({ type: 'refused', action: 'useItem', reason: message('refused.use.spent', { item: item.name.toLowerCase() }) });
      return false;
    }
    txn.set({ ...txn.state, flags: { ...txn.state.flags, [key]: left - 1 } });

    // Some things crumble when the last charge goes.
    if (left - 1 <= 0 && charges.destroyOnEmpty) {
      changeInventory(txn, txn.entity(actor.id) ?? current, itemId, -1);
    }
  }

  const subject = target ? txn.entity(target) : current;
  // Built explicitly rather than with a conditional spread: an optional property
  // typed `X | undefined` is rejected by the shared `Scope` index signature
  // under stricter settings, and this source is compiled by the editor too.
  const extra: Scope = subject ? { target: { id: subject.id, name: subject.name } } : {};
  const scope = buildScope(txn.module, txn.state, current, extra);

  applyOps(txn, evalEffects(item.onUse, { scope, rng, openNamespaces: OPEN_NAMESPACES }), current.id);
  txn.emit({ type: 'itemUsed', entity: current.id, item: itemId, consumed: item.consumedOnUse });

  if (item.consumedOnUse) {
    changeInventory(txn, txn.entity(actor.id) ?? current, itemId, -1);
  }
  return true;
}

/** Where a character's remaining charges for one item are kept. */
export function chargeKey(entityId: string, itemId: string): string {
  return `charges:${entityId}:${itemId}`;
}

/**
 * Refill charged items on a rest of the kind they recharge on.
 *
 * `rechargeOn` and `rechargeAmount` described exactly this and nothing read
 * them, so a wand of seven charges was a wand of seven charges for the whole
 * campaign.
 */
export function rechargeItems(txn: Transaction, restId: string, rng: Rng): void {
  for (const id of txn.state.party) {
    const holder = txn.entity(id);
    if (!holder) continue;

    for (const stack of holder.inventory) {
      const item = txn.module.find<ItemDef>('content.items', stack.item);
      const charges = item?.charges;
      if (!charges || charges.rechargeOn !== restId) continue;

      const key = chargeKey(holder.id, stack.item);
      const left = Number(txn.state.flags[key] ?? charges.max);
      if (left >= charges.max) continue;

      const restored = charges.rechargeAmount
        ? rollCharges(charges.rechargeAmount, rng.derive(`recharge:${holder.id}:${stack.item}`))
        : charges.max;

      txn.set({
        ...txn.state,
        flags: { ...txn.state.flags, [key]: Math.min(charges.max, left + restored) },
      });
    }
  }
}

function rollCharges(notation: string, rng: Rng): number {
  try {
    return Math.max(0, rollDice(parseDice(notation), rng).total);
  } catch {
    return 0;
  }
}

/** Hand something to another party member standing nearby. */
export function giveItem(
  txn: Transaction,
  actor: Entity,
  itemId: string,
  toId: string,
): boolean {
  const recipient = txn.entity(toId);
  const current = txn.entity(actor.id) ?? actor;

  const reach = txn.module.source.rules.interactionRange.reach;
  if (!recipient || recipient.map !== current.map
    || distance(recipient.position, current.position) > reach) {
    txn.emit({ type: 'refused', action: 'give', reason: message('refused.give.tooFar') });
    return false;
  }
  if (!current.inventory.some((stack) => stack.item === itemId)) {
    txn.emit({ type: 'refused', action: 'give', reason: message('refused.item.notCarried') });
    return false;
  }

  unequipItem(txn, current, itemId, { quiet: true });
  changeInventory(txn, txn.entity(actor.id) ?? current, itemId, -1);
  changeInventory(txn, txn.entity(toId)!, itemId, 1);
  return true;
}
