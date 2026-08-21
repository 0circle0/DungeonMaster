/** What the party can do right now, and what they can do with that. */

import type { Action, Entity, EntityId, Position } from '@dm/engine';
import {
  Transaction,
  key,
  findPath,
  distance,
  occupiedTiles,
  fieldOfView,
  isHostileTo,
  reachOf,
  nearestHostile,
  canTalkTo,
  itemsWithinReach,
  describeRequirement,
  sightSenseOf,
  reachableTrap,
  shopBarred,
  text,
  list,
  grammarOf,
  joinMessages,
} from '@dm/engine';
import type { Message } from '@dm/engine';
import { Rng } from '@dm/core';
import type { Requirement } from '@dm/module';
import { traderNearby } from './parser.js';
import type { PlayContext } from './session.js';
import { waysFromHere } from './views/exits.js';
import { duration } from './views/format.js';

/** The reason a gate refuses, in the shortest honest form. */
function gateReason(requires: Requirement | undefined): readonly Message[] {
  const described = describeRequirement(requires);
  return requires?.description ? described.slice(0, 1) : described;
}

/** What you do to a barrier of this kind. */
const OPEN_VERB: Record<string, string> = {
  lock: 'Unlock',
  ward: 'Dispel',
  puzzle: 'Solve',
  toll: 'Pay',
  story: 'Approach',
  hazard: 'Brave',
};

function openVerb(kind: string | undefined): string {
  return OPEN_VERB[kind ?? ''] ?? 'Open';
}


export type AffordanceKind =
  | 'walk' | 'attack' | 'talk' | 'enter' | 'leave' | 'take' | 'open'
  | 'look' | 'search' | 'disarm' | 'trade' | 'sense' | 'select' | 'stance' | 'follow'
  | 'endTurn' | 'flee' | 'rest' | 'wait' | 'travel' | 'quest';

/** Whether the place the party is standing in offers a counter. */
function servesTrade(context: PlayContext): boolean {
  const here = context.state.location;
  if (here.kind !== 'poi') return true;

  const poi = context.module.find<{ services?: string[] }>('world.pointsOfInterest', here.poi);
  const services = poi?.services ?? [];
  if (services.length === 0) return true;
  return services.includes('market') || services.includes('smith') || services.includes('guild');
}

export type Subject =
  | { readonly kind: 'entity'; readonly id: EntityId }
  | { readonly kind: 'tile'; readonly at: Position }
  | { readonly kind: 'poi'; readonly id: string }
  | { readonly kind: 'area'; readonly id: string }
  | { readonly kind: 'item'; readonly id: string };

export interface Affordance {
  /** Stable within a frame — safe as a React key and as a test fixture. */
  readonly id: string;
  readonly kind: AffordanceKind;
  /** Imperative, sentence case, no trailing punctuation: "Attack the bog hound". */
  readonly label: string;
  /** Dispatch this and the thing happens. */
  readonly action: Action;
  readonly subject?: Subject;
  /** Why it would be refused. */
  readonly blocked?: string;
  /** High first. */
  readonly weight: number;
  /** For walks: the route, so hover can draw it and the label can say the cost. */
  readonly path?: { readonly steps: readonly Position[]; readonly cost: number };
}

/** A read-only transaction — the idiom `currentOptions` already uses. */
const reading = (context: PlayContext): Transaction =>
  new Transaction(context.state, context.module);

/** What the party knows of a tile: in view, remembered, or nothing. */
function perception(
  context: PlayContext,
  at: Position,
): { seen: boolean; known: boolean } {
  const map = context.state.maps[context.state.currentMap];
  const actor = context.state.entities[context.state.selected];
  if (!map || !actor) return { seen: false, known: false };

  const packed = key(at);
  const visible = fieldOfView({
    map: map.tiles, terrain: context.terrain, origin: actor.position, radius: 8,
  });
  return { seen: visible.has(packed), known: map.explored.includes(packed) };
}

/** What clicking a tile can mean, heaviest first. */
export function affordancesAt(context: PlayContext, at: Position): readonly Affordance[] {
  const { module, state, terrain } = context;
  const actor = state.entities[state.selected];
  const map = state.maps[state.currentMap];
  if (!actor || !map) return [];

  const { seen, known } = perception(context, at);
  if (!seen && !known) return [];

  const out: Affordance[] = [];
  const packed = key(at);
  const txn = reading(context);

  // — someone standing there ————————————————————————————————
  const occupant = seen
    ? Object.values(state.entities).find(
        (entity) => entity.alive && entity.map === state.currentMap
          && entity.position.x === at.x && entity.position.y === at.y,
      )
    : undefined;

  if (occupant && occupant.id !== actor.id) {
    if (isHostileTo(actor, occupant)) {
      const reach = reachOf(module, actor);
      const gap = distance(actor.position, at);
      out.push({
        id: `attack:${occupant.id}`,
        kind: 'attack',
        label: `Attack the ${occupant.name.toLowerCase()}`,
        action: { type: 'attack', target: occupant.id },
        subject: { kind: 'entity', id: occupant.id },
        weight: 100,
        ...(state.combat && gap > reach ? { blocked: 'too far to reach' } : {}),
      });
    } else if (occupant.kind === 'npc') {
      const inRange = canTalkTo(actor, occupant.id, txn);
      out.push({
        id: `talk:${occupant.id}`,
        kind: 'talk',
        label: `Talk to ${occupant.name}`,
        action: { type: 'talk', npc: occupant.id },
        subject: { kind: 'entity', id: occupant.id },
        weight: 90,
        ...(inRange ? {} : { blocked: 'step closer first' }),
      });
    }

    out.push({
      id: `look:${occupant.id}`,
      kind: 'look',
      label: `Look at the ${occupant.name.toLowerCase()}`,
      action: { type: 'look', at: occupant.name.toLowerCase() },
      subject: { kind: 'entity', id: occupant.id },
      weight: 10,
    });
  }

  // — a place that stands on this tile ——————————————————————
  const here = state.location;
  const areaId = here.kind === 'area' || here.kind === 'poi' ? here.area : null;
  if (areaId) {
    const poi = module
      .all<{
        id: string; name: string; area: string; hidden: boolean;
        position?: Position; gate?: string;
      }>('world.pointsOfInterest')
      .find((candidate) =>
        candidate.area === areaId
        && candidate.position?.x === at.x && candidate.position?.y === at.y
        && (!candidate.hidden || state.flags[`found:${candidate.id}`] === true));

    if (poi && !(here.kind === 'poi' && here.poi === poi.id)) {
      const barred = poi.gate ? state.flags[`gate:${poi.gate}:open`] !== true : false;
      const gate = barred
        ? module.find<{ requires?: Requirement }>('world.gates', poi.gate ?? '')
        : undefined;
      const needs = gateReason(gate?.requires);
      out.push({
        id: `enter:${poi.id}`,
        kind: 'enter',
        label: `Enter ${poi.name}`,
        action: { type: 'enter', target: poi.id },
        subject: { kind: 'poi', id: poi.id },
        weight: 80,
        // Entering attempts the gate, so this is a hint rather than a hard refusal.
        ...(barred && needs.length > 0
          ? { blocked: text(module, 'affordance.barred', { what: joinMessages(module, needs) }) }
          : {}),
      });
    }
  }

  // — a gate on the tile ————————————————————————————————————
  const gate = map.gates[packed];
  if (gate && !gate.open) {
    const definition = module.find<{ name?: string; kind?: string; requires?: Requirement }>(
      'world.gates',
      gate.gate,
    );
    const needs = gateReason(definition?.requires);
    out.push({
      id: `open:${gate.gate}`,
      kind: 'open',
      label: `${openVerb(definition?.kind)} ${definition?.name ?? gate.gate.replace(/_/g, ' ')}`,
      action: { type: 'open', target: gate.gate },
      weight: 75,
      ...(needs.length > 0 ? { blocked: `needs ${needs.join(', ')}` } : {}),
    });
  }

  // — items on the ground ———————————————————————————————————
  if (seen) {
    const reachable = itemsWithinReach(txn, actor).filter((entry) => entry.tile === packed);
    for (const entry of reachable) {
      const name = module.find<{ name?: string }>('content.items', entry.item)?.name ?? entry.item;
      out.push({
        id: `take:${entry.item}:${packed}`,
        kind: 'take',
        label: entry.quantity > 1 ? `Take ${name} ×${entry.quantity}` : `Take the ${name.toLowerCase()}`,
        action: { type: 'take', item: entry.item },
        subject: { kind: 'item', id: entry.item },
        weight: 70,
      });
    }
  }

  // — walking there ————————————————————————————————————————
  const standingOn = at.x === actor.position.x && at.y === actor.position.y;
  if (!standingOn && !occupant) {
    const route = findPath({
      map: map.tiles,
      terrain,
      from: actor.position,
      to: at,
      modes: actor.movementModes,
      blocked: occupiedTiles(state, actor.id),
    });

    out.push({
      id: `walk:${packed}`,
      kind: 'walk',
      label: 'Walk here',
      action: { type: 'travelTo', to: at },
      subject: { kind: 'tile', at },
      // A click on empty ground means walk; on anything else, the thing wins.
      weight: out.length === 0 ? 100 : 60,
      ...(route.found
        ? { path: { steps: route.steps, cost: route.cost } }
        : { blocked: 'no way through' }),
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** Everything to do with one creature, wherever it stands. */
export function affordancesFor(context: PlayContext, target: EntityId): readonly Affordance[] {
  const subject = context.state.entities[target];
  if (!subject) return [];
  return affordancesAt(context, subject.position)
    .filter((entry) => entry.subject?.kind === 'entity' && entry.subject.id === target);
}

/** The context bar: what is worth offering right now, unprompted. */
export function affordances(context: PlayContext): readonly Affordance[] {
  const { module, state } = context;
  const actor = state.entities[state.selected];
  if (!actor || state.outcome !== 'playing') return [];
  if (state.dialogue) return [];

  const out: Affordance[] = [];
  const txn = reading(context);

  // — combat first: the decisions the round is waiting on ————
  if (state.combat) {
    const foe = nearestHostile({ module, state, terrain: context.terrain }, actor);
    if (foe) {
      out.push({
        id: `attack:${foe.id}`,
        kind: 'attack',
        label: `Attack the ${foe.name.toLowerCase()}`,
        action: { type: 'attack', target: foe.id },
        subject: { kind: 'entity', id: foe.id },
        weight: 100,
      });
    }
    out.push({
      id: 'endTurn', kind: 'endTurn', label: 'End turn',
      action: { type: 'endTurn' }, weight: 90,
    });
    out.push({
      id: 'flee', kind: 'flee', label: 'Flee',
      action: { type: 'flee' }, weight: 30,
    });
  }

  // — people in speaking range ——————————————————————————————
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== 'npc' || !entity.alive) continue;
    if (!canTalkTo(actor, entity.id, txn)) continue;
    out.push({
      id: `talk:${entity.id}`,
      kind: 'talk',
      label: `Talk to ${entity.name}`,
      action: { type: 'talk', npc: entity.id },
      subject: { kind: 'entity', id: entity.id },
      weight: 85,
    });
  }

  // — the ways out, from the same derivation the exits panel uses ————
  if (!state.combat) {
    const ways = waysFromHere(module, state, context.terrain);
    for (const place of ways.places) {
      out.push({
        id: `enter:${place.poi}`,
        kind: 'enter',
        label: `Enter ${place.name}${place.travelMinutes > 0 ? ` (${duration(place.travelMinutes)})` : ''}`,
        action: place.action,
        subject: { kind: 'poi', id: place.poi },
        weight: 60,
        ...(place.barred && place.requires.length > 0
          ? { blocked: text(module, 'affordance.barred', { what: list(grammarOf(module), place.requires) }) }
          : {}),
      });
    }
    for (const road of ways.roads) {
      out.push({
        id: `travel:${road.area}`,
        kind: 'travel',
        label: `Travel to ${road.name}${road.travelMinutes > 0 ? ` (${duration(road.travelMinutes)})` : ''}`,
        action: road.action,
        subject: { kind: 'area', id: road.area },
        weight: 55,
        ...(road.barred && road.requires.length > 0
          ? { blocked: text(module, 'affordance.barred', { what: list(grammarOf(module), road.requires) }) }
          : {}),
      });
    }

    if (state.location.kind === 'poi') {
      out.push({
        id: 'leave', kind: 'leave', label: 'Leave',
        action: { type: 'leave' }, weight: 50,
      });
    }
  }

  // — things lying within reach —————————————————————————————
  const reachable = itemsWithinReach(txn, actor);
  if (reachable.length > 0) {
    out.push({
      id: 'take:all', kind: 'take', label: 'Take everything',
      action: { type: 'take' }, weight: 65,
    });
  }

  // --- senses: one button per declared sense ---------------------------------
  const sight = sightSenseOf(module).id;
  for (const sense of module.all<{ id: string; name?: string }>('rules.senses')) {
    if (sense.id === sight) continue;
    const name = sense.name ?? sense.id;
    out.push({
      id: `sense:${sense.id}`,
      kind: 'sense',
      label: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
      action: { type: 'sense', sense: sense.id },
      weight: 40,
    });
  }

  out.push({
    id: 'look', kind: 'look', label: 'Look around',
    action: { type: 'look' }, weight: 45,
  });
  out.push({
    id: 'search', kind: 'search', label: 'Search',
    action: { type: 'search' }, weight: 35,
  });

  // Trade, where the party is standing with someone who deals and the place says so.
  const trader = traderNearby(context);
  if (trader && servesTrade(context)) {
    const txn = reading(context);
    const gate = shopBarred(txn, trader, actor, Rng.fromSeed(state.seed).derive(`shop:${trader}`));
    const npc = module.find<{ name: string }>('content.npcs', trader);
    out.push({
      id: `trade:${trader}`,
      kind: 'trade',
      label: `Trade with ${npc?.name ?? trader}`,
      action: { type: 'look', at: 'shop' },
      subject: { kind: 'entity', id: trader },
      weight: 70,
      ...(gate.barred
        ? {
            blocked: gate.requires.length > 0
              ? text(module, 'affordance.needs', { what: joinMessages(module, gate.requires) })
              : text(module, 'refused.trade.barred.plain'),
          }
        : {}),
    });
  }

  // Only once something has been found.
  const trap = reachableTrap(reading(context), actor);
  if (trap) {
    const definition = module.find<{ name?: string }>('content.traps', trap.trap);
    out.push({
      id: `disarm:${trap.trap}`,
      kind: 'disarm',
      label: `Disarm the ${(definition?.name ?? trap.trap.replace(/_/g, ' ')).toLowerCase()}`,
      action: { type: 'disarm' },
      weight: 78,
    });
  }

  // — pace, when the module offers a choice of one ——————————
  const stances = module.all<{ id: string; name: string }>('rules.stances');
  if (stances.length > 1 && !state.combat) {
    for (const stance of stances) {
      const current = actor.stance === stance.id;
      out.push({
        id: `stance:${stance.id}`,
        kind: 'stance',
        label: stance.name,
        action: { type: 'setStance', stance: stance.id },
        weight: 20,
        ...(current ? { blocked: 'already moving like this' } : {}),
      });
    }
  }

  // — walking together ——————————————————————————————————————
  if (state.party.length > 1 && !state.combat) {
    const followers = state.party.some(
      (id) => id !== actor.id && state.entities[id]?.following === actor.id,
    );
    out.push({
      id: followers ? 'scatter' : 'follow',
      kind: 'follow',
      label: followers ? 'Spread out' : 'Follow me',
      action: { type: 'setFollow', follow: !followers },
      weight: 25,
    });
  }

  // — rests, one per declared kind ——————————————————————————
  if (!state.combat) {
    for (const rest of module.all<{ id: string; name: string }>('rules.rests')) {
      out.push({
        id: `rest:${rest.id}`,
        kind: 'rest',
        label: rest.name,
        action: { type: 'rest', kind: rest.id },
        weight: 15,
      });
    }
  }

  // — quests on offer ———————————————————————————————————————
  for (const [questId, questState] of Object.entries(state.quests)) {
    if (questState.status !== 'available') continue;
    const quest = module.find<{ name?: string }>('narrative.quests', questId);
    out.push({
      id: `quest:${questId}`,
      kind: 'quest',
      label: `Accept ${quest?.name ?? questId.replace(/_/g, ' ')}`,
      action: { type: 'acceptQuest', quest: questId },
      weight: 70,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** Re-exported so front ends can type an entity check without reaching deeper. */
export type { Entity };
