/** The example catalog a deployment ships under `content/`. */

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

/** Fetches the catalog under `base`. */
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

/** Fetches one example as an envelope. */
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
    // A bare document rather than an envelope.
    if (typeof parsed === 'object' && parsed !== null) {
      return envelopeFromDoc(parsed as Record<string, unknown>, id);
    }
    return null;
  } catch {
    return null;
  }
}

/** Fetches one example as its project files, which is what the studio edits. */
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
