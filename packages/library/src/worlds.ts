/**
 * Worlds, as the user's own property.
 *
 * Everything in the library belongs to whoever is sitting there. The shipped
 * examples are not in it until they ask for one, and the moment they do it is
 * an ordinary world they can edit, rename and delete — there is no read-only
 * state anywhere, because an example that cannot be changed is not an example
 * of what can be built.
 */

import { compileModule, hashModule } from '@dm/module';
import { gzipJson, gunzipJson } from './gzip.js';
import type { WorldEnvelope } from './envelope.js';
import { isQuotaError, OUT_OF_SPACE, requestPersistence } from './quota.js';
import {
  openLibrary, tx, get, getAll, remove,
  WORLDS, PAYLOADS, DRAFTS, META,
} from './db.js';
import type { WorldMeta, PayloadRecord, DraftRecord } from './db.js';

export type { WorldMeta } from './db.js';

/** A uuid, with a fallback for the odd context that has no crypto. */
function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `w-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Worlds, newest first, without inflating a single payload. */
export async function listWorlds(): Promise<WorldMeta[]> {
  const db = await openLibrary();
  const all = await getAll<WorldMeta>(db, WORLDS);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readWorld(key: string): Promise<{ meta: WorldMeta; envelope: WorldEnvelope } | null> {
  const db = await openLibrary();
  const meta = await get<WorldMeta>(db, WORLDS, key);
  const payload = await get<PayloadRecord>(db, PAYLOADS, key);
  if (!meta || !payload) return null;
  const envelope = await gunzipJson<WorldEnvelope>(payload.bytes);
  return { meta, envelope };
}

function describe(envelope: WorldEnvelope): { moduleId: string; version: string; description: string; hash: string | null } {
  const doc = envelope.doc;
  const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
  const compiled = compileModule(doc);
  return {
    moduleId: typeof doc['id'] === 'string' ? doc['id'] : 'untitled',
    version: typeof doc['version'] === 'string' ? doc['version'] : '0.0.0',
    description: typeof meta['description'] === 'string' ? meta['description'] : '',
    // A world that does not compile is still worth storing — that is most of
    // what a half-finished one is — so the hash is simply absent for it.
    hash: compiled.ok ? hashModule(compiled.module.source) : null,
  };
}

/**
 * Store a world.
 *
 * The compression happens *before* the transaction opens. An IndexedDB
 * transaction commits as soon as the microtask queue drains, so awaiting a
 * compression stream inside one ends in `TransactionInactiveError` — a failure
 * that is invisible in the code and reliable in production.
 *
 * Metadata and payload go in one transaction, so there is no state where a
 * world's size says one thing and its bytes another.
 */
export async function writeWorld(
  key: string,
  envelope: WorldEnvelope,
  previous?: WorldMeta,
): Promise<WorldMeta> {
  const { bytes, codec, rawBytes } = await gzipJson(envelope);
  const db = await openLibrary();
  const now = Date.now();
  const facts = describe(envelope);

  const meta: WorldMeta = {
    key,
    moduleId: facts.moduleId,
    version: facts.version,
    title: envelope.title,
    description: facts.description,
    filename: envelope.filename,
    origin: previous?.origin ?? 'created',
    originId: previous?.originId ?? null,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    storedBytes: bytes.length,
    rawBytes,
    hash: facts.hash,
  };
  const payload: PayloadRecord = { key, codec, bytes, rawBytes };

  try {
    await tx(db, [WORLDS, PAYLOADS], 'readwrite', (t) => {
      t.objectStore(WORLDS).put(meta);
      t.objectStore(PAYLOADS).put(payload);
    });
  } catch (err) {
    if (isQuotaError(err)) throw new Error(OUT_OF_SPACE);
    throw err;
  }

  // Asked here, on a real write, rather than on load — see `quota.ts`.
  void requestPersistence();
  return meta;
}

export async function createWorld(
  envelope: WorldEnvelope,
  origin: WorldMeta['origin'] = 'created',
  originId: string | null = null,
): Promise<WorldMeta> {
  const key = newKey();
  const now = Date.now();
  const seed = { origin, originId, createdAt: now } as WorldMeta;
  return writeWorld(key, envelope, seed);
}

export async function deleteWorld(key: string): Promise<void> {
  const db = await openLibrary();
  await tx(db, [WORLDS, PAYLOADS, DRAFTS], 'readwrite', (t) => {
    t.objectStore(WORLDS).delete(key);
    t.objectStore(PAYLOADS).delete(key);
    t.objectStore(DRAFTS).delete(key);
  });
}

export async function renameWorld(key: string, title: string): Promise<WorldMeta | null> {
  const existing = await readWorld(key);
  if (!existing) return null;
  return writeWorld(key, { ...existing.envelope, title }, existing.meta);
}

/**
 * Work that does not yet validate.
 *
 * Separate from the world itself for the same reason the studio always kept it
 * separate on disk: the document a game loads has to stay loadable, and a
 * half-typed id is a normal state of a text box. The draft is what makes
 * autosave safe to run against a broken document instead of refusing to.
 */
export async function writeDraft(key: string, doc: Record<string, unknown>): Promise<void> {
  const { bytes, codec } = await gzipJson(doc);
  const db = await openLibrary();
  const record: DraftRecord = { key, savedAt: Date.now(), codec, bytes };
  try {
    await tx(db, [DRAFTS], 'readwrite', (t) => { t.objectStore(DRAFTS).put(record); });
  } catch (err) {
    if (isQuotaError(err)) throw new Error(OUT_OF_SPACE);
    throw err;
  }
}

export async function readDraft(key: string): Promise<{ savedAt: number; doc: Record<string, unknown> } | null> {
  const db = await openLibrary();
  const record = await get<DraftRecord>(db, DRAFTS, key);
  if (!record) return null;
  return { savedAt: record.savedAt, doc: await gunzipJson<Record<string, unknown>>(record.bytes) };
}

export async function clearDraft(key: string): Promise<void> {
  const db = await openLibrary();
  await remove(db, DRAFTS, key);
}

/** Which world was open last, so reopening the app resumes rather than guesses. */
export async function rememberLastOpened(key: string | null): Promise<void> {
  const db = await openLibrary();
  await tx(db, [META], 'readwrite', (t) => { t.objectStore(META).put({ k: 'lastOpened', v: key }); });
}

export async function lastOpened(): Promise<string | null> {
  const db = await openLibrary();
  const row = await get<{ k: string; v: string | null }>(db, META, 'lastOpened');
  return row?.v ?? null;
}
