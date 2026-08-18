/**
 * The IndexedDB underneath the library.
 *
 * It is a database in name and a keyed blob store in practice: no queries, no
 * joins, one integer version. It is here rather than in `localStorage` because
 * Aurendel is 1.5 MB minified and the whole of `localStorage` is about five,
 * and because a synchronous string store blocks the main thread on every write.
 *
 * Metadata and payloads are separate stores on purpose. Both apps list worlds
 * on mount to render a switcher, and a list must never inflate a few hundred
 * kilobytes per row to show a title.
 */

import type { Codec } from './gzip.js';

export const DB_NAME = 'dm.library';
export const DB_VERSION = 1;

export const WORLDS = 'worlds';
export const PAYLOADS = 'payloads';
export const DRAFTS = 'drafts';
export const SAVES = 'saves';
export const META = 'meta';

/** What a world is, apart from its bytes. */
export interface WorldMeta {
  /** A uuid, not the module id: two worlds may both call themselves Aurendel. */
  readonly key: string;
  readonly moduleId: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly filename: string;
  /** How it got here, which is the only thing an example is remembered by. */
  readonly origin: 'created' | 'imported' | 'example';
  /** The catalog id it came from, so it can be offered again if deleted. */
  readonly originId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly storedBytes: number;
  readonly rawBytes: number;
  /** `hashModule`, when it compiles. Null when it does not. */
  readonly hash: string | null;
}

export interface PayloadRecord {
  readonly key: string;
  readonly codec: Codec;
  readonly bytes: Uint8Array;
  readonly rawBytes: number;
}

export interface DraftRecord {
  readonly key: string;
  readonly savedAt: number;
  readonly codec: Codec;
  readonly bytes: Uint8Array;
}

/**
 * A `DOMException` as an `Error`, keeping the name.
 *
 * IndexedDB reports failures as `DOMException`, which is not an `Error`
 * subclass. The name is the part that matters — `QuotaExceededError` is the one
 * failure a person can actually act on — so it is carried across rather than
 * flattened into a message.
 */
function asError(cause: DOMException | null, fallback: string): Error {
  if (!cause) return new Error(fallback);
  const error = new Error(cause.message || fallback);
  error.name = cause.name;
  return error;
}

let opening: Promise<IDBDatabase> | null = null;

/** Is there an IndexedDB here at all? Server rendering says no. */
export function hasStorage(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openLibrary(): Promise<IDBDatabase> {
  if (!hasStorage()) return Promise.reject(new Error('no IndexedDB in this environment'));
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      // One case per version, and an old case is never edited afterwards: the
      // browser replays from whatever version this profile happens to hold.
      switch (event.oldVersion) {
        case 0: {
          const worlds = db.createObjectStore(WORLDS, { keyPath: 'key' });
          worlds.createIndex('byUpdatedAt', 'updatedAt');
          worlds.createIndex('byModuleId', 'moduleId');
          db.createObjectStore(PAYLOADS, { keyPath: 'key' });
          db.createObjectStore(DRAFTS, { keyPath: 'key' });
          // Reserved. Save games live in `localStorage` today because they are
          // small and the save menu reads them synchronously — but a long run
          // of a large world may outgrow it, and creating the store now means
          // that move is a code change rather than a schema upgrade applied to
          // people who already have data.
          db.createObjectStore(SAVES, { keyPath: 'id' });
          db.createObjectStore(META, { keyPath: 'k' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(asError(request.error, 'could not open the library'));
    request.onblocked = () => reject(new Error('the library is open in another tab that must be closed first'));
  }).catch((err: unknown) => {
    // A failed open must not be cached, or a transient failure becomes
    // permanent for the life of the page.
    opening = null;
    throw err;
  });
  return opening;
}

/**
 * Close the connection and forget it.
 *
 * `indexedDB.deleteDatabase` blocks for as long as any connection is open, so a
 * test that only dropped the cached promise would hang rather than fail — the
 * handle has to be closed, not forgotten.
 */
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
      // `put` can throw synchronously — a quota failure does exactly that — so
      // the name has to survive here as well.
      reject(err instanceof Error ? err : asError(err as DOMException | null, 'transaction failed'));
      return;
    }
    transaction.oncomplete = () => resolve(result);
    // `transaction.error` is a `DOMException`, which is not an `Error` — and a
    // quota failure arrives this way, so its `name` has to survive for
    // `isQuotaError` to recognise it.
    transaction.onerror = () => reject(asError(transaction.error, 'transaction failed'));
    transaction.onabort = () => reject(asError(transaction.error, 'transaction aborted'));
  });
}

/**
 * One request, as a promise.
 *
 * Resolving on the request rather than on the transaction is right for reads:
 * the value is available then, and the transaction commits immediately after
 * with nothing left to report. Writes go through `tx`, which waits for the
 * commit, because a write that resolved early would let a caller believe a
 * world was stored when the transaction could still abort.
 */
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

export function put(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return tx(db, [store], 'readwrite', (t) => { t.objectStore(store).put(value); });
}

export function remove(db: IDBDatabase, store: string, key: string): Promise<void> {
  return tx(db, [store], 'readwrite', (t) => { t.objectStore(store).delete(key); });
}
