/** Resolution: rolling against a number. */

import { Rng, parseDice, rollDice } from '@dm/core';
import { evalExpr } from '@dm/module';
import type { CompiledModule, Expr, Scope, Value } from '@dm/module';
import type { Entity, GameState } from '../state.js';
import type { RollRecord } from '../events.js';
import {
  statsOf, proficiencyOf, isSaveProficient, skillRankOf, buildScope, OPEN_NAMESPACES,
} from '../stats.js';
import { swingsFrom } from './conditions.js';

interface Resolution {
  checkDice: string;
  advantageDice: string;
  disadvantageDice: string;
  swingStacking: 'cancel' | 'net';
  criticalSuccessAt: number | null;
  criticalFailureAt: number | null;
  criticalScope: readonly RollKind[];
  criticalDamageMultiplier: number;
  defaultDifficulty: number;
  difficulties: Record<string, number>;
}

export type Swing = 'advantage' | 'disadvantage' | null;

/** What kind of d20 test this is. */
export type RollKind = 'attack' | 'save' | 'check';

export interface CheckOptions {
  /** Added to the roll: attribute modifiers, skill ranks, situational bonuses. */
  readonly modifier?: number;
  /** The number to beat. */
  readonly difficulty?: number;
  /** Which way the dice lean, and why this may be a list. */
  readonly swing?: Swing | readonly Swing[] | undefined;
  /** Defaults to `check`, the least privileged of the three. */
  readonly kind?: RollKind;
}

/** One swing or many, always as many. */
function asList(given: Swing | readonly Swing[] | undefined): readonly Swing[] {
  if (given === undefined || given === null) return [];
  return Array.isArray(given) ? given : [given as Swing];
}

/** One swing from however many apply, per `rules.resolution.swingStacking`. */
export function resolveSwing(
  module: CompiledModule,
  given: Swing | readonly Swing[] | undefined,
): Swing {
  if (given === undefined || given === null) return null;
  if (!Array.isArray(given)) return given as Swing;

  let up = 0;
  let down = 0;
  for (const swing of given) {
    if (swing === 'advantage') up += 1;
    else if (swing === 'disadvantage') down += 1;
  }
  if (up === 0 && down === 0) return null;

  if (resolutionOf(module).swingStacking === 'net') {
    if (up === down) return null;
    return up > down ? 'advantage' : 'disadvantage';
  }

  // `cancel`: one of each is enough to leave nothing, however many there are.
  if (up > 0 && down > 0) return null;
  return up > 0 ? 'advantage' : 'disadvantage';
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

/** A difficulty the module wrote as a formula rather than as a number. */
export function difficultyFrom(
  module: CompiledModule,
  state: GameState,
  actor: Entity,
  declared: unknown,
  rng: Rng,
  extra: Scope = {},
): number | undefined {
  if (declared === undefined) return undefined;
  // A plain number needs no scope built for it.
  if (typeof declared === 'number') return Math.floor(declared);
  if (typeof declared === 'string') return difficultyOf(module, declared);

  const scope = { ...buildScope(module, state, actor), ...extra };
  const value = evalExpr(declared as Expr, { scope, rng, openNamespaces: OPEN_NAMESPACES });
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;
}

/** Roll against a difficulty. */
export function check(module: CompiledModule, rng: Rng, options: CheckOptions = {}): RollRecord {
  const resolution = resolutionOf(module);
  const modifier = options.modifier ?? 0;
  const difficulty = options.difficulty ?? resolution.defaultDifficulty;

  const swing = resolveSwing(module, options.swing);
  const notation =
    swing === 'advantage'
      ? resolution.advantageDice
      : swing === 'disadvantage'
        ? resolution.disadvantageDice
        : resolution.checkDice;

  const rolled = rollDice(parseDice(notation), rng);
  // Advantage notation is `2d20kh1`, so the kept die is the natural roll.
  const kept = rolled.dice.filter((die) => !die.dropped);
  const natural = kept.reduce((sum, die) => sum + die.value, 0) - rolled.modifier;
  const total = rolled.total + modifier;

  // A roll of a kind the ruleset does not let crit is decided on its total alone.
  const canCrit = resolution.criticalScope.includes(options.kind ?? 'check');

  let outcome: RollRecord['outcome'];
  if (canCrit && resolution.criticalSuccessAt !== null && natural >= resolution.criticalSuccessAt) {
    outcome = 'critical';
  } else if (
    canCrit && resolution.criticalFailureAt !== null && natural <= resolution.criticalFailureAt
  ) {
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
    swing,
  };
}

/** Whether a roll counts as a hit. */
export function succeeded(roll: RollRecord): boolean {
  return roll.outcome === 'success' || roll.outcome === 'critical';
}

/** The governing attribute's modifier plus the character's rank in the skill. */
export function skillModifier(module: CompiledModule, entity: Entity, skillId: string): number {
  const skill = module.find<{ attribute: string }>('content.skills', skillId);
  const stats = statsOf(module, entity);
  const attribute = skill ? (stats.mod[skill.attribute] ?? 0) : 0;
  return attribute + skillRankOf(module, entity, skillId);
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
  swing: Swing | readonly Swing[] = null,
): RollRecord {
  return check(module, rng, {
    modifier: skillModifier(module, entity, skillId),
    difficulty: difficultyOf(module, difficulty),
    // Whatever the caller knows, plus whatever the creature is carrying.
    swing: [...asList(swing), ...swingsFrom(module, entity, 'checks')],
  });
}

/** An opposed contest: both sides roll and the higher total wins. */
export function opposedCheck(
  module: CompiledModule,
  rng: Rng,
  attacker: { entity: Entity; skill: string; swing?: Swing | readonly Swing[] },
  defender: { entity: Entity; skill: string; swing?: Swing | readonly Swing[] },
): { attacker: RollRecord; defender: RollRecord; attackerWins: boolean } {
  // Each side is asked separately; neither swing is the other's.
  const attackerRoll = check(module, rng, {
    modifier: skillModifier(module, attacker.entity, attacker.skill),
    difficulty: 0,
    swing: [...asList(attacker.swing), ...swingsFrom(module, attacker.entity, 'checks')],
  });
  const defenderRoll = check(module, rng, {
    modifier: skillModifier(module, defender.entity, defender.skill),
    difficulty: 0,
    swing: [...asList(defender.swing), ...swingsFrom(module, defender.entity, 'checks')],
  });

  const attackerWins = attackerRoll.total > defenderRoll.total;
  return {
    attacker: restate(attackerRoll, defenderRoll.total, attackerWins),
    defender: restate(defenderRoll, attackerRoll.total, !attackerWins),
    attackerWins,
  };
}

/** A roll measured against the other side rather than against nothing. */
function restate(roll: RollRecord, against: number, won: boolean): RollRecord {
  const decided = roll.outcome === 'critical' || roll.outcome === 'fumble';
  return { ...roll, against, outcome: decided ? roll.outcome : won ? 'success' : 'failure' };
}

interface SaveDef {
  id: string;
  attribute: string;
  defaultDifficulty?: unknown;
}

/** A saving throw. */
export function savingThrow(
  module: CompiledModule,
  rng: Rng,
  entity: Entity,
  saveId: string,
  difficulty: number | undefined,
  swing: Swing | readonly Swing[] = null,
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

  // A class trained in this save adds the module's proficiency bonus, per `saveProficiencies`.
  if (isSaveProficient(module, entity, saveId)) modifier += proficiencyOf(module, entity);

  // A save that declares its own default wins over the global difficulty whenever the caller named none.
  const against = difficulty ?? defaultDifficultyOf(module, definition, entity);
  return check(module, rng, {
    modifier,
    difficulty: difficultyOf(module, against),
    swing: [...asList(swing), ...swingsFrom(module, entity, 'saves')],
    kind: 'save',
  });
}

/** The save's own `defaultDifficulty`, which the module may write as a formula. */
function defaultDifficultyOf(
  module: CompiledModule,
  definition: SaveDef | undefined,
  entity: Entity,
): number | undefined {
  if (definition?.defaultDifficulty === undefined) return undefined;
  const stats = statsOf(module, entity);
  const scope: Scope = {
    actor: {
      level: entity.level,
      attr: entity.attributes as Record<string, Value>,
      mod: stats.mod,
      derived: stats.derived,
    },
  };
  const value = evalExpr(definition.defaultDifficulty as Expr, { scope, rng: Rng.fromSeed(0) });
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;
}

/** How much a critical multiplies damage. */
export function criticalMultiplier(module: CompiledModule): number {
  return resolutionOf(module).criticalDamageMultiplier;
}
