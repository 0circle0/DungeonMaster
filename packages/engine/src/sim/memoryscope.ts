/**
 * What is remembered, as something the DSL can read.
 *
 * `requirement.memories` compiles to `{exists: "memory.<who>.<deedKind>"}`, so a gate on what
 * somebody remembers is only as good as the `memory` namespace in scope.
 *
 * Two things make this cheap enough to put in `buildScope`, which runs several times per entity per
 * turn:
 *
 *   * The five `who` keys are getters, memoized on first read, so a scope built for something that
 *     never mentions memory costs one object literal.
 *   * `memory` is a plain object whose keys are getters, not a getter called `memory`. Eight call
 *     sites do `{ ...buildScope(...) }`; a shallow spread copies the reference and the inner
 *     getters survive it.
 *
 * `lookup()` in the DSL walks the scope with plain property access, so a getter is invisible to it.
 */

import type { CompiledModule, Value } from '@dm/module';
import type { Deed, Entity, GameState } from '../state.js';
import { memoryKeyOf } from '../state.js';
import { dateOf } from './clock.js';

/** What the DSL sees for one remembered deed kind. */
export interface RecalledDeed extends Record<string, Value> {
  /**
   * When it happened, as a day index — the same units as `world.day`, so `requirement.withinDays`
   * subtracts like with like. The records themselves store `state.minute`.
   */
  readonly at: number;
  /** The raw minute, for content that wants finer arithmetic than a day. */
  readonly atMinute: number;
  /** 0..1, decaying on the module's forgetting curve. */
  readonly strength: number;
  /** How many retellings away from having seen it. 0 means they were there. */
  readonly hops: number;
}

type Recollection = Record<string, RecalledDeed>;

/** The strongest record each holder has of every deed kind they know. */
function strongestByKind(
  deeds: readonly Deed[],
  held: Record<string, { at: number; strength: number; hops: number }> | undefined,
  toDay: (minute: number) => number,
  into: Recollection = {},
): Recollection {
  if (!held) return into;
  for (const [deedId, record] of Object.entries(held)) {
    const deed = deeds.find((entry) => entry.id === deedId);
    if (!deed) continue;
    const current = into[deed.kind];
    if (current && current.strength >= record.strength) continue;
    into[deed.kind] = {
      at: toDay(record.at),
      atMinute: record.at,
      strength: record.strength,
      hops: record.hops,
    };
  }
  return into;
}

/** Memoize a zero-argument builder behind a property. */
function lazily(target: Record<string, Value>, key: string, build: () => Recollection): void {
  let cached: Recollection | undefined;
  Object.defineProperty(target, key, {
    enumerable: true,
    get() {
      cached ??= build();
      return cached;
    },
  });
}

/**
 * The `memory` namespace for a scope. `subject` is whose recollection `speaker` means: the person
 * being talked to in a conversation, the reactor in a reaction, and otherwise the actor the scope
 * was built for.
 */
export function memoryScope(
  module: CompiledModule,
  state: GameState,
  subject: Entity,
): Record<string, Value> {
  const toDay = (minute: number) => dateOf(module, minute).day;
  const out: Record<string, Value> = {};

  const own = () => strongestByKind(state.deeds, state.memory[memoryKeyOf(subject)], toDay);

  // What this person knows. `self` is the same thing under a name that reads properly outside a
  // conversation.
  lazily(out, 'speaker', own);
  lazily(out, 'self', own);

  // What the party did, rather than what it knows: witnesses never include characters (`deeds.ts`
  // skips them), so "the party saw it" is not something the simulation records.
  lazily(out, 'party', () => {
    const mine = new Set(state.party);
    const into: Recollection = {};
    for (const deed of state.deeds) {
      if (!mine.has(deed.actor)) continue;
      const current = into[deed.kind];
      if (current && current.atMinute >= deed.at) continue;
      into[deed.kind] = {
        at: toDay(deed.at),
        atMinute: deed.at,
        strength: 1,
        hops: 0,
      };
    }
    return into;
  });

  // Anybody at all knows it. Distinct from the speaker, or "word has got around" would be
  // indistinguishable from "this one person saw you".
  lazily(out, 'anyone', () => {
    const into: Recollection = {};
    for (const held of Object.values(state.memory)) {
      strongestByKind(state.deeds, held, toDay, into);
    }
    return into;
  });

  // What the subject's own people know.
  lazily(out, 'faction', () => {
    const faction = module.find<{ faction?: string }>(
      'content.npcs', memoryKeyOf(subject))?.faction;
    const into: Recollection = {};
    if (!faction) return into;
    for (const npc of module.all<{ id: string; faction?: string }>('content.npcs')) {
      if (npc.faction !== faction) continue;
      strongestByKind(state.deeds, state.memory[npc.id], toDay, into);
    }
    return into;
  });

  return out;
}
