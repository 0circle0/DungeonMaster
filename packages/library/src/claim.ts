/**
 * One tab at a time, per world.
 *
 * The studio holds a world assembled in memory and writes back the files that
 * changed, working out *which* by diffing against a snapshot of what it last
 * wrote. That snapshot lives in the tab. Nothing re-reads the store.
 *
 * For one tab that is exactly right. For two it is not a race that loses an
 * edit, which would be recoverable — it is two tabs each writing a different
 * subset of the same world's files, producing a tree that is half of one
 * document and half of another. Neither author ever saw it, and no diagnostic
 * describes it, because every individual file is valid.
 *
 * This is a hazard the file-per-entry store created. The single blob it replaced
 * had the same race and a survivable outcome: the last writer won, whole, and a
 * whole document is a thing somebody wrote.
 *
 * So the second tab does not save. Web Locks are held for as long as the
 * callback's promise is pending, which is the rest of the page's life, and they
 * are released by the browser when the tab goes — including when it crashes,
 * which is why this is a lock and not a flag in the store.
 */

/** A held claim, or the news that somebody else has it. */
export interface WorldClaim {
  /** False when another tab already has this world open. */
  readonly held: boolean;
  /** Give it up — switching worlds, or closing. Safe to call twice. */
  readonly release: () => void;
}

const GRANTED: WorldClaim = { held: true, release: () => {} };

/**
 * What this tab already holds, and what it is still letting go of.
 *
 * Both exist because a lock is not released the moment `release` is called: the
 * manager settles the request promise first and only then hands the name on. A
 * tab that closed a world and immediately reopened it would therefore be told
 * another tab had it — itself, a microtask ago — and would sit read-only over
 * its own world until it was reloaded.
 */
const mine = new Map<string, WorldClaim>();
const letting_go = new Map<string, Promise<unknown>>();

function locks(): LockManager | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { locks?: LockManager }).locks ?? null;
}

/**
 * Claim a world for this tab.
 *
 * `ifAvailable` so this answers immediately rather than queueing: a second tab
 * should be told it is a second tab, not left waiting for the first to close.
 *
 * A browser without Web Locks is granted the claim. The alternative is refusing
 * to save there, and losing every edit is a worse answer to "two tabs might
 * conflict" than the conflict.
 */
export async function claimWorld(key: string): Promise<WorldClaim> {
  const manager = locks();
  if (!manager) return GRANTED;

  // Already ours. Asking again — reopening the world that is open — must not go
  // near the manager, which would refuse this tab its own lock.
  const held = mine.get(key);
  if (held) return held;

  // A claim on this world that this tab is still giving up. Waiting for it is
  // the difference between reopening a world and being locked out of it.
  const pending = letting_go.get(key);
  if (pending) await pending;

  return new Promise<WorldClaim>((resolve) => {
    // Everything happens inside the callback, because that is the only place
    // the answer is known. Resolving from outside it would mean guessing
    // whether the lock had been granted yet — and `request` is safe to close
    // over there, since the manager never invokes the callback synchronously.
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
              // Not ours any more: switching worlds and then closing calls this
              // twice, and the second call must not disturb a later claim.
              if (mine.get(key) !== claim) return;
              mine.delete(key);
              // Resolves once the manager has actually let the name go, which
              // is what the next claim on this world waits for.
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
      // A lock that cannot be taken is not a reason to make the world
      // read-only; it is a reason to carry on without the guarantee.
      resolve(GRANTED);
    });
  });
}
