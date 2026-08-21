/** Resolves a document's `extends` chain against the files a deployment carries. */

import { resolveExtends } from '@dm/module';
import { fetchExampleEnvelope, CONTENT_BASE } from './catalog.js';
import type { Catalog } from './catalog.js';

/** How deep a chain may go before it is certainly a cycle. */
const MAX_DEPTH = 8;

export interface ResolveOutcome {
  readonly ok: boolean;
  readonly doc: Record<string, unknown>;
  readonly error: string | null;
}

/** Fetches every source a document's `extends` chain names and merges them. */
export async function resolveExtendsFor(
  doc: Record<string, unknown>,
  catalog: Catalog,
  base: string = CONTENT_BASE,
): Promise<ResolveOutcome> {
  if (typeof doc['extends'] !== 'string') return { ok: true, doc, error: null };

  const bases = new Map<string, Record<string, unknown>>();
  let want = doc['extends'];

  for (let depth = 0; depth < MAX_DEPTH && want; depth += 1) {
    const id = want.split('@')[0] ?? want;
    if (bases.has(want)) break;

    const entry = catalog.modules.find((m) => m.id === id);
    if (!entry) {
      return { ok: false, doc, error: `this world extends "${want}", which is not available here` };
    }
    const envelope = await fetchExampleEnvelope(entry.id, base);
    if (!envelope) {
      return { ok: false, doc, error: `this world extends "${want}", which could not be loaded` };
    }
    bases.set(want, envelope.doc);
    const next = envelope.doc['extends'];
    want = typeof next === 'string' ? next : '';
  }

  const resolved = resolveExtends(doc, (identity: string) => bases.get(identity));
  if (!resolved.ok) {
    return { ok: false, doc, error: resolved.error };
  }
  return { ok: true, doc: resolved.document, error: null };
}
