/**
 * The verb parser.
 *
 * Turns `attack the skeleton` into an action. Two things matter more than
 * cleverness here:
 *
 *   - **Never say "I don't understand."** A refusal should say what *was*
 *     understood and what is missing — "attack what?" — because the player is
 *     guessing at a vocabulary and a bare rejection teaches them nothing.
 *   - **Resolve nouns against what is actually present.** `hound` matches the
 *     bog hound standing in front of you, and ambiguity is reported rather than
 *     silently picking the first match.
 */

import type { CompiledModule } from '@dm/module';
import type { Action, Direction, GameState } from '@dm/engine';
import { distance, nameScore } from '@dm/engine';
import type { Position } from '@dm/engine';

/**
 * The three things an input can be.
 *
 * Discriminated on `kind` rather than on the presence of a field, so narrowing
 * works — `ok: true` alone cannot distinguish an action from a shell command.
 */
export type ParseResult =
  | { readonly kind: 'action'; readonly action: Action }
  | { readonly kind: 'meta'; readonly meta: MetaCommand }
  | { readonly kind: 'error'; readonly message: string };

export type MetaCommand =
  | { readonly kind: 'quit' }
  | { readonly kind: 'help' }
  | { readonly kind: 'map' }
  | { readonly kind: 'exits' }
  /** Page the transcript. Negative goes back, positive returns. */
  | { readonly kind: 'scroll'; readonly by: number }
  | { readonly kind: 'inventory' }
  | { readonly kind: 'sheet' }
  | { readonly kind: 'journal' }
  | { readonly kind: 'save'; readonly path: string }
  | { readonly kind: 'load'; readonly path: string };

/** What kind of noun a verb wants after it, for completion and for help. */
export type VerbTakes =
  | 'nothing' | 'direction' | 'entity' | 'item' | 'place' | 'area'
  | 'ability' | 'gate' | 'quest' | 'member' | 'rest' | 'text';

export interface VerbSpec {
  /** Canonical key — what the switch in `parse` dispatches on. */
  readonly verb: string;
  /** All spellings, most-specific first. */
  readonly spellings: readonly string[];
  readonly takes: VerbTakes;
  /** One clause for help and for a completion's grey text. */
  readonly summary: string;
  /** A shell command, handled by the front end rather than the engine. */
  readonly meta: boolean;
}

/**
 * The verb table, as described data.
 *
 * One table drives three things — the parser's lookup, the generated `HELP`,
 * and a front end's completion list — which kills the class of bug where a
 * verb works but help never mentions it. Declaration order is match order.
 */
export const VERB_SPECS: readonly VerbSpec[] = [
  { verb: 'go', spellings: ['go', 'move', 'walk', 'head'], takes: 'direction', summary: 'walk one step, or toward a place', meta: false },
  { verb: 'attack', spellings: ['attack', 'hit', 'kill', 'fight', 'strike'], takes: 'entity', summary: 'attack a creature', meta: false },
  { verb: 'use', spellings: ['use', 'cast', 'invoke'], takes: 'ability', summary: 'use an ability or an item', meta: false },
  { verb: 'take', spellings: ['take', 'get', 'pick', 'grab'], takes: 'item', summary: 'pick something up', meta: false },
  { verb: 'drop', spellings: ['drop', 'discard'], takes: 'item', summary: 'put something down', meta: false },
  { verb: 'equip', spellings: ['equip', 'wear', 'wield', 'don'], takes: 'item', summary: 'wear or wield something carried', meta: false },
  { verb: 'unequip', spellings: ['unequip', 'remove', 'sheathe', 'doff'], takes: 'item', summary: 'take something off', meta: false },
  { verb: 'open', spellings: ['open', 'unlock', 'force'], takes: 'gate', summary: 'open a door or a gate', meta: false },
  { verb: 'search', spellings: ['search', 'look for', 'examine'], takes: 'nothing', summary: 'search for what is hidden here', meta: false },
  { verb: 'talk', spellings: ['talk', 'speak', 'greet', 'ask'], takes: 'entity', summary: 'talk to someone', meta: false },
  { verb: 'say', spellings: ['say', 'reply', 'choose', 'answer'], takes: 'text', summary: 'give a reply in conversation', meta: false },
  { verb: 'rest', spellings: ['rest', 'sleep', 'camp'], takes: 'rest', summary: 'rest and recover', meta: false },
  { verb: 'wait', spellings: ['wait', 'z'], takes: 'nothing', summary: 'let time pass', meta: false },
  { verb: 'enter', spellings: ['enter', 'visit', 'approach'], takes: 'place', summary: 'enter a place here', meta: false },
  { verb: 'travel', spellings: ['travel', 'journey'], takes: 'area', summary: 'take a road to another area', meta: false },
  { verb: 'accept', spellings: ['accept'], takes: 'quest', summary: 'take on a job', meta: false },
  { verb: 'select', spellings: ['select', 'switch', 'control'], takes: 'member', summary: 'control another party member', meta: false },
  { verb: 'endTurn', spellings: ['end', 'done', 'pass'], takes: 'nothing', summary: 'end your combat turn', meta: false },
  { verb: 'flee', spellings: ['flee', 'run', 'retreat', 'withdraw'], takes: 'nothing', summary: 'run from a fight', meta: false },
  // Stances. "run" is already flight, so the fast stance is "dash".
  { verb: 'sneak', spellings: ['sneak', 'creep', 'stealth', 'prowl'], takes: 'nothing', summary: 'move quietly', meta: false },
  { verb: 'stroll', spellings: ['walk', 'stroll'], takes: 'nothing', summary: 'move at an ordinary pace', meta: false },
  { verb: 'dash', spellings: ['dash', 'sprint', 'hurry'], takes: 'nothing', summary: 'move fast, and loudly', meta: false },
  { verb: 'listen', spellings: ['listen'], takes: 'nothing', summary: 'stop and listen', meta: false },
  { verb: 'sniff', spellings: ['sniff', 'smell', 'scent'], takes: 'nothing', summary: 'stop and take the air', meta: false },
  { verb: 'leave', spellings: ['leave', 'back', 'out'], takes: 'nothing', summary: 'step back out, or end a conversation', meta: false },
  // Whether the rest of the party walks with you.
  { verb: 'follow', spellings: ['follow', 'regroup'], takes: 'nothing', summary: 'the party falls in behind you', meta: false },
  { verb: 'unfollow', spellings: ['unfollow', 'scatter'], takes: 'nothing', summary: 'the party spreads out', meta: false },
  { verb: 'look', spellings: ['look', 'l'], takes: 'entity', summary: 'look around, or at something', meta: false },
  // Shell commands.
  { verb: 'exits', spellings: ['exits', 'where', 'x'], takes: 'nothing', summary: 'where you can go from here', meta: true },
  { verb: 'scroll', spellings: ['scroll'], takes: 'nothing', summary: 'page back through the log', meta: true },
  { verb: 'map', spellings: ['map', 'm'], takes: 'nothing', summary: 'the whole map, scaled to fit', meta: true },
  { verb: 'inventory', spellings: ['inventory', 'inv', 'i'], takes: 'nothing', summary: 'what you are carrying', meta: true },
  { verb: 'sheet', spellings: ['sheet', 'character', 'stats'], takes: 'nothing', summary: 'the character sheet', meta: true },
  { verb: 'journal', spellings: ['journal', 'quests', 'q'], takes: 'nothing', summary: 'the quest journal', meta: true },
  { verb: 'help', spellings: ['help', '?'], takes: 'nothing', summary: 'this list', meta: true },
  { verb: 'quit', spellings: ['quit', 'exit'], takes: 'nothing', summary: 'stop playing', meta: true },
  { verb: 'save', spellings: ['save'], takes: 'text', summary: 'save the game', meta: true },
  { verb: 'load', spellings: ['load'], takes: 'text', summary: 'load a save', meta: true },
];

/** The lookup `matchVerb` walks, derived from the described table. */
const VERBS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  VERB_SPECS.map((spec) => [spec.verb, spec.spellings]),
);

const DIRECTION_ALIASES: Readonly<Record<string, Direction>> = {
  n: 'north', north: 'north',
  ne: 'northeast', northeast: 'northeast',
  e: 'east', east: 'east',
  se: 'southeast', southeast: 'southeast',
  s: 'south', south: 'south',
  sw: 'southwest', southwest: 'southwest',
  w: 'west', west: 'west',
  nw: 'northwest', northwest: 'northwest',
};

const NOISE = new Set(['the', 'a', 'an', 'at', 'to', 'with', 'on', 'up', 'my', 'of']);

interface VerbMatch {
  readonly verb: string;
  /** The spelling the player actually typed, which some verbs care about. */
  readonly spelling: string;
  /** How many words it consumed. */
  readonly words: number;
}

/**
 * Match the leading verb, longest spelling first.
 *
 * Two words before one, so a multi-word spelling like `look for` can win over
 * the bare `look` that would otherwise shadow it. Matching only the first word
 * meant every multi-word entry in the table was unreachable.
 */
function matchVerb(words: readonly string[]): VerbMatch | null {
  const pair = words.length > 1 ? `${words[0]} ${words[1]}` : '';

  for (const size of pair ? [2, 1] : [1]) {
    const candidate = size === 2 ? pair : words[0]!;
    for (const [verb, spellings] of Object.entries(VERBS)) {
      if (spellings.includes(candidate)) return { verb, spelling: candidate, words: size };
    }
  }
  return null;
}

/**
 * The sense a module means by a word like "listen".
 *
 * Matched against what the module declares rather than hard-coded, because the
 * engine does not know what hearing is — a module is free to call its senses
 * anything, or to have a sense this game has no word for.
 */
function senseNamed(module: CompiledModule, words: readonly string[]): string | null {
  const senses = module.all<{ id: string; name?: string }>('rules.senses');
  for (const sense of senses) {
    const id = sense.id.toLowerCase();
    const name = (sense.name ?? '').toLowerCase();
    if (words.some((word) => id.includes(word) || (name !== '' && name.includes(word)))) {
      return sense.id;
    }
  }
  return null;
}

/**
 * Score how well a noun phrase matches a candidate name.
 *
 * The engine owns the ladder, so that naming a thing to the parser and naming
 * the same thing to the narrator cannot mean two different things.
 */
const score = nameScore;

export interface Candidate<T> {
  readonly value: T;
  readonly name: string;
  /**
   * Where it stands, when it stands somewhere. Two identically-named monsters
   * are indistinguishable by every other field, so a picker leans on this.
   */
  readonly at?: Position;
}

/**
 * How a noun resolved — or the two ways it did not.
 *
 * Both refusal arms carry `message`, so a caller that only wants a string is
 * unchanged; a caller that can *do better* than a string — a front end with a
 * picker — reads `kind` and, on a tie, gets the candidates themselves. Two
 * identically-named monsters always tie, which used to make the input
 * unresolvable by typing at all.
 */
export type Resolution<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly kind: 'none'; readonly message: string }
  | {
      readonly ok: false;
      readonly kind: 'ambiguous';
      readonly message: string;
      readonly candidates: readonly Candidate<T>[];
    };

/** Resolve a noun against candidates, reporting ambiguity rather than guessing. */
export function resolveNoun<T>(
  noun: string,
  candidates: readonly Candidate<T>[],
): Resolution<T> {
  if (candidates.length === 0) {
    return { ok: false, kind: 'none', message: `There is no ${noun} here.` };
  }

  const scored = candidates
    .map((candidate) => ({ candidate, score: score(noun, candidate.name) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { ok: false, kind: 'none', message: `There is no ${noun} here.` };
  }

  const best = scored[0]!;
  const tied = scored.filter((entry) => entry.score === best.score);
  if (tied.length > 1) {
    return {
      ok: false,
      kind: 'ambiguous',
      message: `Which do you mean — ${tied.map((entry) => entry.candidate.name).join(', ')}?`,
      candidates: tied.map((entry) => entry.candidate),
    };
  }

  return { ok: true, value: best.candidate.value };
}

export interface ParseContext {
  readonly module: CompiledModule;
  readonly state: GameState;
}

/** Living things the party can see and name. */
export function visibleEntities(context: ParseContext): Candidate<string>[] {
  const { state } = context;
  const actor = state.entities[state.selected];
  if (!actor) return [];

  return Object.values(state.entities)
    .filter((entity) => entity.alive && entity.map === state.currentMap && entity.id !== actor.id)
    .filter((entity) => distance(entity.position, actor.position) <= 20)
    .map((entity) => ({ value: entity.id, name: entity.name, at: entity.position }));
}

/** The closest living hostile the selected character can see, if any. */
function nearestEnemy(context: ParseContext): string | null {
  const { state } = context;
  const actor = state.entities[state.selected];
  if (!actor) return null;

  const hostiles = Object.values(state.entities)
    .filter((entity) => entity.alive && entity.map === state.currentMap && entity.id !== actor.id)
    .filter((entity) => entity.disposition === 'hostile')
    .sort((a, b) => {
      const gap = distance(a.position, actor.position) - distance(b.position, actor.position);
      // Ties broken by id, so the same input always picks the same target.
      return gap !== 0 ? gap : a.id.localeCompare(b.id);
    });

  return hostiles[0]?.id ?? null;
}

/** Items the selected character is carrying. */
export function carried(context: ParseContext): Candidate<string>[] {
  const actor = context.state.entities[context.state.selected];
  return (actor?.inventory ?? []).map((stack) => ({
    value: stack.item,
    name: context.module.find<{ name: string }>('content.items', stack.item)?.name ?? stack.item,
  }));
}

/** Items carried, plus anything lying within reach. */
export function carriedOrNearby(context: ParseContext): Candidate<string>[] {
  const actor = context.state.entities[context.state.selected];
  const map = actor ? context.state.maps[actor.map] : undefined;
  const nearby: Candidate<string>[] = [];

  if (actor && map) {
    for (const [tileKey, stacks] of Object.entries(map.items)) {
      const tile = Number(tileKey);
      const at = { x: tile & 0xffff, y: tile >>> 16 };
      if (distance(at, actor.position) > 1) continue;
      for (const stack of stacks) {
        nearby.push({
          value: stack.item,
          name: context.module.find<{ name: string }>('content.items', stack.item)?.name ?? stack.item,
        });
      }
    }
  }
  return [...nearby, ...carried(context)];
}

/** Places the party could enter from here. */
export function reachablePlaces(context: ParseContext): Candidate<string>[] {
  const { module, state } = context;
  const here = state.location;
  const areaId = here.kind === 'area' ? here.area : here.kind === 'poi' ? here.area : null;

  const places = module
    .all<{ id: string; name: string; area: string; hidden: boolean }>('world.pointsOfInterest')
    .filter((poi) => poi.area === areaId)
    .filter((poi) => !poi.hidden || state.flags[`found:${poi.id}`] === true)
    .map((poi) => ({ value: poi.id, name: poi.name }));

  return places;
}

/** Parse a line of input. */
export function parse(input: string, context: ParseContext): ParseResult {
  const cleaned = input.trim().toLowerCase();
  if (cleaned === '') return { kind: 'error', message: '' };

  const words = cleaned.split(/\s+/).filter((word) => !NOISE.has(word));
  if (words.length === 0) return { kind: 'error', message: '' };

  // A bare direction is a move — the most common input in a roguelike.
  const bareDirection = DIRECTION_ALIASES[words[0]!];
  if (bareDirection && words.length === 1) {
    return { kind: 'action', action: { type: 'step', direction: bareDirection } };
  }

  const matched = matchVerb(words);

  if (!matched) {
    return { kind: 'error', message: `"${words[0]}" is not something you can do. Try "help".` };
  }

  const { verb, spelling } = matched;
  const rest = words.slice(matched.words).join(' ').trim();

  switch (verb) {
    case 'go': {
      const direction = DIRECTION_ALIASES[rest];
      if (direction) return { kind: 'action', action: { type: 'step', direction } };
      // Bare "walk" is the stance, not an unfinished move. `go` is listed
      // before `stroll` so it wins the word outright; this hands it back.
      if (!rest && spelling === 'walk') {
        return { kind: 'action', action: { type: 'setStance', stance: 'walk' } };
      }
      if (!rest) return { kind: 'error', message: 'Go where? Try a direction, or "exits".' };
      // "go to the mill" is an entry, not a step.
      const place = resolveNoun(rest, reachablePlaces(context));
      if (place.ok) return { kind: 'action', action: { type: 'enter', target: place.value } };
      return { kind: 'error', message: place.message };
    }

    case 'sneak':
      return { kind: 'action', action: { type: 'setStance', stance: 'sneak' } };
    case 'stroll':
      return { kind: 'action', action: { type: 'setStance', stance: 'walk' } };
    case 'dash':
      return { kind: 'action', action: { type: 'setStance', stance: 'dash' } };

    // Stopping to listen or take the air costs a minute and reports what that
    // sense has to say — including what it noticed a while ago and has not
    // forgotten, so asking twice is not silence.
    case 'listen':
    case 'sniff': {
      const wanted = verb === 'listen'
        ? ['hearing', 'hear', 'sound', 'listen']
        : ['smell', 'scent', 'nose', 'odour', 'odor'];
      const sense = senseNamed(context.module, wanted);
      if (!sense) {
        const declared = context.module.all<{ name?: string; id: string }>('rules.senses')
          .map((entry) => (entry.name ?? entry.id).toLowerCase());
        return {
          kind: 'error',
          message: declared.length > 0
            ? `Nothing here works that way. You have: ${declared.join(', ')}.`
            : 'Nothing here works that way.',
        };
      }
      return { kind: 'action', action: { type: 'sense', sense } };
    }

    case 'follow': {
      const off = rest === 'off' || rest === 'stop' || rest === 'no';
      return { kind: 'action', action: { type: 'setFollow', follow: !off } };
    }
    case 'unfollow':
      return { kind: 'action', action: { type: 'setFollow', follow: false } };

    case 'exits':
      return { kind: 'meta', meta: { kind: 'exits' } };

    // Back through the transcript, for a screen that does not scroll on its own.
    case 'scroll': {
      const back = rest === '' || rest === 'up' || rest === 'back';
      return { kind: 'meta', meta: { kind: 'scroll', by: back ? -1 : 1 } };
    }

    case 'attack': {
      // A bare "attack" means the obvious enemy: in a fight there is usually
      // only one thing in front of you, and naming it every round is a chore.
      if (!rest) {
        const obvious = nearestEnemy(context);
        if (obvious) return { kind: 'action', action: { type: 'attack', target: obvious } };
        return { kind: 'error', message: 'Attack what?' };
      }
      const target = resolveNoun(rest, visibleEntities(context));
      if (!target.ok) return { kind: 'error', message: target.message };
      return { kind: 'action', action: { type: 'attack', target: target.value } };
    }

    case 'use': {
      if (!rest) return { kind: 'error', message: 'Use what?' };
      const actor = context.state.entities[context.state.selected];
      const known = (actor?.abilities ?? []).map((id) => ({
        value: id,
        name: context.module.find<{ name: string }>('content.abilities', id)?.name ?? id,
      }));

      // "cast rally on ash" — split the target off if one is named.
      const [abilityPart, targetPart] = rest.split(/\s+on\s+/, 2);
      const ability = resolveNoun(abilityPart ?? rest, known);
      if (!ability.ok) return { kind: 'error', message: ability.message };

      if (targetPart) {
        const target = resolveNoun(targetPart, visibleEntities(context));
        if (!target.ok) return { kind: 'error', message: target.message };
        return { kind: 'action', action: { type: 'useAbility', ability: ability.value, target: target.value } };
      }
      return { kind: 'action', action: { type: 'useAbility', ability: ability.value } };
    }

    case 'open': {
      if (!rest) return { kind: 'error', message: 'Open what?' };
      const gates = context.module
        .all<{ id: string; name: string }>('world.gates')
        .map((gate) => ({ value: gate.id, name: gate.name }));
      const gate = resolveNoun(rest, gates);
      if (!gate.ok) return { kind: 'error', message: gate.message };
      return { kind: 'action', action: { type: 'open', target: gate.value } };
    }

    case 'talk': {
      if (!rest) return { kind: 'error', message: 'Talk to whom?' };
      const who = resolveNoun(rest, visibleEntities(context));
      if (!who.ok) return { kind: 'error', message: who.message };
      return { kind: 'action', action: { type: 'talk', npc: who.value } };
    }

    case 'say': {
      if (!rest) return { kind: 'error', message: 'Say what?' };
      return { kind: 'action', action: { type: 'choose', option: rest.replace(/\s+/g, '_') } };
    }

    case 'enter': {
      if (!rest) return { kind: 'error', message: 'Enter where?' };
      const place = resolveNoun(rest, reachablePlaces(context));
      if (!place.ok) return { kind: 'error', message: place.message };
      return { kind: 'action', action: { type: 'enter', target: place.value } };
    }

    case 'travel': {
      if (!rest) return { kind: 'error', message: 'Travel where?' };
      const areas = context.module
        .all<{ id: string; name: string }>('world.areas')
        .map((area) => ({ value: area.id, name: area.name }));
      const area = resolveNoun(rest, areas);
      if (!area.ok) return { kind: 'error', message: area.message };
      return { kind: 'action', action: { type: 'travelToArea', area: area.value } };
    }

    case 'rest': {
      const rests = context.module
        .all<{ id: string; name: string }>('rules.rests')
        .map((entry) => ({ value: entry.id, name: entry.name }));
      if (rests.length === 0) return { kind: 'error', message: 'There is no way to rest here.' };
      if (!rest) return { kind: 'action', action: { type: 'rest', kind: rests[0]!.value } };
      const chosen = resolveNoun(rest, rests);
      if (!chosen.ok) return { kind: 'error', message: chosen.message };
      return { kind: 'action', action: { type: 'rest', kind: chosen.value } };
    }

    case 'accept': {
      if (!rest) return { kind: 'error', message: 'Accept which quest?' };
      const quests = context.module
        .all<{ id: string; name: string }>('narrative.quests')
        .map((quest) => ({ value: quest.id, name: quest.name }));
      const quest = resolveNoun(rest, quests);
      if (!quest.ok) return { kind: 'error', message: quest.message };
      return { kind: 'action', action: { type: 'acceptQuest', quest: quest.value } };
    }

    case 'select': {
      if (!rest) return { kind: 'error', message: 'Control whom?' };
      const party = context.state.party
        .map((id) => context.state.entities[id])
        .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
        .map((entity) => ({ value: entity.id, name: entity.name }));
      const member = resolveNoun(rest, party);
      if (!member.ok) return { kind: 'error', message: member.message };
      return { kind: 'action', action: { type: 'select', entity: member.value } };
    }

    case 'flee':
      return { kind: 'action', action: { type: 'flee' } };

    case 'leave':
      return { kind: 'action', action: { type: 'leave' } };

    case 'search':
      return { kind: 'action', action: { type: 'search' } };

    case 'wait':
      return { kind: 'action', action: { type: 'wait', minutes: 10 } };

    case 'endTurn':
      return { kind: 'action', action: { type: 'endTurn' } };

    case 'take': {
      // Bare "take" means everything underfoot.
      if (!rest) return { kind: 'action', action: { type: 'take' } };
      const item = resolveNoun(rest, carriedOrNearby(context));
      if (!item.ok) return { kind: 'error', message: item.message };
      return { kind: 'action', action: { type: 'take', item: item.value } };
    }

    case 'drop': {
      if (!rest) return { kind: 'error', message: 'Drop what?' };
      const item = resolveNoun(rest, carried(context));
      if (!item.ok) return { kind: 'error', message: item.message };
      return { kind: 'action', action: { type: 'drop', item: item.value } };
    }

    case 'equip': {
      if (!rest) return { kind: 'error', message: 'Wear what?' };
      const item = resolveNoun(rest, carried(context));
      if (!item.ok) return { kind: 'error', message: item.message };
      return { kind: 'action', action: { type: 'equip', item: item.value } };
    }

    case 'unequip': {
      if (!rest) return { kind: 'error', message: 'Take off what?' };
      const item = resolveNoun(rest, carried(context));
      if (!item.ok) return { kind: 'error', message: item.message };
      return { kind: 'action', action: { type: 'unequip', item: item.value } };
    }

    // Looking is a real action, not a shell command: it goes through the
    // engine so what you can see is decided by perception, once, and lands in
    // the transcript with everything else.
    case 'look':
      return { kind: 'action', action: rest ? { type: 'look', at: rest } : { type: 'look' } };

    // — shell commands ——————————————————————————————————————
    case 'map':
      return { kind: 'meta', meta: { kind: 'map' } };
    case 'inventory':
      return { kind: 'meta', meta: { kind: 'inventory' } };
    case 'sheet':
      return { kind: 'meta', meta: { kind: 'sheet' } };
    case 'journal':
      return { kind: 'meta', meta: { kind: 'journal' } };
    case 'help':
      return { kind: 'meta', meta: { kind: 'help' } };
    case 'quit':
      return { kind: 'meta', meta: { kind: 'quit' } };
    case 'save':
      return { kind: 'meta', meta: { kind: 'save', path: rest || 'save.json' } };
    case 'load':
      return { kind: 'meta', meta: { kind: 'load', path: rest || 'save.json' } };

    default:
      return { kind: 'error', message: `You cannot do that yet.` };
  }
}

/** Whether a parse result is a shell command rather than a game action. */
export function isMeta(result: ParseResult): result is { kind: 'meta'; meta: MetaCommand } {
  return result.kind === 'meta';
}

/**
 * The command list, generated from the same table the parser matches against —
 * so a verb cannot work while help forgets it, or the reverse.
 */
export const HELP: string = (() => {
  const GROUPS: readonly (readonly [string, readonly string[]])[] = [
    ['Movement', ['go']],
    ['Going', ['exits', 'enter', 'travel', 'leave']],
    ['Looking', ['look', 'map', 'search', 'listen', 'sniff']],
    ['Fighting', ['attack', 'endTurn', 'flee']],
    ['Abilities', ['use']],
    ['Items', ['take', 'drop', 'equip', 'unequip', 'open']],
    ['People', ['talk', 'say']],
    ['Pace', ['sneak', 'stroll', 'dash']],
    ['Party', ['follow', 'unfollow', 'select', 'sheet', 'inventory', 'journal']],
    ['Time', ['rest', 'wait']],
    ['Session', ['save', 'load', 'help', 'quit']],
  ];

  const spellingOf = (verb: string): string =>
    VERB_SPECS.find((spec) => spec.verb === verb)?.spellings[0] ?? verb;

  const rows = GROUPS.map(([group, verbs]) => {
    const words = group === 'Movement'
      ? 'n s e w, ne nw se sw   or  go north'
      : verbs.map(spellingOf).join(', ');
    return `  ${group.padEnd(12)}${words}`;
  });

  return ['', ...rows].join('\n');
})();
