/**
 * Events into prose.
 *
 * The engine never writes a sentence; it emits facts, and this turns them into
 * lines. Everything here is downstream — nothing narrated can influence a rule,
 * which is what lets the same run drive a terminal, a browser, or a test
 * assertion unchanged.
 *
 * Combat lines carry their arithmetic. "You hit" is much less useful than
 * "17 (14+3) vs Guard 12 — a hit", and a player who cannot see the numbers
 * cannot learn the system.
 */

import type { CompiledModule } from '@dm/module';
import type { GameEvent, RollRecord } from '../events.js';
import type { GameState } from '../state.js';
import { narrateFrom, interpolate, list, count, article, nameScore, describeCreature } from './grammar.js';
import {
  perceivedTiles, sightSenseOf, impressions, canPerceive, senseOf, senseReport,
} from '../sim/senses.js';
import { npcIdOf } from '../character.js';
import { TerrainIndex, key } from '../grid/tiles.js';

/** A narrated line, tagged so a renderer can style it. */
export interface Line {
  readonly text: string;
  readonly kind: 'prose' | 'combat' | 'system' | 'speech' | 'refusal' | 'note';
}

export interface NarratorContext {
  readonly module: CompiledModule;
  readonly state: GameState;
  readonly seed: number;
}

const nameOf = (context: NarratorContext, id: string): string =>
  context.state.entities[id]?.name ?? id;

const contentName = (context: NarratorContext, collection: string, id: string): string =>
  context.module.find<{ name?: string }>(collection, id)?.name ?? id.replace(/_/g, ' ');

/** Just enough of a quest to talk about it. */
interface QuestShape {
  name: string;
  description?: string;
  objectives?: { id: string; description?: string }[];
  stages?: {
    id: string;
    name?: string;
    journalKey?: string;
    objectives?: { id: string; description?: string }[];
  }[];
}

const questShape = (context: NarratorContext, id: string): QuestShape | undefined =>
  context.module.find<QuestShape>('narrative.quests', id);

/** The authored text for an objective, wherever in the quest it was declared. */
function objectiveShape(
  context: NarratorContext,
  questId: string,
  objectiveId: string,
): { id: string; description?: string } | undefined {
  const quest = questShape(context, questId);
  if (!quest) return undefined;
  return [
    ...(quest.objectives ?? []),
    ...(quest.stages ?? []).flatMap((stage) => stage.objectives ?? []),
  ].find((objective) => objective.id === objectiveId);
}

/** Render a roll as its arithmetic: `17 (14+3) vs 12`. */
export function formatRoll(roll: RollRecord): string {
  const sign = roll.modifier >= 0 ? '+' : '';
  const parts = `${roll.natural}${roll.modifier === 0 ? '' : `${sign}${roll.modifier}`}`;
  const target = roll.against === null ? '' : ` vs ${roll.against}`;
  const swing = roll.swing ? ` [${roll.swing}]` : '';
  return `${roll.total} (${parts})${target}${swing}`;
}

const OUTCOME_WORD: Record<RollRecord['outcome'], string> = {
  critical: 'a critical hit',
  success: 'a hit',
  failure: 'a miss',
  fumble: 'a fumble',
};

/**
 * Turn one event into a line, or nothing.
 *
 * Returning null for events that need no prose keeps the transcript readable —
 * a player does not need to be told the RNG advanced.
 */
export function narrateEvent(context: NarratorContext, event: GameEvent): Line | null {
  const { module } = context;

  switch (event.type) {
    case 'narrate': {
      if (!event.textKey) return null;
      const text = narrateFrom(module, event.textKey, context.seed, {
        context: event.context,
        sceneKey: `${event.textKey}:${JSON.stringify(event.context)}`,
      });
      return text ? { text, kind: 'prose' } : null;
    }

    case 'custom': {
      // Perception events read as prose rather than as a log line, since a
      // creature going to look at something is a scene, not a statistic.
      if (event.event === 'investigating' || event.event === 'lostInterest') {
        // Only if the party could actually see it happen. Announcing that
        // something unseen is casting about for you hands the player knowledge
        // their characters have no way of having.
        const id = String(event.data['entity'] ?? '');
        if (!partyCanSee(context, id)) return null;

        const who = nameOf(context, id);
        return event.event === 'investigating'
          ? { text: `${who} casts about, and starts toward something.`, kind: 'prose' }
          : { text: `${who} loses the thread of it.`, kind: 'prose' };
      }
      if (event.event === 'noticed') {
        return impressionLine(context, event.data);
      }
      if (event.event === 'stanceChanged') {
        return { text: `You move at a ${String(event.data['name'] ?? '').toLowerCase()}.`, kind: 'note' };
      }
      if (event.event === 'entered') {
        const place = String(event.data['place'] ?? '');
        const kind = String(event.data['kind'] ?? 'poi');
        const named = kind === 'area'
          ? contentName(context, 'world.areas', place)
          : contentName(context, 'world.pointsOfInterest', place);
        return { text: named, kind: 'system' };
      }
      if (event.event === 'questOffered') {
        const name = String(event.data['name'] ?? event.data['quest'] ?? '');
        const who = nameOf(context, String(event.data['npc'] ?? ''));
        return { text: `${who} has work for you: ${name}.`, kind: 'system' };
      }
      if (event.event === 'followChanged') {
        return event.data['following'] === true
          ? { text: 'The others fall in behind you.', kind: 'note' }
          : { text: 'The party spreads out.', kind: 'note' };
      }
      if (event.event === 'stageAdvanced') {
        const questId = String(event.data['quest'] ?? '');
        const stageId = String(event.data['stage'] ?? '');
        const stage = questShape(context, questId)?.stages?.find((entry) => entry.id === stageId);
        const name = stage?.name ?? stageId.replace(/_/g, ' ');

        // The stage's own journal prose, if the module wrote any — this is the
        // line that tells a player what the next piece of work actually is.
        const prose = stage?.journalKey
          ? narrateFrom(module, stage.journalKey, context.seed, { sceneKey: `stage:${questId}:${stageId}` })
          : '';

        return { text: prose ? `${name} — ${prose}` : name, kind: 'system' };
      }
      return null;
    }

    case 'say':
      return { text: event.text, kind: 'speech' };

    case 'refused':
      return { text: event.reason, kind: 'refusal' };

    case 'blocked': {
      // `by` is a terrain id when the wall stopped you and a creature's name
      // when someone did, so look the id up and fall back to what was sent.
      const named = context.module.find<{ name: string }>('world.terrains', event.by)?.name;
      return { text: `Blocked by ${(named ?? event.by).toLowerCase()}.`, kind: 'note' };
    }

    case 'attacked': {
      const attacker = nameOf(context, event.attacker);
      const target = nameOf(context, event.target);
      const ability = event.ability ? contentName(context, 'content.abilities', event.ability) : 'attacks';
      return {
        text: `${attacker} — ${ability} on ${target}: ${formatRoll(event.roll)} — ${OUTCOME_WORD[event.roll.outcome]}.`,
        kind: 'combat',
      };
    }

    case 'checked': {
      const what = event.skill ?? event.attribute ?? 'check';
      return {
        text: `${nameOf(context, event.entity)} — ${what.replace(/_/g, ' ')}: ${formatRoll(event.roll)}.`,
        kind: 'combat',
      };
    }

    case 'saved':
      return {
        text: `${nameOf(context, event.entity)} — ${event.save} save: ${formatRoll(event.roll)}.`,
        kind: 'combat',
      };

    case 'damaged': {
      const type = event.damageType ? ` ${event.damageType}` : '';
      const resisted = event.raw !== event.amount ? ` (${event.raw} before resistance)` : '';
      return {
        text: `${nameOf(context, event.entity)} takes ${event.amount}${type} damage${resisted}.`,
        kind: 'combat',
      };
    }

    case 'healed':
      return { text: `${nameOf(context, event.entity)} recovers ${event.amount}.`, kind: 'combat' };

    case 'died':
      return { text: `${nameOf(context, event.entity)} falls.`, kind: 'combat' };

    case 'conditionApplied':
      return {
        text: `${nameOf(context, event.entity)} is ${contentName(context, 'rules.conditions', event.condition).toLowerCase()}.`,
        kind: 'combat',
      };

    case 'conditionRemoved':
      return event.reason === 'expired'
        ? {
            text: `${nameOf(context, event.entity)} is no longer ${contentName(context, 'rules.conditions', event.condition).toLowerCase()}.`,
            kind: 'note',
          }
        : null;

    case 'conditionResisted':
      return {
        text: `${nameOf(context, event.entity)} shrugs off ${contentName(context, 'rules.conditions', event.condition).toLowerCase()}.`,
        kind: 'combat',
      };

    case 'reacted':
      return { text: `${nameOf(context, event.entity)} reacts.`, kind: 'combat' };

    case 'itemGained':
      return {
        text: `Taken: ${count(event.quantity, contentName(context, 'content.items', event.item))}.`,
        kind: 'note',
      };

    case 'itemLost':
      return {
        text: `Lost: ${count(event.quantity, contentName(context, 'content.items', event.item))}.`,
        kind: 'note',
      };

    // A silent drop is a drop the player never picks up.
    case 'droppedLoot':
      return {
        text: `${nameOf(context, event.from)} leaves ${list(
          event.items.map((stack) => count(stack.quantity, contentName(context, 'content.items', stack.item))),
        )} behind.`,
        kind: 'note',
      };

    case 'trapSprung': {
      const name = contentName(context, 'content.traps', event.trap);
      return { text: `${nameOf(context, event.entity)} sets off ${article(name)}!`, kind: 'system' };
    }

    case 'trapDisarmed':
      return {
        text: `${nameOf(context, event.entity)} disarms the ${contentName(context, 'content.traps', event.trap).toLowerCase()}.`,
        kind: 'note',
      };

    case 'traded': {
      const item = contentName(context, 'content.items', event.item);
      const who = nameOf(context, event.npc);
      const many = event.quantity > 1 ? count(event.quantity, item) : item;
      return {
        text: event.bought
          ? `Bought ${many} from ${who} for ${event.price}.`
          : `Sold ${many} to ${who} for ${event.price}.`,
        kind: 'note',
      };
    }

    // The purchase itself already said the price; this is for coin that moves
    // any other way — a reward, a toll, a bribe.
    case 'currencyChanged':
      return {
        text: event.amount > 0 ? `You are ${event.amount} the richer.` : `You are ${-event.amount} the poorer.`,
        kind: 'note',
      };

    case 'xpGained':
      return { text: `${nameOf(context, event.entity)} gains ${event.amount} experience.`, kind: 'note' };

    case 'leveledUp':
      return { text: `${nameOf(context, event.entity)} reaches level ${event.level}.`, kind: 'system' };

    case 'combatStarted':
      return {
        text: `Combat begins — ${list(event.participants.map((id) => nameOf(context, id)))}.`,
        kind: 'system',
      };

    case 'combatEnded': {
      const text =
        event.outcome === 'victory' ? 'The fight is over.'
        : event.outcome === 'fled' ? 'You are not followed.'
        : 'The party falls.';
      return { text, kind: 'system' };
    }

    case 'roundStarted':
      return { text: `— round ${event.round} —`, kind: 'system' };

    // Whose turn it is has to land in the transcript: the player commands the
    // party one member at a time, and without this line the only clue was a
    // refusal after acting with the wrong one.
    case 'turnStarted':
      return { text: `${nameOf(context, event.entity)}'s turn.`, kind: 'combat' };

    case 'gateOpened': {
      const how = event.how === 'bypass' ? ' — forced' : event.how === 'ability' ? ' — by power' : '';
      return { text: `${contentName(context, 'world.gates', event.gate)} opens${how}.`, kind: 'note' };
    }

    case 'gateBlocked': {
      const gate = contentName(context, 'world.gates', event.gate);
      const missing = event.missing.length > 0 ? ` You would need ${list(event.missing, 'or')}.` : '';
      return { text: `${gate} will not open.${missing}`, kind: 'note' };
    }

    case 'discovered':
      return {
        text: event.kind === 'trap'
          ? `You spot ${article(contentName(context, 'content.traps', event.what).toLowerCase())}.`
          : `You find ${contentName(context, 'world.pointsOfInterest', event.what)}.`,
        kind: 'prose',
      };

    case 'questStarted': {
      const quest = questShape(context, event.quest);
      const name = quest?.name ?? contentName(context, 'narrative.quests', event.quest);
      // The description is the whole point of taking a job. Announcing the
      // title alone told the player a quest existed and nothing about it.
      return {
        text: quest?.description ? `New quest: ${name} — ${quest.description}` : `New quest: ${name}.`,
        kind: 'system',
      };
    }

    case 'objectiveCompleted': {
      const objective = objectiveShape(context, event.quest, event.objective);
      const described = objective?.description || event.objective.replace(/_/g, ' ');
      return { text: `Objective complete: ${described}`, kind: 'system' };
    }

    case 'questCompleted':
      return {
        text: `Quest complete: ${contentName(context, 'narrative.quests', event.quest)}.`,
        kind: 'system',
      };

    case 'questFailed':
      return {
        text: `Quest failed: ${contentName(context, 'narrative.quests', event.quest)} — ${event.reason}.`,
        kind: 'system',
      };

    case 'dayBroke':
      return { text: `Day ${event.day} breaks.`, kind: 'note' };

    case 'reputationChanged': {
      const faction = contentName(context, 'content.factions', event.faction);
      const shift = event.to - event.from;
      return {
        text: `${faction}: ${shift > 0 ? 'improved' : 'worsened'} (${shift > 0 ? '+' : ''}${shift}).`,
        kind: 'note',
      };
    }

    case 'deedDone': {
      const seen = event.witnesses.length;
      return {
        text: seen === 0 ? 'Nobody saw that.' : `${count(seen, 'witness', 'witnesses')} to that.`,
        kind: 'note',
      };
    }

    case 'gameOver':
      return {
        text: event.outcome === 'victory' ? 'You have won.' : 'Your party is dead.',
        kind: 'system',
      };

    // Everything else is bookkeeping the player does not need narrated.
    default:
      return null;
  }
}

/** Narrate a batch of events. */
export function narrate(context: NarratorContext, events: readonly GameEvent[]): Line[] {
  const out: Line[] = [];
  for (const event of events) {
    // A couple of events are a whole paragraph rather than a sentence: looking
    // around is the room, its occupants and what reaches you, and listening is
    // one line per thing heard. They expand here, where a list is allowed.
    if (event.type === 'custom' && event.event === 'looked') {
      out.push(...describeLook(context, String(event.data['at'] ?? '')));
      continue;
    }
    if (event.type === 'custom' && event.event === 'sensed') {
      out.push(...describeSense(context, String(event.data['sense'] ?? ''), String(event.data['by'] ?? '')));
      continue;
    }

    const line = narrateEvent(context, event);
    if (line && line.text) out.push(line);
  }
  return out;
}

/** `look`, and `look <something>`. */
function describeLook(context: NarratorContext, at: string): Line[] {
  if (!at) return describeSurroundings(context);

  const { module, state } = context;
  const target = at.toLowerCase();

  // Everything the party could reasonably mean, scored together — checking
  // creatures first would let a miller answer for a mill.
  const candidates: { score: number; lines: () => Line[] }[] = [];

  for (const entity of Object.values(state.entities)) {
    if (!entity.alive || entity.map !== state.currentMap) continue;
    const score = nameScore(target, entity.name);
    if (score === 0) continue;

    candidates.push({
      score,
      lines: () => {
        const source = entity.kind === 'npc'
          ? module.find<{ description?: string }>('content.npcs', npcIdOf(entity))
          : entity.statblock
            ? module.find<{ description?: string }>('content.monsters', entity.statblock)
            : null;
        return [
          { text: entity.name, kind: 'system' },
          {
            text: source?.description || `${entity.name}, and nothing more to be told from here.`,
            kind: 'prose',
          },
        ];
      },
    });
  }

  const actor = state.entities[state.selected];
  for (const stack of actor?.inventory ?? []) {
    const item = module.find<{ name: string; description?: string }>('content.items', stack.item);
    if (!item) continue;
    const score = nameScore(target, item.name);
    if (score === 0) continue;

    candidates.push({
      score,
      lines: () => [
        { text: item.name, kind: 'system' },
        { text: item.description || `${item.name}. Nothing remarkable.`, kind: 'prose' },
      ],
    });
  }

  const here = state.location;
  const areaId = here.kind === 'area' || here.kind === 'poi' ? here.area : null;
  for (const poi of module.all<{
    id: string; name: string; area: string; hidden: boolean;
    description?: string; descriptionKey?: string;
  }>('world.pointsOfInterest')) {
    if (poi.area !== areaId) continue;
    if (poi.hidden && state.flags[`found:${poi.id}`] !== true) continue;
    const score = nameScore(target, poi.name);
    if (score === 0) continue;

    candidates.push({
      score,
      lines: () => {
        const prose = poi.descriptionKey
          ? narrateFrom(module, poi.descriptionKey, context.seed, { sceneKey: `poi:${poi.id}` })
          : '';
        return [
          { text: poi.name, kind: 'system' },
          { text: prose || poi.description || `${poi.name}, from here.`, kind: 'prose' },
        ];
      },
    });
  }

  const best = candidates.reduce<typeof candidates[number] | null>(
    (winner, candidate) => (!winner || candidate.score > winner.score ? candidate : winner),
    null,
  );

  if (!best) return [{ text: `You cannot see ${at} from here.`, kind: 'refusal' }];
  return best.lines();
}

/**
 * `listen`, `smell`, and anything else the module calls a sense.
 *
 * Always says something. A sense that reports nothing has to say so out loud,
 * or stopping to use it reads as a command that does not work.
 */
function describeSense(context: NarratorContext, senseId: string, by: string): Line[] {
  const { module, state } = context;
  const observer = state.entities[by] ?? state.entities[state.selected];
  const sense = senseOf(module, senseId);
  if (!observer || !sense) return [];

  const readings = senseReport(
    { module, state, terrain: terrainFor(module) },
    observer,
    senseId,
  );

  if (readings.length === 0) {
    const empty = sense.emptyTextKey;
    const text = empty ? narrateFrom(module, empty, context.seed, { sceneKey: `${empty}:${state.minute}` }) : '';
    // Phrased around the sense as a noun — "by hearing", "by smell" — because
    // the engine knows the module's name for a sense and not its verb.
    const named = module.find<{ name: string }>('rules.senses', senseId)?.name ?? '';
    return [{
      text: text || (named
        ? `You stop. Nothing reaches you by ${named.toLowerCase()}.`
        : 'You stop. Nothing reaches you.'),
      kind: 'prose',
    }];
  }

  return readings
    .map((reading) => impressionLine(context, {
      sense: senseId,
      // Something remembered rather than present is reported as the faint,
      // uncertain thing it is, however loud it was at the time.
      strength: reading.age === 0 ? reading.strength : Math.min(reading.strength, 0.3),
      direction: reading.direction,
      x: observer.position.x,
      y: observer.position.y,
    }))
    .filter((line): line is Line => line !== null);
}

/**
 * One terrain index per module, built once.
 *
 * The narrator is called several times a turn and used to construct a fresh
 * index on each call, which is pure waste — the index is derived from the
 * module and the module does not change.
 */
const terrainCache = new WeakMap<CompiledModule, TerrainIndex>();
function terrainFor(module: CompiledModule): TerrainIndex {
  let index = terrainCache.get(module);
  if (!index) {
    index = new TerrainIndex(module);
    terrainCache.set(module, index);
  }
  return index;
}

interface Place {
  /** What to call this place to the player. */
  readonly placeName: string;
  /** The text pool describing it, when the module authored one. */
  readonly descriptionKey: string | undefined;
  /** Seeds the grammar, so a place reads the same way every time it is entered. */
  readonly sceneKey: string;
}

/**
 * Where the party is, by the module's own name for it.
 *
 * A point of interest wins over the area containing it, because standing in the
 * village should say the village and not the marsh it sits in.
 */
export function placeOf(module: CompiledModule, state: GameState): Place {
  const location = state.location;

  if (location.kind === 'poi') {
    const poi = module.find<{ name: string; descriptionKey?: string }>(
      'world.pointsOfInterest',
      location.poi,
    );
    return {
      placeName: poi?.name ?? location.poi,
      descriptionKey: poi?.descriptionKey,
      sceneKey: `poi:${location.poi}`,
    };
  }

  if (location.kind === 'area') {
    const area = module.find<{ name: string; descriptionKey?: string }>('world.areas', location.area);
    return {
      placeName: area?.name ?? location.area,
      descriptionKey: area?.descriptionKey,
      sceneKey: `area:${location.area}`,
    };
  }

  const dungeon = module.find<{ name: string }>('world.dungeons', location.dungeon);
  return {
    placeName: dungeon?.name ?? location.dungeon,
    descriptionKey: undefined,
    sceneKey: `dungeon:${location.dungeon}`,
  };
}

/** What to call where the party is standing. */
export function placeNameOf(module: CompiledModule, state: GameState): string {
  return placeOf(module, state).placeName;
}

/**
 * Describe where the party is standing.
 *
 * Uses the place's own text pool when it has one, and falls back to naming what
 * is visible — a room with no prose is still legible.
 */
export function describeSurroundings(context: NarratorContext): Line[] {
  const { state, module } = context;
  const out: Line[] = [];

  const { placeName, descriptionKey, sceneKey } = placeOf(module, state);

  if (placeName) out.push({ text: placeName, kind: 'system' });

  if (descriptionKey) {
    const text = narrateFrom(module, descriptionKey, context.seed, { sceneKey });
    if (text) out.push({ text, kind: 'prose' });
  }

  // Who else is here — only what the party can actually see. Listing a creature
  // asleep behind a wall would tell the player something their characters do
  // not know.
  const actor = state.entities[state.selected];
  const map = state.maps[state.currentMap];
  const terrain = terrainFor(module);
  const visible = actor && map
    ? perceivedTiles({ module, state, terrain }, actor, sightSenseOf(module))
    : null;

  const others = Object.values(state.entities).filter(
    (entity) =>
      entity.alive &&
      entity.map === state.currentMap &&
      entity.kind !== 'character' &&
      (!visible || visible.has(key(entity.position))),
  );
  if (others.length > 0) {
    // A lone creature gets the colour its statblock declares — "a lean,
    // mud-slicked bog hound" rather than "bog hound". Several of a kind are
    // tallied instead, because "two lean bog hounds and a lean bog hound" is
    // worse than counting them.
    const names = others.map((entity) => entity.name.toLowerCase());
    const tally = new Map<string, number>();
    for (const name of names) tally.set(name, (tally.get(name) ?? 0) + 1);

    const described = [...tally].map(([name, n]) => {
      if (n > 1) return count(n, name);
      const one = others.find((entity) => entity.name.toLowerCase() === name)!;
      return describeCreature(module, one, context.seed);
    });
    out.push({ text: `You see ${list(described)}.`, kind: 'prose' });
  }

  // And what reaches the party by other means. Deliberately unnamed and
  // approximate: knowing something large is upwind is worth more to a player
  // than being handed its statblock.
  if (actor && map) {
    for (const felt of impressions({ module, state, terrain }, actor)) {
      // The same authored phrasing the moment-of-noticing uses, so looking
      // around and being surprised describe the world the same way.
      const line = impressionLine(context, {
        sense: felt.sense,
        // A trail is reported as the faint thing it is, however strong the
        // reading: what matters to a player is that it is old.
        strength: felt.fresh ? felt.strength : Math.min(felt.strength, 0.3),
        direction: felt.direction,
        x: actor.position.x,
        y: actor.position.y,
      });
      if (line) out.push(line);
    }
  }

  return out;
}

export { interpolate, narrateFrom, list, count };

/** Whether any living party member can perceive a given creature. */
function partyCanSee(context: NarratorContext, id: string): boolean {
  const subject = context.state.entities[id];
  if (!subject) return false;

  const terrain = terrainFor(context.module);
  const perception = { module: context.module, state: context.state, terrain };

  return context.state.party.some((memberId) => {
    const member = context.state.entities[memberId];
    return member?.alive === true && canPerceive(perception, member, subject);
  });
}

/**
 * What noticing something reads like.
 *
 * The module writes it, because what a marsh smells like is not the engine's
 * business. A sense that declares no phrasing still says *something* — a bare
 * line naming the sense — so a half-authored module is playable rather than
 * silent.
 */
function impressionLine(
  context: NarratorContext,
  data: Readonly<Record<string, unknown>>,
): Line | null {
  const senseId = String(data['sense'] ?? '');
  const sense = senseOf(context.module, senseId);
  const strength = Number(data['strength'] ?? 0);

  const faint = strength <= 0.35;
  const key = faint
    ? sense?.faintImpressionTextKey ?? sense?.impressionTextKey
    : sense?.impressionTextKey;

  const declared = context.module.find<{ name: string }>('rules.senses', senseId);
  const where = String(data['direction'] ?? '');

  if (key) {
    const text = narrateFrom(context.module, key, context.seed, {
      context: { direction: where },
      sceneKey: `${key}:${data['x']},${data['y']}`,
    });
    if (text) return { text, kind: 'prose' };
  }

  const nearness = faint ? 'Faintly' : strength > 0.6 ? 'Close by' : 'Somewhere';
  return {
    text: `${nearness}, something you can ${(declared?.name ?? 'sense').toLowerCase()}.`,
    kind: 'prose',
  };
}
