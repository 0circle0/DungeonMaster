/** A play session. */

import type { CompiledModule } from '@dm/module';
import type { Action, GameState, Line, ModRuntime } from '@dm/engine';
import {
  newGame,
  defaultChoices,
  reduce,
  narrate,
  describeSurroundings,
  TerrainIndex,
  enterDungeon,
  enterArea,
  enterPoi,
  Transaction,
  save as saveState,
  load as loadState,
  visibleOptions,
  startAutoQuests,
  placeOf,
} from '@dm/engine';
import { Rng } from '@dm/core';
import { parse } from './parser.js';
import type { MetaCommand } from './parser.js';

export interface Session {
  readonly module: CompiledModule;
  state: GameState;
  readonly terrain: TerrainIndex;
  readonly seed: number;
  /** Everything narrated so far. */
  readonly transcript: Line[];
}

const PARTY_NAMES = ['Ash', 'Korrin', 'Mire', 'Sable', 'Dun', 'Wren', 'Halt', 'Brann'];

/** Begin a session, placing the party where the module says play starts. */
export function startSession(
  module: CompiledModule,
  seed: number,
  partySize?: number,
  roster?: readonly import('@dm/engine').CharacterChoices[],
): Session {
  const size = Math.min(partySize ?? module.source.start.partySize, module.source.start.partySize);
  const state = newGame(module, {
    seed,
    // A roster from character creation when there is one; the module's defaults otherwise.
    party: roster && roster.length > 0
      ? roster.slice(0, size)
      : Array.from({ length: size }, (_, i) => defaultChoices(module, PARTY_NAMES[i] ?? `Hero ${i + 1}`)),
  });

  const terrain = new TerrainIndex(module);
  const session: Session = { module, state, terrain, seed, transcript: [] };

  // Put the party somewhere real.
  const txn = new Transaction(state, module);
  const rng = Rng.fromSeed(seed).derive('arrival');
  const start = module.source.start;

  if (start.startingPoi) {
    const poi = module.get<{ area: string }>('world.pointsOfInterest', start.startingPoi);
    enterArea(txn, terrain, poi.area, rng);
    const actor = txn.entity(txn.state.selected);
    if (actor) enterPoi(txn, terrain, start.startingPoi, actor, rng, true);
  } else if (start.startingArea) {
    enterArea(txn, terrain, start.startingArea, rng);
  } else if (start.startingDungeon) {
    enterDungeon(txn, terrain, start.startingDungeon, rng);
  }

  // Whatever the party is already committed to when play opens.
  startAutoQuests(txn, rng.derive('quests'));

  const arrived = txn.finish();
  session.state = arrived.state;

  // Order: the module's opening text, then the room, the people and the job.
  const context = { module, state: session.state, seed };

  if (start.openingTextKey) {
    session.transcript.push(
      ...narrate(context, [{ type: 'narrate', textKey: start.openingTextKey, context: {} }]),
    );
  }

  session.transcript.push(...describeSurroundings(context));

  // The look wins: arriving and looking around would print the same paragraph twice.
  const described = placeOf(module, session.state).descriptionKey;
  const location = session.state.location;
  const herePoi = location.kind === 'poi' ? location.poi : null;
  const arrival = arrived.events.filter((event) => {
    if (event.type === 'narrate' && event.textKey === described) return false;
    // The arrival event would print the place's name a second time.
    if (event.type === 'custom' && event.event === 'entered'
      && event.data['place'] === herePoi) return false;
    return true;
  });
  session.transcript.push(...narrate(context, arrival));

  return session;
}

/** Everything the front ends need to answer questions about a game in play. */
export interface PlayContext {
  readonly module: CompiledModule;
  readonly state: GameState;
  readonly terrain: TerrainIndex;
  /** Installed mods, when a game uses any. */
  readonly mods?: ModRuntime | undefined;
}

/** One resolved turn: the world after, and what to say about it. */
export interface Turn {
  readonly state: GameState;
  readonly lines: readonly Line[];
}

/** Apply one action to a state. */
export function applyTo(context: PlayContext & { readonly seed: number }, action: Action): Turn {
  const result = reduce(context.state, action, {
    module: context.module,
    terrain: context.terrain,
    mods: context.mods,
  });
  const lines = narrate(
    { module: context.module, state: result.state, seed: context.seed },
    result.events,
  );
  return { state: result.state, lines };
}

/** Apply one action and narrate what happened. */
export function applyAction(session: Session, action: Action): Line[] {
  const turn = applyTo(session, action);
  session.state = turn.state;
  session.transcript.push(...turn.lines);
  return [...turn.lines];
}

export type CommandResult =
  | { readonly kind: 'lines'; readonly lines: readonly Line[] }
  | { readonly kind: 'meta'; readonly command: MetaCommand }
  | { readonly kind: 'error'; readonly message: string };

/** What one line of input came to, without a session to mutate. */
export type CommandOutcome =
  | { readonly kind: 'turn'; readonly turn: Turn }
  | { readonly kind: 'meta'; readonly command: MetaCommand }
  | { readonly kind: 'error'; readonly message: string };

/** Run one line of player input against a state — the pure form. */
export function interpret(
  context: PlayContext & { readonly seed: number },
  input: string,
): CommandOutcome {
  if (context.state.dialogue) {
    const trimmed = input.trim();
    const choice = Number(trimmed);
    if (Number.isInteger(choice) && choice > 0) {
      const actor = context.state.entities[context.state.selected];
      if (actor) {
        const txn = new Transaction(context.state, context.module);
        const options = visibleOptions(txn, actor, Rng.fromState(context.state.rng))
          .filter((option) => !option.locked);
        const chosen = options[choice - 1];
        if (!chosen) return { kind: 'error', message: 'There is no such reply.' };
        return { kind: 'turn', turn: applyTo(context, { type: 'choose', option: chosen.id }) };
      }
    }
  }

  const parsed = parse(input, { module: context.module, state: context.state });

  switch (parsed.kind) {
    case 'error':
      return { kind: 'error', message: parsed.message };
    case 'meta':
      return { kind: 'meta', command: parsed.meta };
    default:
      return { kind: 'turn', turn: applyTo(context, parsed.action) };
  }
}

/** Run one line of player input. */
export function runCommand(session: Session, input: string): CommandResult {
  const outcome = interpret(session, input);
  if (outcome.kind !== 'turn') return outcome;

  session.state = outcome.turn.state;
  session.transcript.push(...outcome.turn.lines);
  return { kind: 'lines', lines: outcome.turn.lines };
}

/** Replies the player can currently give, numbered for selection. */
export function currentOptions(session: Session): { id: string; text: string; locked: boolean; hint: string }[] {
  if (!session.state.dialogue) return [];
  const actor = session.state.entities[session.state.selected];
  if (!actor) return [];

  const txn = new Transaction(session.state, session.module);
  return visibleOptions(txn, actor, Rng.fromState(session.state.rng));
}

export function serialize(session: Session, savedAt: number): string {
  return saveState(session.state, savedAt);
}

export function deserialize(session: Session, text: string): string | null {
  const result = loadState(text, session.module);
  if (!result.ok) return result.error;
  session.state = result.state;
  return null;
}
