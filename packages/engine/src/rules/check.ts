/**
 * Resolution: rolling against a number.
 *
 * Every uncertain outcome in the game funnels through here — skill checks,
 * saving throws, attack rolls, opposed contests. One implementation means
 * advantage, criticals, and modifiers behave identically wherever they appear.
 *
 * Nothing about *how* to roll is decided here. The dice, what counts as a
 * critical, and how advantage is expressed all come from `rules.resolution`, so
 * a module can use `1d20`, `3d6`, or a dice pool without the engine changing.
 */

import { Rng, parseDice, rollDice } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import type { Entity } from '../state.js';
import type { RollRecord } from '../events.js';
import { statsOf } from '../stats.js';

interface Resolution {
  checkDice: string;
  advantageDice: string;
  disadvantageDice: string;
  criticalSuccessAt: number | null;
  criticalFailureAt: number | null;
  criticalDamageMultiplier: number;
  defaultDifficulty: number;
  difficulties: Record<string, number>;
}

export type Swing = 'advantage' | 'disadvantage' | null;

export interface CheckOptions {
  /** Added to the roll: attribute modifiers, skill ranks, situational bonuses. */
  readonly modifier?: number;
  /** The number to beat. Defaults to the module's `defaultDifficulty`. */
  readonly difficulty?: number;
  readonly swing?: Swing;
}

function resolutionOf(module: CompiledModule): Resolution {
  return module.source.rules.resolution;
}

/** Resolve a named difficulty (`hard`) or a raw number. */
export function difficultyOf(module: CompiledModule, value: number | string | undefined): number {
  const resolution = resolutionOf(module);
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value in resolution.difficulties) {
    return resolution.difficulties[value]!;
  }
  return resolution.defaultDifficulty;
}

/**
 * Roll against a difficulty.
 *
 * The *natural* roll — before modifiers — decides criticals, which is why it is
 * recorded separately. A character with +9 who rolls a 1 has still fumbled.
 */
export function check(module: CompiledModule, rng: Rng, options: CheckOptions = {}): RollRecord {
  const resolution = resolutionOf(module);
  const modifier = options.modifier ?? 0;
  const difficulty = options.difficulty ?? resolution.defaultDifficulty;

  const notation =
    options.swing === 'advantage'
      ? resolution.advantageDice
      : options.swing === 'disadvantage'
        ? resolution.disadvantageDice
        : resolution.checkDice;

  const rolled = rollDice(parseDice(notation), rng);
  // Advantage notation is `2d20kh1`, so the kept die is the natural roll.
  const kept = rolled.dice.filter((die) => !die.dropped);
  const natural = kept.reduce((sum, die) => sum + die.value, 0) - rolled.modifier;
  const total = rolled.total + modifier;

  let outcome: RollRecord['outcome'];
  if (resolution.criticalSuccessAt !== null && natural >= resolution.criticalSuccessAt) {
    outcome = 'critical';
  } else if (resolution.criticalFailureAt !== null && natural <= resolution.criticalFailureAt) {
    outcome = 'fumble';
  } else {
    outcome = total >= difficulty ? 'success' : 'failure';
  }

  return {
    notation,
    dice: rolled.dice.map((die) => die.value),
    natural,
    modifier,
    total,
    against: difficulty,
    outcome,
    swing: options.swing ?? null,
  };
}

/** Whether a roll counts as a hit. A critical always hits; a fumble never does. */
export function succeeded(roll: RollRecord): boolean {
  return roll.outcome === 'success' || roll.outcome === 'critical';
}

/**
 * The bonus a character brings to a skill check: the governing attribute's
 * modifier plus their rank in the skill.
 */
export function skillModifier(module: CompiledModule, entity: Entity, skillId: string): number {
  const skill = module.find<{ attribute: string }>('content.skills', skillId);
  const stats = statsOf(module, entity);
  const attribute = skill ? (stats.mod[skill.attribute] ?? 0) : 0;
  return attribute + (entity.skills[skillId] ?? 0);
}

export function attributeModifier(module: CompiledModule, entity: Entity, attributeId: string): number {
  return statsOf(module, entity).mod[attributeId] ?? 0;
}

/** Roll a skill check for one entity. */
export function skillCheck(
  module: CompiledModule,
  rng: Rng,
  entity: Entity,
  skillId: string,
  difficulty: number | string | undefined,
  swing: Swing = null,
): RollRecord {
  return check(module, rng, {
    modifier: skillModifier(module, entity, skillId),
    difficulty: difficultyOf(module, difficulty),
    swing,
  });
}

/**
 * An opposed contest: both sides roll and the higher total wins.
 *
 * Ties go to the defender, which is the convention that keeps a contested
 * action from succeeding on a draw.
 */
export function opposedCheck(
  module: CompiledModule,
  rng: Rng,
  attacker: { entity: Entity; skill: string },
  defender: { entity: Entity; skill: string },
): { attacker: RollRecord; defender: RollRecord; attackerWins: boolean } {
  const attackerRoll = check(module, rng, {
    modifier: skillModifier(module, attacker.entity, attacker.skill),
    difficulty: 0,
  });
  const defenderRoll = check(module, rng, {
    modifier: skillModifier(module, defender.entity, defender.skill),
    difficulty: 0,
  });
  return {
    attacker: attackerRoll,
    defender: defenderRoll,
    attackerWins: attackerRoll.total > defenderRoll.total,
  };
}

interface SaveDef {
  id: string;
  attribute: string;
  defaultDifficulty?: unknown;
}

/**
 * A saving throw.
 *
 * Bonuses come from the governing attribute plus any `saveBonuses` on the
 * creature's statblock, so a module can make a creature resilient to one kind
 * of effect without touching its attributes.
 */
export function savingThrow(
  module: CompiledModule,
  rng: Rng,
  entity: Entity,
  saveId: string,
  difficulty: number | undefined,
): RollRecord {
  const definition = module.find<SaveDef>('rules.savingThrows', saveId);
  const stats = statsOf(module, entity);

  let modifier = definition ? (stats.mod[definition.attribute] ?? 0) : 0;
  if (entity.statblock) {
    const statblock = module.find<{ saveBonuses?: Record<string, number> }>(
      'content.monsters',
      entity.statblock,
    );
    modifier += statblock?.saveBonuses?.[saveId] ?? 0;
  }

  return check(module, rng, { modifier, difficulty: difficultyOf(module, difficulty) });
}

/** How much a critical multiplies damage. */
export function criticalMultiplier(module: CompiledModule): number {
  return resolutionOf(module).criticalDamageMultiplier;
}
