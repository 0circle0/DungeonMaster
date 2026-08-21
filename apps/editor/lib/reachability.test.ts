/** The reachability notes, checked against the engine and the schema. */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTION_PATHS, buildReferenceIndex, findOrphans } from '@dm/module';
import { readAssembledModule } from '@dm/module/load';
import { REACHED_INDIRECTLY, SELF_PLACING, placesItself } from './reachability';

const ENGINE = fileURLToPath(new URL('../../../packages/engine/src', import.meta.url));
const AURENDEL = fileURLToPath(new URL('../../../modules/aurendel', import.meta.url));

function engineSource(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) out.push(readFileSync(path, 'utf8'));
    }
  };
  walk(ENGINE);
  return out.join('\n');
}

describe('reachability notes', () => {
  it('names only collections that exist', () => {
    for (const collection of REACHED_INDIRECTLY.keys()) {
      expect(COLLECTION_PATHS, `${collection} is not a collection`).toContain(collection);
    }
    for (const rule of SELF_PLACING) {
      expect(COLLECTION_PATHS, `${rule.collection} is not a collection`).toContain(rule.collection);
    }
  });

  it('gives a reason for every exception', () => {
    for (const [collection, why] of REACHED_INDIRECTLY) {
      expect(why.length, `${collection} needs a reason, not an entry`).toBeGreaterThan(10);
    }
  });

  /** The claim that would rot: the engine stops reading `npc.home` and nobody notices. */
  it('proves each self-placing field is still read by the engine', () => {
    const source = engineSource();
    for (const rule of SELF_PLACING) {
      expect(source, `${rule.collection}.${rule.field}: ${rule.proof} is gone from the engine`).toContain(
        rule.proof,
      );
    }
  });

  it('recognises an entry that places itself', () => {
    expect(placesItself('content.npcs', { id: 'a', home: 'the_inn' })).toBe(true);
    expect(placesItself('content.npcs', { id: 'a' })).toBe(false);
    expect(placesItself('content.npcs', { id: 'a', home: '' })).toBe(false);
    expect(placesItself('content.items', { id: 'a', home: 'x' })).toBe(false);
  });
});

/** The number that made this file necessary. */
describe('what the unreferenced view actually reports for aurendel', () => {
  const doc = readAssembledModule(AURENDEL).doc;
  const raw = findOrphans(doc, buildReferenceIndex(doc), []);

  const filtered = raw.filter((orphan) => {
    if (REACHED_INDIRECTLY.has(orphan.collection)) return false;
    const [section, name] = orphan.collection.split('.') as [string, string];
    const entries = (doc[section] as Record<string, unknown> | undefined)?.[name];
    const entry = Array.isArray(entries) ? (entries[orphan.index] as Record<string, unknown>) : undefined;
    return !entry || !placesItself(orphan.collection, entry);
  });

  it('drops the 105 NPCs that place themselves', () => {
    expect(raw.filter((o) => o.collection === 'content.npcs').length).toBeGreaterThan(50);
    expect(filtered.filter((o) => o.collection === 'content.npcs')).toEqual([]);
  });

  it('drops the lore threads, which are read through a DSL path', () => {
    expect(filtered.filter((o) => o.collection === 'narrative.loreThreads')).toEqual([]);
  });

  /** And keeps what is left, which is the point. */
  it('keeps the findings that are real', () => {
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length, 'a report this long is one nobody reads').toBeLessThan(30);
    expect(filtered.some((o) => o.collection === 'world.terrains')).toBe(true);
  });
});
