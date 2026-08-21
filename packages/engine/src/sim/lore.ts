/** What the party has found out. */

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
          // An entry with no authored text reads its id as a phrase.
          name: lore?.name ?? id.replace(/_/g, ' '),
          description: lore?.description ?? '',
          source: lore?.source ?? '',
          textKey: lore?.textKey,
        }
      : UNKNOWN),
  };
}

/** Every thread the module declares, and how far along it the party is. */
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

/** Known entries belonging to no thread, newest first. */
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

/** Thread progress as the DSL sees it. */
export function threadScope(module: CompiledModule, state: GameState): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const thread of module.all<LoreThreadDef>('narrative.loreThreads')) {
    const known = thread.entries.filter((id) => id in state.lore).length;
    out[thread.id] = { known, total: thread.entries.length };
  }
  return out;
}
