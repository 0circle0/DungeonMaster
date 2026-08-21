/** IndexedDB schema for the library and world storage. */

import type { Codec } from './gzip.js';

export const DB_NAME = 'dm.library';
export const DB_VERSION = 2;

export const WORLDS = 'worlds';
export const PAYLOADS = 'payloads';
export const FILES = 'files';
export const SAVES = 'saves';
export const META = 'meta';

/** World metadata stored alongside the project files and payloads. */
export interface WorldMeta {
  /** Unique world key, not the module id. */
  readonly key: string;
  readonly moduleId: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly filename: string;
  /** How the world was created or imported. */
  readonly origin: 'created' | 'imported' | 'example';
  /** Catalog id for offering the world again after deletion. */
  readonly originId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly storedBytes: number;
  readonly rawBytes: number;
  /** Module hash when the document compiles; null otherwise. */
  readonly hash: string | null;
}

export interface PayloadRecord {
  readonly key: string;
  readonly codec: Codec;
  readonly bytes: Uint8Array;
  readonly rawBytes: number;
}

/** One project file stored for a world. */
export interface FileRecord {
  readonly world: string;
  readonly path: string;
  readonly text: string;
}

/** Key range covering every file record for a single world. */
export function worldRange(key: string): IDBKeyRange {
  return IDBKeyRange.bound([key], [key, []]);
}

/** Convert a DOMException into an Error while preserving the original name. */
function asError(cause: DOMException | null, fallback: string): Error {
  if (!cause) return new Error(fallback);
  const error = new Error(cause.message || fallback);
  error.name = cause.name;
  return error;
}

let opening: Promise<IDBDatabase> | null = null;

/** Return true when IndexedDB is available in this environment. */
export function hasStorage(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openLibrary(): Promise<IDBDatabase> {
  if (!hasStorage()) return Promise.reject(new Error('no IndexedDB in this environment'));
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      // Version ladder: each block runs when the stored version is below it.
      if (event.oldVersion < 1) {
        const worlds = db.createObjectStore(WORLDS, { keyPath: 'key' });
        worlds.createIndex('byUpdatedAt', 'updatedAt');
        worlds.createIndex('byModuleId', 'moduleId');
        db.createObjectStore(PAYLOADS, { keyPath: 'key' });
        db.createObjectStore('drafts', { keyPath: 'key' });
        // Reserved.
        db.createObjectStore(SAVES, { keyPath: 'id' });
        db.createObjectStore(META, { keyPath: 'k' });
      }

      if (event.oldVersion < 2) {
        // Worlds are stored as files from this version on; the drafts store goes.
        if (db.objectStoreNames.contains('drafts')) db.deleteObjectStore('drafts');
        if (!db.objectStoreNames.contains(FILES)) {
          db.createObjectStore(FILES, { keyPath: ['world', 'path'] });
        }
        // Metadata rows whose payloads are gone are cleared with them.
        request.transaction?.objectStore(WORLDS).clear();
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(asError(request.error, 'could not open the library'));
    request.onblocked = () => reject(new Error('the library is open in another tab that must be closed first'));
  }).catch((err: unknown) => {
    // A failed open is not cached.
    opening = null;
    throw err;
  });
  return opening;
}

/** Close the current library connection and clear the cached handle. */
export async function closeLibrary(): Promise<void> {
  const pending = opening;
  opening = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // Already gone, which is the state we wanted.
  }
}

/** One transaction, resolved when it commits rather than when the request does. */
export function tx<T>(
  db: IDBDatabase,
  stores: readonly string[],
  mode: IDBTransactionMode,
  body: (transaction: IDBTransaction) => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(stores as string[], mode);
    let result: T;
    try {
      result = body(transaction);
    } catch (err) {
      transaction.abort();
      // `put` can throw synchronously, so the error name is preserved here too.
      reject(err instanceof Error ? err : asError(err as DOMException | null, 'transaction failed'));
      return;
    }
    transaction.oncomplete = () => resolve(result);
    // `transaction.error` is a `DOMException`; `isQuotaError` reads its name.
    transaction.onerror = () => reject(asError(transaction.error, 'transaction failed'));
    transaction.onabort = () => reject(asError(transaction.error, 'transaction aborted'));
  });
}

/** One request, as a promise. */
function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('request failed'));
  });
}

export function get<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  const request = db.transaction([store], 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>;
  return wrap(request);
}

export function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  const request = db.transaction([store], 'readonly').objectStore(store).getAll() as IDBRequest<T[]>;
  return wrap(request);
}

/** Everything in one key range — every file of a world, in path order. */
export function getRange<T>(db: IDBDatabase, store: string, range: IDBKeyRange): Promise<T[]> {
  const request = db.transaction([store], 'readonly').objectStore(store).getAll(range) as IDBRequest<T[]>;
  return wrap(request);
}

export function put(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return tx(db, [store], 'readwrite', (t) => { t.objectStore(store).put(value); });
}

export function remove(db: IDBDatabase, store: string, key: string): Promise<void> {
  return tx(db, [store], 'readwrite', (t) => { t.objectStore(store).delete(key); });
}
