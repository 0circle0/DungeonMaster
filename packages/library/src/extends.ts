/**
 * `extends`, resolved against whatever the deployment is carrying.
 *
 * Nothing ships with a base today — every module is standalone, because the
 * linter schema-checks a raw child before resolving the merge, so a module that
 * leans on its parent for `rules` fails validation before the merge can help
 * it. Aurendel's build script copies the ruleset in for exactly that reason.
 *
 * This exists anyway, because a stored world is stored *unresolved*: baking a
 * base into a document the studio then saves would corrupt it permanently, so
 * the resolution has to happen between reading and compiling, every time.
 */

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

/**
 * Fetch whatever a document's `extends` chain needs, then merge it.
 *
 * The fetching is the async part and the merging is the existing synchronous
 * `resolveExtends`, unchanged — this only supplies it a loader whose sources
 * are static files instead of a directory.
 */
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
