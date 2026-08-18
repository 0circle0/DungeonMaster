/**
 * How much room there is, and whether the browser intends to keep it.
 *
 * Once worlds live only on the user's machine, storage stops being plumbing and
 * becomes the product: losing the database is losing their work. Two things
 * follow, and both are here.
 *
 * Persistence is asked for on the *first write*, never on load. Firefox shows a
 * prompt, and a prompt in front of somebody who has not used the app yet gets
 * dismissed — spending the one chance to ask on the worst possible moment.
 */

export interface PersistenceResult {
  readonly persisted: boolean;
  /** False when the browser has no such notion, so the UI can stay quiet. */
  readonly supported: boolean;
}

export async function requestPersistence(): Promise<PersistenceResult> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return { persisted: false, supported: false };
  }
  try {
    if (await navigator.storage.persisted()) return { persisted: true, supported: true };
    return { persisted: await navigator.storage.persist(), supported: true };
  } catch {
    return { persisted: false, supported: true };
  }
}

export interface StorageEstimate {
  readonly usage: number;
  readonly quota: number;
}

export async function estimateStorage(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? 0, quota: quota ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Is this the browser saying "no room"?
 *
 * Worth distinguishing from every other failure, because it is the one a person
 * can act on: download a world, delete it, carry on.
 */
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

export const OUT_OF_SPACE =
  'There is no room left for this world. Download one you want to keep, delete it here, and try again.';
