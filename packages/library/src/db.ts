/**
 * The IndexedDB underneath the library.
 *
 * For the studio this is a filesystem. A world is not a document here — it is
 * the project files it is made of, one record each, and editing an entry writes
 * that entry's record and nothing else. That is the whole reason the store
 * exists in this shape: the old form kept one gzipped blob per world, so
 * changing an integer from 5 to 3 re-serialized 1.6 MB, compressed it, and
 * replaced the lot.
 *
 * The player still keeps one document per world in `payloads`, because that is
 * genuinely what it has: a compiled `module.json` it reads and never edits. The
 * two apps are separate origins with separate databases, so the stores never
 * meet — they are two access patterns, not two ways of doing one thing.
 *
 * Metadata is separate from both on purpose. Both apps list worlds on mount to
 * render a switcher, and a list must never read a world's contents to show a
 * title.
 */

import type { Codec } from './gzip.js';

export const DB_NAME = 'dm.library';
export const DB_VERSION = 2;

export const WORLDS = 'worlds';
export const PAYLOADS = 'payloads';
export const FILES = 'files';
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

/**
 * One project file.
 *
 * `path` is module-relative and exactly what `bundleModule` emits — `project/…`
 * for entries, `maps/<id>/…` for static maps — so the records of a world *are* a
 * project bundle. One vocabulary across storage, the shipped artifact and the
 * repository, and therefore one place it can drift instead of three.
 */
export interface FileRecord {
  readonly world: string;
  readonly path: string;
  readonly text: string;
}

/**
 * Every file of one world.
 *
 * IndexedDB orders arrays after strings, so a compound `[world, path]` key makes
 * this range both the read and the delete, and no secondary index is needed.
 */
export function worldRange(key: string): IDBKeyRange {
  return IDBKeyRange.bound([key], [key, []]);
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
      // One block per version, and an old block is never edited afterwards: the
      // browser replays from whatever version this profile happens to hold, so
      // a profile at 1 runs only what is new. Written as `<` tests rather than a
      // `switch` because the ladder needs every later step to run and a
      // fall-through `switch` is exactly what `noFallthroughCasesInSwitch`
      // exists to prevent.
      if (event.oldVersion < 1) {
        const worlds = db.createObjectStore(WORLDS, { keyPath: 'key' });
        worlds.createIndex('byUpdatedAt', 'updatedAt');
        worlds.createIndex('byModuleId', 'moduleId');
        db.createObjectStore(PAYLOADS, { keyPath: 'key' });
        db.createObjectStore('drafts', { keyPath: 'key' });
        // Reserved. Save games live in `localStorage` today because they are
        // small and the save menu reads them synchronously — but a long run
        // of a large world may outgrow it, and creating the store now means
        // that move is a code change rather than a schema upgrade applied to
        // people who already have data.
        db.createObjectStore(SAVES, { keyPath: 'id' });
        db.createObjectStore(META, { keyPath: 'k' });
      }

      if (event.oldVersion < 2) {
        // The studio's worlds become files. Drafts go with the blob they
        // existed to protect: they were a *two-version* mechanism, keeping the
        // last document that compiled while a half-typed one was set aside.
        // Files have no second version to keep — an entry with a bad reference
        // is a file like any other, and `joinProject` is structural, so a world
        // that does not compile still opens. The trade is deliberate: the
        // library used to always hold a loadable world, and now it always holds
        // *yours*.
        if (db.objectStoreNames.contains('drafts')) db.deleteObjectStore('drafts');
        if (!db.objectStoreNames.contains(FILES)) {
          db.createObjectStore(FILES, { keyPath: ['world', 'path'] });
        }
        // A metadata row whose bytes are gone is worse than no row: the
        // switcher would offer a world that cannot open. Nothing is lost that
        // was not already unreachable — see `deploy.yml` on how many people
        // this is.
        request.transaction?.objectStore(WORLDS).clear();
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
