/** Encounter budgeting. */

import { parseDice, minRoll, maxRoll, averageRoll } from '@dm/core';

/** Encounters a party is assumed to face between levels. */
const ENCOUNTERS_PER_LEVEL = 8;

/** Multipliers on a standard encounter's budget. */
export const DIFFICULTY_BANDS = {
  trivial: 0.35,
  easy: 0.6,
  standard: 1,
  hard: 1.6,
  deadly: 2.5,
} as const;

export type Difficulty = keyof typeof DIFFICULTY_BANDS | 'overwhelming';

/** Fighting several weaker creatures is harder than the raw xp suggests, since they get more actions. */
function groupMultiplier(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  return 3;
}

interface MonsterLike {
  id: string;
  name?: string;
  level?: number;
  xp?: number;
  challenge?: number;
}

interface EncounterEntryLike {
  monster: string;
  count?: string;
  scaleWithLevel?: boolean;
}

interface GroupLike {
  id: string;
  name?: string;
  weight?: number;
  entries?: EncounterEntryLike[];
  requires?: unknown;
}

interface TableLike {
  id: string;
  name?: string;
  chance?: number;
  emptyWeight?: number;
  groups?: GroupLike[];
}

interface LevelLike {
  level: number;
  xpRequired: number;
}

/** A creature's threat, in xp. */
export function monsterThreat(monster: MonsterLike): number {
  if (typeof monster.challenge === 'number' && monster.challenge > 0) {
    // Challenge is a level-like number; convert it to the xp scale.
    return monster.challenge * 100;
  }
  if (typeof monster.xp === 'number' && monster.xp > 0) return monster.xp;
  // Nothing recorded: assume it is worth roughly its level.
  return Math.max(10, (monster.level ?? 1) * 25);
}

/** How much xp a single character needs to reach the next level. */
export function xpToNextLevel(levels: readonly LevelLike[], level: number): number {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const current = sorted.find((l) => l.level === level);
  const next = sorted.find((l) => l.level === level + 1);
  if (!current || !next) {
    // Past the table's end, extrapolate from the last gap so the maths still works.
    const last = sorted.at(-1);
    const secondLast = sorted.at(-2);
    if (last && secondLast) return Math.max(1, last.xpRequired - secondLast.xpRequired);
    return 100;
  }
  return Math.max(1, next.xpRequired - current.xpRequired);
}

/** The xp a standard encounter should be worth for this party. */
export function standardBudget(
  levels: readonly LevelLike[],
  partyLevel: number,
  partySize: number,
): number {
  return (xpToNextLevel(levels, partyLevel) * partySize) / ENCOUNTERS_PER_LEVEL;
}

/** Classify a threat against the party's budget. */
export function classify(threat: number, budget: number): Difficulty {
  if (budget <= 0) return 'standard';
  const ratio = threat / budget;
  if (ratio >= DIFFICULTY_BANDS.deadly * 1.6) return 'overwhelming';
  if (ratio >= DIFFICULTY_BANDS.deadly) return 'deadly';
  if (ratio >= DIFFICULTY_BANDS.hard) return 'hard';
  if (ratio >= DIFFICULTY_BANDS.standard) return 'standard';
  if (ratio >= DIFFICULTY_BANDS.easy) return 'easy';
  return 'trivial';
}

export interface GroupBudget {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  /** Odds of drawing this group when the table fires. */
  readonly probability: number;
  readonly minCount: number;
  readonly avgCount: number;
  readonly maxCount: number;
  /** Threat in xp, action-economy adjusted. */
  readonly minThreat: number;
  readonly avgThreat: number;
  readonly maxThreat: number;
  /** Non-empty when the group is gated and may not appear at all. */
  readonly gated: boolean;
  readonly missingMonsters: readonly string[];
}

export interface TableBudget {
  readonly id: string;
  readonly label: string;
  /** Odds the table produces anything at all. */
  readonly chance: number;
  readonly groups: readonly GroupBudget[];
  /** Expected threat per consultation, weighted by probability and chance. */
  readonly expectedThreat: number;
  /** The worst the table can do. */
  readonly maxThreat: number;
}

function countBounds(notation: string | undefined): { min: number; avg: number; max: number } {
  if (!notation) return { min: 1, avg: 1, max: 1 };
  try {
    const expr = parseDice(notation);
    return { min: minRoll(expr), avg: averageRoll(expr), max: maxRoll(expr) };
  } catch {
    return { min: 1, avg: 1, max: 1 };
  }
}

/** Work out what an encounter table can produce. */
export function budgetForTable(
  table: TableLike,
  monsters: readonly MonsterLike[],
): TableBudget {
  const byId = new Map(monsters.map((m) => [m.id, m]));
  const groups = table.groups ?? [];

  const emptyWeight = table.emptyWeight ?? 0;
  const totalWeight = groups.reduce((sum, g) => sum + (g.weight ?? 1), 0) + emptyWeight;

  const budgets: GroupBudget[] = groups.map((group) => {
    let minCount = 0;
    let avgCount = 0;
    let maxCount = 0;
    let minThreat = 0;
    let avgThreat = 0;
    let maxThreat = 0;
    const missing: string[] = [];

    for (const entry of group.entries ?? []) {
      const monster = byId.get(entry.monster);
      if (!monster) {
        missing.push(entry.monster);
        continue;
      }
      const threat = monsterThreat(monster);
      const counts = countBounds(entry.count);

      minCount += counts.min;
      avgCount += counts.avg;
      maxCount += counts.max;
      minThreat += threat * counts.min;
      avgThreat += threat * counts.avg;
      maxThreat += threat * counts.max;
    }

    return {
      id: group.id,
      label: group.name ?? group.id,
      weight: group.weight ?? 1,
      probability: totalWeight > 0 ? (group.weight ?? 1) / totalWeight : 0,
      minCount,
      avgCount,
      maxCount,
      // Multiple creatures act more often than their xp implies.
      minThreat: Math.round(minThreat * groupMultiplier(minCount)),
      avgThreat: Math.round(avgThreat * groupMultiplier(Math.round(avgCount))),
      maxThreat: Math.round(maxThreat * groupMultiplier(maxCount)),
      gated: group.requires !== undefined,
      missingMonsters: missing,
    };
  });

  const chance = table.chance ?? 1;
  const expectedThreat = Math.round(
    budgets.reduce((sum, g) => sum + g.avgThreat * g.probability, 0) * chance,
  );
  const maxThreat = budgets.reduce((max, g) => Math.max(max, g.maxThreat), 0);

  return {
    id: table.id,
    label: table.name ?? table.id,
    chance,
    groups: budgets,
    expectedThreat,
    maxThreat,
  };
}

export interface BudgetAssessment {
  readonly partyLevel: number;
  readonly partySize: number;
  readonly standardBudget: number;
  readonly expected: Difficulty;
  readonly worst: Difficulty;
  readonly table: TableBudget;
}

/** Assess a table against a party. */
export function assessTable(
  table: TableLike,
  monsters: readonly MonsterLike[],
  levels: readonly LevelLike[],
  partyLevel: number,
  partySize: number,
): BudgetAssessment {
  const budget = standardBudget(levels, partyLevel, partySize);
  const tableBudget = budgetForTable(table, monsters);
  return {
    partyLevel,
    partySize,
    standardBudget: Math.round(budget),
    expected: classify(tableBudget.expectedThreat, budget),
    worst: classify(tableBudget.maxThreat, budget),
    table: tableBudget,
  };
}
