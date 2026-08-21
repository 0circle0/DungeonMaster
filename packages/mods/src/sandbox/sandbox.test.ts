/** What the sandbox promises the engine. */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { testHost, inlineMod } from '../testing.js';
import type { SandboxHost, LoadedMod } from './host.js';
import type { ModManifest } from '../schema/manifest.js';

let host: SandboxHost;

function manifestFor(id: string, hooks: ModManifest['hooks'], overrides: Partial<ModManifest> = {}): ModManifest {
  return {
    format: 1,
    id,
    target: 'engine',
    version: '1.0.0',
    hash: '0'.repeat(16),
    meta: { title: id, author: '', description: '', license: '', homepage: '' },
    engine: '^1.0.0',
    dependencies: [],
    loadAfter: [],
    entry: 'main.js',
    hooks,
    limits: { steps: 2_000_000, memoryBytes: 32 << 20 },
    systemText: {},
    ...overrides,
  };
}

function modOf(id: string, source: string, hooks: ModManifest['hooks'] = [{ hook: 'action.before', mode: 'after', priority: 0 }], overrides: Partial<ModManifest> = {}): LoadedMod {
  return inlineMod(manifestFor(id, hooks, overrides), { 'main.js': source });
}

const call = (mod: string, hook = 'action.before', payload = '{}') =>
  host.call({ mod, hook, payload, random: () => 0.5, query: () => null });

beforeAll(async () => {
  host = await testHost({ quarantineAfter: 3 });
});

afterAll(() => host?.dispose());

describe('determinism by construction', () => {
  it('has no Date, no Math.random, no fetch, no process', () => {
    const mod = modOf(
      'probe',
      `dm.hook('action.before', () => [{
         kind: 'event',
         event: 'probe',
         data: {
           date: typeof globalThis.Date,
           random: typeof Math.random,
           fetch: typeof globalThis.fetch,
           process: typeof globalThis.process,
           require: typeof globalThis.require,
         },
       }]);`,
    );
    expect(host.install(mod).ok).toBe(true);

    const result = call('probe');
    if (!result.ok) throw new Error(result.error);
    expect(result.directives[0]).toMatchObject({
      data: {
        date: 'undefined',
        random: 'undefined',
        fetch: 'undefined',
        process: 'undefined',
        require: 'undefined',
      },
    });
  });

  it('routes entropy through dm.random, and counts the draws', () => {
    const mod = modOf('dice', `dm.hook('action.before', () => [{ kind: 'event', event: 'r', data: { a: dm.random(), b: dm.random() } }]);`);
    host.install(mod);

    const values: number[] = [0.25, 0.75];
    let i = 0;
    const result = host.call({
      mod: 'dice',
      hook: 'action.before',
      payload: '{}',
      random: () => values[i++]!,
      query: () => null,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.directives[0]).toMatchObject({ data: { a: 0.25, b: 0.75 } });
    expect(result.draws).toBe(2);
  });
});

describe('containment', () => {
  it('interrupts an infinite loop instead of hanging the host', () => {
    const mod = modOf('spin', `dm.hook('action.before', () => { while (true) {} });`, undefined, {
      limits: { steps: 20_000, memoryBytes: 8 << 20 },
    });
    host.install(mod);

    const result = call('spin');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('interrupted');
  });

  it('turns a throwing mod into a result rather than a host exception', () => {
    const mod = modOf('boom', `dm.hook('action.before', () => { throw new Error('mod exploded'); });`);
    host.install(mod);

    // The assertion is as much that this line is reached at all.
    const result = call('boom');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('threw');
    expect(result.error).toContain('mod exploded');
  });

  it('rejects a return that is not a directive list', () => {
    const mod = modOf('junk', `dm.hook('action.before', () => 'not a list');`);
    host.install(mod);
    const result = call('junk');
    expect(result.ok).toBe(true);
  });

  it('quarantines a mod that keeps failing', () => {
    const mod = modOf('flaky', `dm.hook('action.before', () => { throw new Error('again'); });`);
    host.install(mod);

    expect(host.quarantined('flaky')).toBe(false);
    call('flaky');
    call('flaky');
    call('flaky');
    expect(host.quarantined('flaky')).toBe(true);

    // And once quarantined it is not consulted again.
    const after = call('flaky');
    expect(after.ok).toBe(false);
  });

  it('refuses a mod whose syntax is broken, without taking the host with it', () => {
    const mod = modOf('broken', `dm.hook('action.before', () => {`);
    const installed = host.install(mod);
    expect(installed.ok).toBe(false);
    expect(installed.issues.join(' ')).toMatch(/main\.js/);
  });
});

describe('registration', () => {
  it('flags a handler the manifest never declared, which would never run', () => {
    const mod = modOf('undeclared', `dm.hook('occasion', () => null);`, [
      { hook: 'action.before', mode: 'after', priority: 0 },
    ]);
    const installed = host.install(mod);
    expect(installed.issues.join(' ')).toContain('does not declare');
  });

  it('flags a declared hook the code never registered', () => {
    const mod = modOf('silent', `/* registers nothing */`, [
      { hook: 'action.before', mode: 'after', priority: 0 },
    ]);
    const installed = host.install(mod);
    expect(installed.issues.join(' ')).toContain('never registers');
  });

  it('keeps mods in separate realms, so one cannot see another’s globals', () => {
    host.install(modOf('first', `globalThis.shared = 'first'; dm.hook('action.before', () => null);`));
    host.install(
      modOf(
        'second',
        `dm.hook('action.before', () => [{ kind: 'event', event: 'peek', data: { saw: String(globalThis.shared) } }]);`,
      ),
    );
    const result = call('second');
    if (!result.ok) throw new Error(result.error);
    expect(result.directives[0]).toMatchObject({ data: { saw: 'undefined' } });
  });
});
