/** Storage quota, and whether the browser intends to keep the database. */

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

/** Is this error the browser reporting no room? */
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

export const OUT_OF_SPACE =
  'There is no room left for this world. Download one you want to keep, delete it here, and try again.';
