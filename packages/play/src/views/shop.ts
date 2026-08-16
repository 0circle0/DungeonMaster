/**
 * A shopkeeper's counter, as data.
 *
 * Both front ends want the same four things — who, what they have, what they
 * will take, and what is in your pocket — and neither should be re-deriving
 * prices. A barred shop still returns a view, carrying *why*, for the same
 * reason a barred door does: "no" with no reason is the least useful thing a
 * UI can say.
 */

import { Rng } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import type { GameState, StockEntry } from '@dm/engine';
import { Transaction, shopOf, shopStock, sellable, shopBarred, render } from '@dm/engine';

export interface ShopView {
  readonly npc: string;
  readonly name: string;
  /** What the module calls money, and its short form. */
  readonly currency: { readonly name: string; readonly abbrev: string };
  readonly purse: number;
  /** They will not deal with you, and what it would take. */
  readonly barred: boolean;
  readonly requires: readonly string[];
  readonly stock: readonly StockEntry[];
  readonly sellable: readonly StockEntry[];
}

export function shopView(
  module: CompiledModule,
  state: GameState,
  npcId: string,
): ShopView | null {
  const txn = new Transaction(state, module);
  if (!shopOf(txn, npcId)) return null;

  const actor = state.entities[state.selected];
  if (!actor) return null;

  const npc = module.find<{ name: string }>('content.npcs', npcId);
  const gate = shopBarred(txn, npcId, actor, Rng.fromSeed(state.seed).derive(`shop:${npcId}`));
  const currency = module.source.rules.currency;

  return {
    npc: npcId,
    name: npc?.name ?? npcId,
    currency: { name: currency.name, abbrev: currency.abbrev },
    purse: state.purse,
    barred: gate.barred,
    requires: gate.requires.map((need) => render(module, need)),
    // Nothing is shown for sale to someone they will not serve.
    stock: gate.barred ? [] : shopStock(txn, npcId),
    sellable: gate.barred ? [] : sellable(txn, npcId, actor),
  };
}
