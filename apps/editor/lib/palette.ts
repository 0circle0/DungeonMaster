/** Everything in the module, one keystroke away. */

import { COLLECTIONS, SECTIONS, labelFor } from './schema';
import { VIEW_LABELS } from '@/app/studio/selection';
import type { ViewId } from '@/app/studio/selection';
import type { ModuleDoc } from './store';

export type Command =
  | { readonly kind: 'entry'; readonly id: string; readonly label: string; readonly hint: string; readonly collection: string; readonly index: number }
  | { readonly kind: 'collection'; readonly id: string; readonly label: string; readonly hint: string; readonly path: string }
  | { readonly kind: 'view'; readonly id: string; readonly label: string; readonly hint: string; readonly view: ViewId }
  | { readonly kind: 'action'; readonly id: string; readonly label: string; readonly hint: string; readonly run: () => void };

/** A subsequence match, scored so the obvious answer comes first. */
export function score(haystack: string, needle: string): number {
  if (needle === '') return 1;
  const text = haystack.toLowerCase();
  const want = needle.toLowerCase();

  if (text === want) return 1000;
  if (text.startsWith(want)) return 500 - text.length;

  const at = text.indexOf(want);
  if (at >= 0) {
    // A match at a word boundary scores higher than one mid-word.
    const boundary = at === 0 || /[\s_.:-]/.test(text[at - 1] ?? '');
    return (boundary ? 300 : 150) - at;
  }

  // Letters in order but not together — `boghou` against `bog_hound`.
  let i = 0;
  let gaps = 0;
  for (const char of text) {
    if (char === want[i]) {
      i += 1;
      if (i === want.length) return 80 - Math.min(gaps, 60);
    } else if (i > 0) {
      gaps += 1;
    }
  }
  return 0;
}

/** Every place worth going, built once per document. */
export function buildCommands(doc: ModuleDoc, actions: readonly Command[]): readonly Command[] {
  const out: Command[] = [...actions];

  for (const section of SECTIONS) {
    for (const collection of section.collections) {
      out.push({
        kind: 'collection',
        id: `open:${collection.path}`,
        label: collection.label,
        hint: collection.path,
        path: collection.path,
      });
    }
  }

  for (const view of Object.keys(VIEW_LABELS) as ViewId[]) {
    out.push({ kind: 'view', id: `view:${view}`, label: VIEW_LABELS[view], hint: 'view', view });
  }

  for (const collection of COLLECTIONS) {
    const [section, name] = collection.path.split('.') as [string, string];
    const entries = (doc[section] as Record<string, unknown> | undefined)?.[name];
    if (!Array.isArray(entries)) continue;

    entries.forEach((raw, index) => {
      const entry = raw as Record<string, unknown>;
      const id = typeof entry['id'] === 'string' ? entry['id'] : '';
      if (!id) return;
      out.push({
        kind: 'entry',
        id: `${collection.path}:${id}`,
        label: typeof entry['name'] === 'string' && entry['name'] ? entry['name'] : id,
        hint: `${labelFor(name)} · ${id}`,
        collection: collection.path,
        index,
      });
    });
  }

  return out;
}

/** The best few matches. */
export function search(commands: readonly Command[], query: string, limit = 30): readonly Command[] {
  const trimmed = query.trim();
  if (trimmed === '') {
    return commands.filter((c) => c.kind === 'action' || c.kind === 'view').slice(0, limit);
  }

  const RANK = { entry: 3, action: 2, collection: 1, view: 0 } as const;

  return commands
    .map((command) => ({
      command,
      // The id carries the collection, so `monsters bog` narrows the same way.
      score: Math.max(score(command.label, trimmed), score(command.id, trimmed)),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) =>
      b.score !== a.score ? b.score - a.score : RANK[b.command.kind] - RANK[a.command.kind],
    )
    .slice(0, limit)
    .map((row) => row.command);
}
