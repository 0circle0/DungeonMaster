/**
 * Drive one side chain through the real engine and say what happened.
 *
 *     npx tsx packages/tools/src/bin/playchain.ts eelweir
 *     npx tsx packages/tools/src/bin/playchain.ts eelweir --transcript
 *
 * The property tests assert the invariants somebody thought to write down.
 * Playing asserts the ones they did not, and on this project that is where
 * every interesting defect has come from: a dungeon with three entrances, a
 * silent `search`, two of three Deeproads entrances unreachable. So a chain is
 * not finished when it validates — it is finished when a party has walked it.
 *
 * This is deliberately not a vitest file. It teleports the party, grants quest
 * items and kills bosses outright rather than fighting them fairly, because
 * what is under test is the *chain* — does the giver offer it, do the
 * objectives fire, does the reward land, does the standing move — and not the
 * combat maths, which has its own tests. Wiring is what breaks silently.
 */
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { loadModuleFrom } from '@dm/module/load';
import type { CompiledModule } from '@dm/module';
import {
  Transaction, applyOps, buildScope, skillRankOf, startQuest, advanceQuests,
  enterArea, enterPoi, enterDungeon, TerrainIndex, spawnMonster, openGate,
  equipItem, unequipItem,
} from '@dm/engine';
import type { GameState, Entity, GameEvent } from '@dm/engine';
import { startSession } from '@dm/play';
import type { Session } from '@dm/play';

interface QuestLike {
  id: string;
  name: string;
  giver?: string;
  autoStart?: boolean;
  tags?: string[];
  requires?: { without?: { quests?: { quest: string }[] } };
  unlocks?: string[];
  stages?: { id: string; objectives: ObjectiveLike[] }[];
  objectives?: ObjectiveLike[];
  rewards?: { items?: { item: string }[] };
}

interface ObjectiveLike {
  id: string;
  kind?: string;
  target?: string;
  count?: number;
  optional?: boolean;
  description?: string;
}

const argv = process.argv.slice(2);
const CHAIN = argv.find((a) => !a.startsWith('-')) ?? '';
const SHOW_TRANSCRIPT = argv.includes('--transcript');
const SEED = Number(argv.find((a) => a.startsWith('--seed='))?.slice(7) ?? 11);
/** Which way to go at a fork. Run a branching chain once per alternative. */
const BRANCH = Number(argv.find((a) => a.startsWith('--branch='))?.slice(9) ?? 0);
/**
 * A trial is post-game content, so the party it needs is a different party.
 *
 * Everything behind `aurendel_finished` is unreachable to the ordinary setup
 * below — not because the wiring is wrong but because the run is supposed to be
 * over. Recognised by the key rather than by a flag, because `trialkit.tier`
 * writes the tier key as the second tag and there is nothing else to confuse it
 * with.
 */
const TRIAL = CHAIN.startsWith('trial_');

if (!CHAIN) {
  console.error('usage: playchain <chain-key> [--transcript] [--seed=N]');
  process.exit(2);
}

const module_: CompiledModule = loadModuleFrom(
  fileURLToPath(new URL('../../../../modules/aurendel', import.meta.url)),
);

const problems: string[] = [];
const notes: string[] = [];
function fail(what: string) { problems.push(what); }
function note(what: string) { notes.push(what); }

const quests = module_.source.narrative.quests as unknown as QuestLike[];
// `spine` walks the questline itself — every quest that is not side content —
// which is the regression that matters most: side chains are allowed to be
// skipped, and the story is not allowed to be unfinishable.
// `spine` means the questline, not "everything that is not a side chain".
// Hidden threads are neither: nobody offers them, they start from a trigger on
// a doorway, and `playlore.ts` is what walks them. Sweeping them in here made
// the spine run fail on three quests it has no way to begin.
//
// Trials are the same mistake one level further out, and made again: they are
// gated on the ending the spine run is trying to *reach*, so a spine walk that
// includes them reports nine quests that would not start and twelve rewards
// that never landed, all of which is the content behaving exactly as designed.
const chainQuests = CHAIN === 'spine'
  ? quests.filter((q) => {
      const tags = q.tags ?? [];
      return !tags.includes('side') && !tags.includes('hidden') && !tags.includes('trial');
    })
  : quests.filter((q) => (q.tags ?? []).includes(CHAIN));
if (chainQuests.length === 0) {
  console.error(`no quests tagged ${CHAIN}. Chains: ${
    [...new Set(quests.flatMap((q) => q.tags ?? []).filter((t) =>
      !['side', 'act1', 'act2', 'act3', 'branch', 'ending'].includes(t)))].join(', ')}`);
  process.exit(2);
}

/**
 * The level the tier itself asks for, taken from the content rather than
 * restated here, so retuning a tier retunes its driver with it.
 */
const trialLevel = Math.max(
  14,
  ...chainQuests.map((q) => (q.requires as { minLevel?: number } | undefined)?.minLevel ?? 0),
);

// --- a party good enough to be the subject of the experiment ---------------
// Level 6 with the ward-keys in the pack clears every act gate, so one driver
// works for a chain in any act. What is being tested is the chain's own wiring.
const session: Session = startSession(module_, SEED);

/**
 * Everything the fake actions have emitted and the quest watcher has not seen.
 *
 * This is the whole trick, and getting it wrong is what made the first run of
 * this driver report nine failures against a chain that was fine: `reduce.ts`
 * hands `advanceQuests` the events the turn produced, so a transaction whose
 * events are dropped on the floor advances nothing. Objectives observe the
 * event stream; there is no polling to fall back on.
 */
let pending: GameEvent[] = [];

function edit(state: GameState, fn: (txn: Transaction) => void): GameState {
  const txn = new Transaction(state, module_);
  fn(txn);
  const { state: next, events } = txn.finish();
  pending = pending.concat(events);
  return next;
}

session.state = edit(session.state, (txn) => {
  for (const id of txn.state.party) {
    const member = txn.entity(id);
    if (member) txn.putEntity({ ...member, level: 6, xp: 1500 });
  }
  applyOps(txn, [
    { op: 'setFlag', flag: 'act_two_open', value: true },
    { op: 'adjustCurrency', amount: 500 },
  ], txn.state.selected);
  // The act gates, satisfied outright: Act I wants the barrow dealt with, Act
  // II the undercroft, Act III any two ward-keys. Skipped when walking the
  // spine itself, which has to start from nothing or it proves nothing.
  if (CHAIN !== 'spine') {
    for (const id of ['the_open_door', 'word_to_aurenhal', 'the_undercroft']) {
      txn.set({
        ...txn.state,
        quests: { ...txn.state.quests, [id]: { quest: id, status: 'complete', completedObjectives: [], startedAt: 0 } },
      });
    }
  }
  for (const item of ['grown_key', 'cast_key', 'the_wardlist']) {
    applyOps(txn, [{ op: 'grantItem', target: txn.state.selected, item, quantity: 1 }], txn.state.selected);
  }

  // A party that has finished the game: the ending flag every trial is gated
  // on, the level the tier's own head asks for, and the warrants the tiers
  // below pay out. The relic the door wants is *not* granted here — proving
  // that the door refuses an empty-handed party is the point of the check
  // below, so it is handed over there and only after the refusal.
  if (TRIAL) {
    for (const id of txn.state.party) {
      const member = txn.entity(id);
      if (member) txn.putEntity({ ...member, level: trialLevel, xp: 20000 });
    }
    applyOps(txn, [{ op: 'setFlag', flag: 'aurendel_finished', value: true }], txn.state.selected);
    for (const item of ['first_warrant', 'second_warrant']) {
      applyOps(txn, [{ op: 'grantItem', target: txn.state.selected, item, quantity: 1 }], txn.state.selected);
    }
  }
});

const terrain = new TerrainIndex(module_);

/** Stand the party somewhere, whatever kind of place it is. */
function goTo(target: string): boolean {
  const poi = module_.find<{ id: string; area: string; dungeon?: string }>('world.pointsOfInterest', target);
  const area = module_.find<{ id: string }>('world.areas', target);
  const dungeon = module_.find<{ id: string }>('world.dungeons', target);
  const gate = module_.find<{ id: string }>('world.gates', target);

  // A `reach` may name a gate, and is satisfied by `gateOpened`. The driver
  // cannot pay a toll or pass a lore check at difficulty 18, so it walks to
  // whatever fronts the gate and reports it open.
  if (gate && !poi && !area && !dungeon) {
    const fronting = module_.all<{ id: string; gate?: string }>('world.pointsOfInterest')
      .find((entry) => entry.gate === target);
    if (fronting) goTo(fronting.id);
    session.state = edit(session.state, (txn) => {
      txn.emit({ type: 'gateOpened', gate: target, how: 'requirement' });
    });
    return true;
  }

  let moved = false;
  session.state = edit(session.state, (txn) => {
    const rng = Rng.fromSeed(SEED).derive(`goto:${target}`);
    if (poi) {
      enterArea(txn, terrain, poi.area, rng);
      const actor = txn.entity(txn.state.selected);
      if (actor) enterPoi(txn, terrain, poi.id, actor, rng, true);
      moved = true;
    } else if (area) {
      enterArea(txn, terrain, area.id, rng);
      moved = true;
    } else if (dungeon) {
      enterDungeon(txn, terrain, dungeon.id, rng);
      moved = true;
    }
  });
  return moved;
}

/** Put the named creature in front of the party and kill it, recording the event. */
function slay(statblock: string): boolean {
  const monster = module_.find<{ id: string }>('content.monsters', statblock);
  if (!monster) return false;

  session.state = edit(session.state, (txn) => {
    const leader = txn.entity(txn.state.selected);
    if (!leader) return;
    const spawned: Entity = {
      ...spawnMonster(module_, `x:${statblock}`, statblock),
      map: leader.map,
      position: leader.position,
    };
    txn.putEntity(spawned);
    txn.putEntity({ ...spawned, alive: false, resources: { ...spawned.resources, hp: 0 } });
    txn.emit({ type: 'died', entity: spawned.id, killer: leader.id });
  });
  return true;
}

function questState(id: string) {
  return session.state.quests[id];
}

function leader(): Entity {
  return session.state.entities[session.state.selected]!;
}

function has(item: string): number {
  return leader().inventory.find((s) => s.item === item)?.quantity ?? 0;
}

/** Push whatever the fake actions emitted through the quest watcher. */
function pump() {
  // Drained before the edit, because `edit` appends to the same list and an
  // event fed to the watcher twice counts twice against a counted objective.
  const batch = pending;
  pending = [];
  session.state = edit(session.state, (txn) => {
    advanceQuests(txn, batch, Rng.fromSeed(SEED).derive('pump'));
  });
}

// --- 1. is the head offered at all? ---------------------------------------
const unlockedWithin = new Set(chainQuests.flatMap((q) =>
  (q.unlocks ?? []).filter((u) => chainQuests.some((c) => c.id === u))));
const head = chainQuests.find((q) => !unlockedWithin.has(q.id));

if (!head) {
  fail('no head: every quest in the chain is unlocked by another one');
} else if (head.autoStart) {
  // The questline's own head starts itself and needs no giver at all.
  note(`head ${head.id} starts itself`);
} else {
  const giver = head.giver;
  const npc = giver ? module_.find<{ id: string; home?: string; offersQuests?: string[] }>('content.npcs', giver) : undefined;
  if (!npc) fail(`the head ${head.id} names giver ${giver}, who is not an NPC`);
  else {
    if (!npc.home) fail(`${giver} has no home, so nothing places them anywhere`);
    if (!(npc.offersQuests ?? []).includes(head.id)) {
      fail(`${giver} does not list ${head.id} in offersQuests`);
    }
    if (npc.home && !goTo(npc.home)) fail(`${giver}'s home ${npc.home} is not a place`);
    else note(`giver ${giver} is at ${npc.home}`);
  }
}

// --- 1b. the door that wants the relic worn -------------------------------
//
// Only trials have one, and it is the claim worth checking: a tier tuned for
// fabled gear should refuse a party that has not brought any, say so in words,
// and open once they have put it on. Driven through `openGate` rather than by
// setting the flag the objective waits on, because setting the flag proves the
// objective is wired and proves nothing whatever about the door.
if (TRIAL) {
  const door = module_.all<{ id: string; tags?: string[]; requires?: unknown }>('world.gates')
    .find((g) => (g.tags ?? []).includes('trial') && JSON.stringify(g).includes(CHAIN));

  if (!door) {
    fail(`${CHAIN}: no door tagged trial mentions this tier`);
  } else {
    const worn = JSON.stringify(door.requires ?? {}).match(/"item":"([a-z_]+)"/g) ?? [];
    const relic = worn.map((m) => m.slice(8, -1)).find((id) =>
      module_.find<{ id: string; slot?: string }>('content.items', id)?.slot);

    const tryOpen = () => {
      let opened = false;
      session.state = edit(session.state, (txn) => {
        const actor = txn.entity(txn.state.selected);
        if (!actor) return;
        opened = openGate(txn, door.id, actor,
                          Rng.fromSeed(SEED).derive(`door:${door.id}`)).opened;
      });
      return opened;
    };

    if (tryOpen()) fail(`${door.id}: opened for a party wearing nothing it asked for`);
    else note(`${door.id}: refuses an empty-handed party`);

    if (!relic) {
      fail(`${door.id}: asks for no equippable item, so there is nothing to come dressed in`);
    } else {
      session.state = edit(session.state, (txn) => {
        applyOps(txn, [{ op: 'grantItem', target: txn.state.selected, item: relic, quantity: 1 }], txn.state.selected);
        const actor = txn.entity(txn.state.selected);
        if (actor) equipItem(txn, actor, relic);
      });
      if (tryOpen()) note(`${door.id}: opens once ${relic} is worn`);
      else fail(`${door.id}: refuses a party wearing ${relic}, which is what it asked for`);

      // And take it off again. The relic was only ever worn to prove the door
      // checks for it, and leaving it on makes the reward check downstream
      // measure a *swap* rather than a gain — a reward ring reads as +1 resolve
      // when it grants +3 because the one it displaced granted +2.
      session.state = edit(session.state, (txn) => {
        const actor = txn.entity(txn.state.selected);
        if (actor) unequipItem(txn, actor, relic);
      });
    }
  }
}

// --- 2. walk every quest, in order ----------------------------------------
// Declaration order, which both `sidekit.chain` and the act files already emit
// in play order. Following `unlocks` from the head instead looks tidier and
// silently drops every branch — Act I forks, Act II has three parallel routes,
// and a walk that takes the first unlock only would report two thirds of the
// questline as unvisited.
const order: QuestLike[] = chainQuests;

for (const quest of order) {
  session.state = edit(session.state, (txn) => {
    startQuest(txn, quest.id, Rng.fromSeed(SEED).derive(`start:${quest.id}`));
  });
  if (questState(quest.id)?.status !== 'active') {
    // A quest locked out by one already taken is the branch working, not a
    // break: Act I's commission and errand exclude each other with `without`,
    // and exactly one of them is meant to be refused on every run.
    const excluded = (quest.requires?.without?.quests ?? [])
      .map((clause) => clause.quest)
      .filter((id) => ['active', 'complete'].includes(questState(id)?.status ?? ''));
    if (excluded.length > 0) note(`${quest.id}: locked out by ${excluded.join(', ')}, as intended`);
    else fail(`${quest.id}: would not start — its requires did not hold`);
    continue;
  }

  const objectives: ObjectiveLike[] = [
    ...(quest.objectives ?? []),
    ...(quest.stages ?? []).flatMap((s) => s.objectives),
  ];

  /**
   * One pass at every unfinished objective.
   *
   * Repeated until a pass changes nothing, because `ordered` is the default and
   * an objective that is not yet active ignores the event that would satisfy
   * it — so "walk to the cellar, then go and tell him" needs the telling
   * attempted again *after* the seeing has landed. One pass reported the
   * content as broken when it was the driver that was.
   */
  const attempt = (objective: ObjectiveLike) => {
    switch (objective.kind) {
      case 'reach':
        if (!goTo(objective.target!)) fail(`${quest.id}/${objective.id}: cannot reach ${objective.target}`);
        break;
      case 'kill':
        for (let i = 0; i < (objective.count ?? 1); i += 1) {
          if (!slay(objective.target!)) fail(`${quest.id}/${objective.id}: no such monster ${objective.target}`);
        }
        break;
      case 'talk':
        // `matchesEvent` accepts the npc's id directly as well as an entity's
        // statblock, so the conversation need not be held to prove the
        // objective is wired to the right person.
        session.state = edit(session.state, (txn) => {
          txn.emit({ type: 'dialogueStarted', npc: objective.target!, dialogue: `${objective.target!}_talk` });
        });
        break;
      case 'collect':
        session.state = edit(session.state, (txn) => {
          applyOps(txn, [{ op: 'grantItem', target: txn.state.selected, item: objective.target!, quantity: objective.count ?? 1 }], txn.state.selected);
        });
        break;
      default:
        // A `custom` objective waits on a flag somebody sets in conversation.
        // The driver cannot hold a conversation, so it sets the flag it is
        // waiting on and reports that it had to.
        break;
    }
    pump();
  };

  const outstanding = () => {
    const done = new Set(questState(quest.id)?.completedObjectives ?? []);
    return objectives.filter((o) => !o.optional && !done.has(o.id));
  };

  for (let pass = 0; pass < objectives.length + 1; pass += 1) {
    const before = outstanding().length;
    if (before === 0) break;
    for (const objective of outstanding()) attempt(objective);
    if (outstanding().length === before) break;
  }

  // Whatever survives that is flag-driven: somebody sets it in conversation and
  // the driver cannot hold one. Set each and say so, because a chain that needs
  // a great many of these is a chain that plays as a cutscene.
  for (const objective of outstanding()) {
    const flags = reachableFlags(objective);
    if (flags.length === 0) {
      fail(`${quest.id}/${objective.id}: incomplete and waits on no flag — nothing in play can finish it`);
      continue;
    }
    session.state = edit(session.state, (txn) => {
      applyOps(txn, flags.map((flag) => ({ op: 'setFlag' as const, flag, value: true })), txn.state.selected);
    });
    note(`${quest.id}/${objective.id}: satisfied by setting ${flags.join(', ')}`);
    pump();
    // And another round of events, since satisfying a flag can activate the
    // ordered objective that comes after it.
    for (const next of outstanding()) attempt(next);
  }

  if (questState(quest.id)?.status !== 'complete') {
    const left = objectives.filter((o) => !o.optional
      && !new Set(questState(quest.id)?.completedObjectives ?? []).has(o.id));
    fail(`${quest.id}: did not complete — still waiting on ${left.map((o) => o.id).join(', ') || 'nothing, which is worse'}`);
  } else {
    note(`${quest.id}: complete`);
  }
}

/** Every flag named anywhere under a node. */
function flagsUnder(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) { for (const item of node) flagsUnder(item, out); return out; }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'ref' && typeof value === 'string' && value.startsWith('flags.')) {
        out.push(value.slice('flags.'.length));
      }
      flagsUnder(value, out);
    }
  }
  return out;
}

/**
 * The flags one player could actually have set to finish this objective.
 *
 * `resolved_either_way` builds `{any: [...]}` over mutually exclusive outcomes —
 * you seal the chapel *or* you put it in the Crown's ledger, and the dialogue
 * options that set them are `onceOnly` on two different people. Satisfying an
 * `any` by setting every branch at once completes the quest but tests a state
 * no run can reach, and quietly runs both halves of the `either` in
 * `onComplete`. So one branch is chosen, and `--branch=N` walks the others.
 */
function reachableFlags(objective: ObjectiveLike & { when?: unknown }): string[] {
  const when = objective.when as { any?: unknown[] } | undefined;
  if (when && Array.isArray(when.any) && when.any.length > 0) {
    const pick = when.any[BRANCH % when.any.length];
    return flagsUnder(pick);
  }
  return flagsUnder(objective);
}

// --- 3. did it pay? --------------------------------------------------------
const rewardItems = order.flatMap((q) => (q.rewards?.items ?? []).map((r) => r.item));
for (const item of rewardItems) {
  if (has(item) < 1) fail(`reward ${item} never reached the party`);
  else note(`reward ${item} is in the pack`);
}

// The whole point of the engine change: a chain's gear must actually do
// something, and `skillBonuses` is invisible until something is worn.
for (const item of rewardItems) {
  const definition = module_.find<{ id: string; slot?: string; skillBonuses?: Record<string, number> }>('content.items', item);
  if (!definition?.skillBonuses) continue;
  const slot = definition.slot;
  if (!slot) { fail(`${item} grants skills but has no slot, so it can never be worn`); continue; }

  const before = Object.keys(definition.skillBonuses).map((skill) => skillRankOf(module_, leader(), skill));
  session.state = edit(session.state, (txn) => {
    const member = txn.entity(txn.state.selected);
    if (member) txn.putEntity({ ...member, equipped: { ...member.equipped, [slot]: [item] } });
  });
  const after = Object.keys(definition.skillBonuses).map((skill) => skillRankOf(module_, leader(), skill));

  const moved = after.map((value, i) => value - before[i]!);
  const expected = Object.values(definition.skillBonuses);
  if (JSON.stringify(moved) !== JSON.stringify(expected)) {
    fail(`${item} worn in ${slot}: skills moved ${moved.join('/')} , expected ${expected.join('/')}`);
  } else {
    note(`${item} worn in ${slot}: ${Object.entries(definition.skillBonuses).map(([s, n]) => `${s} +${n}`).join(', ')}`);
  }
}

// --- 4. did anybody's opinion change? -------------------------------------
const fresh = startSession(module_, SEED);
const factionsMoved = Object.entries(session.state.reputation)
  .filter(([id, value]) => value !== (fresh.state.reputation[id] ?? 0))
  .map(([id, value]) => `${id} ${value > (fresh.state.reputation[id] ?? 0) ? '+' : ''}${value - (fresh.state.reputation[id] ?? 0)}`);

if (factionsMoved.length === 0) fail('no faction standing moved anywhere in the chain');
else note(`standing moved: ${factionsMoved.join(', ')}`);

// --- 5. the spine is still winnable ---------------------------------------
const ending = (module_.source.narrative.arcs as unknown as { id: string; isEnding?: boolean; quests: string[] }[])
  .find((a) => a.isEnding);
if (ending && CHAIN !== 'spine') {
  const contaminated = ending.quests.filter((q) => chainQuests.some((c) => c.id === q));
  if (contaminated.length > 0) fail(`the ending arc contains ${contaminated.join(', ')} from this chain`);
}
// Walking the spine is only worth anything if it ends the game.
if (ending && CHAIN === 'spine') {
  const unfinished = ending.quests.filter((q) => session.state.quests[q]?.status !== 'complete');
  if (unfinished.length > 0) fail(`the ending arc is unfinished: ${unfinished.join(', ')}`);
  else note(`the ending arc is complete: ${ending.quests.join(', ')}`);
}

// --- report ----------------------------------------------------------------
if (SHOW_TRANSCRIPT) {
  for (const line of session.transcript) console.log(line.text);
  console.log('—'.repeat(60));
}

const scope = buildScope(module_, session.state, leader());
void scope;

console.log(`\n${CHAIN}: ${order.length} quests, seed ${SEED}`);
for (const item of notes) console.log(`  · ${item}`);
if (problems.length > 0) {
  console.log(`\n✗ ${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ${problem}`);
  process.exit(1);
}
console.log('\n✓ walked start to finish');
