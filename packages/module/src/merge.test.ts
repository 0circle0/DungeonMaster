import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeModules, resolveExtends, parseExtends, DELETE_MARKER } from './merge.js';
import { compileModule } from './compile.js';
import { lintModule } from './diagnostics/lint.js';

const MINIMAL_PATH = fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url));
const loadMinimal = () => JSON.parse(readFileSync(MINIMAL_PATH, 'utf8')) as Record<string, unknown>;

describe('mergeModules', () => {
  it('merges plain objects key by key', () => {
    expect(mergeModules({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 4 } })).toEqual({
      a: 1,
      b: { c: 2, d: 4 },
    });
  });

  it('replaces non-collection arrays wholesale', () => {
    // A bare list has no identity to merge on, so replacement is predictable.
    expect(mergeModules({ tags: ['a', 'b'] }, { tags: ['c'] })).toEqual({ tags: ['c'] });
  });

  describe('collections', () => {
    const base = {
      content: {
        monsters: [
          { id: 'husk', name: 'Husk', xp: 10 },
          { id: 'wraith', name: 'Wraith', xp: 50 },
        ],
      },
    };

    it('merges world.maps by id, a pack map replacing a base map wholesale inside', () => {
      const withMaps = mergeModules(
        {
          world: {
            maps: [
              { id: 'keep', layers: [{ kind: 'terrain', cells: [['a']] }] },
              { id: 'shop', layers: [{ kind: 'terrain', cells: [['a']] }] },
            ],
          },
        },
        {
          world: {
            maps: [{ id: 'shop', layers: [{ kind: 'terrain', cells: [['b', 'b']] }] }],
          },
        },
      ) as { world: { maps: { id: string; layers: unknown[] }[] } };

      expect(withMaps.world.maps.map((m) => m.id)).toEqual(['keep', 'shop']);
      // `layers` is a non-collection array, so the pack's grid wins wholesale —
      // per-layer patching is deliberately not a thing.
      expect(withMaps.world.maps[1]!.layers).toEqual([
        { kind: 'terrain', cells: [['b', 'b']] },
      ]);
    });

    // Merging by position would silently rewrite whichever monster sat at that index.
    it('overrides an existing entry by id, field by field', () => {
      const merged = mergeModules(base, {
        content: { monsters: [{ id: 'wraith', xp: 75 }] },
      }) as typeof base;

      expect(merged.content.monsters).toHaveLength(2);
      expect(merged.content.monsters[1]).toEqual({ id: 'wraith', name: 'Wraith', xp: 75 });
      expect(merged.content.monsters[0]).toEqual({ id: 'husk', name: 'Husk', xp: 10 });
    });

    it('appends new entries and preserves base order', () => {
      const merged = mergeModules(base, {
        content: { monsters: [{ id: 'ghoul', name: 'Ghoul', xp: 30 }] },
      }) as typeof base;

      expect(merged.content.monsters.map((m) => m.id)).toEqual(['husk', 'wraith', 'ghoul']);
    });

    it('deletes an entry only when asked explicitly', () => {
      const merged = mergeModules(base, {
        content: { monsters: [{ id: 'husk', [DELETE_MARKER]: true }] },
      }) as typeof base;

      expect(merged.content.monsters.map((m) => m.id)).toEqual(['wraith']);
    });
  });

  it('leaves the base untouched', () => {
    const base = { content: { monsters: [{ id: 'husk', xp: 10 }] } };
    const snapshot = JSON.stringify(base);
    mergeModules(base, { content: { monsters: [{ id: 'husk', xp: 99 }] } });
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('resolveExtends', () => {
  it('returns the document unchanged when it extends nothing', () => {
    const doc = { id: 'solo', version: '1.0.0', extends: null };
    const result = resolveExtends(doc, () => undefined);
    expect(result.ok).toBe(true);
  });

  // The point of the feature: a pack ships a few monsters, not a whole game.
  it('layers a small pack over a full base module', () => {
    const base = loadMinimal();
    const pack = {
      format: 1,
      id: 'more_husks',
      version: '0.1.0',
      extends: 'minimal@1.0.0',
      meta: { title: 'More Husks' },
      content: {
        monsters: [
          { id: 'husk', xp: 25 },
          {
            id: 'greater_husk',
            name: 'Greater Husk',
            level: 3,
            xp: 60,
            attributes: { vigor: 8, wits: 5 },
            abilities: ['cudgel_swing'],
          },
        ],
      },
    };

    const resolved = resolveExtends(pack, (identity) =>
      identity === 'minimal@1.0.0' ? base : undefined,
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    // The merged document must still be a valid, playable module.
    const compiled = compileModule(resolved.document);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    expect(compiled.module.source.id).toBe('more_husks');
    expect(compiled.module.get<{ xp: number }>('content.monsters', 'husk').xp).toBe(25);
    // Untouched fields survive from the base.
    expect(compiled.module.get<{ name: string }>('content.monsters', 'husk').name).toBe('Husk');
    expect(compiled.module.has('content.monsters', 'greater_husk')).toBe(true);
    // Everything else came along.
    expect(compiled.module.ids('rules.attributes')).toEqual(['vigor', 'wits']);
  });

  it('clears extends on the resolved document so it does not re-merge', () => {
    const base = loadMinimal();
    const pack = { id: 'p', version: '0.1.0', extends: 'minimal@1.0.0' };
    const resolved = resolveExtends(pack, () => base);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.document['extends']).toBeNull();
  });

  it('resolves a chain of packs', () => {
    const a = { id: 'a', version: '1.0.0', extends: null, depth: 'a' };
    const b = { id: 'b', version: '1.0.0', extends: 'a@1.0.0', layer: 'b' };
    const c = { id: 'c', version: '1.0.0', extends: 'b@1.0.0', layer: 'c' };
    const registry: Record<string, Record<string, unknown>> = { 'a@1.0.0': a, 'b@1.0.0': b };

    const resolved = resolveExtends(c, (id) => registry[id]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.document['depth']).toBe('a');
    expect(resolved.document['layer']).toBe('c');
  });

  it('reports a missing base rather than compiling a half-built module', () => {
    const result = resolveExtends({ id: 'p', version: '1.0.0', extends: 'gone@1.0.0' }, () => undefined);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not available/);
  });

  it('rejects a cycle instead of following it', () => {
    const x = { id: 'x', version: '1.0.0', extends: 'y@1.0.0' };
    const y = { id: 'y', version: '1.0.0', extends: 'x@1.0.0' };
    const registry: Record<string, Record<string, unknown>> = { 'x@1.0.0': x, 'y@1.0.0': y };

    const result = resolveExtends(x, (id) => registry[id]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cycle/);
  });

  it('rejects a malformed extends value', () => {
    const result = resolveExtends({ id: 'p', version: '1.0.0', extends: 'not-an-identity' }, () => undefined);
    expect(result.ok).toBe(false);
  });
});

/**
 * `extends` was unusable for a long time, and the merge machinery was never the
 * reason: the lint ran ahead of the resolution and every pass saw the raw child.
 * These pin the ordering that fixed it.
 */
describe('linting a module that extends another', () => {
  const base = loadMinimal();
  const pack = {
    format: 1,
    id: 'more_husks',
    version: '0.1.0',
    extends: 'minimal@1.0.0',
    meta: { title: 'More Husks' },
    content: { monsters: [{ id: 'husk', xp: 25 }] },
  };
  const resolve = () =>
    resolveExtends(pack, (identity) => (identity === 'minimal@1.0.0' ? base : undefined));

  it('passes when handed the resolved document', () => {
    const resolved = resolve();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const lint = lintModule(JSON.stringify(pack, null, 2), {
      assembled: resolved.document,
    });
    expect(lint.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(lint.ok).toBe(true);
  });

  it('exposes the compiled module rather than making the caller compile again', () => {
    const resolved = resolve();
    if (!resolved.ok) return;

    const lint = lintModule(JSON.stringify(pack, null, 2), {
      assembled: resolved.document,
    });
    expect(lint.compiled?.identity).toBe('more_husks@0.1.0');
    // The base's content is present, so the whole document really was checked.
    expect(lint.compiled?.get<{ name: string }>('content.monsters', 'husk').name).toBe('Husk');
  });

  it('fails on the raw child alone, which is why resolution has to come first', () => {
    const lint = lintModule(JSON.stringify(pack, null, 2));
    const errors = lint.diagnostics.filter((d) => d.severity === 'error');
    // It leans on its parent for the ruleset, so the schema has nothing to read.
    expect(errors.some((d) => d.path.startsWith('rules') || d.path === '')).toBe(true);
    expect(lint.compiled).toBeUndefined();
  });
});

describe('parseExtends', () => {
  it('parses and rejects identities', () => {
    expect(parseExtends('core_fantasy@1.0.0')).toEqual({ id: 'core_fantasy', version: '1.0.0' });
    expect(parseExtends('bad')).toBeNull();
    expect(parseExtends('Core@1.0.0')).toBeNull();
    expect(parseExtends('core@1.0')).toBeNull();
  });
});
