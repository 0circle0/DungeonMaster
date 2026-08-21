/** The reducer: the only path that changes state. */

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
import { startQuest, abandonQuest, advanceQuests, questsOffered, awardKillXp } from './sim/quests.js';
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
import { steppedTo } from './state.js';
import { message, joinMessages } from './narrate/systemText.js';
import type { Message } from './narrate/systemText.js';
import type { ModRuntime } from './mods/runtime.js';

export interface ReduceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Per-call context. */
export interface ReduceContext {
  readonly module: CompiledModule;
  readonly terrain?: TerrainIndex;
  /** Installed mods. */
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

/** What an action costs on the world clock. */
function actionMinutes(module: CompiledModule, action: string): number {
  return module.source.world.time.actionMinutes[action] ?? 0;
}

export function reduce(state: GameState, action: Action, context: ReduceContext): ReduceResult {
  const { module } = context;
  const terrain = context.terrain ?? terrainFor(module);
  const mods = context.mods ?? null;
  const txn = new Transaction(state, module, mods);

  // The run's RNG is restored, used and written back, so a replay is identical.
  const rng = Rng.fromState(state.rng);

  /** Rebuilt per read because it closes over the transaction's current state. */
  const targeting = (): TargetingContext => ({ module, state: txn.state, terrain });

  // Mods get first refusal on every action; a `replace` handler stands in for the core case entirely.
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

  // Switch on `action.type` directly, to keep the discriminated-union narrowing.
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
      // Walk the route one tile at a time so a trigger or a newly visible creature interrupts it.
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
        // Outside combat a round is everything ageing one step.
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
        // Charge the clock for the walk out to it, per the exit's `travelMinutes`.
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

        // Enforce `oneWay`.
        const back = module
          .find<{ connections: { to: string; oneWay: boolean }[] }>('world.areas', action.area)
          ?.connections.find((entry) => entry.to === areaId);
        if (back?.oneWay) {
          txn.emit({ type: 'refused', action: 'travelToArea', reason: message('refused.travel.noWayUp') });
          break;
        }

        // An area may also gate entry with `requires`.
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

      // Looking is free.
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

      // Waiting costs `world.time.actionMinutes` and the world advances during it.
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
      // The leader follows nobody.
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

      // Searching is the only way a trap is found; there is no passive per-step roll.
      const foundTraps = searchForTraps(txn, actor, rng.derive('traps'));

      if (hidden.length === 0 && !foundTraps) {
        // Say explicitly that the search turned nothing up.
        txn.emit({ type: 'refused', action: 'search', reason: message('refused.search.nothing') });
        runSearchTriggers(txn, actor, rng);
        break;
      }

      for (const poi of hidden) {
        // A discovery formula lowers the check as clues are learned.
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

      // What the speaker has to offer, whether or not they have a dialogue tree.
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

      // A rest can be interrupted by anything that comes looking, per `interruptChance`.
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

      // Fleeing spends the actor's whole movement away from the nearest enemy.
      const steps = runAway(txn, terrain, actor.id, rng);

      if (steps === 0) {
        txn.emit({ type: 'refused', action: 'flee', reason: message('refused.flee.noExit') });
        break;
      }

      txn.emit({ type: 'custom', event: 'fled', data: { entity: actor.id, steps } });

      // Fleeing ends the actor's turn.
      if (txn.state.combat && txn.state.combat.order[txn.state.combat.turn] === actor.id) {
        endCombatTurn(txn, targeting(), rng);
      }
      break;
    }

    case 'leave': {
      // `leave` also breaks off a conversation.
      if (txn.state.dialogue) {
        endDialogue(txn);
        break;
      }

      const here = txn.state.location;
      if (here.kind === 'dungeon') {
        // `leave` walks back out from the recorded exit tile, or a tile beside it.
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
      // The place's `exit` occasion.
      if (here.kind === 'poi') runOccasion(txn, 'exit', rng);
      if (here.kind === 'poi') {
        // Stepping out of a place returns you to its area.
        const areaMap = `area:${here.area}`;
        if (txn.state.currentMap === areaMap) {
          txn.set({ ...txn.state, location: { kind: 'area', area: here.area } });
          txn.emit({ type: 'custom', event: 'entered', data: { place: here.area, kind: 'area' } });
          break;
        }
        enterArea(txn, terrain, here.area, rng);
        // Stepping out of an interior lands on the place's outdoor position.
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

      // Stance is the whole party's, so it is set on every member.
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
      // Unknown action types are refused by name; a save may carry one this build lacks.
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

  // Mods see the action's own events before anything settles.
  if (mods?.has('action.after', action.type)) {
    const actorId = 'actor' in action && action.actor ? action.actor : state.selected;
    const seen = txn.finish().events.map((event) => event.type);
    mods.run(txn, 'action.after', { action, actorId, events: seen }, rng);
  }

  // Write the advanced generator back, then settle anything the action caused.
  txn.set({ ...txn.state, rng: rng.save() });
  settle(txn, terrain, rng);

  // After everything the action set in motion has resolved.
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

  // Each pass sees only what the previous one produced, and stops when a pass produces nothing.
  let batch: readonly GameEvent[] = pending.events;
  let produced: GameEvent[] = [];
  for (let pass = 0; pass < MAX_EMISSION_PASSES && batch.length > 0; pass += 1) {
    const before = followUp.finish().events.length;
    processEmissions(followUp, terrain, batch, rng, pass);
    produced = followUp.finish().events.slice(before);
    batch = produced;
  }

  // Report a module whose consequences never settle.
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

/** How many times a batch of events may set off another batch. */
const MAX_EMISSION_PASSES = 4;

/** Everything a batch of events sets in motion. */
function processEmissions(
  txn: Transaction,
  terrain: TerrainIndex,
  events: readonly GameEvent[],
  rng: Rng,
  pass: number,
): void {
  const suffix = pass === 0 ? '' : `:${pass}`;

  // Re-read the leader each pass: a quest's `onComplete` can change who is selected, or kill them.
  const actor = txn.entity(txn.state.selected);

  // Content asks for a deed by emitting one, so recording it here covers every path that can cause one.
  if (actor) {
    for (const event of events) {
      if (event.type !== 'custom' || event.event !== 'deed') continue;
      const kind = String((event.data as { kind?: unknown }).kind ?? '');
      if (kind) recordDeed(txn, terrain, kind, actor, null, rng.derive(`deed:${kind}${suffix}`));
    }
  }

  // A quest can be granted in conversation.
  for (const event of events) {
    if (event.type !== 'custom' || event.event !== 'startQuest') continue;
    const questId = String((event.data as { quest?: unknown }).quest ?? '');
    if (questId) startQuest(txn, questId, rng.derive(`quest:${questId}${suffix}`));
  }

  // A trigger can wait on an event the content itself emits (`on: 'custom'`).
  for (const event of events) {
    if (event.type !== 'custom') continue;
    if (event.event === 'deed' || event.event === 'startQuest') continue;
    runOccasion(txn, 'custom', rng.derive(`custom:${event.event}${suffix}`), event.event);
  }

  // Whoever declared they would react to this.
  dispatchReactions(txn, events, rng.derive(`reactions${suffix}`));

  // The dead drop what they carried.
  dropDeathLoot(txn, terrain, events, rng.derive(`spoils${suffix}`));

  // Award XP for kills.
  awardKillXp(txn, events, rng.derive(`killxp${suffix}`));

  // Quests watch everything that just happened.
  advanceQuests(txn, events, rng.derive(`quests${suffix}`));
}

/** Move one entity one tile. */
/** Back away from whatever is hostile, one step at a time. */
function runAway(txn: Transaction, terrain: TerrainIndex, actorId: EntityId, rng: Rng): number {
  let steps = 0;

  // Bounded by any sane movement budget; the budget check below is what stops it.
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

    // Score by distance to the nearest enemy, then total distance to all of them.
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
  // A follower's step is silent and does not charge the clock again.
  const silent = options.silent === true;

  const map = txn.state.maps[actor.map];
  if (!map) {
    if (!silent) txn.emit({ type: 'refused', action: 'move', reason: message('refused.move.noMap') });
    return false;
  }

  // Movement draws on the same shared budget as actions, so it obeys turn order.
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
      // An empty id means there was no tile at all, which the module has its own message for.
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

  // Leaving a threatened tile may provoke, so the move is re-checked afterwards.
  provokeOpportunity(txn, { module: txn.module, state: txn.state, terrain }, actor, from, to, _rng);
  const survived = txn.entity(actor.id);
  if (!survived || !survived.alive) return false;

  txn.putEntity(steppedTo(survived, to, txn.state.minute));
  txn.emit({ type: 'moved', entity: actor.id, from, to, cost });
  if (combat) spendMovement(txn, cost);

  // The party shares one fog of war, and it records what is seen rather than what is walked.
  if (actor.kind === 'character') {
    const walker = txn.entity(actor.id) ?? actor;
    markExplored(txn, actor.map, perceivedTiles(
      { module: txn.module, state: txn.state, terrain },
      walker,
      sightSenseOf(txn.module),
    ));
  }

  // Movement leaves a scent trail.
  leaveMarks(txn, terrain, txn.entity(actor.id) ?? actor, to);

  // What the terrain does to whoever stands on it — lava, caltrops, a pressure plate.
  runTerrain(txn, actor.id, 'onEnter', to, _rng);

  // Narrate a room template's `descriptionKey` on entry; this is how a generated dungeon is described.
  enterRoom(txn, actor.id, from, to, _rng);

  // And whatever is buried under the tile.
  const stepped = txn.entity(actor.id);
  if (stepped) springTrap(txn, stepped, _rng.derive(`trap:${actor.id}`));

  // Walking costs time only out of combat, where a round is seconds.
  const perTile = txn.module.source.world.time.minutesPerTile;
  if (!silent && !combat && perTile > 0 && actor.kind === 'character') {
    advanceTime(txn, perTile, _rng);
  }

  // The rest of the party comes along, if they have been told to.
  if (!silent) moveFollowers(txn, terrain, actor.id, _rng);

  return true;
}

/** Every place the party is currently inside, innermost last. */
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

/** Fire everything declared for an occasion, wherever the party is standing. */
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

  // Mods see every occasion, including the `custom` events content emits.
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

/** Notice walking from one room into another. */
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

/** Bring along whoever is following the leader. */
function moveFollowers(
  txn: Transaction,
  terrain: TerrainIndex,
  leaderId: EntityId,
  rng: Rng,
): void {
  if (txn.state.combat) return;

  const leader = txn.entity(leaderId);
  if (!leader || !leader.alive) return;

  // Roster order, so two followers resolve the same way on identical runs.
  for (const id of txn.state.party) {
    if (id === leaderId) continue;

    const member = txn.entity(id);
    if (!member || !member.alive) continue;
    if (member.following !== leaderId) continue;
    if (member.map !== leader.map) continue;

    // Already at the leader's shoulder.
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
      // No route, or a blocked doorway: stand still rather than refuse per follower.
      if (!route.found || !next) break;
      if (!moveEntity(txn, terrain, current, next, rng, { silent: true })) break;
      steps -= 1;
    }
  }
}

/** Record tiles as seen, for the fog of war. */
function markExplored(txn: Transaction, mapId: string, seen: ReadonlySet<number>): void {
  const map = txn.state.maps[mapId];
  if (!map) return;

  const known = new Set(map.explored);
  let added = false;
  for (const packed of seen) {
    if (known.has(packed)) continue;
    // Sight reaches past the edge of the map; tiles that do not exist are not remembered.
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

  // Ambience and anything on a schedule.
  runOccasion(txn, 'timePass', rng.derive(`timePass:${after}`));

  // Out of combat the world moves because time passes, so anything that noticed something acts on it here.
  const terrain = terrainFor(txn.module);
  runIdleTurns(txn, { module: txn.module, state: txn.state, terrain }, rng, minutes);

  // Run every day boundary crossed, so resting through a week ages the world by a week.
  const dayBefore = Math.floor(before / perDay);
  const dayAfter = Math.floor(after / perDay);

  // The world tick: once per call rather than per minute.
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

/** Consequences that follow any action: death, victory, defeat. */
function settle(txn: Transaction, terrain: TerrainIndex, rng: Rng): void {
  if (txn.state.outcome !== 'playing') return;

  // Combat begins when something hostile shares the map and ends when one side is gone.
  const noticed = perceiveAll(txn, terrain);

  // Anything that has just spotted a party member.
  dispatchNoticed(txn, noticed, rng.derive('noticed'));

  // Ancestry and carried-item passives, re-applied every reduction.
  runPartyPassives(txn, rng.derive('passives'));

  // `combatStart` and `combatEnd` are occasions a place can declare triggers for.
  const eventsBefore = txn.finish().events.length;
  const combatBefore = txn.state.combat !== null;
  maybeEndCombat(txn, { module: txn.module, state: txn.state, terrain });
  maybeStartCombat(txn, { module: txn.module, state: txn.state, terrain }, rng);
  // Someone whose stance changed while the fight was already running.
  joinCombat(txn, { module: txn.module, state: txn.state, terrain }, rng);

  if (!combatBefore && txn.state.combat !== null) {
    runOccasion(txn, 'combatStart', rng.derive('combatStart'));
  } else if (combatBefore && txn.state.combat === null) {
    runOccasion(txn, 'combatEnd', rng.derive('combatEnd'));
  }

  // `combatStarted`, `combatEnded` and `turnStarted` are emitted here, inside `settle`.
  let dispatched = txn.finish().events.length;
  dispatchReactions(txn, txn.finish().events.slice(eventsBefore), rng.derive('settleReactions'));

  // Non-player characters act as soon as the turn reaches them.
  if (txn.state.combat) {
    runAiTurns(
      txn,
      { module: txn.module, state: txn.state, terrain },
      rng,
      (t, _c, r) => endCombatTurn(t, { module: t.module, state: t.state, terrain }, r),
    );
    maybeEndCombat(txn, { module: txn.module, state: txn.state, terrain });

    // AI turns emit their own `turnStarted` and damage, so the fan-out runs again over what they produced.
    dispatchReactions(txn, txn.finish().events.slice(dispatched), rng.derive('aiReactions'));
    dispatched = txn.finish().events.length;
  }

  // Both declared ways of winning are checked before the all-dead test.
  const start = txn.module.source.start;
  const ending = endingReached(txn.module, txn.state);
  if (ending && !txn.state.flags[endingFlag(ending.id)]) {
    // `gameOver` as well as the arc event; the `ending:<arc>` flag makes this fire once.
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

/** Whether a module-declared ending condition holds. */
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

/** Whose turn it is, or null when the actor may act. */
function outOfTurn(txn: Transaction, actorId: EntityId): Message | null {
  const combat = txn.state.combat;
  if (!combat) return null;
  const activeId = combat.order[combat.turn];
  if (!activeId || activeId === actorId) return null;
  const active = txn.entity(activeId);
  return active ? message('refused.turn.other', { who: active.name }) : null;
}

/** Use an ability and, in combat, spend the action it costs. */
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

/** Apply a sequence of actions. */
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
