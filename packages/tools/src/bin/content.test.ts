/**
 * The content pipeline, end to end.
 *
 * An artifact is the one thing in this project nobody reads before it ships: it
 * is generated, gitignored and served. So the whole path is exercised here —
 * assemble, minify, gzip, and then back out through the same check the browser
 * makes — because "the file the player downloads is a world that works" is
 * otherwise a claim with nothing behind it.
 */

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
    // The whole reason the artifact exists: the repository keeps the readable
    // form and the wire gets the small one. If that ratio ever collapses, the
    // build step is costing complexity for nothing.
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
    // Nothing extends anything today; the point is that the build never bakes a
    // base in, because a document saved after that would carry its parent
    // permanently.
    expect(envelope.doc['extends']).toBeNull();
  });

  it('refuses to build a test fixture', () => {
    // greenmarch is a fixture whose mods nothing distributes, and minimal is a
    // smaller one. Neither is a game, and an allowlist that quietly grew to
    // include them would ship two worlds that cannot be played.
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

    // The mechanism the staleness guard rests on: a changed world has to move
    // the committed file, or "forgot to regenerate" is invisible.
    expect(manifestOf(built)).not.toBe(before);
  });
});
