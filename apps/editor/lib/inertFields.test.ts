/**
 * The coverage registry, checked against the engine it describes.
 *
 * `inertFields.ts` is the studio's honesty layer — the notes an author reads under a form to learn
 * which knobs are connected to anything. It was hand-maintained and went stale.
 *
 * A grep is a blunt instrument and deliberately so: it cannot prove a field is used, only that its
 * name appears nowhere in the engine, which is a sufficient condition for "inert" and the one that
 * rots.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inertEntries } from './inertFields';

const ENGINE = fileURLToPath(new URL('../../../packages/engine/src', import.meta.url));

/** Every non-test line of engine source, as one haystack. */
function engineSource(): string {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      // Tests name inert fields all the time — asserting they do nothing is what several of them
      // are for.
      if (entry.endsWith('.test.ts')) continue;
      out.push(readFileSync(path, 'utf8'));
    }
  };

  walk(ENGINE);
  return out.join('\n');
}

const SOURCE = engineSource();

/**
 * Fields whose names collide with something else, or whose note is about where a live field is
 * applied rather than whether it is read. A short, explained list: a long one would mean the check
 * had stopped checking anything.
 */
const EXEMPT: Record<string, string> = {
  // A collection field, `Array.map`, and `state.maps` all at once. The note is about `map.palette`
  // specifically, which no grep can see.
  map: 'collides with Array.map and state.maps',

  // `TerrainDef.isDoor` is indexed and never consulted — a distinction a grep cannot draw.

  // `TerrainIndex` copies every declared terrain field into its struct, so both of these are read
  // by the indexer and consulted by nothing after it.
  isDoor: 'copied into TerrainDef by the indexer, then never consulted',
  lightRadius: 'copied into TerrainDef by the indexer, then never consulted',
};

/**
 * Whether the engine actually reads this field, rather than merely naming it. Several are declared
 * on a local interface — `corridorLength` in `DungeonDef`, `lightRadius` in `TerrainDef` — and
 * never dereferenced. A declaration is `field:`; a read is `.field` or `['field']`.
 */
function isRead(field: string): boolean {
  const patterns = [
    new RegExp(`\\.${field}\\b`),
    new RegExp(`\\['${field}'\\]`),
    new RegExp(`\\["${field}"\\]`),
  ];
  return patterns.some((pattern) => pattern.test(SOURCE));
}

describe('the coverage registry', () => {
  it('names fields the engine genuinely never reads', () => {
    const wrong: string[] = [];

    for (const { path, field } of inertEntries()) {
      if (field === '*' || field in EXEMPT) continue;
      if (isRead(field)) wrong.push(`${path}.${field}`);
    }

    expect(
      wrong,
      `these are listed as inert but the engine mentions them — wire-up without deleting the note?\n  ${wrong.join('\n  ')}`,
    ).toEqual([]);
  });

  it('is not empty, which would mean the check had stopped checking', () => {
    expect(inertEntries().length).toBeGreaterThan(0);
  });

  // The exemptions are where this check goes to die: every one is a field the grep cannot judge, so
  // the list must stay short and each entry must say why.
  it('exempts only fields the registry actually names', () => {
    const named = new Set(inertEntries().map((entry) => entry.field));
    for (const field of Object.keys(EXEMPT)) {
      expect(named, `${field} is exempted but no longer listed as inert`).toContain(field);
    }
    expect(Object.keys(EXEMPT).length).toBeLessThanOrEqual(8);
  });

  it('carries a note on every entry, since the note is the whole point', () => {
    for (const { path, field } of inertEntries()) {
      expect(`${path}.${field}`.length).toBeGreaterThan(0);
    }
  });
});
