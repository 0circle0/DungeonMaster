export {
  monsterThreat,
  xpToNextLevel,
  standardBudget,
  classify,
  budgetForTable,
  assessTable,
  DIFFICULTY_BANDS,
} from './budget.js';
export type { Difficulty, GroupBudget, TableBudget, BudgetAssessment } from './budget.js';

export { buildReferenceIndex, referencesTo, findOrphans } from './references.js';
export type { Reference, ReferenceIndex, OrphanEntry } from './references.js';

export { simulateMemory } from './simulate.js';
export type { SeedDeed, Knower, TimelineDay, TimelineResult } from './simulate.js';
