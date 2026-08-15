import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom, readAssembledModule } from '@dm/module/load';
import { newGame, defaultChoices } from './newgame.js';
import { spawnMonster, spawnNpc, npcIdOf } from './character.js';
import { reduce, reduceAll } from './reduce.js';
import { statesEqual } from './save.js';
import { Transaction } from './rules/apply.js';
import { shouldFire, runTriggers } from './sim/triggers.js';
import type { TriggerDef } from './sim/triggers.js';
import { openGate, describeRequirement } from './sim/gates.js';
import {
  startQuest, abandonQuest, advanceQuests, grantXp, startAutoQuests, stageIndexOf, questsOffered,
} from './sim/quests.js';
import type { QuestDef } from './sim/quests.js';
import { questJournal, currentObjective } from './sim/questview.js';
import { arcsOf, endingReached } from './sim/arcs.js';
import { startDialogue, visibleOptions, chooseOption, canTalkTo } from './sim/dialogue.js';
import { recordDeed, witnessesOf, knowledgeOf } from './sim/deeds.js';
import { enterDungeon, enterArea, enterPoi, placeParty } from './sim/enter.js';
import { savingThrow } from './rules/check.js';
import { buildScope } from './stats.js';
import { TerrainIndex, createMap, MapBuilder } from './grid/tiles.js';
import type { GameState } from './state.js';
import type { Action } from './actions.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');
const ctx = { module: GREENMARCH };
const terrain = new TerrainIndex(GREENMARCH);

function fresh(module = GREENMARCH, seed = 11): GameState {
  const base = newGame(module, { seed, party: [defaultChoices(module, 'Ash')] });
  const floor = module.source.id === 'minimal' ? 'bare_floor' : 'floor';
  const hero = base.entities[base.party[0]!]!;
  return {
    ...base,
    currentMap: 'here',
    maps: {
      here: {
        id: 'here', tiles: createMap(13, 13, floor), kind: 'area', source: 'millford',
        explored: [], gates: {}, exits: {}, items: {}, marks: {},
      traps: {}, rooms: [], depth: 1,
      },
    },
    entities: { ...base.entities, [hero.id]: { ...hero, map: 'here', position: { x: 6, y: 6 } } },
  };
}

function transact(state: GameState, module = GREENMARCH): Transaction {
  return new Transaction(state, module);
}

// Greenmarch authors no interior POIs, so interior tests run on a fixture: the
// village given a small generated interior, and an outdoor `position` that
// lies outside the interior's bounds — which is the normal case, since
// `position` is in area coordinates.
function withInteriorVillage(): CompiledModule {
  const dir = fileURLToPath(new URL('../../../modules/greenmarch', import.meta.url));
  const doc = readAssembledModule(dir).doc as unknown as {
    world: { pointsOfInterest: { id: string; map?: unknown; position?: unknown }[] };
  };
  const village = doc.world.pointsOfInterest.find((p) => p.id === 'millford_village')!;
  village.map = { width: '7', height: '7' };
  village.position = { x: 24, y: 5 };
  const result = compileModule(doc);
  if (!result.ok) throw new Error('interior fixture failed to compile');
  return result.module;
}

describe('triggers', () => {
  const base: TriggerDef = {
    id: 't1', mode: 'once', on: 'enter', cooldownMinutes: 0,
    remember: true, chance: 1, effects: [],
  };

  it('fires once and never again', () => {
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;
    expect(shouldFire(txn, base, actor, Rng.fromSeed(1))).toBe(true);

    runTriggers(txn, [base], 'enter', { id: 'x', kind: 'area' }, actor, Rng.fromSeed(1));
    expect(shouldFire(txn, base, actor, Rng.fromSeed(1))).toBe(false);
  });

  it('fires on every entry when told to', () => {
    const trigger = { ...base, mode: 'everyEntry' as const };
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;

    runTriggers(txn, [trigger], 'enter', { id: 'x', kind: 'area' }, actor, Rng.fromSeed(1));
    expect(shouldFire(txn, trigger, actor, Rng.fromSeed(1))).toBe(true);
  });

  it('repeats until its completion condition holds', () => {
    const trigger = {
      ...base, mode: 'untilComplete' as const,
      completeWhen: { test: { ref: 'flags.done' } } as never,
    };
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;
    expect(shouldFire(txn, trigger, actor, Rng.fromSeed(1))).toBe(true);

    txn.set({ ...txn.state, flags: { ...txn.state.flags, done: true } });
    expect(shouldFire(txn, trigger, actor, Rng.fromSeed(1))).toBe(false);
  });

  it('loops on a cooldown', () => {
    const trigger = { ...base, mode: 'loop' as const, cooldownMinutes: 240 };
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;

    runTriggers(txn, [trigger], 'enter', { id: 'x', kind: 'area' }, actor, Rng.fromSeed(1));
    expect(shouldFire(txn, trigger, actor, Rng.fromSeed(1))).toBe(false);

    // Wait out the cooldown.
    txn.set({ ...txn.state, minute: txn.state.minute + 300 });
    expect(shouldFire(txn, trigger, actor, Rng.fromSeed(1))).toBe(true);
  });

  // `remember` off means the world keeps no record — ambience, not a set piece.
  it('does not record a trigger it is told not to remember', () => {
    const trigger = { ...base, id: 'ambience', mode: 'everyEntry' as const, remember: false };
    const txn = transact(fresh());
    runTriggers(txn, [trigger], 'enter', { id: 'x', kind: 'area' }, txn.entity('e:1')!, Rng.fromSeed(1));
    expect(txn.state.firedTriggers['ambience']).toBeUndefined();
  });

  it('respects a requirement gate', () => {
    const trigger = {
      ...base,
      requires: { minLevel: 5, classes: [], ancestries: [], abilities: [], attributes: [], skills: [], items: [], quests: [], factions: [], memories: [], flags: [], without: { classes: [], abilities: [], items: [], quests: [], flags: [], conditions: [] }, anyOf: [], description: '' } as never,
    };
    const txn = transact(fresh());
    expect(shouldFire(txn, trigger, txn.entity('e:1')!, Rng.fromSeed(1))).toBe(false);
  });

  it('only fires on the occasion it declares', () => {
    const txn = transact(fresh());
    runTriggers(txn, [base], 'rest', { id: 'x', kind: 'area' }, txn.entity('e:1')!, Rng.fromSeed(1));
    expect(txn.finish().events.some((e) => e.type === 'triggerFired')).toBe(false);
  });

  it('runs the real greenmarch triggers when entering the fens', () => {
    const state = fresh();
    const txn = transact(state);
    enterArea(txn, terrain, 'the_fens', Rng.fromSeed(3));
    const { state: next, events } = txn.finish();

    expect(events.some((e) => e.type === 'triggerFired' && e.trigger === 'fens_first_sight')).toBe(true);
    expect(next.flags['seen_fens']).toBe(true);
  });
});

describe('gates', () => {
  it('opens when the requirement is met', () => {
    const state = fresh();
    const hero = state.entities['e:1']!;
    const withKey: GameState = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, inventory: [{ item: 'brass_key', quantity: 1 }] } },
    };

    const txn = transact(withKey);
    const outcome = openGate(txn, 'mill_door', txn.entity('e:1')!, Rng.fromSeed(1));
    expect(outcome.opened).toBe(true);
    if (outcome.opened) expect(outcome.how).toBe('requirement');
    expect(txn.finish().state.flags['mill_open']).toBe(true);
  });

  // A door that says only "locked" is a dead end; one that names the key is a lead.
  it('says what is missing when it refuses', () => {
    const txn = transact(fresh());
    // Force a bypass failure by using a hopeless roll.
    const outcome = openGate(txn, 'mill_door', txn.entity('e:1')!, Rng.fromSeed(2), { force: false });

    expect(outcome.opened).toBe(false);
    if (outcome.opened) return;
    expect(outcome.missing.join(' ')).toMatch(/brass key/);

    const blocked = txn.finish().events.find((e) => e.type === 'gateBlocked');
    expect(blocked).toBeDefined();
  });

  it('can be forced with a skill check', () => {
    // Over many seeds, picking the lock must sometimes succeed.
    let opened = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const state = fresh();
      const hero = state.entities['e:1']!;
      const skilled: GameState = {
        ...state,
        entities: { ...state.entities, 'e:1': { ...hero, skills: { lockpicking: 8 } } },
      };
      const txn = transact(skilled);
      if (openGate(txn, 'mill_door', txn.entity('e:1')!, Rng.fromSeed(seed)).opened) opened += 1;
    }
    expect(opened).toBeGreaterThan(0);
  });

  it('opens for an ability that answers it', () => {
    const state = fresh();
    const hero = state.entities['e:1']!;
    const runeReader: GameState = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, abilities: [...hero.abilities, 'read_runes'] } },
    };

    const txn = transact(runeReader);
    const outcome = openGate(txn, 'barrow_ward', txn.entity('e:1')!, Rng.fromSeed(1));
    expect(outcome.opened).toBe(true);
  });

  // The exits panel and the affordance list have always decided "barred" by
  // reading this flag. Nothing wrote it, so a door the party had opened went on
  // reading as locked for the rest of the run.
  it('records that it stands open, so the way stops reading as barred', () => {
    const state = fresh();
    const hero = state.entities['e:1']!;
    const withKey: GameState = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, inventory: [{ item: 'brass_key', quantity: 1 }] } },
    };

    const txn = transact(withKey);
    openGate(txn, 'mill_door', txn.entity('e:1')!, Rng.fromSeed(1));
    expect(txn.finish().state.flags['gate:mill_door:open']).toBe(true);
  });

  // A standing door is not re-opened on the way back through: `onOpen` fires
  // once, so a gate that grants something cannot be farmed by walking in and
  // out of it.
  it('does not open twice', () => {
    const state = fresh();
    const hero = state.entities['e:1']!;
    const withKey: GameState = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, inventory: [{ item: 'brass_key', quantity: 1 }] } },
    };

    const first = transact(withKey);
    openGate(first, 'mill_door', first.entity('e:1')!, Rng.fromSeed(1));
    const opened = first.finish().state;

    const second = transact(opened);
    const outcome = openGate(second, 'mill_door', second.entity('e:1')!, Rng.fromSeed(1));
    expect(outcome.opened).toBe(true);
    expect(second.finish().events.filter((e) => e.type === 'gateOpened')).toHaveLength(0);
  });

  // `minTier` compiled to a comparison against a namespace nothing populated,
  // which resolved to null and then threw inside the comparison — from
  // `useAbility`, which does not catch. Greenmarch's `read_runes` carries one,
  // so any character who learned it took the whole reduction down on use.
  it('resolves a mastery-tier gate on an ability instead of throwing', () => {
    const state = fresh();
    const hero = state.entities['e:1']!;
    const learner = (lore: number): GameState => ({
      ...state,
      entities: {
        ...state.entities,
        'e:1': { ...hero, abilities: [...hero.abilities, 'read_runes'], skills: { ...hero.skills, lore } },
      },
    });

    // `adept` starts at rank 3, so rank 2 is short of it and rank 3 meets it.
    const short = reduce(learner(2), { type: 'useAbility', ability: 'read_runes' }, ctx);
    expect(short.state.flags['runes_read']).toBeUndefined();
    expect(short.events.some((e) => e.type === 'refused')).toBe(true);

    const adept = reduce(learner(3), { type: 'useAbility', ability: 'read_runes' }, ctx);
    expect(adept.state.flags['runes_read']).toBe(true);
  });

  it('describes a requirement in words', () => {
    const described = describeRequirement({
      description: '', minLevel: 3, items: [{ item: 'brass_key', quantity: 1, consume: false, equipped: false }],
      classes: [], ancestries: [], abilities: [], attributes: [], skills: [], quests: [], factions: [],
      creatureTypes: [], alignments: [], languages: [],
      memories: [], flags: [], anyOf: [],
      without: { classes: [], abilities: [], items: [], quests: [], flags: [], conditions: [] },
    });
    expect(described.join(' ')).toMatch(/brass key/);
    expect(described.join(' ')).toMatch(/level 3/);
  });
});

describe('quests', () => {
  it('starts a quest and records it', () => {
    const txn = transact(fresh());
    expect(startQuest(txn, 'the_mill_door', Rng.fromSeed(1))).toBe(true);
    const { state, events } = txn.finish();
    expect(state.quests['the_mill_door']!.status).toBe('active');
    expect(events.some((e) => e.type === 'questStarted')).toBe(true);
  });

  it('refuses a quest whose requirement is unmet', () => {
    const txn = transact(fresh());
    // the_barrow_ward needs level 2 and the mill quest complete.
    expect(startQuest(txn, 'the_barrow_ward', Rng.fromSeed(1))).toBe(false);
  });

  it('completes a kill objective when the right creature dies', () => {
    const state = fresh();
    const txn = transact(state);
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));

    // Stage 1 wants the mill reached; force past it to the kill stage.
    const questState = txn.state.quests['the_mill_door']!;
    txn.set({
      ...txn.state,
      quests: {
        ...txn.state.quests,
        the_mill_door: { ...questState, completedObjectives: ['open_door'] },
      },
      entities: {
        ...txn.state.entities,
        'm:0': { ...spawnMonster(GREENMARCH, 'm:0', 'bog_hound'), map: 'here', position: { x: 7, y: 6 } },
      },
    });

    advanceQuests(txn, [
      { type: 'died', entity: 'm:0', killer: 'e:1' },
      { type: 'died', entity: 'm:0', killer: 'e:1' },
    ], Rng.fromSeed(1));

    const done = txn.state.quests['the_mill_door']!.completedObjectives;
    expect(done).toContain('kill_hounds');
  });

  it('counts progress toward a multi-kill objective', () => {
    const state = fresh();
    const txn = transact(state);
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));
    const questState = txn.state.quests['the_mill_door']!;
    txn.set({
      ...txn.state,
      quests: { ...txn.state.quests, the_mill_door: { ...questState, completedObjectives: ['open_door'] } },
      entities: {
        ...txn.state.entities,
        'm:0': { ...spawnMonster(GREENMARCH, 'm:0', 'bog_hound'), map: 'here', position: { x: 7, y: 6 } },
      },
    });

    // One kill of two: not yet done, but progress recorded.
    advanceQuests(txn, [{ type: 'died', entity: 'm:0', killer: 'e:1' }], Rng.fromSeed(1));
    expect(txn.state.quests['the_mill_door']!.completedObjectives).not.toContain('kill_hounds');
    expect(txn.state.flags['quest:the_mill_door:kill_hounds:count']).toBe(1);
  });

  // Levelling used to be a number going up and nothing else.
  it('unlocks the class abilities the new level opens', () => {
    const txn = transact(fresh());
    // The warden declares `rally` at level 2 and could never reach it.
    expect(txn.entity('e:1')!.abilities).not.toContain('rally');

    grantXp(txn, 150, Rng.fromSeed(1));
    expect(txn.entity('e:1')!.level).toBe(2);
    expect(txn.entity('e:1')!.abilities).toContain('rally');
    // And keeps what it already had.
    expect(txn.entity('e:1')!.abilities).toContain('strike');
  });

  it('runs the module effects for every level crossed, not just the last', () => {
    const txn = transact(fresh());
    const before = txn.entity('e:1')!.inventory.find((s) => s.item === 'rope')?.quantity ?? 0;

    // Enough for level 3 in one award, so level 2's grant must not be skipped.
    grantXp(txn, 1000, Rng.fromSeed(1));
    const hero = txn.entity('e:1')!;
    expect(hero.level).toBeGreaterThanOrEqual(3);

    const after = hero.inventory.find((s) => s.item === 'rope')?.quantity ?? 0;
    expect(after).toBe(before + 2);          // level 2 granted two ropes
    expect(txn.state.flags['veteran']).toBe(true); // level 3 set the flag
  });

  it('adds proficiency to a save the class is trained in', () => {
    const state = fresh();
    const hero = state.entities['e:1']!;
    // Greenmarch trains the warden in `will` and nobody else.
    const warden: GameState = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, characterClass: 'warden', level: 1 } },
    };
    const stalker: GameState = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, characterClass: 'stalker', level: 1 } },
    };

    const rollFor = (from: GameState) =>
      savingThrow(GREENMARCH, Rng.fromSeed(4), from.entities['e:1']!, 'will', 12);

    expect(rollFor(warden).modifier - rollFor(stalker).modifier).toBe(2);
  });

  it('awards xp and levels the party up', () => {
    const txn = transact(fresh());
    grantXp(txn, 150, Rng.fromSeed(1));
    const hero = txn.entity('e:1')!;
    expect(hero.xp).toBe(150);
    // greenmarch: level 2 at 100 xp.
    expect(hero.level).toBe(2);
    expect(txn.finish().events.some((e) => e.type === 'leveledUp')).toBe(true);
  });

  it('unlocks the next quest in the chain on completion', () => {
    const state = fresh();
    const txn = transact(state);
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));

    // Satisfy every objective directly.
    const quest = GREENMARCH.get<{ stages: { objectives: { id: string }[] }[] }>('narrative.quests', 'the_mill_door');
    const allObjectives = quest.stages.flatMap((stage) => stage.objectives.map((o) => o.id));
    txn.set({
      ...txn.state,
      quests: {
        ...txn.state.quests,
        the_mill_door: {
          ...txn.state.quests['the_mill_door']!,
          completedObjectives: allObjectives.slice(0, -1),
        },
      },
    });

    advanceQuests(txn, [{ type: 'dialogueStarted', npc: 'e:9', dialogue: 'vess_talk' }], Rng.fromSeed(1));
    void allObjectives;
  });

  // The cursor is derived from the completed list rather than stored, so these
  // pin the derivation rather than a field.
  it('tracks which stage a quest is on', () => {
    const quest = GREENMARCH.get<QuestDef>('narrative.quests', 'the_mill_door');
    expect(stageIndexOf(quest, new Set())).toBe(0);
    expect(stageIndexOf(quest, new Set(['open_door']))).toBe(1);
    expect(stageIndexOf(quest, new Set(['open_door', 'kill_hounds']))).toBe(2);
    expect(stageIndexOf(quest, new Set(['open_door', 'kill_hounds', 'report'])))
      .toBe(quest.stages.length);
  });

  it('runs a stage\'s effects when it opens and when it closes', () => {
    const state = fresh();
    const txn = transact(state);
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));

    txn.set({
      ...txn.state,
      entities: {
        ...txn.state.entities,
        'm:0': { ...spawnMonster(GREENMARCH, 'm:0', 'bog_hound'), map: 'here', position: { x: 7, y: 6 } },
      },
    });

    // Finishing stage 1's only objective must move the cursor and say so.
    advanceQuests(txn, [{ type: 'triggerFired', trigger: 't', at: 'the_mill' }], Rng.fromSeed(1));

    expect(txn.state.quests['the_mill_door']!.completedObjectives).toContain('open_door');
    const advanced = txn.finish().events.filter(
      (event) => event.type === 'custom' && event.event === 'stageAdvanced',
    );
    expect(advanced).toHaveLength(1);
  });

  it('starts the quests a module says begin on their own', () => {
    const txn = transact(fresh());
    startAutoQuests(txn, Rng.fromSeed(1));
    expect(txn.state.quests['arrive_in_millford']!.status).toBe('active');
    // Twice must not restart it, or arriving anywhere would reset the job.
    startAutoQuests(txn, Rng.fromSeed(1));
    expect(txn.finish().events.filter((event) => event.type === 'questStarted')).toHaveLength(1);
  });

  it('drops an abandoned quest back to available and clears its progress', () => {
    const txn = transact(fresh());
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));
    txn.set({
      ...txn.state,
      flags: { ...txn.state.flags, 'quest:the_mill_door:kill_hounds:count': 1 },
    });

    expect(abandonQuest(txn, 'the_mill_door')).toBe(true);
    expect(txn.state.quests['the_mill_door']!.status).toBe('available');
    expect(txn.state.flags['quest:the_mill_door:kill_hounds:count']).toBeUndefined();
  });

  it('reads the journal from the module\'s own words', () => {
    const txn = transact(fresh());
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));
    const entry = questJournal(GREENMARCH, txn.state)
      .find((candidate) => candidate.quest === 'the_mill_door')!;

    expect(entry.description).toBe('Vess wants her mill back.');
    expect(entry.stageNumber).toBe(1);
    expect(entry.stageCount).toBe(3);
    expect(entry.stageName).toBe('Get inside');
    expect(entry.objectives.map((objective) => objective.description))
      .toContain('Get through the mill door.');

    // And the same source answers "what now".
    const next = currentObjective(GREENMARCH, txn.state)!;
    expect(next.objective.description).toBe('Get through the mill door.');
  });

  it('does not list objectives from stages the party has not reached', () => {
    const txn = transact(fresh());
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));
    const entry = questJournal(GREENMARCH, txn.state)
      .find((candidate) => candidate.quest === 'the_mill_door')!;
    expect(entry.objectives.map((objective) => objective.id)).toEqual(['open_door']);
  });
});

// Only the selected character used to move; the rest stood where they had been
// dropped until the player switched to each one and walked them individually.
describe('walking together', () => {
  /** A three-strong party spread along a corridor of floor. */
  function party(): GameState {
    const base = newGame(GREENMARCH, {
      seed: 3,
      party: ['Ash', 'Korrin', 'Mire'].map((name) => defaultChoices(GREENMARCH, name)),
    });
    const [first, second, third] = base.party as [string, string, string];
    return {
      ...base,
      currentMap: 'here',
      maps: {
        here: {
          id: 'here', tiles: createMap(15, 15, 'floor'), kind: 'area', source: 'millford',
          explored: [], gates: {}, exits: {}, items: {}, marks: {},
      traps: {}, rooms: [], depth: 1,
        },
      },
      selected: first,
      entities: {
        ...base.entities,
        [first]: { ...base.entities[first]!, map: 'here', position: { x: 7, y: 7 } },
        [second]: { ...base.entities[second]!, map: 'here', position: { x: 7, y: 8 } },
        [third]: { ...base.entities[third]!, map: 'here', position: { x: 7, y: 9 } },
      },
    };
  }

  const spread = (state: GameState): number => {
    const leader = state.entities[state.selected]!;
    return Math.max(...state.party
      .map((id) => state.entities[id]!)
      .map((member) => Math.max(
        Math.abs(member.position.x - leader.position.x),
        Math.abs(member.position.y - leader.position.y),
      )));
  };

  it('leaves the party where it stands until told to follow', () => {
    let state = party();
    for (let i = 0; i < 3; i += 1) {
      state = reduce(state, { type: 'step', direction: 'north' }, { module: GREENMARCH, terrain }).state;
    }
    // The leader has walked away from everyone else.
    expect(spread(state)).toBeGreaterThan(3);
  });

  it('brings the party along once it is', () => {
    let state = reduce(party(), { type: 'setFollow', follow: true }, { module: GREENMARCH, terrain }).state;
    for (let i = 0; i < 4; i += 1) {
      state = reduce(state, { type: 'step', direction: 'north' }, { module: GREENMARCH, terrain }).state;
    }
    expect(spread(state)).toBeLessThanOrEqual(2);
  });

  it('charges the clock once for the step, not once per follower', () => {
    const following = reduce(party(), { type: 'setFollow', follow: true }, { module: GREENMARCH, terrain }).state;
    const before = following.minute;
    const after = reduce(following, { type: 'step', direction: 'north' }, { module: GREENMARCH, terrain }).state;

    const perTile = GREENMARCH.source.world.time.minutesPerTile;
    expect(after.minute - before).toBe(perTile);
  });

  it('lets the party spread out again', () => {
    const on = reduce(party(), { type: 'setFollow', follow: true }, { module: GREENMARCH, terrain }).state;
    const off = reduce(on, { type: 'setFollow', follow: false }, { module: GREENMARCH, terrain }).state;
    for (const id of off.party) expect(off.entities[id]!.following).toBeNull();
  });

  // In a fight initiative decides who acts; auto-walking the others would spend
  // their turns before the player had a say.
  it('refuses to set a follow order in combat', () => {
    const state = party();
    const fighting: GameState = {
      ...state,
      combat: {
        round: 1, order: [state.selected], turn: 0,
        spent: {}, movement: 6, reactionsUsed: {}, cooldowns: [], usedOnce: [], specialUses: {},
      },
    };
    const result = reduce(fighting, { type: 'setFollow', follow: true }, { module: GREENMARCH, terrain });
    expect(result.events.some((event) => event.type === 'refused')).toBe(true);
    for (const id of result.state.party) expect(result.state.entities[id]!.following).toBeNull();
  });
});

// `victoryWhen` was declared, linted, and evaluated by nothing, so winning was
// unreachable however well the party played.
describe('ending the game', () => {
  it('wins when the module says the party has won', () => {
    const state = fresh();
    const won = reduce(
      { ...state, flags: { ...state.flags, barrow_finished: true } },
      { type: 'wait', minutes: 1 },
      { module: GREENMARCH, terrain },
    );
    expect(won.state.outcome).toBe('victory');
    expect(won.events.some((event) => event.type === 'gameOver')).toBe(true);
  });

  it('keeps playing while the condition is unmet', () => {
    const played = reduce(fresh(), { type: 'wait', minutes: 1 }, { module: GREENMARCH, terrain });
    expect(played.state.outcome).toBe('playing');
  });
});

describe('dialogue', () => {
  /**
   * The party standing beside Vess.
   *
   * Built the way the game builds her — an npc entity keyed by her own content
   * id. The fixture used to fake one by putting an *npc* id in `statblock`,
   * which is a field that means "the monster whose numbers this uses", and so
   * hid the fact that dialogue could not find a person who really had one.
   */
  function withVess(state = fresh()): GameState {
    const vess = spawnNpc(GREENMARCH, 'vess');
    return {
      ...state,
      entities: {
        ...state.entities,
        vess: { ...vess, map: 'here', position: { x: 7, y: 6 } },
      },
    };
  }

  it('starts a conversation and speaks a line', () => {
    const txn = transact(withVess());
    const started = startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(1));

    expect(started).toBe(true);
    const { state, events } = txn.finish();
    expect(state.dialogue?.node).toBe('opening');
    expect(events.find((e) => e.type === 'say')).toBeDefined();
  });

  it('hides options whose requirement fails and shows the rest', () => {
    const txn = transact(withVess());
    startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(1));
    const options = visibleOptions(txn, txn.entity('e:1')!, Rng.fromSeed(1));

    const ids = options.map((option) => option.id);
    expect(ids).toContain('ask_mill');
    // Offered because the quest is unstarted.
    expect(ids).toContain('take_job');
    // Hidden: the mill is not clear.
    expect(ids).not.toContain('done_it');
  });

  it('shows a locked option with its hint when content asks for it', () => {
    const txn = transact(withVess());
    startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(1));
    const shop = visibleOptions(txn, txn.entity('e:1')!, Rng.fromSeed(1)).find((o) => o.id === 'shop');

    expect(shop).toBeDefined();
    expect(shop!.locked).toBe(true);
    expect(shop!.hint).toMatch(/chest/);
  });

  it('follows an option and runs its effects', () => {
    const txn = transact(withVess());
    startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(1));
    chooseOption(txn, 'take_job', txn.entity('e:1')!, Rng.fromSeed(1));

    const { state } = txn.finish();
    expect(state.dialogue?.node).toBe('given_key');
    // The option grants the brass key.
    expect(txn.entity('e:1')!.inventory.some((s) => s.item === 'brass_key')).toBe(true);
  });

  it('refuses an option the party does not qualify for', () => {
    const txn = transact(withVess());
    startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(1));
    expect(chooseOption(txn, 'done_it', txn.entity('e:1')!, Rng.fromSeed(1))).toBe(false);
  });

  // The point of the memory model: she reacts to what she has heard.
  it('redirects to the cold node once Vess has heard of a theft', () => {
    const state = withVess();
    const cold: GameState = { ...state, flags: { ...state.flags, vess_cold: true } };
    const txn = transact(cold);
    startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(1));

    // Asserted on the event rather than on lingering state: `cold` offers no
    // reply, and a node with nothing to say back closes the conversation.
    const { state: after, events } = txn.finish();
    expect(events.find((event) => event.type === 'dialogueNode')).toMatchObject({ node: 'cold' });
    expect(after.dialogue).toBeNull();
  });

  // Every option in greenmarch led to another node, and no verb ended a
  // conversation, so talking to Vess was a room with no door.
  it('lets the party stop talking', () => {
    const txn = transact(withVess());
    startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(1));
    expect(txn.state.dialogue).not.toBeNull();

    const after = reduce(txn.finish().state, { type: 'leave' }, { module: GREENMARCH, terrain });
    expect(after.state.dialogue).toBeNull();
  });

  it('ends the conversation at a node with nothing left to say', () => {
    const txn = transact(withVess());
    startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(1));
    // `farewell` has no `goto`; the opening node's other options all loop.
    chooseOption(txn, 'farewell', txn.entity('e:1')!, Rng.fromSeed(1));
    expect(txn.state.dialogue).toBeNull();
  });

  it('resolves an opposed persuasion check to one of two nodes', () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const state = withVess();
      const txn = transact(state);
      startQuest(txn, 'the_mill_door', Rng.fromSeed(seed));
      startDialogue(txn, txn.entity('e:1')!, txn.entity('vess')!, Rng.fromSeed(seed));
      chooseOption(txn, 'haggle', txn.entity('e:1')!, Rng.fromSeed(seed));
      const node = txn.state.dialogue?.node;
      if (node) outcomes.add(node);
    }
    expect(outcomes.has('haggle_won') || outcomes.has('haggle_lost')).toBe(true);
  });
});

describe('deeds and witnesses', () => {
  function withOnlooker(state = fresh()): GameState {
    const hound = spawnMonster(GREENMARCH, 'w:1', 'bog_hound');
    return {
      ...state,
      entities: { ...state.entities, 'w:1': { ...hound, map: 'here', position: { x: 8, y: 6 } } },
    };
  }

  it('records a deed and who saw it', () => {
    const txn = transact(withOnlooker());
    const deed = recordDeed(txn, terrain, 'theft', txn.entity('e:1')!, null, Rng.fromSeed(1));

    expect(deed).not.toBeNull();
    expect(deed!.witnesses).toContain('w:1');
    expect(txn.finish().state.deeds).toHaveLength(1);
  });

  // The setting that makes stealth and massacre mechanically distinct.
  it('has no witnesses when nobody living can see', () => {
    const state = fresh();
    const txn = transact(state);
    const deed = recordDeed(txn, terrain, 'theft', txn.entity('e:1')!, null, Rng.fromSeed(1));
    expect(deed!.witnesses).toHaveLength(0);
  });

  it('does not count a witness behind a wall', () => {
    const base = withOnlooker();
    const builder = new MapBuilder(13, 13, 'floor');
    for (let y = 0; y < 13; y += 1) builder.set(7, y, 'wall');
    const walled: GameState = {
      ...base,
      maps: { here: { ...base.maps['here']!, tiles: builder.freeze() } },
    };

    const txn = transact(walled);
    expect(witnessesOf(txn, terrain, txn.entity('e:1')!)).toHaveLength(0);
  });

  it('moves reputation only when the deed is seen', () => {
    const seen = transact(withOnlooker());
    recordDeed(seen, terrain, 'theft', seen.entity('e:1')!, null, Rng.fromSeed(1));
    expect(seen.state.reputation['wardens']).toBeLessThan(0);

    const unseen = transact(fresh());
    recordDeed(unseen, terrain, 'theft', unseen.entity('e:1')!, null, Rng.fromSeed(1));
    expect(unseen.state.reputation['wardens']).toBe(0);
  });

  it('writes what a witness knows into their memory', () => {
    const txn = transact(withOnlooker());
    recordDeed(txn, terrain, 'theft', txn.entity('e:1')!, null, Rng.fromSeed(1));
    const known = knowledgeOf(txn, 'w:1', 'theft');
    expect(known?.strength).toBe(1);
    expect(known?.hops).toBe(0);
  });
});

describe('entering places', () => {
  it('generates a dungeon on first entry and reuses it after', () => {
    const txn = transact(fresh());
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(4));

    const first = txn.state.maps['dungeon:barrow_depths'];
    expect(first).toBeDefined();
    expect(txn.state.currentMap).toBe('dungeon:barrow_depths');

    // Leaving and returning must find the same dungeon.
    const snapshot = JSON.stringify(first!.tiles);
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(4));
    expect(JSON.stringify(txn.state.maps['dungeon:barrow_depths']!.tiles)).toBe(snapshot);
  });

  it('spawns the dungeon population', () => {
    const txn = transact(fresh());
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(4));
    const monsters = Object.values(txn.state.entities).filter((e) => e.kind === 'monster');
    expect(monsters.length).toBeGreaterThan(0);
    for (const monster of monsters) expect(monster.map).toBe('dungeon:barrow_depths');
  });

  it('places the whole party without stacking them', () => {
    const module = GREENMARCH;
    const base = newGame(module, {
      seed: 1,
      party: ['Ash', 'Vess', 'Korrin'].map((name) => defaultChoices(module, name)),
    });
    const state: GameState = {
      ...base,
      currentMap: 'here',
      maps: {
        here: { id: 'here', tiles: createMap(9, 9, 'floor'), kind: 'area', source: 'x', explored: [], gates: {}, exits: {}, items: {}, marks: {}, traps: {}, rooms: [], depth: 1 },
      },
    };

    const txn = transact(state);
    placeParty(txn, terrain, 'here', { x: 4, y: 4 });

    const positions = base.party.map((id) => {
      const member = txn.entity(id)!;
      return `${member.position.x},${member.position.y}`;
    });
    expect(new Set(positions).size).toBe(positions.length);
  });

  // `residents` was declared by the content and instantiated by nothing, so the
  // quest-giver named in the module was not on the map to be talked to.
  it('puts a place\'s residents on the map when the party arrives', () => {
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;
    enterPoi(txn, terrain, 'millford_village', actor, Rng.fromSeed(5), true);

    const vess = txn.entity('vess');
    expect(vess).toBeDefined();
    expect(vess!.kind).toBe('npc');
    expect(vess!.map).toBe(txn.state.currentMap);
    // Neutral, never `ally` — an ally is a party member for targeting.
    expect(vess!.disposition).toBe('neutral');
    expect(npcIdOf(vess!)).toBe('vess');
  });

  it('does not spawn a second copy of a resident on a return visit', () => {
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;
    enterPoi(txn, terrain, 'millford_village', actor, Rng.fromSeed(5), true);
    const first = txn.entity('vess')!.position;

    // Wander off and come back.
    txn.putEntity({ ...txn.entity('vess')!, position: { x: 2, y: 2 } });
    enterPoi(txn, terrain, 'millford_village', actor, Rng.fromSeed(5), true);

    const npcs = Object.values(txn.state.entities).filter((e) => e.kind === 'npc');
    expect(npcs).toHaveLength(1);
    // And she is left where she walked to, not dragged home.
    expect(txn.entity('vess')!.position).toEqual({ x: 2, y: 2 });
    void first;
  });

  it('stands the party in the place they entered', () => {
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;
    enterPoi(txn, terrain, 'millford_village', actor, Rng.fromSeed(5), true);

    // millford_village sits at (6,6); arriving must put the party there rather
    // than leaving them wherever they were on the area map.
    const leader = txn.entity(txn.state.selected)!;
    expect(Math.max(Math.abs(leader.position.x - 6), Math.abs(leader.position.y - 6)))
      .toBeLessThanOrEqual(2);
  });

  // A place with no interior map produced no events at all, so entering it was
  // indistinguishable from the command doing nothing — and a "reach the mill"
  // objective could never complete, because there was no `enteredMap` to see.
  it('says so when the party arrives somewhere with no interior', () => {
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;
    enterPoi(txn, terrain, 'the_mill', actor, Rng.fromSeed(5), true);

    const arrived = txn.finish().events.find(
      (event) => event.type === 'custom' && event.event === 'entered',
    );
    expect(arrived).toBeDefined();
    expect((arrived as { data: Record<string, unknown> }).data['place']).toBe('the_mill');
  });

  it('walks the party into an interior, and back in on a return visit', () => {
    const module = withInteriorVillage();
    const inside = new TerrainIndex(module);
    const txn = transact(fresh(module), module);
    const actor = txn.entity('e:1')!;

    enterPoi(txn, inside, 'millford_village', actor, Rng.fromSeed(5), true);
    expect(txn.state.currentMap).toBe('poi:millford_village');
    expect(txn.entity(txn.state.selected)!.map).toBe('poi:millford_village');

    // Step back outside, then enter again: the return visit used to leave the
    // party standing on the area map at the POI's outdoor coordinates.
    placeParty(txn, inside, 'here', { x: 6, y: 6 });
    enterPoi(txn, inside, 'millford_village', actor, Rng.fromSeed(5), true);
    expect(txn.state.currentMap).toBe('poi:millford_village');
    expect(txn.entity(txn.state.selected)!.map).toBe('poi:millford_village');
  });

  it('spawns residents inside the interior, not at the outdoor position', () => {
    const module = withInteriorVillage();
    const inside = new TerrainIndex(module);
    const txn = transact(fresh(module), module);
    const actor = txn.entity('e:1')!;

    enterPoi(txn, inside, 'millford_village', actor, Rng.fromSeed(5), true);

    // The outdoor position (24,5) does not exist on the 7×7 interior; anchoring
    // there used to leave residents standing outside the map entirely.
    const vess = txn.entity('vess')!;
    const tiles = txn.state.maps['poi:millford_village']!.tiles;
    expect(vess.map).toBe('poi:millford_village');
    expect(vess.position.x).toBeGreaterThanOrEqual(0);
    expect(vess.position.y).toBeGreaterThanOrEqual(0);
    expect(vess.position.x).toBeLessThan(tiles.width);
    expect(vess.position.y).toBeLessThan(tiles.height);
  });

  it('completes a reach objective on arriving at such a place', () => {
    const txn = transact(fresh());
    startQuest(txn, 'the_mill_door', Rng.fromSeed(1));

    advanceQuests(
      txn,
      [{ type: 'custom', event: 'entered', data: { place: 'the_mill', kind: 'poi' } }],
      Rng.fromSeed(1),
    );
    expect(txn.state.quests['the_mill_door']!.completedObjectives).toContain('open_door');
  });

  // Leaving a place used to re-enter its area, which re-placed the party at the
  // area's arrival point — from the player's chair, being thrown across the map
  // for saying "leave".
  it('does not move the party when they step back out onto ground they are already on', () => {
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;
    enterArea(txn, terrain, 'millford', Rng.fromSeed(5));
    enterPoi(txn, terrain, 'millford_village', actor, Rng.fromSeed(5), true);

    const before = txn.finish().state;
    const walked: GameState = {
      ...before,
      entities: {
        ...before.entities,
        [before.selected]: { ...before.entities[before.selected]!, position: { x: 20, y: 14 } },
      },
    };

    const after = reduce(walked, { type: 'leave' }, { module: GREENMARCH, terrain });
    expect(after.state.entities[after.state.selected]!.position).toEqual({ x: 20, y: 14 });
    expect(after.state.location).toMatchObject({ kind: 'area', area: 'millford' });
  });

  it('finds a resident\'s dialogue, and lets the party talk to them', () => {
    const txn = transact(fresh());
    const actor = txn.entity('e:1')!;
    enterPoi(txn, terrain, 'millford_village', actor, Rng.fromSeed(5), true);

    const leader = txn.entity(txn.state.selected)!;
    txn.putEntity({ ...txn.entity('vess')!, position: { x: leader.position.x + 1, y: leader.position.y } });

    expect(canTalkTo(leader, 'vess', txn)).toBe(true);
    expect(startDialogue(txn, leader, txn.entity('vess')!, Rng.fromSeed(1))).toBe(true);
    expect(txn.state.dialogue).not.toBeNull();
  });
});

// The end-to-end proof the plan calls for.
describe('the greenmarch story flow', () => {
  it('runs from the village to the mill through the quest', () => {
    let state = fresh(GREENMARCH, 2024);
    const log: string[] = [];

    const act = (action: Action) => {
      const result = reduce(state, action, ctx);
      state = result.state;
      for (const event of result.events) {
        if (event.type === 'questStarted') log.push(`quest: ${event.quest}`);
        if (event.type === 'objectiveCompleted') log.push(`objective: ${event.objective}`);
        if (event.type === 'gateOpened') log.push(`opened: ${event.gate}`);
        if (event.type === 'gateBlocked') log.push(`blocked: ${event.gate}`);
        if (event.type === 'triggerFired') log.push(`trigger: ${event.trigger}`);
      }
      return result;
    };

    // Take the quest.
    act({ type: 'acceptQuest', quest: 'the_mill_door' });
    expect(state.quests['the_mill_door']?.status).toBe('active');

    // The mill door refuses us without the key.
    act({ type: 'enter', target: 'the_mill' });
    expect(log.some((line) => line.startsWith('blocked:') || line.startsWith('opened:'))).toBe(true);

    // With the key in hand it opens.
    const hero = state.entities['e:1']!;
    state = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, inventory: [...hero.inventory, { item: 'brass_key', quantity: 1 }] } },
    };
    act({ type: 'enter', target: 'the_mill' });
    expect(log).toContain('opened: mill_door');
    expect(state.flags['mill_open']).toBe(true);
  });

  it('is deterministic across the whole flow', () => {
    const script: Action[] = [
      { type: 'acceptQuest', quest: 'the_mill_door' },
      { type: 'enter', target: 'the_mill' },
      { type: 'travelToArea', area: 'the_fens' },
      { type: 'search' },
      { type: 'rest', kind: 'breather' },
    ];
    const a = reduceAll(fresh(GREENMARCH, 88), script, ctx);
    const b = reduceAll(fresh(GREENMARCH, 88), script, ctx);
    expect(statesEqual(a.state, b.state)).toBe(true);
  });

  it('rests and restores resources', () => {
    let state = fresh();
    const hero = state.entities['e:1']!;
    state = {
      ...state,
      entities: { ...state.entities, 'e:1': { ...hero, resources: { ...hero.resources, hp: 1, focus: 0 } } },
    };

    const { state: rested } = reduce(state, { type: 'rest', kind: 'camp' }, ctx);
    expect(rested.entities['e:1']!.resources['hp']).toBeGreaterThan(1);
    expect(rested.minute).toBeGreaterThan(state.minute);
  });

  it('refuses to rest during a fight', () => {
    const state = fresh();
    const withHound: GameState = {
      ...state,
      entities: {
        ...state.entities,
        'm:0': { ...spawnMonster(GREENMARCH, 'm:0', 'bog_hound'), map: 'here', position: { x: 7, y: 6 } },
      },
    };
    const started = reduce(withHound, { type: 'wait', minutes: 0 }, ctx).state;
    const { events } = reduce(started, { type: 'rest', kind: 'camp' }, ctx);
    expect(events.find((e) => e.type === 'refused')).toMatchObject({ reason: 'not while fighting' });
  });
});

describe('minimal still runs everything', () => {
  it('enters its dungeon and starts a fight', () => {
    const context = { module: MINIMAL };
    const txn = new Transaction(fresh(MINIMAL, 3), MINIMAL);
    enterDungeon(txn, new TerrainIndex(MINIMAL), 'first_descent', Rng.fromSeed(3));

    const state = txn.finish().state;
    expect(state.currentMap).toBe('dungeon:first_descent');
    expect(Object.values(state.entities).some((e) => e.kind === 'monster')).toBe(true);

    const { state: next } = reduce(state, { type: 'wait', minutes: 0 }, context);
    // Either a fight started or the husks are out of sight; both are valid.
    expect(next.outcome).toBe('playing');
  });
});

describe('searching', () => {
  it('says so when there is nothing left to find', () => {
    const txn = transact(fresh());
    enterArea(txn, terrain, 'millford', Rng.fromSeed(3));

    // Millford hides nothing, so the search comes back empty rather than silent.
    const { events } = reduce(txn.state, { type: 'search' }, { module: GREENMARCH });
    expect(events.find((e) => e.type === 'refused')).toMatchObject({
      action: 'search',
      reason: 'you find nothing here',
    });
  });
});

describe('leaving a place', () => {
  it('steps back out of a point of interest into its area', () => {
    const txn = transact(fresh());
    enterPoi(txn, terrain, 'millford_village', txn.entity('e:1')!, Rng.fromSeed(3), true);
    expect(txn.state.location.kind).toBe('poi');

    const { state: next } = reduce(txn.state, { type: 'leave' }, { module: GREENMARCH });
    expect(next.location.kind).toBe('area');
    expect(next.currentMap).toBe('area:millford');
  });

  it('steps out of an interior onto the doorstep, not across the map', () => {
    const module = withInteriorVillage();
    const inside = new TerrainIndex(module);
    const txn = transact(fresh(module), module);
    enterPoi(txn, inside, 'millford_village', txn.entity('e:1')!, Rng.fromSeed(3), true);
    expect(txn.state.currentMap).toBe('poi:millford_village');

    const { state: next } = reduce(txn.state, { type: 'leave' }, { module });
    expect(next.currentMap).toBe('area:millford');
    // The village's outdoor position (24,5), not the area entry point (15,10).
    const leader = next.entities[next.selected]!;
    expect(Math.max(Math.abs(leader.position.x - 24), Math.abs(leader.position.y - 5)))
      .toBeLessThanOrEqual(2);
  });

  it('will not let you walk out of a dungeon except at the way in', () => {
    const txn = transact(fresh());
    enterDungeon(txn, terrain, 'barrow_depths', Rng.fromSeed(4));

    // Move the leader clear of the exit tile (on or beside it counts as at
    // the way out): from anywhere else the dungeon still has to be crossed.
    const hero = txn.entity(txn.state.selected)!;
    const inside = txn.state.maps[txn.state.currentMap]!;
    let off: { x: number; y: number } | undefined;
    for (let y = 1; y < inside.tiles.height - 1 && !off; y += 1) {
      for (let x = 1; x < inside.tiles.width - 1; x += 1) {
        if (Math.max(Math.abs(x - hero.position.x), Math.abs(y - hero.position.y)) <= 1) continue;
        if (!terrain.isPassable(inside.tiles, { x, y })) continue;
        off = { x, y };
        break;
      }
    }
    txn.putEntity({ ...hero, position: off! });

    const { state: next, events } = reduce(txn.state, { type: 'leave' }, { module: GREENMARCH });
    expect(events.find((e) => e.type === 'refused')).toMatchObject({
      action: 'leave',
      reason: 'find the way out first',
    });
    expect(next.currentMap).toBe('dungeon:barrow_depths');
  });

  it('says so when there is nowhere to go back to', () => {
    const txn = transact(fresh());
    enterArea(txn, terrain, 'millford', Rng.fromSeed(3));

    const { events } = reduce(txn.state, { type: 'leave' }, { module: GREENMARCH });
    expect(events.find((e) => e.type === 'refused')).toMatchObject({
      reason: 'there is nowhere to go back to',
    });
  });
});

describe('story arcs', () => {
  // `narrative.arcs` was never queried at all — a whole collection the schema
  // accepted, the linter cleared, the docs described, and nothing read.
  it('derives an arc\'s standing from its quests, storing nothing', () => {
    const base = fresh();
    const [arc] = arcsOf(GREENMARCH, base);
    expect(arc).toBeDefined();
    expect(arc!.status).toBe('unstarted');
    expect(arc!.total).toBe(2);

    const half: GameState = {
      ...base,
      quests: {
        the_mill_door: {
          quest: 'the_mill_door', status: 'complete', completedObjectives: [], startedAt: 0,
        },
      },
    };
    expect(arcsOf(GREENMARCH, half)[0]!).toMatchObject({ status: 'active', done: 1 });
  });

  it('counts a failed quest as a failed arc, however much else is finished', () => {
    const state: GameState = {
      ...fresh(),
      quests: {
        the_mill_door: {
          quest: 'the_mill_door', status: 'complete', completedObjectives: [], startedAt: 0,
        },
        the_barrow_ward: {
          quest: 'the_barrow_ward', status: 'failed', completedObjectives: [], startedAt: 0,
        },
      },
    };
    expect(arcsOf(GREENMARCH, state)[0]!.status).toBe('failed');
  });

  // `isEnding` promised the game would end and did nothing whatsoever.
  it('ends the run when an ending arc is finished', () => {
    const done: GameState = {
      ...fresh(),
      quests: {
        the_mill_door: {
          quest: 'the_mill_door', status: 'complete', completedObjectives: [], startedAt: 0,
        },
        the_barrow_ward: {
          quest: 'the_barrow_ward', status: 'complete', completedObjectives: [], startedAt: 0,
        },
      },
    };
    expect(endingReached(GREENMARCH, done)?.id).toBe('the_greenmarch');

    const { state } = reduce(done, { type: 'wait', minutes: 1 }, ctx);
    expect(state.outcome).toBe('victory');
  });

  it('puts every declared arc in scope, so a typo is loud', () => {
    const scope = buildScope(GREENMARCH, fresh(), fresh().entities['e:1']!);
    const arcs = scope['arcs'] as Record<string, { status: string }>;
    expect(arcs['the_greenmarch']!.status).toBe('unstarted');
  });
});

describe('who hands out work', () => {
  // `offersQuests` was read only by the linter and `giver` by nothing at all,
  // so a module that said who gives what still needed a dialogue tree.
  it('offers what an NPC declares, when the party could take it', () => {
    const txn = transact(fresh());
    const offered = questsOffered(txn, 'vess', Rng.fromSeed(1)).map((quest) => quest.id);
    expect(offered).toContain('the_mill_door');
  });

  it('stops offering a job already taken', () => {
    const state: GameState = {
      ...fresh(),
      quests: {
        the_mill_door: {
          quest: 'the_mill_door', status: 'active', completedObjectives: [], startedAt: 0,
        },
      },
    };
    const offered = questsOffered(transact(state), 'vess', Rng.fromSeed(1)).map((q) => q.id);
    expect(offered).not.toContain('the_mill_door');
  });

  it('says so out loud when the party talks to them', () => {
    const base = fresh();
    const vess = spawnNpc(GREENMARCH, 'vess');
    const state: GameState = {
      ...base,
      entities: {
        ...base.entities,
        vess: { ...vess, map: 'here', position: { x: 7, y: 6 } },
      },
    };

    const { events } = reduce(state, { type: 'talk', npc: 'vess' }, ctx);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'custom', event: 'questOffered' }),
    );
  });
});
