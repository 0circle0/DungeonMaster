/**
 * Ruleset knobs, read once.
 *
 * The engine reaches `module.source.rules.*` from a hundred places, and the
 * numbers it finds there used to be split between the schema and literals in
 * code — `criticalDamageMultiplier` was data while the save-for-half beside it
 * was `0.5`, `defaultSize` was declarable while the movement mode was the
 * string `walk`. These accessors are the other half of those pairs.
 *
 * Two rules hold here:
 *
 * - **No `??` chains.** `compileModule` runs the document through Zod, so a
 *   declared default is already present. Restating one here would be a second
 *   source of truth, and the two would drift.
 * - **Resolved, not merely read**, where "the module's answer" takes more than
 *   a property access — a default that falls back to the first declared entry,
 *   or a rounding mode that has to become a function.
 *
 * Resolution is memoized per module because these are read per operation and
 * a module never changes. Nothing else in the engine memoizes; this is the one
 * place where the cost is worth the WeakMap.
 */

import type { CompiledModule } from '@dm/module';

/** How a scaled number is turned back into a whole one. */
export type Rounding = 'floor' | 'round' | 'ceil' | 'trunc';

const ROUND: Record<Rounding, (n: number) => number> = {
  floor: Math.floor,
  round: Math.round,
  ceil: Math.ceil,
  trunc: Math.trunc,
};

export interface ResolvedConfig {
  /** What a successful save against `half` leaves. */
  readonly saveMultiplier: number;
  /** The floor a passive score is measured from. */
  readonly passiveBase: number;
  /** Whether a resisting side rolls, or is measured standing still. */
  readonly opposedMode: 'passive' | 'contested';
  /** Applied to damage after resistance, criticals, and saves. */
  readonly roundDamage: (n: number) => number;
  /** Applied to a reputation spill across faction relations. */
  readonly roundReputation: (n: number) => number;
  /** Whether the purse may go below zero. */
  readonly allowDebt: boolean;
  /** Minutes in an hour, for the calendar. */
  readonly minutesPerHour: number;
  /**
   * How a creature gets about when it declares nothing: the module's own
   * default, then the first mode it declares at all, and null for a ruleset
   * with no notion of movement modes.
   */
  readonly defaultMovementMode: string | null;
}

const cache = new WeakMap<CompiledModule, ResolvedConfig>();

export function configOf(module: CompiledModule): ResolvedConfig {
  let resolved = cache.get(module);
  if (!resolved) {
    const rules = module.source.rules;
    const resolution = rules.resolution;
    resolved = {
      saveMultiplier: resolution.saveSuccessMultiplier,
      passiveBase: resolution.passiveBase,
      opposedMode: resolution.opposedMode,
      roundDamage: ROUND[resolution.damageRounding],
      roundReputation: ROUND[resolution.reputationRounding],
      allowDebt: rules.currency.allowNegative,
      minutesPerHour: module.source.world.time.minutesPerHour,
      defaultMovementMode:
        rules.defaultMovementMode ?? module.ids('rules.movementModes')[0] ?? null,
    };
    cache.set(module, resolved);
  }
  return resolved;
}

/** What a successful saving throw against `onSuccess: "half"` leaves. */
export function saveMultiplier(module: CompiledModule): number {
  return configOf(module).saveMultiplier;
}

/** The baseline a passive score is measured from. */
export function passiveBase(module: CompiledModule): number {
  return configOf(module).passiveBase;
}

/**
 * The movement mode a creature uses when it declares none.
 *
 * The same shape as `defaultStanceOf` and `reachOf`'s size fallback: declared
 * first, then the first entry, then nothing.
 */
export function defaultMovementModeOf(module: CompiledModule): string | null {
  return configOf(module).defaultMovementMode;
}
