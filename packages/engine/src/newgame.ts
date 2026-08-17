/**
 * Starting a game.
 *
 * `newGame` is the one place a {@link GameState} is created from nothing. It
 * takes a compiled module, a seed, and the party's creation choices, and
 * returns fully serializable state — no further setup, no hidden globals.
 *
 * Everything it reads comes from the module: how many characters the party has,
 * what the world clock starts at, which flags a new game sets, and where play
 * begins. Swapping the module changes all of it.
 */

import { Rng } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import { createCharacter } from './character.js';
import type { CharacterChoices } from './character.js';
import { SAVE_VERSION } from './state.js';
import type { Entity, GameState, Location } from './state.js';

export interface NewGameOptions {
  /** Root seed. Everything random in the run derives from this one number. */
  readonly seed: number;
  readonly party: readonly CharacterChoices[];
}

export class NewGameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewGameError';
  }
}

interface FactionDef {
  id: string;
  initialStanding: number;
}

/**
 * Where play begins.
 *
 * A module may drop the party straight into a dungeon or start them in a
 * region; the plan's "initial gameplay is the dungeon crawl" is a content
 * decision expressed by `start.startingDungeon`, not an engine assumption.
 */
function startingLocation(module: CompiledModule): Location {
  const { startingDungeon, startingArea, startingPoi } = module.source.start;

  // A point of interest is the most specific starting point, then an area, then
  // diving straight into a generated dungeon.
  if (startingPoi) {
    const poi = module.get<{ area: string }>('world.pointsOfInterest', startingPoi);
    return { kind: 'poi', area: poi.area, poi: startingPoi };
  }
  if (startingArea) return { kind: 'area', area: startingArea };
  if (startingDungeon) {
    // The room id is filled in by dungeon generation; until M2 lands, the
    // entrance is named but not yet built.
    return { kind: 'dungeon', dungeon: startingDungeon, room: '' };
  }

  throw new NewGameError(
    'module declares no start.startingPoi, start.startingArea, or start.startingDungeon, so there is nowhere to begin',
  );
}

export function newGame(module: CompiledModule, options: NewGameOptions): GameState {
  const expected = module.source.start.partySize;
  if (options.party.length === 0) {
    throw new NewGameError('a party needs at least one character');
  }
  if (options.party.length > expected) {
    throw new NewGameError(
      `module allows a party of ${expected}, got ${options.party.length}`,
    );
  }

  // Sub-streams so that, for example, rolling extra hit dice at creation cannot
  // shift the dungeon this seed would have generated.
  const root = Rng.fromSeed(options.seed);
  const creationRng = root.derive('creation');

  const entities: Record<string, Entity> = {};
  const party: string[] = [];
  let nextEntityId = 0;

  for (const choices of options.party) {
    nextEntityId += 1;
    const id = `e:${nextEntityId}`;
    entities[id] = createCharacter(module, id, choices, creationRng);
    party.push(id);
  }

  const reputation: Record<string, number> = {};
  for (const faction of module.all<FactionDef>('content.factions')) {
    reputation[faction.id] = faction.initialStanding;
  }

  return {
    saveVersion: SAVE_VERSION,
    module: {
      id: module.source.id,
      version: module.source.version,
      hash: module.hash,
    },
    seed: options.seed,
    // The root generator is stored unadvanced; sub-streams are derived by
    // label, so nothing consumed during setup perturbs the run.
    rng: root.save(),
    nextEntityId,
    minute: module.source.world.time.startMinute,
    party,
    entities,
    selected: party[0]!,
    location: startingLocation(module),
    // Maps are generated on arrival, not at creation — the party has not been
    // placed anywhere yet.
    maps: {},
    currentMap: '',
    combat: null,
    firedTriggers: {},
    memory: {},
    dialogue: null,
    flags: { ...module.source.start.initialFlags },
    lore: {},
    purse: module.source.start.creation.startingCurrency,
    reputation,
    quests: {},
    deeds: [],
    modState: {},
    outcome: 'playing',
  };
}

/**
 * Default choices for a character, used by quick-start and by tests.
 *
 * Picks the first ancestry and class the module offers and leaves attributes at
 * their declared defaults, so it works for any module including ones whose
 * content this engine has never seen.
 */
export function defaultChoices(module: CompiledModule, name: string): CharacterChoices {
  const ancestries = module.ids('content.ancestries');
  const classes = module.ids('content.classes');

  if (ancestries.length === 0) throw new NewGameError('module defines no ancestries');
  if (classes.length === 0) throw new NewGameError('module defines no classes');

  const attributes: Record<string, number> = {};
  for (const attr of module.all<{ id: string; default: number }>('rules.attributes')) {
    attributes[attr.id] = attr.default;
  }

  return {
    name,
    ancestry: ancestries[0]!,
    characterClass: classes[0]!,
    attributes,
  };
}
