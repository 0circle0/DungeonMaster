/**
 * What the selected character carries, as data.
 *
 * Gains what the terminal never computed: whether each item is equipped and in
 * which slot, which a browser inventory needs for its Equip/Unequip buttons.
 */

import type { CompiledModule } from '@dm/module';
import type { GameState } from '@dm/engine';

export interface CarriedItem {
  readonly item: string;
  readonly name: string;
  readonly description: string;
  readonly quantity: number;
  readonly equipped: boolean;
  /** The slot holding it, when equipped. */
  readonly slot: string | null;
  /** Whether the module says this can be used. */
  readonly usable: boolean;
  readonly equippable: boolean;
}

export function inventoryView(module: CompiledModule, state: GameState): readonly CarriedItem[] {
  const actor = state.entities[state.selected];
  if (!actor) return [];

  // Which slot, if any, holds each item id.
  const slotOf = new Map<string, string>();
  for (const [slot, items] of Object.entries(actor.equipped)) {
    for (const id of items) slotOf.set(id, slot);
  }

  return actor.inventory.map((stack) => {
    const item = module.find<{
      name?: string; description?: string; slot?: string; onUse?: unknown[];
    }>('content.items', stack.item);

    return {
      item: stack.item,
      name: item?.name ?? stack.item,
      description: item?.description ?? '',
      quantity: stack.quantity,
      equipped: slotOf.has(stack.item),
      slot: slotOf.get(stack.item) ?? null,
      usable: Array.isArray(item?.onUse) && item.onUse.length > 0,
      equippable: Boolean(item?.slot),
    };
  });
}
