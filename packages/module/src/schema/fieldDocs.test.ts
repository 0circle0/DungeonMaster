/**
 * The field glosses, held to the schema in both directions.
 *
 * A description written once and never checked again is the failure mode this
 * whole arrangement exists to avoid: the reference and the site would keep
 * rendering confidently while the format moved underneath them. So adding a
 * field to the format fails here until it is described, removing one fails
 * here until its line goes, and neither can be missed on the way past.
 */

import { describe, it, expect } from 'vitest';
import { FIELD_DOCS } from './fieldDocs.js';
import { fieldPaths, walkModuleSchema } from './walk.js';

describe('field glosses', () => {
  it('describes every field the schema has', () => {
    const missing = fieldPaths().filter((path) => !(path in FIELD_DOCS));
    expect(missing).toEqual([]);
  });

  it('describes nothing the schema does not have', () => {
    const real = new Set(fieldPaths());
    const stale = Object.keys(FIELD_DOCS).filter((path) => !real.has(path));
    expect(stale).toEqual([]);
  });

  it('has one line per field and no duplicates in the walk', () => {
    const paths = fieldPaths();
    expect(new Set(paths).size).toBe(paths.length);
  });

  /**
   * The one style rule worth enforcing rather than trusting. A thousand of
   * these get written in long sittings, and a dash is the punctuation that
   * creeps back in.
   */
  it('writes prose without dashes', () => {
    const offenders = Object.entries(FIELD_DOCS)
      .filter(([, text]) => /[-‐-―]/.test(text))
      .map(([path, text]) => `${path}: ${text}`);
    expect(offenders).toEqual([]);
  });

  it('keeps each gloss to a single short line', () => {
    const tooLong = Object.entries(FIELD_DOCS)
      .filter(([, text]) => text.length > 110 || text.includes('\n'))
      .map(([path, text]) => `${path} (${text.length})`);
    expect(tooLong).toEqual([]);
  });

  it('leaves the registry-backed section to the registry', () => {
    const registry = walkModuleSchema().filter((section) => section.fromRegistry);
    expect(registry.map((section) => section.path)).toEqual(['narrative.systemText']);
    expect(registry[0]?.fields).toEqual([]);
  });
});
