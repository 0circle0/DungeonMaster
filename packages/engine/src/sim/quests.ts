/**
 * Quests: stages, objectives, and completion.
 *
 * Objectives watch the event stream rather than being polled: when a creature dies, a place is
 * reached or a flag is set, every active objective gets a chance to notice. Quest logic therefore
 * stays out of the actions themselves.
 *
 * Common shapes (`kill`, `collect`, `reach`, `talk`) are recognised directly; `custom` takes a DSL
 * predicate for everything else.
 */

import { Rng } from '@dm/core';
import { evalEffects, evalExpr, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Expr } from '@dm/module';
import type { Effect, Predicate, Requirement } from '@dm/module';
import type { GameEvent } from '../events.js';
import type { EntityId, QuestState } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { abilitiesUpTo } from '../character.js';
import type { ClassDef } from '../character.js';
import { Transaction, applyOps, changeInventory, adjustReputation } from '../rules/apply.js';
import { message } from '../narrate/systemText.js';
import type { Message } from '../narrate/systemText.js';

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
 * Which stage a quest is on, derived rather than stored: the first stage still holding an
 * unfinished required objective. Deriving it means no new state field and no save migration, and it
 * cannot drift out of step with the completed list. Stage-less objectives never move the cursor.
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
    txn.emit({ type: 'refused', action: 'acceptQuest', reason: message('refused.quest.unknown', { quest: questId }) });
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
      txn.emit({ type: 'refused', action: 'acceptQuest', reason: message('refused.quest.unavailable', { quest: quest.name }) });
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

  // Opening the quest opens its first stage, so a stage's `onStart` setup runs.
  const opening = quest.stages[stageIndexOf(quest, new Set())];
  if (opening) applyEffects(txn, opening.onStart, rng);

  return true;
}

/**
 * Start every quest the module marks as beginning on its own. Run as the party is placed, inside
 * the arrival transaction, so `onStart` can run and its event reaches the transcript; `newGame` has
 * no transaction.
 */
export function startAutoQuests(txn: Transaction, rng: Rng): void {
  for (const quest of txn.module.all<QuestDef>('narrative.quests')) {
    if (!quest.autoStart) continue;
    if (txn.state.quests[quest.id]) continue;
    startQuest(txn, quest.id, rng.derive(`autostart:${quest.id}`));
  }
}

/**
 * Note quests the world has opened up but nobody has offered yet. An `available` quest is one the
 * party could take if they knew to ask, which is what the journal shows under "available".
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
 * Give up on a quest. It drops back to available rather than vanishing, and progress is cleared:
 * walking away and coming back means doing the work.
 */
export function abandonQuest(txn: Transaction, questId: string): boolean {
  const questState = txn.state.quests[questId];
  if (!questState || questState.status !== 'active') {
    txn.emit({ type: 'refused', action: 'abandonQuest', reason: message('refused.quest.notTaken') });
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
  txn.emit({ type: 'questFailed', quest: questId, reason: message('quest.failed.abandoned') });
  return true;
}

/**
 * Whether an event satisfies an objective. The recognised shapes cover what quests usually ask for;
 * anything else declares a `when` predicate and is checked against world state.
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
      // Arriving at a place with no interior map of its own, which emits no `enteredMap`, so a
      // "reach the mill" objective can still complete.
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
 * Offer events to every active quest. Called once after an action resolves, with everything that
 * action produced.
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
        failQuest(txn, quest, message('quest.failed.conditions'), rng);
        continue;
      }
    }
    if (quest.timeLimitDays && questState.startedAt !== null) {
      const perDay = txn.module.source.world.time.minutesPerDay;
      if (txn.state.minute - questState.startedAt > quest.timeLimitDays * perDay) {
        failQuest(txn, quest, message('quest.failed.timedOut'), rng);
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

      // An objective can declare what it takes to be active. Not threaded into `stageIndexOf`: on
      // an ordered quest the cursor sits on the gated objective and the quest waits, which keeps
      // the stage cursor derived from `completedObjectives` alone.
      if (!isEmptyRequirement(objective.requires) && leader) {
        const scope = buildScope(txn.module, txn.state, leader);
        const gate = compileRequirement(objective.requires);
        if (!evalPredicate(gate, { scope, rng, openNamespaces: OPEN_NAMESPACES })) continue;
      }

      let satisfied = false;

      if (objective.kind === 'custom' && objective.when && leader) {
        const scope = buildScope(txn.module, txn.state, leader);
        satisfied = evalPredicate(objective.when, { scope, rng, openNamespaces: OPEN_NAMESPACES });
      } else {
        // On an event-driven kind, `when` is an extra gate the event must also satisfy, not a
        // second way to finish — that would give a `kill` objective two completion paths.
        if (objective.when && leader) {
          const scope = buildScope(txn.module, txn.state, leader);
          if (!evalPredicate(objective.when, { scope, rng, openNamespaces: OPEN_NAMESPACES })) continue;
        }

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

  // Finishing the last required objective of a stage closes it and opens the next. The cursor is
  // derived, so this is the only place that has to notice.
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
  if (xp > 0) grantXp(txn, xp, rng.derive('levelup'));

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

function failQuest(txn: Transaction, quest: QuestDef, reason: Message, rng: Rng): void {
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

/**
 * Award experience to the whole party, and level anyone who has earned it. Each crossed level is
 * applied in order, because a module may grant something at 2 that something at 3 depends on.
 */
/**
 * Experience for what the party killed, from `content.monsters[].xp`.
 *
 * There is no switch for this: a ruleset that does not want experience for killing gives its
 * creatures none, which is the schema default.
 *
 * Read from the statblock rather than from the corpse. `Entity.xp` holds both what a character has
 * earned and what a monster is worth, so the authored number is the one to trust.
 */
export function awardKillXp(txn: Transaction, events: readonly GameEvent[], rng: Rng): void {
  for (const event of events) {
    if (event.type !== 'died') continue;

    // Only what the party brought down. A creature killed by another creature, or by the ground it
    // was standing on, teaches the party nothing.
    if (!event.killer || !txn.state.party.includes(event.killer)) continue;

    const corpse = txn.entity(event.entity);
    if (!corpse?.statblock) continue;

    const statblock = txn.module.find<{ xp?: number }>('content.monsters', corpse.statblock);
    const worth = statblock?.xp ?? 0;
    if (worth <= 0) continue;

    grantXp(txn, worth, rng.derive(`kill:${corpse.id}`));
  }
}

export function grantXp(txn: Transaction, amount: number, rng: Rng): void {
  if (amount <= 0) return;
  const levels = txn.module.source.rules.progression.levels as {
    level: number;
    xpRequired: number;
    grants?: Effect[];
  }[];
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
    if (level === member.level) continue;

    txn.emit({ type: 'leveledUp', entity: id, level });

    for (let reached = member.level + 1; reached <= level; reached += 1) {
      applyLevel(txn, id, reached, levels, rng.derive(`levelup:${id}:${reached}`));
    }
  }
}

/** Everything reaching one level does, beyond the number itself. */
function applyLevel(
  txn: Transaction,
  id: EntityId,
  level: number,
  levels: readonly { level: number; grants?: Effect[] }[],
  rng: Rng,
): void {
  // What the class has unlocked by now. A union rather than a replacement, so an ability granted by
  // an ancestry or an item is not revoked.
  const current = txn.entity(id);
  if (current?.characterClass) {
    const characterClass = txn.module.find<ClassDef>('content.classes', current.characterClass);
    if (characterClass) {
      const unlocked = abilitiesUpTo(characterClass, level)
        .filter((ability: string) => !current.abilities.includes(ability));
      if (unlocked.length > 0) {
        txn.putEntity({ ...current, abilities: [...current.abilities, ...unlocked] });
      }
    }
  }

  // Then the module's own effects for reaching it, scoped to the character who levelled rather than
  // the party leader — `applyEffects` uses the leader, which would give everyone's level-up bonus
  // to one person.
  const grants = levels.find((entry) => entry.level === level)?.grants ?? [];
  if (grants.length === 0) return;

  const member = txn.entity(id);
  if (!member) return;
  const scope = buildScope(txn.module, txn.state, member);
  applyOps(txn, evalEffects(grants, { scope, rng, openNamespaces: OPEN_NAMESPACES }), id);
}

/**
 * Quests this person can hand over, that the party could take right now. Answers both
 * `npcs[].offersQuests` and `quests[].giver`, so a front end can offer the job and a bare `talk`
 * can mention it without a dialogue tree.
 */
export function questsOffered(txn: Transaction, npcId: string, rng: Rng): readonly QuestDef[] {
  const npc = txn.module.find<{ offersQuests?: string[] }>('content.npcs', npcId);

  const declared = new Set(npc?.offersQuests ?? []);
  for (const quest of txn.module.all<QuestDef>('narrative.quests')) {
    if (quest.giver === npcId) declared.add(quest.id);
  }
  if (declared.size === 0) return [];

  const leader = txn.state.entities[txn.state.selected];
  const out: QuestDef[] = [];

  // Sorted, so two runs offer the same jobs in the same order.
  for (const id of [...declared].sort()) {
    const quest = txn.module.find<QuestDef>('narrative.quests', id);
    if (!quest) continue;

    const existing = txn.state.quests[id];
    // Already taken, already done — unless it is one you can take again.
    if (existing && existing.status !== 'available' && !(quest.repeatable && existing.status === 'complete')) {
      continue;
    }

    if (leader && !isEmptyRequirement(quest.requires)) {
      const scope = buildScope(txn.module, txn.state, leader);
      try {
        if (!evalPredicate(compileRequirement(quest.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES })) {
          continue;
        }
      } catch {
        continue;
      }
    }
    out.push(quest);
  }
  return out;
}
