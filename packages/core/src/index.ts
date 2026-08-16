export { Rng, hashString } from './rng.js';
export { hash64, stableStringify } from './hash.js';
export { valueNoise } from './noise.js';
export type { NoiseField, NoiseOptions } from './noise.js';
export type { RngState } from './rng.js';

export {
  parseDice,
  rollDice,
  roll,
  minRoll,
  maxRoll,
  averageRoll,
  DiceParseError,
} from './dice.js';
export type { DiceExpr, Term, DiceTerm, ConstantTerm, DieRoll, RollResult, DiceRng } from './dice.js';

export { IdAllocator, contentId, entityId, isValidContentId } from './ids.js';
export type { Id, ContentId, EntityId } from './ids.js';
