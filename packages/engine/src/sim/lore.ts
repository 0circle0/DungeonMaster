/**
 * What the party has found out.
 *
 * A quest records what somebody told you to do; lore records what you worked out.
 *
 * Three properties decide the shape:
 *
 *   - Learning is permanent and unordered, so state is a flat id → minute map and everything else
 *     here is derived.
 *   - A thread declares its whole set, which is what lets the journal say three of five rather than
 *     listing three facts and implying nothing.
 *   - An unknown entry has no text. `loreByThread` returns the slot and withholds the words, so a
 *     front end cannot accidentally render a clue the party has not earned.
 */

import type { CompiledModule, Value } from '@dm/module';
import type { GameState } from '../state.js';

export interface LoreDef {
  id: string;
  name: string;
  description: string;
  tags: string[];
  textKey?: string;
  source: string;
}

export interface LoreThreadDef {
  id: string;
  name: string;
  description: string;
  entries: string[];
}

export interface LoreEntryView {
  readonly id: string;
  readonly known: boolean;
  /** World minute it was learned, or null while unknown. */
  readonly learnedAt: number | null;
  /** Withheld until known — see the note above. */
  readonly name: string;
  readonly description: string;
  readonly source: string;
  /** A prose pool to expand instead of `name`, when the module wrote one. */
  readonly textKey: string | undefined;
}

export interface LoreThreadView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly known: number;
  readonly total: number;
  readonly entries: readonly LoreEntryView[];
}

const UNKNOWN = { name: '', description: '', source: '', textKey: undefined } as const;

function entryView(module: CompiledModule, state: GameState, id: string): LoreEntryView {
  const learnedAt = state.lore[id];
  const known = learnedAt !== undefined;
  const lore = module.find<LoreDef>('narrative.lore', id);

  return {
    id,
    known,
    learnedAt: known ? learnedAt : null,
    ...(known
      ? {
          // An entry with no authored text still has to say something, so its id reads as a phrase
          // — the same fallback `questview.describe` makes for an objective.
          name: lore?.name ?? id.replace(/_/g, ' '),
          description: lore?.description ?? '',
          source: lore?.source ?? '',
          textKey: lore?.textKey,
        }
      : UNKNOWN),
  };
}

/**
 * Every thread the module declares, and how far along it the party is. Threads with nothing known
 * are still returned: the point of an empty thread is that its heading is the only thing you have.
 */
export function loreByThread(module: CompiledModule, state: GameState): readonly LoreThreadView[] {
  return module.all<LoreThreadDef>('narrative.loreThreads').map((thread) => {
    const entries = thread.entries.map((id) => entryView(module, state, id));
    return {
      id: thread.id,
      name: thread.name,
      description: thread.description,
      known: entries.filter((entry) => entry.known).length,
      total: entries.length,
      entries,
    };
  });
}

/**
 * Known entries belonging to no thread, newest first. Loose lore is the module's business rather
 * than a mistake. Unknown ones are omitted rather than listed as blanks, because with no heading
 * over them a row of blanks says nothing.
 */
export function looseLore(module: CompiledModule, state: GameState): readonly LoreEntryView[] {
  const claimed = new Set(
    module.all<LoreThreadDef>('narrative.loreThreads').flatMap((thread) => thread.entries),
  );

  return module
    .all<LoreDef>('narrative.lore')
    .filter((lore) => !claimed.has(lore.id) && lore.id in state.lore)
    .map((lore) => entryView(module, state, lore.id))
    .sort((a, b) => (b.learnedAt ?? 0) - (a.learnedAt ?? 0) || a.id.localeCompare(b.id));
}

/**
 * Thread progress as the DSL sees it. Populated for every declared thread rather than only the
 * started ones, so `threads` is a closed namespace and a misspelled id is a loud error rather than
 * a silent zero.
 */
export function threadScope(module: CompiledModule, state: GameState): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const thread of module.all<LoreThreadDef>('narrative.loreThreads')) {
    const known = thread.entries.filter((id) => id in state.lore).length;
    out[thread.id] = { known, total: thread.entries.length };
  }
  return out;
}
