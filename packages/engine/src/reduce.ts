/**
 * The reducer: the only path that changes state.
 *
 * `reduce(state, action)` returns a new state and the events describing what
 * happened. It is pure — no I/O, no clock, no ambient randomness. Chance comes
 * from the RNG state stored *in* the state, which is advanced and written back,
 * so a save file plus an action log replays a run exactly.
 *
 * Handlers are deliberately small and each owns one action. Anything shared
 * lives in `rules/`, so the dispatch table stays readable as the action list
 * grows past thirty entries.
 */

import { Rng } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import { evalPredicate } from '@dm/module';
import type { Predicate } from '@dm/module';
import { buildScope, OPEN_NAMESPACES } from './stats.js';
import type { Action } from './actions.js';
import { DIRECTION_OFFSETS } from './actions.js';
import type { GameEvent } from './events.js';
import type { GameState, Entity, EntityId } from './state.js';
import { Transaction, adjustResource } from './rules/apply.js';
import { statsOf } from './stats.js';
import { tickAllConditions } from './rules/conditions.js';
import { useAbility, defaultAttackAbility } from './rules/combat/attack.js';
import {
  maybeStartCombat,
  maybeEndCombat,
  endTurn as endCombatTurn,
  hasBudget,
  spendBudget,
  spendMovement,
  provokeOpportunity,
  broadcastReaction,
} from './rules/combat/turn.js';
import { runAiTurns, runIdleTurns } from './rules/combat/ai.js';
import { enterDungeon, enterArea, enterPoi } from './sim/enter.js';
import { openGate, markGateOpen } from './sim/gates.js';
import { startQuest, abandonQuest, advanceQuests } from './sim/quests.js';
import { startDialogue, chooseOption, canTalkTo, endDialogue } from './sim/dialogue.js';
import { recordDeed } from './sim/deeds.js';
import { tickDay } from './sim/agenda.js';
import { takeItem, dropItem, equipItem, unequipItem, useItem, giveItem } from './sim/items.js';
import { skillCheck, succeeded } from './rules/check.js';
import type { TargetingContext } from './rules/combat/targeting.js';
import { TerrainIndex, key, unkey } from './grid/tiles.js';
import type { Position } from './grid/tiles.js';
import { findPath } from './grid/path.js';
import { distance } from './grid/geometry.js';
import { isHostileTo } from './rules/combat/targeting.js';
import { leaveMarks, perceiveAll, perceivedTiles, sightSenseOf } from './sim/senses.js';

export interface ReduceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * Per-call context.
 *
 * The terrain index is derived from the module and is expensive enough to be
 * worth caching across calls, so callers may pass one in. Everything else is
 * read from state.
 */
export interface ReduceContext {
  readonly module: CompiledModule;
  readonly terrain?: TerrainIndex;
}

const terrainCache = new WeakMap<CompiledModule, TerrainIndex>();

function terrainFor(module: CompiledModule): TerrainIndex {
  let index = terrainCache.get(module);
  if (!index) {
    index = new TerrainIndex(module);
    terrainCache.set(module, index);
  }
  return index;
}

/** Resolve who is acting: the named entity, or the selected party member. */
function actorOf(state: GameState, action: Action): Entity | undefined {
  const id = 'actor' in action && action.actor ? action.actor : state.selected;
  return state.entities[id];
}

/** Tiles occupied by living creatures, which movement must route around. */
export function occupiedTiles(state: GameState, exclude?: EntityId): Set<number> {
  const blocked = new Set<number>();
  for (const entity of Object.values(state.entities)) {
    if (!entity.alive || entity.id === exclude) continue;
    if (entity.map !== state.currentMap) continue;
    blocked.add(key(entity.position));
  }
  return blocked;
}

export function reduce(state: GameState, action: Action, context: ReduceContext): ReduceResult {
  const { module } = context;
  const terrain = context.terrain ?? terrainFor(module);
  const txn = new Transaction(state, module);

  // The run's RNG is restored, used, and written back, so consuming randomness
  // is itself part of the state transition and replays identically.
  const rng = Rng.fromState(state.rng);

  /** Rebuilt per read because it closes over the transaction's current state. */
  const targeting = (): TargetingContext => ({ module, state: txn.state, terrain });

  switch (action.type) {
    case 'step':
    case 'move': {
      const actor = actorOf(state, action);
      if (!actor) {
        txn.emit({ type: 'refused', action: action.type, reason: 'no such character' });
        break;
      }
      const target =
        action.type === 'step'
          ? {
              x: actor.position.x + DIRECTION_OFFSETS[action.direction].x,
              y: actor.position.y + DIRECTION_OFFSETS[action.direction].y,
            }
          : action.to;
      moveEntity(txn, terrain, actor, target, rng);
      break;
    }

    case 'travelTo': {
      const actor = actorOf(state, action);
      if (!actor) {
        txn.emit({ type: 'refused', action: 'travelTo', reason: 'no such character' });
        break;
      }
      const map = txn.state.maps[txn.state.currentMap];
      if (!map) {
        txn.emit({ type: 'refused', action: 'travelTo', reason: 'nowhere to walk' });
        break;
      }

      const path = findPath({
        map: map.tiles,
        terrain,
        from: actor.position,
        to: action.to,
        modes: actor.movementModes,
        blocked: occupiedTiles(txn.state, actor.id),
      });

      if (!path.found) {
        txn.emit({ type: 'refused', action: 'travelTo', reason: 'no way through' });
        break;
      }
      // Walk the route a tile at a time so anything interesting — a trigger, a
      // creature coming into view — interrupts it rather than being skipped.
      for (const step of path.steps) {
        const current = txn.entity(actor.id);
        if (!current) break;
        if (!moveEntity(txn, terrain, current, step, rng)) break;
      }
      break;
    }

    case 'wait': {
      const minutes = Math.max(0, action.minutes ?? 10);
      advanceTime(txn, minutes, rng);
      break;
    }

    case 'advanceTime':
      advanceTime(txn, Math.max(0, action.minutes), rng);
      break;

    case 'select': {
      if (!state.party.includes(action.entity)) {
        txn.emit({ type: 'refused', action: 'select', reason: 'not in the party' });
        break;
      }
      txn.set({ ...txn.state, selected: action.entity });
      break;
    }

    case 'attack': {
      const actor = actorOf(state, action);
      if (!actor) {
        txn.emit({ type: 'refused', action: 'attack', reason: 'no such character' });
        break;
      }
      const abilityId = defaultAttackAbility(module, actor);
      if (!abilityId) {
        txn.emit({ type: 'refused', action: 'attack', reason: `${actor.name} has nothing to attack with` });
        break;
      }
      performAbility(txn, targeting, actor.id, abilityId, { target: action.target }, rng);
      break;
    }

    case 'useAbility': {
      const actor = actorOf(state, action);
      if (!actor) {
        txn.emit({ type: 'refused', action: 'useAbility', reason: 'no such character' });
        break;
      }
      performAbility(
        txn,
        targeting,
        actor.id,
        action.ability,
        { ...(action.target ? { target: action.target } : {}), ...(action.at ? { at: action.at } : {}) },
        rng,
      );
      break;
    }

    case 'endTurn': {
      if (txn.state.combat) {
        endCombatTurn(txn, targeting(), rng);
      } else {
        // Outside combat a "round" is just everything ageing one step.
        tickAllConditions(txn, rng.derive(`tick:${state.minute}`));
      }
      break;
    }

    case 'enter': {
      const actor = actorOf(state, action);
      if (!actor) break;

      // A point of interest may be gated; opening it is part of entering.
      const poi = module.find<{ id: string; gate?: string }>('world.pointsOfInterest', action.target);
      if (poi) {
        let opened = true;
        if (poi.gate) {
          const outcome = openGate(txn, poi.gate, actor, rng);
          opened = outcome.opened;
        }
        enterPoi(txn, terrain, action.target, actor, rng, opened);
        break;
      }
      if (module.has('world.dungeons', action.target)) {
        enterDungeon(txn, terrain, action.target, rng);
        break;
      }
      txn.emit({ type: 'refused', action: 'enter', reason: `there is no "${action.target}" here` });
      break;
    }

    case 'travelToArea': {
      const from = txn.state.location;
      const areaId = from.kind === 'area' ? from.area : from.kind === 'poi' ? from.area : null;

      // Travel follows declared connections, and a connection may be gated.
      if (areaId) {
        const area = module.find<{
          connections: { to: string; travelMinutes: number; gate?: string; oneWay: boolean }[];
        }>('world.areas', areaId);
        const route = area?.connections.find((entry) => entry.to === action.area);

        if (!route) {
          txn.emit({ type: 'refused', action: 'travelToArea', reason: 'there is no road that way' });
          break;
        }
        if (route.gate) {
          const actor = actorOf(state, action);
          if (actor && !openGate(txn, route.gate, actor, rng).opened) break;
        }
        advanceTime(txn, route.travelMinutes, rng);
      }

      enterArea(txn, terrain, action.area, rng);
      break;
    }

    case 'open': {
      const actor = actorOf(state, action);
      if (!actor) break;

      // A gate id names a barrier directly; otherwise look for a door underfoot.
      const gateId = module.has('world.gates', action.target) ? action.target : null;
      if (gateId) {
        const outcome = openGate(txn, gateId, actor, rng);
        if (outcome.opened) {
          const map = txn.state.maps[txn.state.currentMap];
          for (const [tile, entry] of Object.entries(map?.gates ?? {})) {
            if (entry.gate === gateId) markGateOpen(txn, Number(tile));
          }
        }
        break;
      }
      txn.emit({ type: 'refused', action: 'open', reason: `nothing here called "${action.target}"` });
      break;
    }

    case 'look': {
      const actor = actorOf(state, action);
      if (!actor) break;

      // Looking is free. The narrator answers it from state, so nothing here
      // decides what is seen — that stays in one place, with perception.
      txn.emit({ type: 'custom', event: 'looked', data: { by: actor.id, at: action.at ?? '' } });
      break;
    }

    case 'sense': {
      const actor = actorOf(state, action);
      if (!actor) break;

      const sense = module.find<{ id: string }>('rules.senses', action.sense);
      if (!sense) {
        txn.emit({ type: 'refused', action: 'sense', reason: `nothing here works like that` });
        break;
      }

      // Stopping to listen or take the air costs a minute, and the world moves
      // in it — which is the point: it is a real thing to spend time on.
      advanceTime(txn, 1, rng);
      txn.emit({ type: 'custom', event: 'sensed', data: { sense: sense.id, by: actor.id } });
      break;
    }

    case 'setFollow': {
      const actor = actorOf(state, action);
      if (!actor) break;

      if (txn.state.combat) {
        txn.emit({
          type: 'refused', action: 'setFollow',
          reason: 'in a fight everyone acts on their own initiative',
        });
        break;
      }

      for (const id of txn.state.party) {
        const member = txn.entity(id);
        if (!member || id === actor.id) continue;
        txn.putEntity({ ...member, following: action.follow ? actor.id : null });
      }
      // The leader follows nobody, or they would trail themselves in circles.
      const leader = txn.entity(actor.id);
      if (leader) txn.putEntity({ ...leader, following: null });

      txn.emit({ type: 'custom', event: 'followChanged', data: { following: action.follow, leader: actor.id } });
      break;
    }

    case 'search': {
      const actor = actorOf(state, action);
      if (!actor) break;

      // Searching finds hidden places in the area the party is standing in.
      const here = txn.state.location;
      const areaId = here.kind === 'area' ? here.area : here.kind === 'poi' ? here.area : null;
      const hidden = module
        .all<{ id: string; area: string; hidden: boolean; discover?: { skill: string; difficulty: number } }>(
          'world.pointsOfInterest',
        )
        .filter((poi) => poi.area === areaId && poi.hidden && poi.discover)
        .filter((poi) => txn.state.flags[`found:${poi.id}`] !== true);

      if (hidden.length === 0) {
        // Silence reads as a broken command, so say plainly that the search
        // turned nothing up.
        txn.emit({ type: 'refused', action: 'search', reason: 'you find nothing here' });
        break;
      }

      for (const poi of hidden) {
        const roll = skillCheck(module, rng, actor, poi.discover!.skill, poi.discover!.difficulty);
        txn.emit({ type: 'checked', entity: actor.id, skill: poi.discover!.skill, attribute: null, roll });
        if (!succeeded(roll)) continue;

        txn.set({ ...txn.state, flags: { ...txn.state.flags, [`found:${poi.id}`]: true } });
        txn.emit({ type: 'discovered', what: poi.id, kind: 'poi' });
      }
      advanceTime(txn, 10, rng);
      break;
    }

    case 'talk': {
      const actor = actorOf(state, action);
      if (!actor) break;
      if (!canTalkTo(actor, action.npc, txn)) {
        txn.emit({ type: 'refused', action: 'talk', reason: 'too far away to talk' });
        break;
      }
      const speaker = txn.entity(action.npc);
      if (speaker) startDialogue(txn, actor, speaker, rng);
      break;
    }

    case 'choose': {
      const actor = actorOf(state, action);
      if (actor) chooseOption(txn, action.option, actor, rng);
      break;
    }

    case 'acceptQuest':
      startQuest(txn, action.quest, rng);
      break;

    case 'abandonQuest':
      abandonQuest(txn, action.quest);
      break;

    case 'rest': {
      const actor = actorOf(state, action);
      const rest = module.find<{
        id: string; duration: number; kind: 'short' | 'long'; interruptChance: number;
      }>('rules.rests', action.kind);

      if (!actor || !rest) {
        txn.emit({ type: 'refused', action: 'rest', reason: `cannot rest like that here` });
        break;
      }
      if (txn.state.combat) {
        txn.emit({ type: 'refused', action: 'rest', reason: 'not while fighting' });
        break;
      }

      advanceTime(txn, rest.duration, rng);

      // Hours of stillness in one place is exactly what a nose is for. Anything
      // that came looking while the party slept interrupts the rest — which is
      // what `interruptChance` has always meant and never done.
      const drawn = Object.values(txn.state.entities).some(
        (other) => other.alive && other.kind !== 'character'
          && other.map === txn.state.currentMap && other.alerts.length > 0,
      );

      if (drawn && rest.interruptChance > 0 && rng.chance(rest.interruptChance)) {
        txn.emit({
          type: 'refused',
          action: 'rest',
          reason: 'something came looking before you could settle',
        });
        break;
      }

      // Resting restores the fraction each resource declares for this rest kind.
      for (const id of txn.state.party) {
        const member = txn.entity(id);
        if (!member || !member.alive) continue;

        for (const resource of module.all<{
          id: string; restoreOnShortRest: number; restoreOnLongRest: number;
        }>('rules.resources')) {
          const fraction = rest.kind === 'long' ? resource.restoreOnLongRest : resource.restoreOnShortRest;
          if (fraction <= 0) continue;
          const stats = statsOf(module, member);
          const max = stats.max[resource.id] ?? 0;
          const restored = Math.ceil(max * fraction);
          adjustResource(txn, txn.entity(id)!, resource.id, restored);
        }
      }
      break;
    }

    case 'flee': {
      const actor = actorOf(state, action);
      if (!actor) break;
      if (!txn.state.combat) {
        txn.emit({ type: 'refused', action: 'flee', reason: 'nothing to flee from' });
        break;
      }

      // Running away is movement, not an escape hatch. The actor spends its
      // whole movement putting ground between itself and whatever is closest,
      // which means adjacent enemies get their parting blow like any other
      // disengagement, and the fight ends only once nobody can see anybody —
      // which `maybeEndCombat` decides, not this handler.
      const steps = runAway(txn, terrain, actor.id, rng);

      if (steps === 0) {
        txn.emit({ type: 'refused', action: 'flee', reason: 'there is nowhere to run' });
        break;
      }

      txn.emit({ type: 'custom', event: 'fled', data: { entity: actor.id, steps } });

      // Turning your back ends your turn: no running away *and* swinging.
      if (txn.state.combat && txn.state.combat.order[txn.state.combat.turn] === actor.id) {
        endCombatTurn(txn, targeting(), rng);
      }
      break;
    }

    case 'leave': {
      // Breaking off a conversation is the commonest thing "leave" means, and
      // without it a player who ran out of replies had no way to stop talking.
      if (txn.state.dialogue) {
        endDialogue(txn);
        break;
      }

      const here = txn.state.location;
      if (here.kind === 'dungeon') {
        txn.emit({ type: 'refused', action: 'leave', reason: 'find the way out first' });
        break;
      }
      if (here.kind === 'poi') {
        // Stepping back out of a place returns you to its area. When that area
        // is the ground already underfoot, stepping back out is a change of
        // where you *are*, not of where you are standing — re-entering it would
        // teleport the party to the area's arrival point from wherever they had
        // walked to, which reads as being thrown across the map.
        const areaMap = `area:${here.area}`;
        if (txn.state.currentMap === areaMap) {
          txn.set({ ...txn.state, location: { kind: 'area', area: here.area } });
          txn.emit({ type: 'custom', event: 'entered', data: { place: here.area, kind: 'area' } });
          break;
        }
        enterArea(txn, terrain, here.area, rng);
        break;
      }
      txn.emit({ type: 'refused', action: 'leave', reason: 'there is nowhere to go back to' });
      break;
    }

    case 'setStance': {
      const actor = actorOf(state, action);
      if (!actor) break;

      const stance = module.find<{ id: string; name: string }>('rules.stances', action.stance);
      if (!stance) {
        txn.emit({ type: 'refused', action: 'setStance', reason: `there is no way of moving called "${action.stance}"` });
        break;
      }

      // The whole party moves together — one member creeping while another
      // clatters along behind would only ever be the noisy one's stance.
      for (const id of txn.state.party) {
        const member = txn.entity(id);
        if (member) txn.putEntity({ ...member, stance: stance.id });
      }
      txn.emit({ type: 'custom', event: 'stanceChanged', data: { stance: stance.id, name: stance.name } });
      break;
    }

    case 'take': {
      const actor = actorOf(state, action);
      if (actor) takeItem(txn, actor, action.item, action.quantity);
      break;
    }

    case 'drop': {
      const actor = actorOf(state, action);
      if (actor) dropItem(txn, actor, action.item, action.quantity);
      break;
    }

    case 'equip': {
      const actor = actorOf(state, action);
      if (actor) equipItem(txn, actor, action.item, action.slot);
      break;
    }

    case 'unequip': {
      const actor = actorOf(state, action);
      if (actor) unequipItem(txn, actor, action.item);
      break;
    }

    case 'useItem': {
      const actor = actorOf(state, action);
      if (actor) useItem(txn, actor, action.item, action.target, rng);
      break;
    }

    case 'give': {
      const actor = actorOf(state, action);
      if (actor) giveItem(txn, actor, action.item, action.to);
      break;
    }

    default: {
      // Every action in the union is handled above, and TypeScript proves it:
      // adding a case to `Action` without a handler here stops compiling rather
      // than failing silently at the table. Still reachable at runtime, though —
      // a save or a caller can hand over a type this build has never heard of,
      // and that must refuse by name rather than throw.
      const exhaustive: never = action;
      const unhandled = exhaustive as unknown as { type: string };
      txn.emit({
        type: 'refused',
        action: unhandled.type,
        reason: `"${unhandled.type}" is not something you can do`,
      });
      break;
    }
  }

  // Write the advanced generator back, then settle anything the action caused.
  txn.set({ ...txn.state, rng: rng.save() });
  settle(txn, terrain, rng);

  // Content asks for a deed by emitting one; recording it here means every
  // path that can cause one — a trigger, a quest, a dialogue node — is covered.
  const pending = txn.finish();
  const followUp = new Transaction(pending.state, module);
  const actor = followUp.entity(pending.state.selected);

  if (actor) {
    for (const event of pending.events) {
      if (event.type !== 'custom' || event.event !== 'deed') continue;
      const kind = String((event.data as { kind?: unknown }).kind ?? '');
      if (kind) recordDeed(followUp, terrain, kind, actor, null, rng.derive(`deed:${kind}`));
    }
  }

  // A quest can be handed over in conversation. This runs before the quests
  // advance so the job the party just took can be progressed by the same batch
  // of events that granted it — accepting and arriving are often one moment.
  for (const event of pending.events) {
    if (event.type !== 'custom' || event.event !== 'startQuest') continue;
    const questId = String((event.data as { quest?: unknown }).quest ?? '');
    if (questId) startQuest(followUp, questId, rng.derive(`quest:${questId}`));
  }

  // Quests watch everything that just happened.
  advanceQuests(followUp, pending.events, rng.derive('quests'));

  const settled = followUp.finish();
  return { state: settled.state, events: [...pending.events, ...settled.events] };
}

/**
 * Move one entity one tile.
 *
 * Returns whether the move happened, so a multi-tile walk can stop cleanly.
 * Everything about whether a tile can be entered comes from the module's
 * terrain definitions — the engine only asks.
 */
/**
 * Back away from whatever is hostile, one step at a time.
 *
 * Greedy rather than clever: each step goes to the reachable neighbour that is
 * furthest from the nearest enemy, and it stops when no neighbour is an
 * improvement — which is what being cornered looks like. Every step goes
 * through `moveEntity`, so parting blows, terrain cost, and the movement budget
 * all apply exactly as they do to a walk.
 *
 * Returns how many steps were taken.
 */
function runAway(txn: Transaction, terrain: TerrainIndex, actorId: EntityId, rng: Rng): number {
  let steps = 0;

  // Bounded by any sane movement budget; the budget check below is what
  // actually stops it.
  for (let guard = 0; guard < 32; guard += 1) {
    const actor = txn.entity(actorId);
    if (!actor || !actor.alive) break;

    const map = txn.state.maps[actor.map];
    if (!map) break;

    const enemies = Object.values(txn.state.entities).filter(
      (other) => other.alive && other.map === actor.map && isHostileTo(actor, other),
    );
    if (enemies.length === 0) break;

    const occupied = new Set(
      Object.values(txn.state.entities)
        .filter((other) => other.alive && other.map === actor.map && other.id !== actor.id)
        .map((other) => key(other.position)),
    );

    // How good a tile is: how far the nearest enemy is, then how far they all
    // are. The second term breaks ties toward open ground rather than a corner.
    const score = (at: Position): [number, number] => {
      let nearest = Infinity;
      let total = 0;
      for (const enemy of enemies) {
        const d = distance(at, enemy.position);
        nearest = Math.min(nearest, d);
        total += d;
      }
      return [nearest, total];
    };

    const here = score(actor.position);
    let best: Position | null = null;
    let bestScore = here;

    const budget = txn.state.combat ? txn.state.combat.movement : Infinity;

    for (const offset of Object.values(DIRECTION_OFFSETS)) {
      const at = { x: actor.position.x + offset.x, y: actor.position.y + offset.y };
      if (occupied.has(key(at))) continue;
      if (!terrain.isPassable(map.tiles, at, actor.movementModes)) continue;

      const cost = terrain.costOf(map.tiles, at, actor.movementModes);
      if (!Number.isFinite(cost) || cost > budget) continue;

      const candidate = score(at);
      if (candidate[0] > bestScore[0] || (candidate[0] === bestScore[0] && candidate[1] > bestScore[1])) {
        best = at;
        bestScore = candidate;
      }
    }

    if (!best) break;
    if (!moveEntity(txn, terrain, actor, best, rng)) break;
    steps += 1;
  }

  return steps;
}

function moveEntity(
  txn: Transaction,
  terrain: TerrainIndex,
  actor: Entity,
  to: Position,
  _rng: Rng,
  options: { readonly silent?: boolean } = {},
): boolean {
  // A follower trailing the party is not making decisions the player should be
  // told about. It walks where it can, says nothing when it cannot, and never
  // pays the clock a second time for the step the leader already paid for.
  const silent = options.silent === true;

  const map = txn.state.maps[actor.map];
  if (!map) {
    if (!silent) txn.emit({ type: 'refused', action: 'move', reason: 'not on a map' });
    return false;
  }

  // Movement draws on the same shared budget the actions do, so it obeys the
  // same turn order. AI movement never comes through here.
  const wrongTurn = outOfTurn(txn, actor.id);
  if (wrongTurn) {
    if (!silent) txn.emit({ type: 'refused', action: 'move', reason: wrongTurn });
    return false;
  }

  if (distance(actor.position, to) !== 1) {
    if (!silent) txn.emit({ type: 'refused', action: 'move', reason: 'that is not one step away' });
    return false;
  }

  if (!terrain.isPassable(map.tiles, to, actor.movementModes)) {
    const blocking = terrain.at(map.tiles, to);
    if (!silent) {
      txn.emit({ type: 'blocked', entity: actor.id, at: to, by: blocking.id || 'the edge of the world' });
    }
    return false;
  }

  const occupant = Object.values(txn.state.entities).find(
    (other) => other.alive && other.map === actor.map && other.id !== actor.id
      && other.position.x === to.x && other.position.y === to.y,
  );
  if (occupant) {
    if (!silent) txn.emit({ type: 'blocked', entity: actor.id, at: to, by: occupant.name });
    return false;
  }

  const cost = terrain.costOf(map.tiles, to, actor.movementModes);
  const combat = txn.state.combat;
  if (combat && combat.movement < cost) {
    if (!silent) txn.emit({ type: 'refused', action: 'move', reason: 'no movement left this turn' });
    return false;
  }

  const from = actor.position;

  // Leaving a threatened tile may provoke, and the reaction can kill the mover
  // before the step completes — so the move is re-checked afterwards.
  provokeOpportunity(txn, { module: txn.module, state: txn.state, terrain }, actor, from, to, _rng);
  const survived = txn.entity(actor.id);
  if (!survived || !survived.alive) return false;

  txn.putEntity({ ...survived, position: to });
  txn.emit({ type: 'moved', entity: actor.id, from, to, cost });
  if (combat) spendMovement(txn, cost);

  // Everyone in the party shares the fog of war: what one sees, all know. And
  // it is *seen*, not walked — recording only the tile underfoot left the
  // remembered layer as a one-tile breadcrumb trail through rooms the party had
  // stood in the middle of and looked around.
  if (actor.kind === 'character') {
    const walker = txn.entity(actor.id) ?? actor;
    markExplored(txn, actor.map, perceivedTiles(
      { module: txn.module, state: txn.state, terrain },
      walker,
      sightSenseOf(txn.module),
    ));
  }

  // And everything that walks leaves something behind for a nose to find.
  leaveMarks(txn, txn.entity(actor.id) ?? actor, to);

  // Walking takes time — but only out of combat, where a round is seconds and
  // the clock has no business moving.
  const perTile = txn.module.source.world.time.minutesPerTile;
  if (!silent && !combat && perTile > 0 && actor.kind === 'character') {
    advanceTime(txn, perTile, _rng);
  }

  // The rest of the party comes along, if they have been told to.
  if (!silent) moveFollowers(txn, terrain, actor.id, _rng);

  return true;
}

/**
 * Bring along whoever is walking with the leader.
 *
 * Runs inside the leader's step rather than as an action of its own: the clock
 * and the combat movement budget are charged once, by the person who chose to
 * move, and the followers ride along on it.
 *
 * Never in combat. There, initiative decides who acts and each character is
 * commanded individually — auto-walking the others would spend their turns for
 * them before the player had a say.
 */
function moveFollowers(
  txn: Transaction,
  terrain: TerrainIndex,
  leaderId: EntityId,
  rng: Rng,
): void {
  if (txn.state.combat) return;

  const leader = txn.entity(leaderId);
  if (!leader || !leader.alive) return;

  // Roster order, so two followers never race for the same tile differently on
  // two identical runs.
  for (const id of txn.state.party) {
    if (id === leaderId) continue;

    const member = txn.entity(id);
    if (!member || !member.alive) continue;
    if (member.following !== leaderId) continue;
    if (member.map !== leader.map) continue;

    // Already at the leader's shoulder: close enough, and crowding the tile
    // they are about to leave helps nobody.
    let steps = distance(member.position, leader.position) > 3 ? 2 : 1;

    while (steps > 0) {
      const current = txn.entity(id);
      const map = current ? txn.state.maps[current.map] : undefined;
      if (!current || !map) break;
      if (distance(current.position, leader.position) <= 1) break;

      const route = findPath({
        map: map.tiles,
        terrain,
        from: current.position,
        to: leader.position,
        modes: current.movementModes,
        blocked: occupiedTiles(txn.state, current.id),
        adjacentIsEnough: true,
      });

      const next = route.steps[0];
      // No way through, or blocked by someone standing in a doorway: stand
      // still. A refusal per follower per step would drown the transcript.
      if (!route.found || !next) break;
      if (!moveEntity(txn, terrain, current, next, rng, { silent: true })) break;
      steps -= 1;
    }
  }
}

/**
 * Record tiles as seen, for the fog of war.
 *
 * Kept sorted ascending so the list has a total order independent of the order
 * things were noticed in — saved state is compared array-positionally, and two
 * runs that saw the same ground in a different sequence must still be equal.
 */
function markExplored(txn: Transaction, mapId: string, seen: ReadonlySet<number>): void {
  const map = txn.state.maps[mapId];
  if (!map) return;

  const known = new Set(map.explored);
  let added = false;
  for (const packed of seen) {
    if (known.has(packed)) continue;
    // Sight reaches past the edge of the map; remembering tiles that do not
    // exist would put junk in the save and draw nothing.
    const at = unkey(packed);
    if (at.x < 0 || at.y < 0 || at.x >= map.tiles.width || at.y >= map.tiles.height) continue;
    known.add(packed);
    added = true;
  }
  if (!added) return;

  txn.set({
    ...txn.state,
    maps: {
      ...txn.state.maps,
      [mapId]: { ...map, explored: [...known].sort((a, b) => a - b) },
    },
  });
}

/** Advance the world clock, emitting a day boundary when one is crossed. */
export function advanceTime(txn: Transaction, minutes: number, rng: Rng): void {
  if (minutes <= 0) return;

  const perDay = txn.module.source.world.time.minutesPerDay;
  const before = txn.state.minute;
  const after = before + minutes;

  txn.set({ ...txn.state, minute: after });
  txn.emit({ type: 'timePassed', minutes, totalMinute: after });

  // Anything that noticed something has this long to act on it. Out of combat
  // the world moves because time passes, not because the player typed.
  const terrain = terrainFor(txn.module);
  runIdleTurns(txn, { module: txn.module, state: txn.state, terrain }, rng, minutes);

  // Every day boundary crossed runs the world forward, however long the jump.
  // Resting through a week must age the world by a week, not by one tick.
  const dayBefore = Math.floor(before / perDay);
  const dayAfter = Math.floor(after / perDay);
  for (let day = dayBefore + 1; day <= dayAfter; day += 1) {
    tickDay(txn, day, rng);
  }
}

/**
 * Consequences that follow any action: death, victory, defeat.
 *
 * Run once at the end of a reduction rather than inside each handler, so a
 * handler cannot forget to check and the party cannot be left alive-but-dead.
 */
function settle(txn: Transaction, terrain: TerrainIndex, rng: Rng): void {
  if (txn.state.outcome !== 'playing') return;

  // Combat begins the moment something hostile shares the map, and ends the
  // moment one side is gone — there is no explicit "enter combat" on a grid
  // that is always on.
  // Everything notices what there is to notice before anyone decides anything,
  // so a creature that heard you a moment ago acts on it this turn rather than
  // next.
  perceiveAll(txn, terrain);

  maybeEndCombat(txn, { module: txn.module, state: txn.state, terrain });
  maybeStartCombat(txn, { module: txn.module, state: txn.state, terrain }, rng);

  // Anything that is not a player character takes its turn as soon as the turn
  // reaches it, rather than waiting for the player to end a turn. Doing this
  // here — after every action — means a monster that becomes active because
  // combat just started, or because the previous creature died, still acts.
  if (txn.state.combat) {
    runAiTurns(
      txn,
      { module: txn.module, state: txn.state, terrain },
      rng,
      (t, _c, r) => endCombatTurn(t, { module: t.module, state: t.state, terrain }, r),
    );
    maybeEndCombat(txn, { module: txn.module, state: txn.state, terrain });
  }

  // The module says what winning is. Checked before the all-dead test on
  // purpose: a party that falls on the blow that ends it has still won.
  const start = txn.module.source.start;
  if (outcomeReached(txn, start.victoryWhen, rng)) {
    txn.set({ ...txn.state, outcome: 'victory' });
    txn.emit({ type: 'gameOver', outcome: 'victory' });
    return;
  }
  if (outcomeReached(txn, start.defeatWhen, rng)) {
    txn.set({ ...txn.state, outcome: 'defeat' });
    txn.emit({ type: 'gameOver', outcome: 'defeat' });
    return;
  }

  const party = txn.state.party.map((id) => txn.state.entities[id]).filter(Boolean) as Entity[];
  if (party.length > 0 && party.every((member) => !member.alive)) {
    txn.set({ ...txn.state, outcome: 'defeat' });
    txn.emit({ type: 'gameOver', outcome: 'defeat' });
  }
}

/**
 * Whether a module-declared ending condition holds.
 *
 * A malformed predicate must not be able to end a run or crash a turn, so it
 * simply reads as "not yet" — the same forgiving treatment the grammar gives a
 * bad variant gate.
 */
function outcomeReached(txn: Transaction, when: unknown, rng: Rng): boolean {
  if (!when) return false;
  const leader = txn.state.entities[txn.state.selected];
  if (!leader) return false;

  try {
    const scope = buildScope(txn.module, txn.state, leader);
    return evalPredicate(when as Predicate, { scope, rng, openNamespaces: OPEN_NAMESPACES });
  } catch {
    return false;
  }
}

/**
 * In combat, initiative decides who may act — a reason naming whose turn it is,
 * or null when the actor is free to go ahead.
 *
 * The budget is a single record on the combat state, so without this check the
 * selected character could act on any combatant's turn and spend it for them —
 * and the refusal the player then saw, "no action left this turn", read as a
 * budget problem rather than a turn-order one.
 */
function outOfTurn(txn: Transaction, actorId: EntityId): string | null {
  const combat = txn.state.combat;
  if (!combat) return null;
  const activeId = combat.order[combat.turn];
  if (!activeId || activeId === actorId) return null;
  const active = txn.entity(activeId);
  return active ? `it is ${active.name}'s turn` : null;
}

/**
 * Use an ability and, in combat, spend the action it costs.
 *
 * Shared by `attack` and `useAbility` so the budget can never be spent by one
 * path and not the other.
 */
function performAbility(
  txn: Transaction,
  targeting: () => TargetingContext,
  actorId: EntityId,
  abilityId: string,
  explicit: { target?: EntityId; at?: Position },
  rng: Rng,
): void {
  const actor = txn.entity(actorId);
  if (!actor) return;

  const wrongTurn = outOfTurn(txn, actorId);
  if (wrongTurn) {
    txn.emit({ type: 'refused', action: 'useAbility', reason: wrongTurn });
    return;
  }

  const ability = txn.module.find<{ actionType?: string }>('content.abilities', abilityId);
  if (txn.state.combat && !hasBudget(txn, ability?.actionType)) {
    txn.emit({ type: 'refused', action: 'useAbility', reason: 'no action left this turn' });
    return;
  }

  const before = new Set(
    Object.values(txn.state.entities).filter((entity) => entity.alive).map((entity) => entity.id),
  );

  const result = useAbility(txn, targeting(), actor, abilityId, explicit, rng);
  if (!result.used) return;

  spendBudget(txn, ability?.actionType);

  // Anything that died this action is something the survivors may react to.
  for (const entity of Object.values(txn.state.entities)) {
    if (entity.alive || !before.has(entity.id)) continue;
    broadcastReaction(txn, 'allyKilled', entity, rng.derive(`died:${entity.id}`));
  }
}

/**
 * Apply a sequence of actions.
 *
 * The replay primitive: a seed and a list of actions reproduce a run exactly,
 * which is what the determinism tests assert.
 */
export function reduceAll(
  state: GameState,
  actions: readonly Action[],
  context: ReduceContext,
): ReduceResult {
  let current = state;
  const events: GameEvent[] = [];

  for (const action of actions) {
    const result = reduce(current, action, context);
    current = result.state;
    events.push(...result.events);
  }

  return { state: current, events };
}
