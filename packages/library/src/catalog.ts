/**
 * The examples a deployment happens to be carrying.
 *
 * Everything here is optional by design. There may be no catalog, no artifact
 * behind an entry, no network, or no `content/` directory at all — a deployment
 * that ships nothing but the app is a supported configuration, because the
 * library is the source of truth and these files are only a seed. So nothing in
 * this file throws: the worst case is an empty list and a quiet line in the UI,
 * never an error screen in front of somebody who only wanted to open their own
 * world.
 */

import { gunzipJson } from './gzip.js';
import { isEnvelope, envelopeFromDoc } from './envelope.js';
import { isProjectBundle } from './files.js';
import type { WorldEnvelope } from './envelope.js';

export interface CatalogEntry {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  /** `extends` target, so a chain can be fetched before compiling. */
  readonly extends: string | null;
  /** Compressed transfer size, so the UI can say what a click will cost. */
  readonly storedBytes: number;
  /** Minified size, which is what it occupies once inflated. */
  readonly rawBytes: number;
  readonly hash: string;
}

export interface Catalog {
  readonly format: number;
  readonly modules: readonly CatalogEntry[];
}

export const EMPTY_CATALOG: Catalog = { format: 1, modules: [] };

/** Where the artifacts live, relative to the app root. */
export const CONTENT_BASE = '/content';

function looksLikeCatalog(value: unknown): value is Catalog {
  return (
    typeof value === 'object' && value !== null &&
    Array.isArray((value as { modules?: unknown }).modules)
  );
}

/**
 * The catalog, or an empty one.
 *
 * A 404, a parse failure, a captive-portal HTML page, being offline — all the
 * same answer. There is nothing a caller could usefully do differently, and
 * every one of them ends in "this deployment has no examples".
 */
export async function fetchCatalog(base: string = CONTENT_BASE): Promise<Catalog> {
  try {
    const response = await fetch(`${base}/catalog.json`, { cache: 'no-cache' });
    if (!response.ok) return EMPTY_CATALOG;
    const parsed: unknown = await response.json();
    return looksLikeCatalog(parsed) ? parsed : EMPTY_CATALOG;
  } catch {
    return EMPTY_CATALOG;
  }
}

/**
 * One example, inflated and wrapped.
 *
 * Null rather than a throw when it is not there: an entry can outlive its
 * artifact, and "Aurendel isn't available on this server" is one line next to a
 * button, not a broken page.
 */
export async function fetchExampleEnvelope(
  id: string,
  base: string = CONTENT_BASE,
): Promise<WorldEnvelope | null> {
  try {
    const response = await fetch(`${base}/${id}.json.gz`, { cache: 'no-cache' });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const parsed = await gunzipJson<unknown>(bytes);
    if (isEnvelope(parsed)) return parsed;
    // A plain document is just as loadable; only the wrapper is missing.
    if (typeof parsed === 'object' && parsed !== null) {
      return envelopeFromDoc(parsed as Record<string, unknown>, id);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * One example as the project it is.
 *
 * What the studio fetches, because what the studio edits is files. The player
 * takes `<id>.json.gz` — the compiled module — from the function above; these
 * are two artifacts of one world and each app gets the one it can use.
 */
export async function fetchExampleProject(
  id: string,
  base: string = CONTENT_BASE,
): Promise<Record<string, string> | null> {
  try {
    const response = await fetch(`${base}/${id}.project.json.gz`, { cache: 'no-cache' });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const parsed = await gunzipJson<unknown>(bytes);
    return isProjectBundle(parsed) ? parsed.files : null;
  } catch {
    return null;
  }
}
