/**
 * Traps: finding them, springing them, and taking them apart.
 *
 * The generator has always placed traps and the arrival code always threw them
 * away, so the whole `content.traps` collection — a detect check, a disarm
 * check, effects on both — was accepted, validated, documented, and incapable
 * of doing anything.
 *
 * A trap lives on the map beside the gates, keyed by the same packed tile
 * integer, and moves through four states: `hidden` until somebody searches,
 * `found` once they have, then `disarmed` or `sprung`.
 *
 * **There is deliberately no passive detection roll on movement.** A roll
 * re-made on every step is a treadmill that finds everything eventually and
 * teaches the player nothing; making `search` the only way to find a trap is
 * deterministic, gives `search` a job inside a dungeon, and leaves walking into
 * one a real consequence of not looking.
 */

import { Rng } from '@dm/core';
import { evalEffects } from '@dm/module';
import type { Effect } from '@dm/module';
import type { Entity, MapInstance } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps } from '../rules/apply.js';
import { skillCheck, succeeded, difficultyFrom } from '../rules/check.js';
import { key as packKey, unkey } from '../grid/tiles.js';
import { distance } from '../grid/geometry.js';
import { message } from '../narrate/systemText.js';

export interface TrapDef {
  id: string;
  name: string;
  detect: { skill: string; difficulty: unknown };
  disarm: { skill: string; difficulty: unknown };
  onTrigger: Effect[];
  onDisarm: Effect[];
  reusable: boolean;
}

export type TrapState = 'hidden' | 'found' | 'disarmed' | 'sprung';



function mapOf(txn: Transaction): MapInstance | undefined {
  return txn.state.maps[txn.state.currentMap];
}

/** Write one trap's state back, leaving the rest of the map alone. */
function setTrapState(txn: Transaction, tile: number, state: TrapState): void {
  const map = mapOf(txn);
  const existing = map?.traps[tile];
  if (!map || !existing) return;

  txn.set({
    ...txn.state,
    maps: {
      ...txn.state.maps,
      [map.id]: { ...map, traps: { ...map.traps, [tile]: { ...existing, state } } },
    },
  });
}

/**
 * Step onto a tile that may be trapped.
 *
 * A trap that has been found is still a trap: knowing where it is does not stop
 * you walking into it, which is why disarming exists. Monsters spring traps too
 * — the trap does not know who is standing on it, and a hound blundering into
 * the party's own snare is a good moment rather than an edge case.
 */
export function springTrap(txn: Transaction, mover: Entity, rng: Rng): void {
  const map = txn.state.maps[mover.map];
  const tile = packKey(mover.position);
  const placed = map?.traps[tile];
  if (!map || !placed) return;
  if (placed.state === 'disarmed' || placed.state === 'sprung') return;

  const definition = txn.module.find<TrapDef>('content.traps', placed.trap);
  if (!definition) return;

  txn.emit({ type: 'trapSprung', trap: placed.trap, entity: mover.id, at: mover.position });

  if (definition.onTrigger.length > 0) {
    // `target` is the one who stepped on it, which is what an authored trap
    // means by `{ "ref": "target.id" }`.
    const scope = { ...buildScope(txn.module, txn.state, mover), target: { id: mover.id } };
    applyOps(txn, evalEffects(definition.onTrigger, { scope, rng, openNamespaces: OPEN_NAMESPACES }), null);
  }

  // A reusable trap re-arms, but it is no longer a secret once it has gone off.
  setTrapState(txn, tile, definition.reusable ? 'found' : 'sprung');
}

/**
 * Look for what is hidden underfoot.
 *
 * Returns whether anything was in range at all, so the caller can tell "you
 * find nothing here" from "there was nothing to find".
 */
export function searchForTraps(txn: Transaction, searcher: Entity, rng: Rng): boolean {
  const map = txn.state.maps[searcher.map];
  if (!map) return false;

  const nearby = Object.entries(map.traps)
    .map(([tile, placed]) => ({ tile: Number(tile), placed }))
    .filter(({ tile, placed }) =>
      placed.state === 'hidden'
      && distance(unkey(tile), searcher.position) <= txn.module.source.rules.search.trapRadius)
    // Sorted, so two searches of the same ground roll in the same order.
    .sort((a, b) => a.tile - b.tile);

  if (nearby.length === 0) return false;

  for (const { tile, placed } of nearby) {
    const definition = txn.module.find<TrapDef>('content.traps', placed.trap);
    if (!definition) continue;

    const roll = skillCheck(
      txn.module, rng.derive(`detect:${tile}`), searcher, definition.detect.skill,
      difficultyFrom(txn.module, txn.state, searcher, definition.detect.difficulty, rng.derive(`detectDc:${tile}`)),
    );
    txn.emit({ type: 'checked', entity: searcher.id, skill: definition.detect.skill, attribute: null, roll });
    if (!succeeded(roll)) continue;

    setTrapState(txn, tile, 'found');
    txn.emit({ type: 'discovered', what: placed.trap, kind: 'trap' });
  }
  return true;
}

/** A trap this character has found and can reach, nearest first. */
export function reachableTrap(txn: Transaction, actor: Entity): { tile: number; trap: string } | null {
  const map = txn.state.maps[actor.map];
  if (!map) return null;

  const candidates = Object.entries(map.traps)
    .map(([tile, placed]) => ({ tile: Number(tile), placed }))
    .filter(({ tile, placed }) =>
      placed.state === 'found'
      && distance(unkey(tile), actor.position) <= txn.module.source.rules.search.disarmReach)
    .sort((a, b) => a.tile - b.tile);

  const first = candidates[0];
  return first ? { tile: first.tile, trap: first.placed.trap } : null;
}

/**
 * Take a found trap apart.
 *
 * Failing costs time; only a fumble sets it off. A trap that punished every
 * failed attempt would make disarming strictly worse than walking around.
 */
export function disarmTrap(txn: Transaction, actor: Entity, rng: Rng): boolean {
  const target = reachableTrap(txn, actor);
  if (!target) {
    txn.emit({ type: 'refused', action: 'disarm', reason: message('refused.disarm.nothingHere') });
    return false;
  }

  const definition = txn.module.find<TrapDef>('content.traps', target.trap);
  if (!definition) return false;

  const roll = skillCheck(
    txn.module, rng, actor, definition.disarm.skill,
    difficultyFrom(txn.module, txn.state, actor, definition.disarm.difficulty, rng.derive('disarmDc')),
  );
  txn.emit({ type: 'checked', entity: actor.id, skill: definition.disarm.skill, attribute: null, roll });

  if (succeeded(roll)) {
    setTrapState(txn, target.tile, 'disarmed');
    txn.emit({ type: 'trapDisarmed', trap: target.trap, entity: actor.id, at: unkey(target.tile) });

    if (definition.onDisarm.length > 0) {
      const scope = buildScope(txn.module, txn.state, actor);
      applyOps(txn, evalEffects(definition.onDisarm, { scope, rng, openNamespaces: OPEN_NAMESPACES }), actor.id);
    }
    return true;
  }

  if (roll.outcome === 'fumble') {
    const standing = txn.entity(actor.id);
    if (standing) {
      // Fumbling sets it off under the hands of whoever was working on it.
      const at = unkey(target.tile);
      springTrap(txn, { ...standing, position: at }, rng.derive('fumble'));
    }
  }
  return false;
}
