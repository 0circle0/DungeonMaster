/**
 * The guard that stops two tabs interleaving one world's files.
 *
 * Node implements Web Locks, so these run against the real `LockManager` rather
 * than a stand-in — which matters, because the property under test is that a
 * lock is held for as long as a promise is pending and handed on only once the
 * manager says so. A stub would assert my idea of that contract instead of it.
 *
 * A second *tab* is not a second call: `claimWorld` knows what this tab already
 * holds. So the other tab is played by taking the raw lock, which is what one
 * would be doing.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { claimWorld } from './claim.js';

const REAL = Object.getOwnPropertyDescriptor(globalThis, 'navigator')!;
afterEach(() => { Object.defineProperty(globalThis, 'navigator', REAL); });

/** Another tab, holding a world until it is told to let go. */
function otherTab(key: string): { taken: Promise<void>; close: () => void } {
  let close = (): void => {};
  const taken = new Promise<void>((granted) => {
    void navigator.locks.request(`dm.world.${key}`, (lock) => {
      expect(lock).not.toBeNull();
      granted();
      return new Promise<void>((done) => { close = done; });
    });
  });
  return { taken, close: () => close() };
}

describe('claimWorld', () => {
  it('refuses a world another tab already has open', async () => {
    const other = otherTab('taken');
    await other.taken;
    expect((await claimWorld('taken')).held).toBe(false);
    other.close();
  });

  it('grants a world nobody has open', async () => {
    expect((await claimWorld('free')).held).toBe(true);
  });

  it('answers immediately rather than queueing behind the other tab', async () => {
    const other = otherTab('no-queue');
    await other.taken;
    // If this queued rather than asking, the await never returns and the test
    // times out — which is the failure it exists to catch.
    await expect(claimWorld('no-queue')).resolves.toMatchObject({ held: false });
    other.close();
  });

  it('gives this tab back the world it already has open', async () => {
    // Reopening the open world. Going near the manager here would refuse this
    // tab its own lock and leave it read-only over its own work.
    const first = await claimWorld('reopened');
    expect(first.held).toBe(true);
    expect(await claimWorld('reopened')).toBe(first);
  });

  it('reopens a world this tab has just closed', async () => {
    // The case that made `release` more than resolving a promise: the manager
    // settles the request first and hands the name on afterwards, so a claim
    // taken in the same breath as the release used to be refused — by this tab,
    // against itself, a microtask earlier.
    const first = await claimWorld('closed-then-reopened');
    first.release();
    expect((await claimWorld('closed-then-reopened')).held).toBe(true);
  });

  it('lets another tab have a world once this one lets go', async () => {
    const claim = await claimWorld('handed-on');
    claim.release();
    const other = otherTab('handed-on');
    await expect(other.taken).resolves.toBeUndefined();
    other.close();
  });

  it('survives being released twice, which is what switching then closing does', async () => {
    const claim = await claimWorld('released-twice');
    claim.release();
    expect(() => claim.release()).not.toThrow();
  });

  it('grants the claim where there are no Web Locks at all', async () => {
    // Refusing to save in such a browser would lose every edit, which is a
    // worse answer to "two tabs might conflict" than the conflict itself.
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    expect((await claimWorld('no-locks')).held).toBe(true);
    expect((await claimWorld('no-locks')).held).toBe(true);
  });
});
