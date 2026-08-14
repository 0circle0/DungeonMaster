/**
 * Quests: stages, objectives, and completion.
 *
 * Objectives watch the event stream rather than being polled. When something
 * happens — a creature dies, a place is reached, a flag is set — every active
 * objective gets a chance to notice. That keeps quest logic out of the actions
 * themselves, so adding a quest never means editing the combat code.
 *
 * Common objective shapes (`kill`, `collect`, `reach`, `talk`) are recognised
 * directly so an author does not have to write a predicate for the ordinary
 * case; `custom` takes a DSL predicate for everything else.
 */

import { Rng } from '@dm/core';
import { evalEffects, evalExpr, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Expr } from '@dm/module';
import type { Effect, Predicate, Requirement } from '@dm/module';
import type { GameEvent } from '../events.js';
import type { QuestState } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps, changeInventory, adjustReputation } from '../rules/apply.js';

export interface ObjectiveDef {
  id: string;
  description: string;
  kind: 'custom' | 'kill' | 'collect' | 'reach' | 'talk';
  target?: string;
  count: number;
  when?: Predicate;
  requires?: Requirement;
  hidden: boolean;
  optional: boolean;
  onComplete: Effect[];
}

export interface StageDef {
  id: string;
  name?: string;
  description: string;
  journalKey?: string;
  objectives: ObjectiveDef[];
  onStart: Effect[];
  onComplete: Effect[];
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  giver?: string;
  available?: Predicate;
  requires?: Requirement;
  autoStart: boolean;
  stages: StageDef[];
  objectives: ObjectiveDef[];
  ordered: boolean;
  onStart: Effect[];
  onComplete: Effect[];
  onFail: Effect[];
  failWhen?: Predicate;
  rewards: {
    xp: unknown;
    items: { item: string; quantity: unknown }[];
    reputation: Record<string, unknown>;
  };
  unlocks: string[];
  remembersAs?: string;
  repeatable: boolean;
  timeLimitDays?: number;
}

/** Every objective in a quest, flattened across stages in order. */
export function objectivesOf(quest: QuestDef): { stage: string | null; objective: ObjectiveDef }[] {
  const out: { stage: string | null; objective: ObjectiveDef }[] = [];
  for (const objective of quest.objectives) out.push({ stage: null, objective });
  for (const stage of quest.stages) {
    for (const objective of stage.objectives) out.push({ stage: stage.id, objective });
  }
  return out;
}

/**
 * Which stage a quest is on, derived rather than stored.
 *
 * The first stage still holding an unfinished required objective is the one the
 * party is working. Deriving it means no new state field and no save migration,
 * and it cannot drift out of step with the completed list it is computed from.
 * A quest's stage-less objectives belong to no stage and never move the cursor.
 */
export function stageIndexOf(quest: QuestDef, done: ReadonlySet<string>): number {
  for (let index = 0; index < quest.stages.length; index += 1) {
    const pending = quest.stages[index]!.objectives.some(
      (objective) => !objective.optional && !done.has(objective.id),
    );
    if (pending) return index;
  }
  return quest.stages.length;
}

/** Run a stage's or quest's effects against the party leader. */
function applyEffects(txn: Transaction, effects: readonly Effect[], rng: Rng): void {
  if (effects.length === 0) return;
  const leader = txn.state.entities[txn.state.selected];
  if (!leader) return;
  const scope = buildScope(txn.module, txn.state, leader);
  applyOps(txn, evalEffects(effects, { scope, rng, openNamespaces: OPEN_NAMESPACES }), leader.id);
}

/** Start a quest, if it is not already running and its gate allows. */
export function startQuest(txn: Transaction, questId: string, rng: Rng): boolean {
  const quest = txn.module.find<QuestDef>('narrative.quests', questId);
  if (!quest) {
    txn.emit({ type: 'refused', action: 'acceptQuest', reason: `no quest "${questId}"` });
    return false;
  }

  const existing = txn.state.quests[questId];
  if (existing && existing.status !== 'available' && !(quest.repeatable && existing.status === 'complete')) {
    return false;
  }

  const leader = txn.state.entities[txn.state.selected];
  if (leader && !isEmptyRequirement(quest.requires)) {
    const scope = buildScope(txn.module, txn.state, leader);
    if (!evalPredicate(compileRequirement(quest.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES })) {
      txn.emit({ type: 'refused', action: 'acceptQuest', reason: `${quest.name} is not available yet` });
      return false;
    }
  }

  const state: QuestState = {
    quest: questId,
    status: 'active',
    completedObjectives: [],
    startedAt: txn.state.minute,
  };
  txn.set({ ...txn.state, quests: { ...txn.state.quests, [questId]: state } });
  txn.emit({ type: 'questStarted', quest: questId });

  applyEffects(txn, quest.onStart, rng);

  // Opening the quest opens its first stage. Authors put the setup there — a
  // flag, a spawned marker — and it never ran before, so a stage that "arms"
  // the world was quietly inert.
  const opening = quest.stages[stageIndexOf(quest, new Set())];
  if (opening) applyEffects(txn, opening.onStart, rng);

  return true;
}

/**
 * Start every quest the module marks as beginning on its own.
 *
 * Run once as the party is placed, inside the arrival transaction, so the
 * opening screen can say what they are here to do. Doing it in `newGame` would
 * be too early: there is no transaction there, so `onStart` could not run and
 * the event would never reach the transcript.
 */
export function startAutoQuests(txn: Transaction, rng: Rng): void {
  for (const quest of txn.module.all<QuestDef>('narrative.quests')) {
    if (!quest.autoStart) continue;
    if (txn.state.quests[quest.id]) continue;
    startQuest(txn, quest.id, rng.derive(`autostart:${quest.id}`));
  }
}

/**
 * Note quests the world has opened up but nobody has offered yet.
 *
 * An `available` quest is one the party could take if they knew to ask, which
 * is what the journal shows under "available" — the difference between a world
 * with more in it and a world that has run out.
 */
export function refreshQuestAvailability(txn: Transaction, rng: Rng): void {
  const leader = txn.state.entities[txn.state.selected];
  if (!leader) return;

  for (const quest of txn.module.all<QuestDef>('narrative.quests')) {
    if (!quest.available || txn.state.quests[quest.id]) continue;

    const scope = buildScope(txn.module, txn.state, leader);
    let open = false;
    try {
      open = evalPredicate(quest.available, { scope, rng, openNamespaces: OPEN_NAMESPACES });
    } catch {
      // A malformed predicate hides the quest; it must not stop the turn.
      continue;
    }
    if (!open) continue;

    txn.set({
      ...txn.state,
      quests: {
        ...txn.state.quests,
        [quest.id]: { quest: quest.id, status: 'available', completedObjectives: [], startedAt: null },
      },
    });
  }
}

/**
 * Give up on a quest.
 *
 * It drops back to available rather than vanishing, because the party changing
 * their mind is not the same as the job ceasing to exist. Progress is cleared:
 * walking away and coming back should mean doing the work.
 */
export function abandonQuest(txn: Transaction, questId: string): boolean {
  const questState = txn.state.quests[questId];
  if (!questState || questState.status !== 'active') {
    txn.emit({ type: 'refused', action: 'abandonQuest', reason: 'you are not on that job' });
    return false;
  }

  const quest = txn.module.find<QuestDef>('narrative.quests', questId);
  const flags = { ...txn.state.flags };
  for (const { objective } of quest ? objectivesOf(quest) : []) {
    delete flags[progressKey(questId, objective.id)];
  }

  txn.set({
    ...txn.state,
    flags,
    quests: {
      ...txn.state.quests,
      [questId]: { quest: questId, status: 'available', completedObjectives: [], startedAt: null },
    },
  });
  txn.emit({ type: 'questFailed', quest: questId, reason: 'abandoned' });
  return true;
}

/**
 * Whether an event satisfies an objective.
 *
 * The recognised shapes cover what quests actually ask for; anything else
 * declares a `when` predicate and is checked against world state instead.
 */
function matchesEvent(objective: ObjectiveDef, event: GameEvent, txn: Transaction): boolean {
  switch (objective.kind) {
    case 'kill': {
      if (event.type !== 'died') return false;
      const victim = txn.state.entities[event.entity];
      return Boolean(victim && (!objective.target || victim.statblock === objective.target));
    }

    case 'collect': {
      if (event.type !== 'itemGained') return false;
      return !objective.target || event.item === objective.target;
    }

    case 'reach': {
      if (event.type === 'enteredMap') return !objective.target || event.map.includes(objective.target);
      if (event.type === 'triggerFired') return !objective.target || event.at === objective.target;
      if (event.type === 'gateOpened') return !objective.target || event.gate === objective.target;
      // Arriving at a place with no interior map of its own. Without this a
      // "reach the mill" objective could never complete, because a point of
      // interest that generates no map emits no `enteredMap`.
      if (event.type === 'custom' && event.event === 'entered') {
        return !objective.target || event.data['place'] === objective.target;
      }
      return false;
    }

    case 'talk':
      return event.type === 'dialogueStarted'
        && (!objective.target || txn.state.entities[event.npc]?.statblock === objective.target
          || event.npc === objective.target);

    default:
      return false;
  }
}

/** How many times an objective has been satisfied so far, for counted goals. */
function progressKey(questId: string, objectiveId: string): string {
  return `quest:${questId}:${objectiveId}:count`;
}

/**
 * Offer events to every active quest.
 *
 * Called once after an action resolves, with everything that action produced.
 */
export function advanceQuests(txn: Transaction, events: readonly GameEvent[], rng: Rng): void {
  refreshQuestAvailability(txn, rng.derive('available'));

  for (const questState of Object.values(txn.state.quests)) {
    if (questState.status !== 'active') continue;

    const quest = txn.module.find<QuestDef>('narrative.quests', questState.quest);
    if (!quest) continue;

    // A quest can fail out from under the party — the giver dies, time runs out.
    const leader = txn.state.entities[txn.state.selected];
    if (leader && quest.failWhen) {
      const scope = buildScope(txn.module, txn.state, leader);
      if (evalPredicate(quest.failWhen, { scope, rng, openNamespaces: OPEN_NAMESPACES })) {
        failQuest(txn, quest, 'conditions changed', rng);
        continue;
      }
    }
    if (quest.timeLimitDays && questState.startedAt !== null) {
      const perDay = txn.module.source.world.time.minutesPerDay;
      if (txn.state.minute - questState.startedAt > quest.timeLimitDays * perDay) {
        failQuest(txn, quest, 'too much time passed', rng);
        continue;
      }
    }

    const all = objectivesOf(quest);
    const done = new Set(questState.completedObjectives);

    for (const { objective } of all) {
      if (done.has(objective.id)) continue;

      // Ordered quests only accept progress on the next unfinished objective.
      if (quest.ordered) {
        const next = all.find((entry) => !done.has(entry.objective.id));
        if (next && next.objective.id !== objective.id) continue;
      }

      let satisfied = false;

      if (objective.kind === 'custom' && objective.when && leader) {
        const scope = buildScope(txn.module, txn.state, leader);
        satisfied = evalPredicate(objective.when, { scope, rng, openNamespaces: OPEN_NAMESPACES });
      } else {
        const hits = events.filter((event) => matchesEvent(objective, event, txn)).length;
        if (hits > 0) {
          const flagId = progressKey(quest.id, objective.id);
          const already = Number(txn.state.flags[flagId] ?? 0);
          const total = already + hits;

          if (total >= objective.count) {
            satisfied = true;
          } else {
            txn.set({ ...txn.state, flags: { ...txn.state.flags, [flagId]: total } });
          }
        }
      }

      if (!satisfied) continue;

      completeObjective(txn, quest, objective, rng);
      done.add(objective.id);
    }

    checkQuestCompletion(txn, quest, rng);
  }
}

function completeObjective(
  txn: Transaction,
  quest: QuestDef,
  objective: ObjectiveDef,
  rng: Rng,
): void {
  const questState = txn.state.quests[quest.id];
  if (!questState) return;

  const before = stageIndexOf(quest, new Set(questState.completedObjectives));
  const completed = [...questState.completedObjectives, objective.id];

  txn.set({
    ...txn.state,
    quests: {
      ...txn.state.quests,
      [quest.id]: { ...questState, completedObjectives: completed },
    },
  });
  txn.emit({ type: 'objectiveCompleted', quest: quest.id, objective: objective.id });

  applyEffects(txn, objective.onComplete, rng);

  // Finishing the last required objective of a stage closes it and opens the
  // next. The cursor is derived, so this is the only place that has to notice.
  const after = stageIndexOf(quest, new Set(completed));
  if (after === before) return;

  const finished = quest.stages[before];
  if (finished) applyEffects(txn, finished.onComplete, rng);

  const opened = quest.stages[after];
  if (opened) {
    applyEffects(txn, opened.onStart, rng);
    txn.emit({
      type: 'custom',
      event: 'stageAdvanced',
      data: { quest: quest.id, stage: opened.id, index: after },
    });
  }
}

function checkQuestCompletion(txn: Transaction, quest: QuestDef, rng: Rng): void {
  const questState = txn.state.quests[quest.id];
  if (!questState || questState.status !== 'active') return;

  const required = objectivesOf(quest).filter(({ objective }) => !objective.optional);
  const done = new Set(questState.completedObjectives);
  if (required.length === 0) return;
  if (!required.every(({ objective }) => done.has(objective.id))) return;

  txn.set({
    ...txn.state,
    quests: { ...txn.state.quests, [quest.id]: { ...questState, status: 'complete' } },
  });
  txn.emit({ type: 'questCompleted', quest: quest.id });

  const leader = txn.state.entities[txn.state.selected];
  if (!leader) return;
  const scope = buildScope(txn.module, txn.state, leader);

  if (quest.onComplete.length > 0) {
    applyOps(txn, evalEffects(quest.onComplete, { scope, rng, openNamespaces: OPEN_NAMESPACES }), leader.id);
  }

  // — rewards ——————————————————————————————————————————————
  const xp = Number(evalNumber(quest.rewards?.xp, txn, leader.id, rng));
  if (xp > 0) grantXp(txn, xp);

  for (const reward of quest.rewards?.items ?? []) {
    const quantity = Math.max(1, Number(evalNumber(reward.quantity, txn, leader.id, rng)));
    changeInventory(txn, txn.entity(leader.id) ?? leader, reward.item, quantity);
  }
  for (const [faction, amount] of Object.entries(quest.rewards?.reputation ?? {})) {
    adjustReputation(txn, faction, Number(evalNumber(amount, txn, leader.id, rng)));
  }

  // A completed quest can open the next one in a chain.
  for (const unlocked of quest.unlocks) {
    const already = txn.state.quests[unlocked];
    if (already) continue;
    txn.set({
      ...txn.state,
      quests: {
        ...txn.state.quests,
        [unlocked]: { quest: unlocked, status: 'available', completedObjectives: [], startedAt: null },
      },
    });
  }

  // What the world will remember about this.
  if (quest.remembersAs) {
    txn.emit({ type: 'custom', event: 'deed', data: { kind: quest.remembersAs } });
  }
}

function failQuest(txn: Transaction, quest: QuestDef, reason: string, rng: Rng): void {
  const questState = txn.state.quests[quest.id];
  if (!questState) return;

  txn.set({
    ...txn.state,
    quests: { ...txn.state.quests, [quest.id]: { ...questState, status: 'failed' } },
  });
  txn.emit({ type: 'questFailed', quest: quest.id, reason });

  const leader = txn.state.entities[txn.state.selected];
  if (quest.onFail.length > 0 && leader) {
    const scope = buildScope(txn.module, txn.state, leader);
    applyOps(txn, evalEffects(quest.onFail, { scope, rng, openNamespaces: OPEN_NAMESPACES }), leader.id);
  }
}

/** Evaluate a reward expression, which may be a plain number or DSL. */
function evalNumber(expr: unknown, txn: Transaction, actorId: string, rng: Rng): number {
  if (typeof expr === 'number') return expr;
  if (expr === undefined || expr === null) return 0;

  const actor = txn.entity(actorId);
  if (!actor) return 0;

  const value = evalExpr(expr as Expr, { scope: buildScope(txn.module, txn.state, actor), rng });
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Award experience to the whole party, and level anyone who has earned it. */
export function grantXp(txn: Transaction, amount: number): void {
  if (amount <= 0) return;
  const levels = txn.module.source.rules.progression.levels as { level: number; xpRequired: number }[];
  const maxLevel = txn.module.source.rules.progression.maxLevel;

  for (const id of txn.state.party) {
    const member = txn.entity(id);
    if (!member || !member.alive) continue;

    const total = member.xp + amount;
    let level = member.level;
    while (level < maxLevel) {
      const next = levels.find((entry) => entry.level === level + 1);
      if (!next || total < next.xpRequired) break;
      level += 1;
    }

    txn.putEntity({ ...member, xp: total, level });
    txn.emit({ type: 'xpGained', entity: id, amount, total });
    if (level > member.level) txn.emit({ type: 'leveledUp', entity: id, level });
  }
}
