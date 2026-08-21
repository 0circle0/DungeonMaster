/** The content pipeline, end to end. */

import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { compileModule } from '@dm/module';
import { isEnvelope } from '@dm/library/envelope';
import { buildModule, buildAll, manifestOf } from './build-content.js';

describe('build-content', () => {
  it('produces an envelope that inflates and compiles', () => {
    const built = buildModule('aurendel');
    const parsed: unknown = JSON.parse(gunzipSync(built.gz).toString('utf8'));

    expect(isEnvelope(parsed)).toBe(true);
    const envelope = parsed as { doc: Record<string, unknown> };
    expect(compileModule(envelope.doc).ok).toBe(true);
  });

  it('is worth doing at all', () => {
    const built = buildModule('aurendel');
    expect(built.storedBytes).toBeLessThan(built.rawBytes / 4);
  });

  it('inlines the map folders, which is what an assembled document means', () => {
    const built = buildModule('aurendel');
    const envelope = JSON.parse(gunzipSync(built.gz).toString('utf8')) as {
      doc: { world: { maps?: unknown[] } };
    };
    expect(envelope.doc.world.maps?.length).toBeGreaterThan(0);
  });

  it('leaves `extends` unresolved, because the studio saves what it loads', () => {
    const built = buildModule('core_fantasy');
    const envelope = JSON.parse(gunzipSync(built.gz).toString('utf8')) as {
      doc: Record<string, unknown>;
    };
    expect(envelope.doc['extends']).toBeNull();
  });

  it('refuses to build a test fixture', () => {
    // greenmarch is a fixture whose mods nothing distributes, and minimal is a smaller one.
    expect(() => buildModule('greenmarch')).toThrow(/never shipped/);
    expect(() => buildModule('minimal')).toThrow(/never shipped/);
  });

  it('builds only what some app ships', () => {
    expect([...buildAll().keys()]).toEqual(['aurendel', 'core_fantasy']);
  });

  it('writes a manifest that moves when a world does', () => {
    const built = buildAll();
    const before = manifestOf(built);

    const aurendel = built.get('aurendel');
    expect(aurendel).toBeDefined();
    built.set('aurendel', { ...aurendel!, hash: 'deadbeef' });

    expect(manifestOf(built)).not.toBe(before);
  });
});
