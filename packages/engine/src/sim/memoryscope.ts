/** What is remembered, as something the DSL can read. */

import type { CompiledModule, Value } from '@dm/module';
import type { Deed, Entity, GameState } from '../state.js';
import { memoryKeyOf } from '../state.js';
import { dateOf } from './clock.js';

/** What the DSL sees for one remembered deed kind. */
export interface RecalledDeed extends Record<string, Value> {
  /** When it happened, as a day index matching `world.day`; records store `state.minute`. */
  readonly at: number;
  /** The raw minute, for content that wants finer arithmetic than a day. */
  readonly atMinute: number;
  /** 0..1, decaying on the module's forgetting curve. */
  readonly strength: number;
  /** How many retellings away from having seen it. */
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

/** The `memory` namespace for a scope. */
export function memoryScope(
  module: CompiledModule,
  state: GameState,
  subject: Entity,
): Record<string, Value> {
  const toDay = (minute: number) => dateOf(module, minute).day;
  const out: Record<string, Value> = {};

  const own = () => strongestByKind(state.deeds, state.memory[memoryKeyOf(subject)], toDay);

  // What this person knows.
  lazily(out, 'speaker', own);
  lazily(out, 'self', own);

  // What the party did: witnesses never include characters.
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

  // Anybody at all knows it.
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
