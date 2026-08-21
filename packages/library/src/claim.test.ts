/** Tests for `claimWorld`, run against the real `LockManager`. */

import { describe, it, expect, afterEach } from 'vitest';
import { claimWorld } from './claim.js';

const REAL = Object.getOwnPropertyDescriptor(globalThis, 'navigator')!;
afterEach(() => { Object.defineProperty(globalThis, 'navigator', REAL); });

/** A second tab holding `key`'s lock until `close` is called. */
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
    await expect(claimWorld('no-queue')).resolves.toMatchObject({ held: false });
    other.close();
  });

  it('gives this tab back the world it already has open', async () => {
    const first = await claimWorld('reopened');
    expect(first.held).toBe(true);
    expect(await claimWorld('reopened')).toBe(first);
  });

  it('reopens a world this tab has just closed', async () => {
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
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
    expect((await claimWorld('no-locks')).held).toBe(true);
    expect((await claimWorld('no-locks')).held).toBe(true);
  });
});
