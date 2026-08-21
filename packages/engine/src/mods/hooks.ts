/** The hook contract: the whole surface a mod attaches to. */

import type { Action } from '../actions.js';
import type { GameEvent } from '../events.js';
import type { EntityId } from '../state.js';

export type HookName =
  /** Before the action switch. */
  | 'action.before'
  /** After the action switch, before the rng is written back. */
  | 'action.after'
  /**
   * An effect op the engine does not implement. The branch already existed to refuse unknown ops,
   * so a mod can add a genuinely new effect op — usable from module JSON, editable in the studio —
   * with no core change.
   */
  | 'applyOp'
  /** An occasion firing, before the module's own triggers run. */
  | 'occasion'
  /**
   * After a reduction settles: perception, combat start/stop, AI turns, and the victory and defeat
   * checks have all run.
   *
   * No `replace`. `settle` enforces the invariants that keep a game coherent. A mod that wants to
   * stand in for them can do it from `action.before` with `replace`, where the intent is explicit.
   */
  | 'settle.after'
  /** After the world clock advances, once per call rather than per minute. */
  | 'time.after'
  /** Whether a module trigger fires. `replace` decides it outright. */
  | 'trigger.shouldFire'
  /** After an entity's passive traits and item procs are evaluated. */
  | 'passives'
  /** A creature's chance to react, alongside its statblock's own reactions. */
  | 'reactions'
  /**
   * Every event, as it is emitted. Fires hundreds of times a turn, so a declaration must carry a
   * `match` naming the event type — an unfiltered one would put a WASM crossing on every event in
   * the game.
   */
  | 'event.emit';

export const HOOK_NAMES: readonly HookName[] = [
  'action.before',
  'action.after',
  'applyOp',
  'occasion',
  'settle.after',
  'time.after',
  'trigger.shouldFire',
  'passives',
  'reactions',
  'event.emit',
];

/** Hooks that must be narrowed, because unfiltered they would be ruinous. */
export const MUST_MATCH: readonly HookName[] = ['event.emit'];

export function isHookName(value: string): value is HookName {
  return (HOOK_NAMES as readonly string[]).includes(value);
}

/** World facts every hook gets. */
export interface HookNow {
  readonly minute: number;
  readonly day: number;
  readonly map: string;
  readonly outcome: string;
}

export interface HookSubjects {
  'action.before': { readonly action: Action; readonly actorId: EntityId };
  'action.after': {
    readonly action: Action;
    readonly actorId: EntityId;
    readonly events: readonly GameEvent['type'][];
  };
  applyOp: { readonly op: Record<string, unknown> };
  occasion: {
    readonly occasion: string;
    readonly customEvent: string | null;
    readonly sourceId: string | null;
    readonly sourceKind: string | null;
  };
  'settle.after': { readonly inCombat: boolean; readonly outcome: string };
  'time.after': {
    readonly minutes: number;
    readonly totalMinute: number;
    readonly daysCrossed: number;
  };
  'trigger.shouldFire': {
    readonly triggerId: string;
    readonly occasion: string;
    readonly actorId: EntityId;
    readonly willFire: boolean;
  };
  passives: { readonly entityId: EntityId };
  reactions: {
    readonly reactorId: EntityId;
    readonly trigger: string;
    readonly subjectId: EntityId | null;
  };
  'event.emit': { readonly event: GameEvent };
}

/** The narrowing key for a hook, matched against a declaration's `match`. */
export function matchKeyFor<K extends HookName>(hook: K, subject: HookSubjects[K]): string | undefined {
  switch (hook) {
    case 'action.before':
    case 'action.after':
      return (subject as HookSubjects['action.before']).action.type;
    case 'applyOp':
      return (subject as HookSubjects['applyOp']).op['op'] as string | undefined;
    case 'occasion': {
      const s = subject as HookSubjects['occasion'];
      return s.customEvent ?? s.occasion;
    }
    case 'trigger.shouldFire':
      return (subject as HookSubjects['trigger.shouldFire']).occasion;
    case 'reactions':
      return (subject as HookSubjects['reactions']).trigger;
    case 'event.emit':
      return (subject as HookSubjects['event.emit']).event.type;
    case 'settle.after':
    case 'time.after':
    case 'passives':
      // Fires once per reduction, so a crossing per call is affordable.
      return undefined;
    default:
      return undefined;
  }
}

/** What a hook run did, so the call site knows whether to run the core path. */
export interface HookOutcome {
  /** A `replace` handler stood in for the core implementation. */
  readonly replaced: boolean;
  /** A handler refused the action. */
  readonly refused: boolean;
}

export const NO_HOOK_OUTCOME: HookOutcome = { replaced: false, refused: false };
