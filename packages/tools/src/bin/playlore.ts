/**
 * Drive one hidden thread through the real engine, three ways, and say what
 * happened.
 *
 *     npx tsx packages/tools/src/bin/playlore.ts frost_blue
 *     npx tsx packages/tools/src/bin/playlore.ts frost_blue --route=hostile
 *     npx tsx packages/tools/src/bin/playlore.ts --all --quiet
 *
 * A side chain is finished when a party has walked it (`playchain.ts` says so
 * and it was right). A hidden thread has more ways to be silently broken than a
 * chain does, because none of it is announced: a clue nobody can be asked for
 * reads exactly like a clue nobody has asked for yet, and an anchor whose
 * discovery difficulty never comes down is a place that simply does not exist
 * for the player who did everything right.
 *
 * Three routes, and the thread has to survive all three:
 *
 *   friendly — full standing, asks for everything, never draws a weapon
 *   hostile  — standing driven below every floor, so nobody will talk; takes
 *              what it needs off the bodies
 *   blind    — learns no clues at all, and searches until the anchor turns up
 *
 * The point of the third is the claim that a clue *informs* the search rather
 * than gating it. If `blind` cannot reach the relic, that claim is false and
 * the content is a lock wearing a rumour's clothes.
 *
 * Like `playchain`, this teleports and fakes kills on purpose. What is under
 * test is the wiring — is the clue askable, does the door state its price, does
 * the corpse drop what the living would have handed over — and not the combat
 * maths, which has its own tests.
 */
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { loadModuleFrom } from '@dm/module/load';
import type { CompiledModule } from '@dm/module';
import {
  Transaction, TerrainIndex, npcIdOf,
  enterArea, enterPoi, openGate, describeRequirement, startDialogue,
  visibleOptions, chooseOption, loreByThread, threadScope, reduce, narrate,
} from '@dm/engine';
import type { GameState, Entity } from '@dm/engine';
import { startSession } from '@dm/play';

type Route = 'friendly' | 'hostile' | 'blind';

interface ThreadDef { id: string; name: string; entries: string[] }
interface PoiDef {
  id: string; name: string; area: string; hidden?: boolean;
  gate?: string; dungeon?: string;
  discover?: { skill: string; difficulty: unknown };
}
interface NpcDef {
  id: string; name: string; home?: string; faction?: string;
  dialogue?: string; statblock?: string;
}
interface ItemDef { id: string; name: string; extra?: { heldBy?: string } }
interface GateDef { id: string; name: string; requires?: unknown }

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const QUIET = argv.includes('--quiet');
const SHOW = argv.includes('--transcript');
const SEED = Number(argv.find((a) => a.startsWith('--seed='))?.slice(7) ?? 11);
const ROUTES: Route[] = (() => {
  const named = argv.find((a) => a.startsWith('--route='))?.slice(8) as Route | undefined;
  return named ? [named] : ['friendly', 'hostile', 'blind'];
})();
const WANTED = argv.find((a) => !a.startsWith('-')) ?? '';

if (!WANTED && !ALL) {
  console.error('usage: playlore <thread-key> [--route=friendly|hostile|blind] [--all] [--transcript]');
  process.exit(2);
}

const module_: CompiledModule = loadModuleFrom(
  fileURLToPath(new URL('../../../../modules/aurendel', import.meta.url)),
);
const terrain = new TerrainIndex(module_);

const problems: string[] = [];
const notes: string[] = [];
const fail = (line: string) => problems.push(line);
const note = (line: string) => { notes.push(line); if (!QUIET) console.log(`  ${line}`); };

// --- the world, as this thread sees it --------------------------------------

const threads = module_.all<ThreadDef>('narrative.loreThreads');
const pois = module_.all<PoiDef>('world.pointsOfInterest');
const npcs = module_.all<NpcDef>('content.npcs');
const items = module_.all<ItemDef>('content.items');

/** Places whose discovery difficulty mentions this thread. */
function anchorsOf(threadId: string): PoiDef[] {
  return pois.filter((poi) =>
    JSON.stringify(poi.discover?.difficulty ?? null).includes(`threads.${threadId}.known`));
}

/** Everyone whose dialogue can teach one of this thread's clues. */
function tellersOf(entries: readonly string[]): { npc: NpcDef; clues: string[] }[] {
  const out: { npc: NpcDef; clues: string[] }[] = [];
  for (const npc of npcs) {
    if (!npc.dialogue) continue;
    const text = JSON.stringify(module_.find('narrative.dialogues', npc.dialogue) ?? {});
    const clues = entries.filter((entry) => text.includes(`"${entry}"`));
    if (clues.length > 0) out.push({ npc, clues });
  }
  return out;
}

/** Key items a gate on this thread's anchors demands. */
function keysOf(anchors: readonly PoiDef[]): ItemDef[] {
  const wanted = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor.gate) continue;
    const gate = module_.find<GateDef>('world.gates', anchor.gate);
    for (const need of JSON.stringify(gate?.requires ?? {}).matchAll(/"item":"([a-z0-9_]+)"/g)) {
      wanted.add(need[1]!);
    }
  }
  return items.filter((item) => wanted.has(item.id));
}

// --- a party, placed and armed ----------------------------------------------

function session(seed: number) {
  return startSession(module_, seed);
}

function put(state: GameState, areaId: string): GameState {
  const txn = new Transaction(state, module_);
  enterArea(txn, terrain, areaId, Rng.fromSeed(SEED));
  return txn.finish().state;
}

function leader(state: GameState): Entity {
  return state.entities[state.party[0]!]!;
}

function withStanding(state: GameState, factions: readonly string[], value: number): GameState {
  const reputation = { ...state.reputation };
  for (const faction of factions) reputation[faction] = value;
  return { ...state, reputation };
}

function withItem(state: GameState, item: string): GameState {
  const hero = leader(state);
  return {
    ...state,
    entities: {
      ...state.entities,
      [hero.id]: { ...hero, inventory: [...hero.inventory, { item, quantity: 1 }] },
    },
  };
}

// --- what each route does ---------------------------------------------------

/**
 * Ask everyone who has anything, and take the answer the dice give.
 *
 * Retried, because the whole design is that a roll is a price rather than a
 * gate: a friendly party that fails a persuasion is expected to try again, and
 * a run where one bad roll ends a thread would be the bug.
 */
function askAround(
  start: GameState,
  tellers: readonly { npc: NpcDef; clues: string[] }[],
  attempts: number,
): GameState {
  let state = start;

  for (let round = 0; round < attempts; round += 1) {
    for (const { npc } of tellers) {
      const home = npc.home ? module_.find<PoiDef>('world.pointsOfInterest', npc.home) : undefined;
      if (!home) continue;

      state = put(state, home.area);
      let txn = new Transaction(state, module_);
      enterPoi(txn, terrain, home.id, leader(txn.state), Rng.fromSeed(SEED + round), true);
      state = txn.finish().state;

      // The NPC has to actually be standing there — `residentsOf` spawns from
      // `npc.home`, and a teller nobody can walk up to is a teller who tells
      // nobody anything.
      const body = Object.values(state.entities).find((e) => e.alive && npcIdOf(e) === npc.id);
      if (!body) continue;

      txn = new Transaction(state, module_);
      const rng = Rng.fromSeed(SEED * 31 + round);
      if (!startDialogue(txn, leader(txn.state), body, rng)) { state = txn.finish().state; continue; }

      for (let hop = 0; hop < 12; hop += 1) {
        const open = visibleOptions(txn, leader(txn.state), rng).filter((o) => !o.locked);
        const next = open.find((o) => !o.id.endsWith('_leave') && !o.id.endsWith('_go')
          && !o.id.endsWith('_on') && !o.id.endsWith('_drop') && !o.id.endsWith('_thanks')
          && !o.id.endsWith('_leave') && !o.id.endsWith('_kept'));
        const step = next ?? open.find((o) => o.id.endsWith('_on') || o.id.endsWith('_thanks')
          || o.id.endsWith('_drop') || o.id.endsWith('_leave'));
        if (!step) break;
        if (!chooseOption(txn, step.id, leader(txn.state), rng)) break;
        if (!txn.state.dialogue) break;
      }
      state = txn.finish().state;
    }
  }
  return state;
}

/**
 * Kill whoever is holding something, and see what falls out of them.
 *
 * Skips anyone who has already handed theirs over. That is not politeness — a
 * corpse dropping a second copy of a gift already made is precisely the bug the
 * `given:` flag on the loot entry exists to prevent, so a driver that killed
 * regardless would report the fix working as a failure.
 */
function takeByForce(start: GameState, holders: readonly { npc: NpcDef; item: string }[]): GameState {
  let state = start;

  for (const { npc: holder, item } of holders) {
    if (state.flags[`given:${item}`] === true) continue;
    if (leader(state).inventory.some((stack) => stack.item === item)) continue;
    const home = holder.home ? module_.find<PoiDef>('world.pointsOfInterest', holder.home) : undefined;
    if (!home) continue;

    state = put(state, home.area);
    let txn = new Transaction(state, module_);
    enterPoi(txn, terrain, home.id, leader(txn.state), Rng.fromSeed(SEED), true);
    state = txn.finish().state;

    const body = Object.values(state.entities).find((e) => e.alive && npcIdOf(e) === holder.id);
    if (!body) { fail(`${holder.id}: nobody to kill — no entity spawned at ${holder.home}`); continue; }

    // Down to one hit point in a bare transaction, then killed by a *real*
    // attack through `reduce`. That distinction is the whole reason this
    // function exists: `dropDeathLoot` runs in the reducer's second
    // transaction, so a corpse made inside a transaction of our own drops
    // nothing at all and the route would look broken when it is not.
    txn = new Transaction(state, module_);
    txn.putEntity({ ...body, resources: { ...body.resources, hp: 1 } });
    state = txn.finish().state;

    // Standing next to them, so the swing is in range.
    const hero = leader(state);
    state = {
      ...state,
      entities: {
        ...state.entities,
        [hero.id]: { ...hero, map: body.map, position: { x: body.position.x + 1, y: body.position.y } },
      },
    };

    for (let swing = 0; swing < 12; swing += 1) {
      const result = reduce(state, { type: 'attack', target: body.id }, { module: module_, terrain });
      state = result.state;
      if (!state.entities[body.id]?.alive) break;
      // A miss costs nothing here; put them back on one and swing again, since
      // what is under test is the drop and not the dice.
      const still = state.entities[body.id]!;
      const patch = new Transaction(state, module_);
      patch.putEntity({ ...still, resources: { ...still.resources, hp: 1 } });
      state = patch.finish().state;
    }

    if (state.entities[body.id]?.alive) {
      fail(`${holder.id}: still standing after twelve swings`);
      continue;
    }

    // Loot lands on the floor where they fell; the party picks it up.
    const map = state.maps[state.currentMap];
    let taken = 0;
    for (const stacks of Object.values(map?.items ?? {})) {
      for (const stack of stacks) { state = withItem(state, stack.item); taken += 1; }
    }
    if (taken === 0) fail(`${holder.id}: died holding ${item} and left nothing on the floor`);
  }
  return state;
}

/** Search until the anchor turns up, or give up and say how long it took. */
function searchFor(start: GameState, anchor: PoiDef, tries: number): { state: GameState; found: number } {
  let state = put(start, anchor.area);
  for (let i = 1; i <= tries; i += 1) {
    const result = reduce(state, { type: 'search' }, { module: module_, terrain });
    state = result.state;
    if (state.flags[`found:${anchor.id}`] === true) return { state, found: i };
  }
  return { state, found: 0 };
}

// --- one thread, one route ---------------------------------------------------

function run(thread: ThreadDef, route: Route): void {
  if (!QUIET) console.log(`\n── ${thread.name}  [${route}] ──────────────────────────`);

  const anchors = anchorsOf(thread.id);
  const tellers = tellersOf(thread.entries);
  const keys = keysOf(anchors);
  // Key items come in two shapes. Most are held by somebody; a few are a relic
  // this layer already pays out for finishing another thread, which is how an
  // over-tuned place stacks a second gate on the first. Both must be reachable;
  // only the first is reachable by violence.
  const rewarded = new Set(
    module_.all<{ rewards?: { items?: { item: string }[] } }>('narrative.quests')
      .flatMap((quest) => (quest.rewards?.items ?? []).map((entry) => entry.item)),
  );
  const holders = keys
    .flatMap((key) => {
      const npc = npcs.find((n) => n.id === key.extra?.heldBy);
      return npc ? [{ npc, item: key.id }] : [];
    });
  const factions = [...new Set(tellers.map((t) => t.npc.faction).filter((f): f is string => Boolean(f)))];

  if (anchors.length === 0) fail(`${thread.id}: no point of interest is findable by this thread`);
  if (tellers.length < 2) fail(`${thread.id}: only ${tellers.length} teller(s) — a thread needs two`);
  const areas = new Set(tellers.map((t) => module_.find<PoiDef>('world.pointsOfInterest', t.npc.home ?? '')?.area));
  if (areas.size < 2) fail(`${thread.id}: every teller is in one area (${[...areas].join(', ')})`);

  let state = session(SEED).state;

  if (route === 'hostile') {
    state = withStanding(state, factions, -60);
  } else if (route === 'friendly') {
    state = withStanding(state, factions, 40);
  }

  // — clues —
  if (route !== 'blind') {
    state = askAround(state, tellers, route === 'hostile' ? 1 : 3);
  }
  const known = threadScope(module_, state)[thread.id] as { known: number; total: number };
  note(`clues: ${known.known}/${known.total}`);

  if (route === 'friendly' && known.known < 2) {
    fail(`${thread.id}/friendly: only learned ${known.known} of ${known.total} clues from talking`);
  }
  if (route === 'blind' && known.known !== 0) {
    fail(`${thread.id}/blind: learned ${known.known} clue(s) without asking anybody`);
  }

  // — finding the place —
  for (const anchor of anchors) {
    if (!anchor.hidden) { fail(`${anchor.id}: not hidden, so there is nothing to find`); continue; }
    const { state: after, found } = searchFor(state, anchor, 60);
    state = after;
    if (found === 0) {
      fail(`${thread.id}/${route}: ${anchor.id} not found in 60 searches`);
    } else {
      note(`found ${anchor.id} on search ${found}`);
    }
  }

  // — the key item, both routes —
  if (keys.length === 0) fail(`${thread.id}: no anchor is gated, so finding it is the whole of it`);
  for (const key of keys) {
    if (!key.extra?.heldBy) {
      if (!rewarded.has(key.id)) fail(`${key.id}: nobody holds it and no quest pays it out`);
      continue;
    }
    const holder = npcs.find((n) => n.id === key.extra!.heldBy);
    if (!holder) { fail(`${key.id}: holder ${key.extra.heldBy} is not an NPC`); continue; }
    if (!holder.statblock) fail(`${key.id}: ${holder.id} has no statblock, so killing them drops nothing`);
  }

  const hasKey = (s: GameState, id: string) =>
    leader(s).inventory.some((stack) => stack.item === id);

  if (route === 'hostile' || (route === 'blind' && keys.length > 0)) {
    state = takeByForce(state, holders);
  }
  for (const key of keys) {
    if (!hasKey(state, key.id) && key.extra?.heldBy && route === 'friendly') {
      // Asking is a roll, and a run of bad ones is not a broken thread — but
      // the item must still be reachable, so fall back and say which way it
      // came in the end.
      state = takeByForce(state, holders);
      if (hasKey(state, key.id)) note(`${key.id}: asking failed the dice; taken instead`);
    }
    if (hasKey(state, key.id)) { note(`holding ${key.id}`); continue; }

    if (rewarded.has(key.id)) {
      // Paid out by another thread of this layer, which this driver runs
      // separately. Grant it and say so, rather than pretending a run that
      // finished one thread has finished two.
      state = withItem(state, key.id);
      note(`${key.id}: earned by another thread — granted, run that one too`);
      continue;
    }
    fail(`${thread.id}/${route}: never obtained ${key.id} by any route`);
  }

  // — the door, before and after —
  for (const anchor of anchors) {
    if (!anchor.gate) continue;
    const gate = module_.find<GateDef>('world.gates', anchor.gate);
    if (!gate) { fail(`${anchor.id}: gate ${anchor.gate} does not exist`); continue; }

    const missing = describeRequirement(gate.requires as never);
    if (missing.length === 0) fail(`${gate.id}: refuses without saying what it wants`);

    const bare = new Transaction(session(SEED).state, module_);
    const shut = openGate(bare, gate.id, leader(bare.state), Rng.fromSeed(SEED), { force: false });
    if (shut.opened) fail(`${gate.id}: opens for a party carrying nothing`);

    const armed = new Transaction(state, module_);
    const open = openGate(armed, gate.id, leader(armed.state), Rng.fromSeed(SEED), { force: false });
    if (!open.opened) {
      fail(`${gate.id}: still shut with every key in hand`);
    } else {
      note(`${gate.id} opens (${open.how})`);
      state = armed.finish().state;
    }
  }

  // — the quest nobody gave you —
  //
  // Through `reduce`, not through a transaction of our own, and that is the
  // whole point of doing it here: `emit: {event: "startQuest"}` is turned into
  // an actual quest by `processEmissions`, which runs in the reducer. A driver
  // that called `enterPoi` directly would watch the event go by and conclude
  // the trigger was dead.
  for (const anchor of anchors) {
    state = put(state, anchor.area);
    const arrived = reduce(state, { type: 'enter', target: anchor.id }, { module: module_, terrain });
    state = arrived.state;

    const started = arrived.events.filter((e) => e.type === 'questStarted').map((e) => e.quest);
    const refused = arrived.events.filter((e) => e.type === 'refused');
    if (started.length > 0) note(`arriving started: ${started.join(', ')}`);
    else if (refused.length > 0) note(`arriving refused (${refused.length}) — expected while a gate is shut`);

    if (SHOW) {
      for (const line of narrate({ module: module_, state, seed: SEED }, arrived.events)) {
        console.log(`     [${line.kind}] ${line.text}`);
      }
    }
  }

  // Every thread has to be able to *start* its quest for somebody. Which route
  // gets there is the player's business; that none of them can is a bug.
  const hidden = module_.all<{ id: string; tags?: string[] }>('narrative.quests')
    .filter((q) => q.tags?.includes('hidden') && q.tags.includes(thread.id));
  for (const quest of hidden) {
    if (!state.quests[quest.id] && route === 'friendly') {
      fail(`${thread.id}/friendly: ${quest.id} never started, so nothing is trackable`);
    }
  }

  const view = loreByThread(module_, state).find((t) => t.id === thread.id);
  note(`journal: ${view?.known}/${view?.total} — ${view?.entries.filter((e) => !e.known).length} still blank`);
}

// --- go ---------------------------------------------------------------------

const chosen = ALL ? threads : threads.filter((t) => t.id === WANTED);
if (chosen.length === 0) {
  console.error(`no such thread: ${WANTED}. known: ${threads.map((t) => t.id).join(', ')}`);
  process.exit(2);
}

for (const thread of chosen) {
  for (const route of ROUTES) run(thread, route);
}

console.log('');
if (problems.length === 0) {
  console.log(`✓ ${chosen.length} thread(s) × ${ROUTES.length} route(s): every one reachable`);
  process.exit(0);
}
console.log(`✗ ${problems.length} problem(s)`);
for (const line of problems) console.log(`  · ${line}`);
process.exit(1);
