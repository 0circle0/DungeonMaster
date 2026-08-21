/** Ruleset knobs, read once. */

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
  /** How a creature gets about when it declares nothing; null when the ruleset has no modes. */
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

/** How a scaled damage number is rounded. */
export function roundDamageOf(module: CompiledModule): (n: number) => number {
  return configOf(module).roundDamage;
}

/** The baseline a passive score is measured from. */
export function passiveBase(module: CompiledModule): number {
  return configOf(module).passiveBase;
}

/** The movement mode a creature uses when it declares none. */
export function defaultMovementModeOf(module: CompiledModule): string | null {
  return configOf(module).defaultMovementMode;
}
