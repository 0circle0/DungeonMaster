/** Worlds: create, read, list, rename and delete the rows in the library. */

import { compileModule, hashModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { gzipJson, gunzipJson } from './gzip.js';
import type { WorldEnvelope } from './envelope.js';
import { isQuotaError, OUT_OF_SPACE, requestPersistence } from './quota.js';
import {
  openLibrary, tx, get, getAll, getRange, put, worldRange,
  WORLDS, PAYLOADS, FILES, META,
} from './db.js';
import type { WorldMeta, PayloadRecord, FileRecord } from './db.js';

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

/** One world's metadata. */
export async function readWorldMeta(key: string): Promise<WorldMeta | null> {
  const db = await openLibrary();
  return (await get<WorldMeta>(db, WORLDS, key)) ?? null;
}

export async function readWorld(key: string): Promise<{ meta: WorldMeta; envelope: WorldEnvelope } | null> {
  const db = await openLibrary();
  const meta = await get<WorldMeta>(db, WORLDS, key);
  const payload = await get<PayloadRecord>(db, PAYLOADS, key);
  if (!meta || !payload) return null;
  const envelope = await gunzipJson<WorldEnvelope>(payload.bytes);
  return { meta, envelope };
}

export interface WorldFacts {
  readonly moduleId: string;
  readonly version: string;
  readonly description: string;
  readonly hash: string | null;
}

/** The facts the switcher needs about a document, without opening it. */
export function factsFor(
  doc: Record<string, unknown>,
  compiled?: CompiledModule | null,
): WorldFacts {
  const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
  const module = compiled === undefined
    ? (() => { const result = compileModule(doc); return result.ok ? result.module : null; })()
    : compiled;
  return {
    moduleId: typeof doc['id'] === 'string' ? doc['id'] : 'untitled',
    version: typeof doc['version'] === 'string' ? doc['version'] : '0.0.0',
    description: typeof meta['description'] === 'string' ? meta['description'] : '',
    // A world that does not compile has no hash.
    hash: module ? hashModule(module.source) : null,
  };
}

/** Stores a world. */
export async function writeWorld(
  key: string,
  envelope: WorldEnvelope,
  previous?: WorldMeta,
  known?: WorldFacts,
): Promise<WorldMeta> {
  const { bytes, codec, rawBytes } = await gzipJson(envelope);
  const db = await openLibrary();
  const now = Date.now();
  const facts = known ?? factsFor(envelope.doc);

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

  // Requested on a real write rather than on load — see `quota.ts`.
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
  await tx(db, [WORLDS, PAYLOADS, FILES], 'readwrite', (t) => {
    t.objectStore(WORLDS).delete(key);
    t.objectStore(PAYLOADS).delete(key);
    // One range rather than one call per file.
    t.objectStore(FILES).delete(worldRange(key));
  });
}

/** A new title, and nothing else touched. */
export async function renameWorld(key: string, title: string): Promise<WorldMeta | null> {
  const db = await openLibrary();
  const meta = await get<WorldMeta>(db, WORLDS, key);
  if (!meta) return null;
  const next: WorldMeta = { ...meta, title, updatedAt: Date.now() };
  await put(db, WORLDS, next);
  return next;
}

/** Every file of a world, by path. */
export async function readWorldFiles(key: string): Promise<Record<string, string>> {
  const db = await openLibrary();
  const records = await getRange<FileRecord>(db, FILES, worldRange(key));
  const files: Record<string, string> = {};
  for (const record of records) files[record.path] = record.text;
  return files;
}

/** What a save has to do to the store, and nothing more. */
export interface FileChange {
  readonly put: Readonly<Record<string, string>>;
  readonly remove: readonly string[];
  /** Also delete every record not in `put` — a document replaced wholesale. */
  readonly sweep?: boolean;
}

/** Write the files that changed: editing one integer puts one record. */
export async function writeWorldFiles(
  key: string,
  change: FileChange,
  patch: { facts: WorldFacts; title: string; storedBytes: number },
  previous: WorldMeta,
): Promise<WorldMeta> {
  const db = await openLibrary();
  const meta: WorldMeta = {
    ...previous,
    key,
    moduleId: patch.facts.moduleId,
    version: patch.facts.version,
    description: patch.facts.description,
    hash: patch.facts.hash,
    title: patch.title,
    updatedAt: Date.now(),
    storedBytes: patch.storedBytes,
    rawBytes: patch.storedBytes,
  };

  try {
    await tx(db, [WORLDS, FILES], 'readwrite', (t) => {
      const files = t.objectStore(FILES);
      if (change.sweep) files.delete(worldRange(key));
      for (const path of change.remove) files.delete([key, path]);
      for (const [path, text] of Object.entries(change.put)) {
        files.put({ world: key, path, text } satisfies FileRecord);
      }
      t.objectStore(WORLDS).put(meta);
    });
  } catch (err) {
    if (isQuotaError(err)) throw new Error(OUT_OF_SPACE);
    throw err;
  }

  void requestPersistence();
  return meta;
}

/** A world that arrives as files — which, in the studio, is all of them. */
export async function createWorldFromFiles(
  files: Readonly<Record<string, string>>,
  seed: {
    title: string;
    filename: string;
    facts: WorldFacts;
    origin?: WorldMeta['origin'];
    originId?: string | null;
  },
): Promise<WorldMeta> {
  const key = newKey();
  const now = Date.now();
  const bytes = Object.values(files).reduce((total, text) => total + text.length, 0);
  return writeWorldFiles(
    key,
    { put: files, remove: [], sweep: true },
    { facts: seed.facts, title: seed.title, storedBytes: bytes },
    {
      key,
      moduleId: seed.facts.moduleId,
      version: seed.facts.version,
      title: seed.title,
      description: seed.facts.description,
      filename: seed.filename,
      origin: seed.origin ?? 'created',
      originId: seed.originId ?? null,
      createdAt: now,
      updatedAt: now,
      storedBytes: bytes,
      rawBytes: bytes,
      hash: seed.facts.hash,
    },
  );
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
