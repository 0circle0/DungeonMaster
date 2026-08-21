/** `ValidationIndex.parse` must be indistinguishable from `safeParse`. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rng } from '@dm/core';
import { gameModuleSchema } from '../schema/module.js';
import { hashModule } from '../compile.js';
import { ValidationIndex } from './incremental.js';
import { lintModule, attachPositions } from './lint.js';

const MODULES = ['minimal', 'core_fantasy', 'greenmarch', 'aurendel'] as const;

const moduleDoc = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../../modules/${name}/module.json`, import.meta.url)),
      'utf8',
    ),
  ) as Record<string, unknown>;

/** The editor's `setAt`, in miniature: copy the spine, share everything else. */
function setAt(doc: unknown, path: readonly (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  if (typeof head === 'number') {
    const list = Array.isArray(doc) ? [...(doc as unknown[])] : [];
    list[head] = setAt(list[head], rest, value);
    return list;
  }
  const object = { ...((doc as Record<string, unknown> | undefined) ?? {}) };
  object[head] = setAt(object[head], rest, value);
  return object;
}

describe('ValidationIndex', () => {
  it.each(MODULES)('parses %s exactly as safeParse does', (name) => {
    const doc = moduleDoc(name);
    const expected = gameModuleSchema.safeParse(doc);
    expect(expected.success).toBe(true);
    if (!expected.success) return;

    const actual = new ValidationIndex().parse(doc);
    expect(actual.ok).toBe(true);
    if (!actual.ok) return;

    expect(actual.data).toEqual(expected.data);
    // The hash is what a save is pinned to, so it gets its own assertion.
    expect(hashModule(actual.data)).toBe(hashModule(expected.data));
  });

  it('reuses entries across edits instead of reparsing the document', () => {
    const doc = moduleDoc('aurendel');
    const index = new ValidationIndex();

    index.parse(doc);
    const firstPass = index.lastMisses;
    expect(firstPass).toBeGreaterThan(1000);

    const edited = setAt(doc, ['world', 'pointsOfInterest', 3, 'name'], 'Renamed');
    index.parse(edited);
    // One entry changed, so exactly one entry should have been parsed again.
    expect(index.lastMisses).toBe(1);
  });

  /** The one that catches a stale cache. */
  it('stays equal to a from-scratch parse across a run of edits', () => {
    const rng = Rng.fromString('incremental-parity');
    let doc: unknown = moduleDoc('greenmarch');
    const index = new ValidationIndex();
    index.parse(doc);

    const targets: readonly (readonly (string | number)[])[] = [
      ['content', 'monsters', 0, 'xp'],
      ['content', 'items', 0, 'value'],
      ['world', 'areas', 0, 'name'],
      ['narrative', 'quests', 0, 'name'],
      ['content', 'monsters', 1, 'level'],
    ];

    for (let step = 0; step < 40; step += 1) {
      const path = rng.pick(targets);
      const value = path[3] === 'name' ? `edited ${step}` : rng.nextInt(0, 99);
      doc = setAt(doc, path, value);

      const incremental = index.parse(doc);
      const scratch = gameModuleSchema.safeParse(doc);
      expect(incremental.ok, `step ${step}`).toBe(scratch.success);
      if (!incremental.ok || !scratch.success) continue;
      expect(incremental.data, `step ${step}`).toEqual(scratch.data);
    }
  });

  describe('inside lintModule', () => {
    it.each(MODULES)('reports the same diagnostics for %s', (name) => {
      const doc = moduleDoc(name);
      const plain = lintModule(doc);
      const indexed = lintModule(doc, { index: new ValidationIndex() });

      expect(indexed.diagnostics).toEqual(plain.diagnostics);
      expect(indexed.ok).toBe(plain.ok);
      expect(indexed.compiled?.hash).toBe(plain.compiled?.hash);
    });

    it('keeps saying the same thing as the document is edited', () => {
      const index = new ValidationIndex();
      let doc: unknown = moduleDoc('greenmarch');
      lintModule(doc, { index });

      for (let step = 0; step < 12; step += 1) {
        doc = setAt(doc, ['content', 'monsters', 0, 'xp'], step * 7);
        const indexed = lintModule(doc, { index });
        const plain = lintModule(doc);
        expect(indexed.diagnostics, `step ${step}`).toEqual(plain.diagnostics);
        expect(indexed.compiled?.hash, `step ${step}`).toBe(plain.compiled?.hash);
      }
    });

    it('falls back to the ordinary pass so schema errors keep their suggestions', () => {
      const doc = moduleDoc('greenmarch');
      const broken = setAt(doc, ['content', 'monsters', 0], {
        ...((doc['content'] as { monsters: Record<string, unknown>[] }).monsters[0]!),
        nmae: 'typo',
      });

      const indexed = lintModule(broken, { index: new ValidationIndex() });
      const plain = lintModule(broken);
      expect(indexed.diagnostics).toEqual(plain.diagnostics);
      expect(indexed.diagnostics.some((d) => d.hint?.includes('name'))).toBe(true);
    });
  });

  /** Guards against the cache being silently defeated. */
  describe('stays incremental', () => {
    it('re-parses one entry per edit when driven through lintModule', () => {
      const index = new ValidationIndex();
      const doc = moduleDoc('aurendel');
      lintModule(doc, { index });

      const edited = setAt(doc, ['world', 'pointsOfInterest', 12, 'name'], 'Renamed');
      lintModule(edited, { index });
      expect(index.lastMisses).toBe(1);
    });

    it('is far cheaper warm than a cold parse', () => {
      const doc = moduleDoc('aurendel');
      const index = new ValidationIndex();
      index.parse(doc);

      const cold = () => {
        const started = performance.now();
        gameModuleSchema.safeParse(doc);
        return performance.now() - started;
      };
      const warm = (n: number) => {
        const edited = setAt(doc, ['meta', 'description'], `edit ${n}`);
        const started = performance.now();
        index.parse(edited);
        return performance.now() - started;
      };

      // Interleaved, so a machine that stalls mid-test slows both alike.
      const colds: number[] = [];
      const warms: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        colds.push(cold());
        warms.push(warm(i));
      }
      colds.sort((a, b) => a - b);
      warms.sort((a, b) => a - b);

      // Really ~250x.
      expect(colds[1]! / warms[1]!).toBeGreaterThan(10);
    });
  });

  /** Linting the document loses line numbers and the editor gets them back on the idle tier. */
  describe('attachPositions', () => {
    it.each(MODULES)('restores the positions %s would have had', (name) => {
      const doc = moduleDoc(name);
      const text = `${JSON.stringify(doc, null, 2)}\n`;

      const fromText = lintModule(text);
      const restored = attachPositions(lintModule(doc, { index: new ValidationIndex() }).diagnostics, text);

      expect(restored.map((d) => d.path)).toEqual(fromText.diagnostics.map((d) => d.path));
      expect(restored.map((d) => d.position)).toEqual(fromText.diagnostics.map((d) => d.position));
      expect(restored.map((d) => d.excerpt)).toEqual(fromText.diagnostics.map((d) => d.excerpt));
    });

    it('locates a broken entry on the line it actually sits on', () => {
      const doc = moduleDoc('greenmarch');
      const broken = setAt(doc, ['content', 'monsters', 0, 'level'], 'not a number') as Record<string, unknown>;
      const text = `${JSON.stringify(broken, null, 2)}\n`;

      const restored = attachPositions(lintModule(broken, { index: new ValidationIndex() }).diagnostics, text);
      const found = restored.find((d) => d.path === 'content.monsters.0.level');
      expect(found?.position).not.toBeNull();

      // The reported line really does hold that field.
      const line = text.split('\n')[(found!.position!.line ?? 1) - 1] ?? '';
      expect(line).toContain('level');
    });

    it('leaves diagnostics alone when the text will not parse', () => {
      const doc = moduleDoc('greenmarch');
      const diagnostics = lintModule(doc, { index: new ValidationIndex() }).diagnostics;
      expect(attachPositions(diagnostics, '{ not json')).toEqual(diagnostics);
    });
  });

  describe('reports the same problems', () => {
    it('finds a bad field inside one entry', () => {
      const doc = moduleDoc('greenmarch');
      const broken = setAt(doc, ['content', 'monsters', 0, 'level'], 'not a number');

      const scratch = gameModuleSchema.safeParse(broken);
      const incremental = new ValidationIndex().parse(broken);
      expect(scratch.success).toBe(false);
      expect(incremental.ok).toBe(false);
      if (incremental.ok) return;
      expect(incremental.errors.some((e) => e.path === 'content.monsters.0.level')).toBe(true);
    });

    it('reports the same problem again on a second parse', () => {
      const doc = moduleDoc('greenmarch');
      const broken = setAt(doc, ['content', 'monsters', 0, 'level'], 'not a number');
      const index = new ValidationIndex();

      const first = index.parse(broken);
      const second = index.parse(broken);
      expect(first.ok).toBe(false);
      expect(second.ok).toBe(false);
      if (first.ok || second.ok) return;
      // A cache that remembered the list would swallow this the second time.
      expect(second.errors).toEqual(first.errors);
    });

    it('still enforces a minimum on a collection the document leaves empty', () => {
      const doc = moduleDoc('greenmarch');
      const emptied = setAt(doc, ['rules', 'attributes'], []);

      const scratch = gameModuleSchema.safeParse(emptied);
      const incremental = new ValidationIndex().parse(emptied);
      expect(scratch.success).toBe(false);
      expect(incremental.ok).toBe(false);
    });

    it('does not invent a minimum for a collection that has entries', () => {
      const doc = moduleDoc('greenmarch');
      const index = new ValidationIndex();
      const result = index.parse(doc);
      expect(result.ok).toBe(true);
    });

    it('rejects a collection that is not a list', () => {
      const doc = moduleDoc('greenmarch');
      const wrong = setAt(doc, ['content', 'monsters'], { id: 'husk' });

      expect(gameModuleSchema.safeParse(wrong).success).toBe(false);
      expect(new ValidationIndex().parse(wrong).ok).toBe(false);
    });
  });
});
