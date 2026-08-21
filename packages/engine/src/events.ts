/**
 * Events: what happened.
 *
 * The engine never produces prose. It produces these, and the narrator turns them into text, so the
 * same run can drive a terminal, a browser, a combat log or a test assertion.
 *
 * Two properties:
 *
 *   - Events are facts, not instructions. `Damaged` records that damage was dealt; state is already
 *     updated by the time one exists.
 *   - Events carry their numbers — the dice, the modifiers, the total, and what was being rolled
 *     against — because the arithmetic cannot be reconstructed later.
 */

import type { Position } from './grid/tiles.js';
import type { EntityId } from './state.js';
import type { Message } from './narrate/systemText.js';

/** A roll, recorded in full so it can be explained. */
export interface RollRecord {
  /** Dice notation that was rolled. */
  readonly notation: string;
  /** Individual faces, in order. */
  readonly dice: readonly number[];
  /** The natural roll before modifiers — what a critical is judged on. */
  readonly natural: number;
  /** Everything added to the natural roll. */
  readonly modifier: number;
  readonly total: number;
  /** What it had to beat, when there was a target number. */
  readonly against: number | null;
  readonly outcome: 'success' | 'failure' | 'critical' | 'fumble';
  /** Set when advantage or disadvantage applied. */
  readonly swing: 'advantage' | 'disadvantage' | null;
}

export type GameEvent =
  // — narration ————————————————————————————————————————————
  /** Ask the narrator for prose from a text pool. */
  | { readonly type: 'narrate'; readonly textKey: string; readonly context: Readonly<Record<string, string | number>> }
  /** Literal text the engine already resolved, e.g. an authored line. */
  | { readonly type: 'say'; readonly text: string; readonly speaker: EntityId | null }

  // — refusal ——————————————————————————————————————————————
  /**
   * An action could not be taken, and why. Not an error: refusals are ordinary play. The reason is
   * a `systemText` key and its facts rather than a finished sentence, so the module decides the
   * words.
   */
  | { readonly type: 'refused'; readonly action: string; readonly reason: Message }

  // — movement ——————————————————————————————————————————————
  | { readonly type: 'moved'; readonly entity: EntityId; readonly from: Position; readonly to: Position; readonly cost: number }
  | { readonly type: 'blocked'; readonly entity: EntityId; readonly at: Position; readonly by: string }
  | { readonly type: 'enteredMap'; readonly entity: EntityId; readonly map: string; readonly at: Position }

  // — resolution ————————————————————————————————————————————
  | { readonly type: 'checked'; readonly entity: EntityId; readonly skill: string | null; readonly attribute: string | null; readonly roll: RollRecord }
  | { readonly type: 'saved'; readonly entity: EntityId; readonly save: string; readonly roll: RollRecord }
  | { readonly type: 'attacked'; readonly attacker: EntityId; readonly target: EntityId; readonly ability: string | null; readonly roll: RollRecord }

  // — vitals ————————————————————————————————————————————————
  | {
      readonly type: 'damaged';
      readonly entity: EntityId;
      readonly amount: number;
      readonly damageType: string | null;
      /** Damage before resistance or vulnerability was applied. */
      readonly raw: number;
      readonly resource: string;
      readonly source: EntityId | null;
    }
  | { readonly type: 'healed'; readonly entity: EntityId; readonly amount: number; readonly resource: string }
  | { readonly type: 'resourceChanged'; readonly entity: EntityId; readonly resource: string; readonly from: number; readonly to: number }
  | { readonly type: 'depleted'; readonly entity: EntityId; readonly resource: string }
  | { readonly type: 'died'; readonly entity: EntityId; readonly killer: EntityId | null }

  // — conditions ————————————————————————————————————————————
  | { readonly type: 'conditionApplied'; readonly entity: EntityId; readonly condition: string; readonly duration: number | null; readonly stacked: boolean }
  | { readonly type: 'conditionRemoved'; readonly entity: EntityId; readonly condition: string; readonly reason: 'expired' | 'removed' | 'saved' }
  | { readonly type: 'conditionResisted'; readonly entity: EntityId; readonly condition: string; readonly reason: 'immune' | 'saved' }

  // — inventory —————————————————————————————————————————————
  | { readonly type: 'itemGained'; readonly entity: EntityId; readonly item: string; readonly quantity: number }
  | { readonly type: 'itemLost'; readonly entity: EntityId; readonly item: string; readonly quantity: number }
  | { readonly type: 'itemEquipped'; readonly entity: EntityId; readonly item: string; readonly slot: string }
  | { readonly type: 'itemUnequipped'; readonly entity: EntityId; readonly item: string; readonly slot: string }
  | { readonly type: 'itemUsed'; readonly entity: EntityId; readonly item: string; readonly consumed: boolean }
  /** What a dead creature left on the ground. */
  | {
      readonly type: 'droppedLoot';
      readonly from: EntityId;
      readonly at: Position;
      readonly items: readonly { readonly item: string; readonly quantity: number }[];
    }

  // — traps —————————————————————————————————————————————————
  | { readonly type: 'trapSprung'; readonly trap: string; readonly entity: EntityId; readonly at: Position }
  | { readonly type: 'trapDisarmed'; readonly trap: string; readonly entity: EntityId; readonly at: Position }

  // — progression ———————————————————————————————————————————
  | { readonly type: 'xpGained'; readonly entity: EntityId; readonly amount: number; readonly total: number }
  | { readonly type: 'leveledUp'; readonly entity: EntityId; readonly level: number }

  // — entities ——————————————————————————————————————————————
  | { readonly type: 'spawned'; readonly entity: EntityId; readonly statblock: string; readonly at: Position }
  | { readonly type: 'removed'; readonly entity: EntityId }

  // — combat ————————————————————————————————————————————————
  | { readonly type: 'combatStarted'; readonly participants: readonly EntityId[] }
  | { readonly type: 'combatEnded'; readonly outcome: 'victory' | 'defeat' | 'fled' }
  | { readonly type: 'roundStarted'; readonly round: number }
  | { readonly type: 'turnStarted'; readonly entity: EntityId }
  | { readonly type: 'turnEnded'; readonly entity: EntityId }
  | { readonly type: 'reacted'; readonly entity: EntityId; readonly reaction: string; readonly trigger: string }

  // — casting ———————————————————————————————————————————————
  | { readonly type: 'spellCast'; readonly entity: EntityId; readonly spell: string; readonly slot: number; readonly ritual: boolean }
  | { readonly type: 'concentrationBroken'; readonly entity: EntityId; readonly spell: string }

  // — world —————————————————————————————————————————————————
  | { readonly type: 'timePassed'; readonly minutes: number; readonly totalMinute: number }
  | { readonly type: 'dayBroke'; readonly day: number }
  | { readonly type: 'flagSet'; readonly flag: string; readonly value: unknown }
  | { readonly type: 'reputationChanged'; readonly faction: string; readonly from: number; readonly to: number }
  /** Somebody joined a fight already under way, having just turned on you. */
  | { readonly type: 'joinedCombat'; readonly entity: EntityId }
  /** A creature changed its mind about the party — or somebody changed it. */
  | {
      readonly type: 'dispositionChanged';
      readonly entity: EntityId;
      readonly from: 'ally' | 'neutral' | 'hostile';
      readonly to: 'ally' | 'neutral' | 'hostile';
    }
  | { readonly type: 'currencyChanged'; readonly amount: number; readonly purse: number }
  | {
      readonly type: 'traded';
      readonly npc: EntityId;
      readonly item: string;
      readonly quantity: number;
      readonly price: number;
      /** True when the party bought it, false when they sold it. */
      readonly bought: boolean;
    }
  | { readonly type: 'triggerFired'; readonly trigger: string; readonly at: string }
  | { readonly type: 'gateOpened'; readonly gate: string; readonly how: 'requirement' | 'bypass' | 'ability' }
  | { readonly type: 'gateBlocked'; readonly gate: string; readonly missing: readonly Message[] }
  | { readonly type: 'discovered'; readonly what: string; readonly kind: 'poi' | 'trap' | 'secret' }

  // — narrative —————————————————————————————————————————————
  | { readonly type: 'loreLearned'; readonly entry: string }
  | { readonly type: 'questStarted'; readonly quest: string }
  | { readonly type: 'objectiveCompleted'; readonly quest: string; readonly objective: string }
  | { readonly type: 'questCompleted'; readonly quest: string }
  | { readonly type: 'questFailed'; readonly quest: string; readonly reason: Message }
  | { readonly type: 'dialogueStarted'; readonly npc: EntityId; readonly dialogue: string }
  | { readonly type: 'dialogueNode'; readonly node: string; readonly text: string }
  | { readonly type: 'dialogueEnded' }

  // — society ———————————————————————————————————————————————
  | { readonly type: 'deedDone'; readonly deed: string; readonly kind: string; readonly witnesses: readonly string[] }
  | { readonly type: 'rumourSpread'; readonly deed: string; readonly to: string; readonly hops: number }
  | { readonly type: 'memoryFaded'; readonly npc: string; readonly deed: string }

  // — escape hatch ——————————————————————————————————————————
  /** A custom event emitted by module content via the DSL's `emit`. */
  | { readonly type: 'custom'; readonly event: string; readonly data: Readonly<Record<string, unknown>> }

  // — meta ——————————————————————————————————————————————————
  | { readonly type: 'gameOver'; readonly outcome: 'victory' | 'defeat' };

export type EventType = GameEvent['type'];

/** Narrow to one event type. */
export function isEvent<T extends EventType>(
  event: GameEvent,
  type: T,
): event is Extract<GameEvent, { type: T }> {
  return event.type === type;
}

/** Collect events of one type from a list. */
export function eventsOfType<T extends EventType>(
  events: readonly GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}
