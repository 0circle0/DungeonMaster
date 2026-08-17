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
import { evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Predicate, Requirement } from '@dm/module';
import { buildScope, OPEN_NAMESPACES } from './stats.js';
import type { Action } from './actions.js';
import { DIRECTION_OFFSETS } from './actions.js';
import type { GameEvent } from './events.js';
import type { GameState, Entity, EntityId } from './state.js';
import { Transaction, adjustResource } from './rules/apply.js';
import { statsOf } from './stats.js';
import { tickAllConditions } from './rules/conditions.js';
import { recoverSlots } from './rules/casting.js';
import { runPartyPassives } from './rules/passives.js';
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
  joinCombat,
} from './rules/combat/turn.js';
import { runAiTurns, runIdleTurns } from './rules/combat/ai.js';
import { enterDungeon, enterArea, enterPoi, placeParty } from './sim/enter.js';
import { openGate, markGateOpen, describeRequirement } from './sim/gates.js';
import { startQuest, abandonQuest, advanceQuests, questsOffered } from './sim/quests.js';
import { startDialogue, chooseOption, canTalkTo, endDialogue } from './sim/dialogue.js';
import { dropDeathLoot } from './sim/spoils.js';
import { endingReached, endingFlag } from './sim/arcs.js';
import { buyItem, sellItem } from './sim/trade.js';
import { springTrap, searchForTraps, disarmTrap } from './sim/traps.js';
import { runTerrain } from './sim/terrain.js';
import { runTriggers, triggersFor } from './sim/triggers.js';
import { recordDeed } from './sim/deeds.js';
import { dispatchReactions, dispatchNoticed } from './sim/reactions.js';
import { tickDay } from './sim/agenda.js';
import { takeItem, dropItem, equipItem, unequipItem, useItem, giveItem, rechargeItems } from './sim/items.js';
import { skillCheck, succeeded, difficultyFrom } from './rules/check.js';
import type { TargetingContext } from './rules/combat/targeting.js';
import { TerrainIndex, key, unkey, terrainFor } from './grid/tiles.js';
import type { Position } from './grid/tiles.js';
import { findPath } from './grid/path.js';
import { distance } from './grid/geometry.js';
import { isHostileTo } from './rules/combat/targeting.js';
import { leaveMarks, perceiveAll, perceivedTiles, sightSenseOf } from './sim/senses.js';
import { message, joinMessages } from './narrate/systemText.js';
import type { Message } from './narrate/systemText.js';
import type { ModRuntime } from './mods/runtime.js';

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
  /**
   * Installed mods.
   *
   * Absent means no mods, which is byte-for-byte today's behaviour: every hook
   * site is an optional-chain miss, so nothing is allocated, serialized, or
   * crossed. `mods.test.ts` proves that by replaying the same action list with
   * and without a zero-mod runtime and comparing states.
   */
  readonly mods?: ModRuntime | undefined;
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

/**
 * What an action costs on the world clock.
 *
 * Searching a room and disarming a trap were ten minutes each because the
 * engine said so, while `minutesPerTile` and rest durations were the GM's all
 * along. An action the module does not price costs nothing.
 */
function actionMinutes(module: CompiledModule, action: string): number {
  return module.source.world.time.actionMinutes[action] ?? 0;
}

export function reduce(state: GameState, action: Action, context: ReduceContext): ReduceResult {
  const { module } = context;
  const terrain = context.terrain ?? terrainFor(module);
  const mods = context.mods ?? null;
  const txn = new Transaction(state, module, mods);

  // The run's RNG is restored, used, and written back, so consuming randomness
  // is itself part of the state transition and replays identically.
  const rng = Rng.fromState(state.rng);

  /** Rebuilt per read because it closes over the transaction's current state. */
  const targeting = (): TargetingContext => ({ module, state: txn.state, terrain });

  // Mods get first refusal on every action. A `replace` handler stands in for
  // the core case entirely — which is how a mod rewrites an existing rule
  // rather than only adding to it.
  let replacedByMod = false;
  if (mods?.has('action.before', action.type)) {
    const actorId = 'actor' in action && action.actor ? action.actor : state.selected;
    const outcome = mods.run(txn, 'action.before', { action, actorId }, rng);
    replacedByMod = outcome.replaced;
    if (outcome.refused) {
      txn.set({ ...txn.state, rng: rng.save() });
      return txn.finish();
    }
  }

  // No braces so the switch below keeps its indentation, and — more to the
  // point — so `action.type` stays the scrutinee. Switching on anything
  // computed would destroy the discriminated-union narrowing that every case
  // in this function depends on.
  if (!replacedByMod)
  switch (action.type) {
    case 'step':
    case 'move': {
      const actor = actorOf(state, action);
      if (!actor) {
        txn.emit({ type: 'refused', action: action.type, reason: message('refused.actor.missing') });
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
        txn.emit({ type: 'refused', action: 'travelTo', reason: message('refused.actor.missing') });
        break;
      }
      const map = txn.state.maps[txn.state.currentMap];
      if (!map) {
        txn.emit({ type: 'refused', action: 'travelTo', reason: message('refused.travel.noMap') });
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
        txn.emit({ type: 'refused', action: 'travelTo', reason: message('refused.travel.noRoute') });
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
      const minutes = Math.max(0, action.minutes ?? actionMinutes(txn.module, 'wait'));
      advanceTime(txn, minutes, rng);
      break;
    }

    case 'advanceTime':
      advanceTime(txn, Math.max(0, action.minutes), rng);
      break;

    case 'select': {
      if (!state.party.includes(action.entity)) {
        txn.emit({ type: 'refused', action: 'select', reason: message('refused.select.notParty') });
        break;
      }
      txn.set({ ...txn.state, selected: action.entity });
      break;
    }

    case 'attack': {
      const actor = actorOf(state, action);
      if (!actor) {
        txn.emit({ type: 'refused', action: 'attack', reason: message('refused.actor.missing') });
        break;
      }
      const abilityId = defaultAttackAbility(module, actor);
      if (!abilityId) {
        txn.emit({ type: 'refused', action: 'attack', reason: message('refused.attack.noWeapon', { who: actor.name }) });
        break;
      }
      performAbility(txn, targeting, actor.id, abilityId, { target: action.target }, rng);
      break;
    }

    case 'useAbility': {
      const actor = actorOf(state, action);
      if (!actor) {
        txn.emit({ type: 'refused', action: 'useAbility', reason: message('refused.actor.missing') });
        break;
      }
      performAbility(
        txn,
        targeting,
        actor.id,
        action.ability,
        {
          ...(action.target ? { target: action.target } : {}),
          ...(action.at ? { at: action.at } : {}),
          ...(action.ritual ? { ritual: true } : {}),
        },
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
      const poi = module.find<{ id: string; gate?: string; travelMinutes?: number }>(
        'world.pointsOfInterest',
        action.target,
      );
      if (poi) {
        let opened = true;
        if (poi.gate) {
          const outcome = openGate(txn, poi.gate, actor, rng);
          opened = outcome.opened;
        }
        const entered = enterPoi(txn, terrain, action.target, actor, rng, opened);
        // The walk out to it. Exit labels have printed this number since the
        // beginning and the clock never moved, so a place "45m away" was next
        // door.
        if (entered && poi.travelMinutes) advanceTime(txn, poi.travelMinutes, rng);
        break;
      }
      if (module.has('world.dungeons', action.target)) {
        enterDungeon(txn, terrain, action.target, rng);
        break;
      }
      txn.emit({ type: 'refused', action: 'enter', reason: message('refused.enter.noSuchPlace', { target: action.target }) });
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
          txn.emit({ type: 'refused', action: 'travelToArea', reason: message('refused.travel.noRoad') });
          break;
        }

        // A cliff you can descend but not climb. `travelToArea` looks the route
        // up on the *origin*, so an asymmetry made by omission was already
        // enforced — but a module that lists its roads both ways, which is the
        // natural thing to do, got nothing from `oneWay` at all.
        const back = module
          .find<{ connections: { to: string; oneWay: boolean }[] }>('world.areas', action.area)
          ?.connections.find((entry) => entry.to === areaId);
        if (back?.oneWay) {
          txn.emit({ type: 'refused', action: 'travelToArea', reason: message('refused.travel.noWayUp') });
          break;
        }

        // An area may be gated on more than a door. `requires` on an area was
        // the registry's own complaint: a gate that gates nothing.
        const destination = module.find<{ requires?: Requirement }>('world.areas', action.area);
        if (!isEmptyRequirement(destination?.requires)) {
          const traveller = actorOf(state, action);
          const scope = traveller ? buildScope(module, txn.state, traveller) : {};
          const met = evalPredicate(compileRequirement(destination!.requires), {
            scope, rng, openNamespaces: OPEN_NAMESPACES,
          });
          if (!met) {
            const missing = describeRequirement(destination!.requires);
            txn.emit({
              type: 'refused',
              action: 'travelToArea',
              reason: missing.length > 0
                ? message('refused.travel.notYet', { missing: joinMessages(txn.module, missing) })
                : message('refused.travel.notYet.plain'),
            });
            break;
          }
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
      txn.emit({ type: 'refused', action: 'open', reason: message('refused.open.noSuchThing', { target: action.target }) });
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
        txn.emit({ type: 'refused', action: 'sense', reason: message('refused.sense.unknown') });
        break;
      }

      // Stopping to listen or take the air costs time, and the world moves in
      // it — which is the point: it is a real thing to spend time on. How much
      // is `world.time.actionMinutes`, like every other duration here.
      advanceTime(txn, actionMinutes(txn.module, 'sense'), rng);
      txn.emit({ type: 'custom', event: 'sensed', data: { sense: sense.id, by: actor.id } });
      break;
    }

    case 'setFollow': {
      const actor = actorOf(state, action);
      if (!actor) break;

      if (txn.state.combat) {
        txn.emit({
          type: 'refused', action: 'setFollow',
          reason: message('refused.follow.inCombat'),
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
        .all<{ id: string; area: string; hidden: boolean; discover?: { skill: string; difficulty: unknown } }>(
          'world.pointsOfInterest',
        )
        .filter((poi) => poi.area === areaId && poi.hidden && poi.discover)
        .filter((poi) => txn.state.flags[`found:${poi.id}`] !== true);

      // Searching also finds what is buried underfoot. This is deliberately the
      // *only* way a trap is found: a passive roll re-made on every step finds
      // everything eventually and teaches the player nothing.
      const foundTraps = searchForTraps(txn, actor, rng.derive('traps'));

      if (hidden.length === 0 && !foundTraps) {
        // Silence reads as a broken command, so say plainly that the search
        // turned nothing up.
        txn.emit({ type: 'refused', action: 'search', reason: message('refused.search.nothing') });
        runSearchTriggers(txn, actor, rng);
        break;
      }

      for (const poi of hidden) {
        // A formula here is how a clue makes a place findable without making
        // it a prerequisite: the number falls as the party learns more, so a
        // party that knows nothing can still turn it up and rarely does.
        const roll = skillCheck(
          module, rng, actor, poi.discover!.skill,
          difficultyFrom(module, txn.state, actor, poi.discover!.difficulty, rng.derive(`findDc:${poi.id}`)),
        );
        txn.emit({ type: 'checked', entity: actor.id, skill: poi.discover!.skill, attribute: null, roll });
        if (!succeeded(roll)) continue;

        txn.set({ ...txn.state, flags: { ...txn.state.flags, [`found:${poi.id}`]: true } });
        txn.emit({ type: 'discovered', what: poi.id, kind: 'poi' });
      }
      runSearchTriggers(txn, actor, rng);
      advanceTime(txn, actionMinutes(txn.module, 'search'), rng);
      break;
    }

    case 'buy': {
      const actor = actorOf(state, action);
      if (!actor) break;
      buyItem(txn, action.npc, actor, action.item, action.quantity ?? 1, rng.derive('buy'));
      break;
    }

    case 'sell': {
      const actor = actorOf(state, action);
      if (!actor) break;
      sellItem(txn, action.npc, actor, action.item, action.quantity ?? 1, rng.derive('sell'));
      break;
    }

    case 'disarm': {
      const actor = actorOf(state, action);
      if (!actor) break;
      disarmTrap(txn, actor, rng.derive('disarm'));
      if (!txn.state.combat) advanceTime(txn, actionMinutes(txn.module, 'disarm'), rng);
      break;
    }

    case 'talk': {
      const actor = actorOf(state, action);
      if (!actor) break;
      if (!canTalkTo(actor, action.npc, txn)) {
        txn.emit({ type: 'refused', action: 'talk', reason: message('refused.talk.tooFar') });
        break;
      }
      const speaker = txn.entity(action.npc);
      if (speaker) startDialogue(txn, actor, speaker, rng);

      // What they have for you, whether or not they have a dialogue tree. A
      // module that said "Vess offers the mill door" needed a conversation
      // authored before that meant anything.
      for (const quest of questsOffered(txn, action.npc, rng.derive('offers'))) {
        txn.emit({
          type: 'custom',
          event: 'questOffered',
          data: { quest: quest.id, npc: action.npc, name: quest.name },
        });
      }
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
        txn.emit({ type: 'refused', action: 'rest', reason: message('refused.rest.notHere') });
        break;
      }
      if (txn.state.combat) {
        txn.emit({ type: 'refused', action: 'rest', reason: message('refused.rest.inCombat') });
        break;
      }

      runOccasion(txn, 'rest', rng);
      rechargeItems(txn, rest.id, rng.derive('recharge'));
      recoverSlots(txn, rest.id);
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
          reason: message('refused.rest.interrupted'),
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
        txn.emit({ type: 'refused', action: 'flee', reason: message('refused.flee.noCombat') });
        break;
      }

      // Running away is movement, not an escape hatch. The actor spends its
      // whole movement putting ground between itself and whatever is closest,
      // which means adjacent enemies get their parting blow like any other
      // disengagement, and the fight ends only once nobody can see anybody —
      // which `maybeEndCombat` decides, not this handler.
      const steps = runAway(txn, terrain, actor.id, rng);

      if (steps === 0) {
        txn.emit({ type: 'refused', action: 'flee', reason: message('refused.flee.noExit') });
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
        // The way out is the way in: the exit tile recorded when the party
        // first arrived. Standing on or beside it, "leave" walks back to
        // wherever they came from — beside counts because the party clusters
        // on arrival and a member may be occupying the tile itself. Anywhere
        // else, the dungeon still has to be crossed.
        const inside = txn.state.maps[txn.state.currentMap];
        const leader = txn.entity(txn.state.selected);
        const exit = inside && leader
          ? Object.entries(inside.exits).find(([tile]) => {
              const at = unkey(Number(tile));
              return Math.max(Math.abs(at.x - leader.position.x), Math.abs(at.y - leader.position.y)) <= 1;
            })?.[1]
          : undefined;
        if (!exit || !txn.state.maps[exit.toMap]) {
          txn.emit({ type: 'refused', action: 'leave', reason: message('refused.leave.noExitFound') });
          break;
        }

        runOccasion(txn, 'exit', rng);

        const colon = exit.toMap.indexOf(':');
        const outsideKind = exit.toMap.slice(0, colon);
        const outsideId = exit.toMap.slice(colon + 1);
        if (outsideKind === 'area') {
          txn.set({ ...txn.state, location: { kind: 'area', area: outsideId } });
        } else if (outsideKind === 'poi') {
          const poi = module.find<{ area: string }>('world.pointsOfInterest', outsideId);
          if (poi) {
            txn.set({ ...txn.state, location: { kind: 'poi', area: poi.area, poi: outsideId } });
          }
        } else {
          txn.set({ ...txn.state, location: { kind: 'dungeon', dungeon: outsideId, room: '' } });
        }

        placeParty(txn, terrain, exit.toMap, exit.at);
        txn.emit({ type: 'custom', event: 'entered', data: { place: outsideId, kind: outsideKind } });
        break;
      }
      // Whatever the place has to say about being left. Declared by the schema
      // since the beginning and fired from nowhere.
      if (here.kind === 'poi') runOccasion(txn, 'exit', rng);
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
        // Stepping out of an interior puts you on the doorstep — the place's
        // outdoor position — not at the area's arrival point across the map.
        const outside = module.find<{ position?: Position }>('world.pointsOfInterest', here.poi);
        if (outside?.position) placeParty(txn, terrain, `area:${here.area}`, outside.position);
        break;
      }
      txn.emit({ type: 'refused', action: 'leave', reason: message('refused.leave.nowhere') });
      break;
    }

    case 'setStance': {
      const actor = actorOf(state, action);
      if (!actor) break;

      const stance = module.find<{ id: string; name: string }>('rules.stances', action.stance);
      if (!stance) {
        txn.emit({ type: 'refused', action: 'setStance', reason: message('refused.stance.unknown', { stance: action.stance }) });
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
        reason: message('refused.action.unknown', { action: unhandled.type }),
      });
      break;
    }
  }

  // Mods see the action's own events before anything settles, which is what
  // makes "react to what just happened" possible without re-deriving it.
  if (mods?.has('action.after', action.type)) {
    const actorId = 'actor' in action && action.actor ? action.actor : state.selected;
    const seen = txn.finish().events.map((event) => event.type);
    mods.run(txn, 'action.after', { action, actorId, events: seen }, rng);
  }

  // Write the advanced generator back, then settle anything the action caused.
  txn.set({ ...txn.state, rng: rng.save() });
  settle(txn, terrain, rng);

  // After everything the action set in motion has resolved. Deliberately no
  // `replace`: see the note on the hook.
  if (mods?.has('settle.after')) {
    mods.run(
      txn,
      'settle.after',
      { inCombat: txn.state.combat !== null, outcome: txn.state.outcome },
      rng,
    );
  }

  const pending = txn.finish();
  const followUp = new Transaction(pending.state, module, mods);

  // Consequences can have consequences. Each pass sees only what the previous
  // one produced, and stops when a pass produces nothing.
  let batch: readonly GameEvent[] = pending.events;
  let produced: GameEvent[] = [];
  for (let pass = 0; pass < MAX_EMISSION_PASSES && batch.length > 0; pass += 1) {
    const before = followUp.finish().events.length;
    processEmissions(followUp, terrain, batch, rng, pass);
    produced = followUp.finish().events.slice(before);
    batch = produced;
  }

  // A module whose consequences never settle says so rather than being silently
  // truncated. Deliberately an event carrying data and not a `refused` carrying
  // prose: every message-tier entry in the system-text registry has a schema
  // default, so adding one would move the hash of every module in existence and
  // invalidate every save — which is exactly what `compile.test.ts` pins
  // `minimal`'s hash to catch. This is a fact about a broken module, and facts
  // travel as events.
  if (batch.length > 0) {
    followUp.emit({
      type: 'custom',
      event: 'emissionsUnsettled',
      data: { passes: MAX_EMISSION_PASSES, pending: batch.length },
    });
  }

  const settled = followUp.finish();
  return { state: settled.state, events: [...pending.events, ...settled.events] };
}

/**
 * How many times a batch of events may set off another batch.
 *
 * The same posture as `narrative.maxDialogueHops` and gossip's `maxHops`: deep
 * enough that no honest chain hits it, shallow enough that a quest whose
 * `onComplete` restarts itself stops rather than hanging the turn.
 */
const MAX_EMISSION_PASSES = 4;

/**
 * Everything a batch of events sets in motion.
 *
 * This used to run once, straight-line, over the action's own events — which
 * meant anything `advanceQuests` emitted arrived after the scan had finished
 * and was never looked at. `quest.remembersAs` produced no deed at all,
 * `onComplete` could not emit `startQuest`, and an objective's `onComplete`
 * could not set off a trigger. Looping it fixes all three.
 *
 * Feeding each pass **only the previous pass's new events** is what makes that
 * safe. Re-feeding the accumulated list would double-count a multi-kill
 * objective, since `advanceQuests` tallies hits per batch into a progress flag,
 * and would drop the same corpse's loot twice.
 *
 * Pass 0 keeps its original rng labels exactly, so a module whose quests emit
 * nothing has a byte-identical trace to before and only the runs this fix is
 * *for* change at all.
 */
function processEmissions(
  txn: Transaction,
  terrain: TerrainIndex,
  events: readonly GameEvent[],
  rng: Rng,
  pass: number,
): void {
  const suffix = pass === 0 ? '' : `:${pass}`;

  // Re-read the leader each pass: a quest's `onComplete` can change who is
  // selected, or kill them.
  const actor = txn.entity(txn.state.selected);

  // Content asks for a deed by emitting one; recording it here means every
  // path that can cause one — a trigger, a quest, a dialogue node — is covered.
  if (actor) {
    for (const event of events) {
      if (event.type !== 'custom' || event.event !== 'deed') continue;
      const kind = String((event.data as { kind?: unknown }).kind ?? '');
      if (kind) recordDeed(txn, terrain, kind, actor, null, rng.derive(`deed:${kind}${suffix}`));
    }
  }

  // A quest can be handed over in conversation. This runs before the quests
  // advance so the job the party just took can be progressed by the same batch
  // of events that granted it — accepting and arriving are often one moment.
  for (const event of events) {
    if (event.type !== 'custom' || event.event !== 'startQuest') continue;
    const questId = String((event.data as { quest?: unknown }).quest ?? '');
    if (questId) startQuest(txn, questId, rng.derive(`quest:${questId}${suffix}`));
  }

  // A trigger can wait on an event the content itself emits, which is what
  // `on: 'custom'` has always meant and never done.
  for (const event of events) {
    if (event.type !== 'custom') continue;
    if (event.event === 'deed' || event.event === 'startQuest') continue;
    runOccasion(txn, 'custom', rng.derive(`custom:${event.event}${suffix}`), event.event);
  }

  // Whoever declared they would react to any of this. After the deed scan, so
  // `witnessDeed` sees a deed the same batch recorded.
  dispatchReactions(txn, events, rng.derive(`reactions${suffix}`));

  // The dead leave what they were carrying. Before quests advance, so a "bring
  // me its hide" objective can be satisfied by the same batch that killed it.
  dropDeathLoot(txn, terrain, events, rng.derive(`spoils${suffix}`));

  // Quests watch everything that just happened.
  advanceQuests(txn, events, rng.derive(`quests${suffix}`));
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
    if (!silent) txn.emit({ type: 'refused', action: 'move', reason: message('refused.move.noMap') });
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
    if (!silent) txn.emit({ type: 'refused', action: 'move', reason: message('refused.move.tooFar') });
    return false;
  }

  if (!terrain.isPassable(map.tiles, to, actor.movementModes)) {
    const blocking = terrain.at(map.tiles, to);
    if (!silent) {
      // An empty id means there was no tile at all — the narrator has a word
      // for that, and it is the module's word.
      txn.emit({ type: 'blocked', entity: actor.id, at: to, by: blocking.id });
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
    if (!silent) txn.emit({ type: 'refused', action: 'move', reason: message('refused.move.noMovement') });
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

  // What the ground itself does to whoever stands on it — lava, caltrops, a
  // pressure plate. Declared on every terrain and read by nothing until now.
  runTerrain(txn, actor.id, 'onEnter', to, _rng);

  // Walking into a new room is how a generated dungeon gets described at all:
  // a room template's `descriptionKey` is required by the schema and was
  // narrated nowhere, so every corridor and chamber read as blank ground.
  enterRoom(txn, actor.id, from, to, _rng);

  // And whatever is buried under the tile.
  const stepped = txn.entity(actor.id);
  if (stepped) springTrap(txn, stepped, _rng.derive(`trap:${actor.id}`));

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
 * Every place the party is currently inside, innermost last.
 *
 * A trigger declared on the biome, the area, the point of interest, the room,
 * or the dungeon should all get their occasion — `runTriggers` has always taken
 * one and was only ever called with `'enter'`, from three places.
 */
function placesHere(txn: Transaction): { collection: string; id: string }[] {
  const here = txn.state.location;
  const out: { collection: string; id: string }[] = [];

  if (here.kind === 'area' || here.kind === 'poi') {
    const area = txn.module.find<{ biome: string }>('world.areas', here.area);
    if (area) out.push({ collection: 'world.biomes', id: area.biome });
    out.push({ collection: 'world.areas', id: here.area });
    if (here.kind === 'poi') out.push({ collection: 'world.pointsOfInterest', id: here.poi });
  } else if (here.kind === 'dungeon') {
    out.push({ collection: 'world.dungeons', id: here.dungeon });
  }

  const map = txn.state.maps[txn.state.currentMap];
  const actor = txn.entity(txn.state.selected);
  if (map && actor) {
    const room = roomAt(txn, actor.map, actor.position);
    if (room) out.push({ collection: 'world.roomTemplates', id: room.template });
  }
  return out;
}

/**
 * Fire everything declared for an occasion, wherever the party is standing.
 *
 * `trigger.on` accepts eight occasions and only `enter` ever happened, so
 * `exit`, `rest`, `search`, `combatStart`, `combatEnd`, `timePass` and `custom`
 * were all authorable and inert — and `mode: 'loop'` with them, since a loop
 * needs an occasion that recurs.
 */
export function runOccasion(
  txn: Transaction,
  occasion: string,
  rng: Rng,
  customEvent?: string,
): void {
  const actor = txn.entity(txn.state.selected);
  if (!actor) return;

  const here = txn.state.location;
  const source =
    here.kind === 'poi' ? { id: here.poi, kind: 'poi' as const }
    : here.kind === 'area' ? { id: here.area, kind: 'area' as const }
    : here.kind === 'dungeon' ? { id: here.dungeon, kind: 'dungeon' as const }
    : null;
  if (!source) return;

  // Mods see every occasion, including the `custom` events content emits — so
  // a mod can listen to the module's own pub/sub as well as the engine's.
  // A `replace` here stands in for the module's triggers entirely.
  const key = customEvent ?? occasion;
  if (txn.mods?.has('occasion', key)) {
    const outcome = txn.mods.run(
      txn,
      'occasion',
      { occasion, customEvent: customEvent ?? null, sourceId: source.id, sourceKind: source.kind },
      rng.derive(`modOccasion:${key}`),
    );
    if (outcome.replaced) return;
  }

  runTriggers(
    txn, triggersFor(txn, placesHere(txn)), occasion, source, actor,
    rng.derive(`occasion:${occasion}`), customEvent,
  );
}

function runSearchTriggers(txn: Transaction, _actor: Entity, rng: Rng): void {
  runOccasion(txn, 'search', rng);
}

/** The room of a map a position falls inside, if the map records rooms. */
function roomAt(txn: Transaction, mapId: string, at: Position): { id: string; template: string } | null {
  const map = txn.state.maps[mapId];
  for (const room of map?.rooms ?? []) {
    if (at.x >= room.x && at.x < room.x + room.width
      && at.y >= room.y && at.y < room.y + room.height) return room;
  }
  return null;
}

/**
 * Notice walking from one room into another.
 *
 * The description is given once per room per save — a corridor announced on
 * every step back and forth would be worse than silence — but the room's own
 * triggers use their declared mode, so an `everyEntry` ambush still works.
 */
function enterRoom(txn: Transaction, actorId: EntityId, from: Position, to: Position, rng: Rng): void {
  const actor = txn.entity(actorId);
  if (!actor || actor.kind !== 'character') return;

  const room = roomAt(txn, actor.map, to);
  if (!room) return;
  if (roomAt(txn, actor.map, from)?.id === room.id) return;

  const template = txn.module.find<{ descriptionKey?: string }>('world.roomTemplates', room.template);
  const seen = `seen:${actor.map}:${room.id}`;
  if (template?.descriptionKey && txn.state.flags[seen] !== true) {
    txn.set({ ...txn.state, flags: { ...txn.state.flags, [seen]: true } });
    txn.emit({ type: 'narrate', textKey: template.descriptionKey, context: { place: room.id } });
  }

  runTriggers(
    txn,
    triggersFor(txn, [{ collection: 'world.roomTemplates', id: room.template }]),
    'enter',
    { id: room.id, kind: 'room' },
    actor,
    rng.derive(`room:${room.id}`),
  );
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
    // they are about to leave helps nobody. How far is "trailing" and how fast
    // they close it up is party cohesion, and so the module's to set.
    const follow = txn.module.source.start.partyFollow;
    let steps = distance(member.position, leader.position) > follow.catchUpDistance
      ? follow.catchUpSteps
      : 1;

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

  // Ambience, weather, the thing that stirs at dusk. `timePass` is what a
  // `mode: 'loop'` trigger with a cooldown is written against.
  runOccasion(txn, 'timePass', rng.derive(`timePass:${after}`));

  // Anything that noticed something has this long to act on it. Out of combat
  // the world moves because time passes, not because the player typed.
  const terrain = terrainFor(txn.module);
  runIdleTurns(txn, { module: txn.module, state: txn.state, terrain }, rng, minutes);

  // Every day boundary crossed runs the world forward, however long the jump.
  // Resting through a week must age the world by a week, not by one tick.
  const dayBefore = Math.floor(before / perDay);
  const dayAfter = Math.floor(after / perDay);

  // The world tick. Once per call rather than per minute, because resting
  // through a week is one jump, not ten thousand.
  if (txn.mods?.has('time.after')) {
    txn.mods.run(
      txn,
      'time.after',
      { minutes, totalMinute: after, daysCrossed: dayAfter - dayBefore },
      rng.derive(`modTime:${after}`),
    );
  }
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
  const noticed = perceiveAll(txn, terrain);

  // Anything that has just spotted a party member. Before `maybeStartCombat`,
  // so a reaction that kills or drives off the observer keeps it out of the
  // fight it would otherwise have started.
  dispatchNoticed(txn, noticed, rng.derive('noticed'));

  // What an ancestry *is* and what a carried thing *does* — asked every
  // reduction, because a passive whose condition changed should take effect
  // when it changes rather than when somebody happens to swing.
  runPartyPassives(txn, rng.derive('passives'));

  // A fight starting and a fight ending are both occasions a place can declare
  // something for — an alarm, a door slamming, a cave-in once it is over.
  const eventsBefore = txn.finish().events.length;
  const combatBefore = txn.state.combat !== null;
  maybeEndCombat(txn, { module: txn.module, state: txn.state, terrain });
  maybeStartCombat(txn, { module: txn.module, state: txn.state, terrain }, rng);
  // Someone whose stance changed while the fight was already running. Runs
  // after `maybeStartCombat`, which does nothing once combat exists.
  joinCombat(txn, { module: txn.module, state: txn.state, terrain }, rng);

  if (!combatBefore && txn.state.combat !== null) {
    runOccasion(txn, 'combatStart', rng.derive('combatStart'));
  } else if (combatBefore && txn.state.combat === null) {
    runOccasion(txn, 'combatEnd', rng.derive('combatEnd'));
  }

  // `combatStarted`, `combatEnded` and `turnStarted` are emitted here rather
  // than by the action, so they are already past `processEmissions` by the time
  // it runs. Fanning them out from inside `settle` is what makes the combat
  // lifecycle triggers live at all.
  let dispatched = txn.finish().events.length;
  dispatchReactions(txn, txn.finish().events.slice(eventsBefore), rng.derive('settleReactions'));

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

    // The AI's turns emit their own `turnStarted` — and their own damage — so
    // the fan-out runs again over whatever they produced. Two passes rather
    // than one at the end, because `seePlayer` and `combatStart` have to be
    // able to change the board *before* anybody acts on it.
    dispatchReactions(txn, txn.finish().events.slice(dispatched), rng.derive('aiReactions'));
    dispatched = txn.finish().events.length;
  }

  // The module says what winning is, and both ways of saying it are checked
  // before the all-dead test on purpose: a party that falls on the blow that
  // ends it has still won.
  const start = txn.module.source.start;
  const ending = endingReached(txn.module, txn.state);
  if (ending && !txn.state.flags[endingFlag(ending.id)]) {
    // `gameOver` as well as the arc event, because `gameOver` is the only thing
    // `narrate` renders `game.victory` from — emitting a bare `custom` here is
    // why finishing a module whose ending is an arc has always been silent.
    //
    // The flag is what makes this fire once. In `continue` mode `outcome` stays
    // `playing`, so `endingReached` goes on being true for the rest of the run
    // and the guard cannot be the outcome any more. `ending:<arc>` is the
    // engine's own record, in the same family as `gate:<id>:open`.
    txn.set({
      ...txn.state,
      flags: { ...txn.state.flags, [endingFlag(ending.id)]: true },
    });
    txn.emit({ type: 'custom', event: 'arcCompleted', data: { arc: ending.id } });
    txn.emit({ type: 'gameOver', outcome: 'victory' });
    if (start.postVictory !== 'continue') {
      txn.set({ ...txn.state, outcome: 'victory' });
      return;
    }
  }

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
function outOfTurn(txn: Transaction, actorId: EntityId): Message | null {
  const combat = txn.state.combat;
  if (!combat) return null;
  const activeId = combat.order[combat.turn];
  if (!activeId || activeId === actorId) return null;
  const active = txn.entity(activeId);
  return active ? message('refused.turn.other', { who: active.name }) : null;
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
  explicit: { target?: EntityId; at?: Position; ritual?: boolean },
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
    txn.emit({ type: 'refused', action: 'useAbility', reason: message('refused.ability.noAction') });
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
