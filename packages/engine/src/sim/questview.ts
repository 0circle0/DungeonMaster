/** What the player is allowed to read about their quests. */

import type { CompiledModule } from '@dm/module';
import type { GameState, QuestState } from '../state.js';
import { objectivesOf, stageIndexOf } from './quests.js';
import type { QuestDef, ObjectiveDef } from './quests.js';
import { arcsOf } from './arcs.js';
import type { ArcView } from './arcs.js';

export interface JournalObjective {
  readonly id: string;
  readonly description: string;
  readonly done: boolean;
  /** How many of `count` are in hand. */
  readonly progress: number;
  readonly count: number;
  /** Which stage it belongs to, or null for a quest-level objective. */
  readonly stage: string | null;
}

export interface JournalEntry {
  readonly quest: string;
  readonly name: string;
  readonly description: string;
  readonly status: QuestState['status'];
  /** 1-based for display; 0 when the quest declares no stages. */
  readonly stageNumber: number;
  readonly stageCount: number;
  readonly stageName: string;
  readonly stageDescription: string;
  readonly journalKey: string | undefined;
  readonly objectives: readonly JournalObjective[];
}

/** The party's whole quest log, active first. */
export function questJournal(module: CompiledModule, state: GameState): JournalEntry[] {
  const RANK: Record<QuestState['status'], number> = {
    active: 0, available: 1, complete: 2, failed: 3,
  };

  return Object.values(state.quests)
    .map((questState) => entryOf(module, state, questState))
    .filter((entry): entry is JournalEntry => entry !== null)
    .sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
}

function entryOf(
  module: CompiledModule,
  state: GameState,
  questState: QuestState,
): JournalEntry | null {
  const quest = module.find<QuestDef>('narrative.quests', questState.quest);
  if (!quest) return null;

  const done = new Set(questState.completedObjectives);
  const index = stageIndexOf(quest, done);
  const stage = quest.stages[index];

  const objectives = objectivesOf(quest)
    .filter(({ objective, stage: owner }) => {
      // A hidden objective stays hidden until it is met — that is the point of it.
      if (objective.hidden && !done.has(objective.id)) return false;
      return owner === null || owner === stage?.id || done.has(objective.id);
    })
    .map(({ objective, stage: owner }) => describe(state, quest, objective, owner, done));

  return {
    quest: quest.id,
    name: quest.name,
    description: quest.description,
    status: questState.status,
    stageNumber: quest.stages.length > 0 ? Math.min(index + 1, quest.stages.length) : 0,
    stageCount: quest.stages.length,
    stageName: stage?.name ?? '',
    stageDescription: stage?.description ?? '',
    journalKey: stage?.journalKey,
    objectives,
  };
}

function describe(
  state: GameState,
  quest: QuestDef,
  objective: ObjectiveDef,
  stage: string | null,
  done: ReadonlySet<string>,
): JournalObjective {
  const complete = done.has(objective.id);
  const counted = Number(state.flags[`quest:${quest.id}:${objective.id}:count`] ?? 0);

  return {
    id: objective.id,
    // An objective with no authored text reads its id as a phrase.
    description: objective.description || objective.id.replace(/_/g, ' '),
    done: complete,
    progress: complete ? objective.count : Math.min(counted, objective.count),
    count: objective.count,
    stage,
  };
}

export interface CurrentObjective {
  readonly quest: string;
  readonly questName: string;
  readonly stageName: string;
  readonly objective: JournalObjective;
}

/** The one line worth keeping on screen: what to do next. */
export function currentObjective(
  module: CompiledModule,
  state: GameState,
): CurrentObjective | null {
  const active = Object.values(state.quests)
    .filter((questState) => questState.status === 'active')
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.quest.localeCompare(b.quest));

  for (const questState of active) {
    const entry = entryOf(module, state, questState);
    if (!entry) continue;
    const next = entry.objectives.find((objective) => !objective.done);
    if (!next) continue;
    return {
      quest: entry.quest,
      questName: entry.name,
      stageName: entry.stageName,
      objective: next,
    };
  }

  return null;
}

/** The journal, grouped by the arcs a module declares. */
export function journalByArc(
  module: CompiledModule,
  state: GameState,
): readonly {
  readonly arc: ArcView | null;
  readonly entries: readonly JournalEntry[];
}[] {
  const entries = questJournal(module, state);
  const arcs = arcsOf(module, state);
  const claimed = new Set<string>();

  const grouped = arcs.map((arc) => {
    const mine = entries.filter((entry) => arc.quests.some((quest) => quest.id === entry.quest));
    for (const entry of mine) claimed.add(entry.quest);
    return { arc, entries: mine };
  }).filter((group) => group.entries.length > 0);

  const loose = entries.filter((entry) => !claimed.has(entry.quest));
  return loose.length > 0 ? [...grouped, { arc: null, entries: loose }] : grouped;
}
