/** One tab at a time, per world. */

/** A held claim, or the news that somebody else has it. */
export interface WorldClaim {
  /** False when another tab already has this world open. */
  readonly held: boolean;
  /** Give it up — switching worlds, or closing. */
  readonly release: () => void;
}

const GRANTED: WorldClaim = { held: true, release: () => {} };

/** Claims this tab holds, and claims it has released but the manager has not yet handed on. */
const mine = new Map<string, WorldClaim>();
const letting_go = new Map<string, Promise<unknown>>();

function locks(): LockManager | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { locks?: LockManager }).locks ?? null;
}

/** Claims `key` for this tab. */
export async function claimWorld(key: string): Promise<WorldClaim> {
  const manager = locks();
  if (!manager) return GRANTED;

  // Already held by this tab.
  const held = mine.get(key);
  if (held) return held;

  // A claim on this world that this tab is still releasing.
  const pending = letting_go.get(key);
  if (pending) await pending;

  return new Promise<WorldClaim>((resolve) => {
    // The grant is only known inside the callback; the manager never invokes it synchronously.
    const request: Promise<unknown> = manager.request(
      `dm.world.${key}`,
      { mode: 'exclusive', ifAvailable: true },
      (lock) => {
        if (!lock) {
          resolve({ held: false, release: () => {} });
          return undefined;
        }
        // The lock is held for exactly as long as this promise is pending.
        return new Promise<void>((done) => {
          const claim: WorldClaim = {
            held: true,
            release: () => {
              // Only the current claim releases; a second call is a no-op.
              if (mine.get(key) !== claim) return;
              mine.delete(key);
              // Resolves once the manager has handed the name on.
              letting_go.set(key, request.finally(() => {
                if (letting_go.get(key) === request) letting_go.delete(key);
              }));
              done();
            },
          };
          mine.set(key, claim);
          resolve(claim);
        });
      },
    );

    void request.catch(() => {
      // No Web Locks here: grant the claim without the guarantee.
      resolve(GRANTED);
    });
  });
}
