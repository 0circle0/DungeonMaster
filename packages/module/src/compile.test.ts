import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileModule, hashModule } from './compile.js';
import { loadModuleFrom } from './load.js';
import type { GameModule } from './schema/module.js';

const MINIMAL_PATH = fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url));

function loadMinimal(): Record<string, unknown> {
  return JSON.parse(readFileSync(MINIMAL_PATH, 'utf8')) as Record<string, unknown>;
}

/** Deep clone so each test can mutate its own copy. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Rebuild every object with its keys in reverse order, leaving content identical. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).reverse()) {
    out[key] = reverseKeys((value as Record<string, unknown>)[key]);
  }
  return out;
}

describe('compileModule', () => {
  it('compiles the minimal module', () => {
    const result = compileModule(loadMinimal());
    if (!result.ok) {
      throw new Error(`expected success, got:\n${result.errors.map((e) => `${e.path}: ${e.message}`).join('\n')}`);
    }
    expect(result.module.identity).toBe('minimal@1.0.0');
  });

  it('indexes collections for id lookup', () => {
    const result = compileModule(loadMinimal());
    if (!result.ok) throw new Error('expected success');
    const { module } = result;

    expect(module.has('content.monsters', 'husk')).toBe(true);
    expect(module.get<{ name: string }>('content.monsters', 'husk').name).toBe('Husk');
    expect(module.ids('rules.attributes')).toEqual(['vigor', 'wits']);
    expect(module.all('content.items')).toHaveLength(1);
    expect(module.find('content.monsters', 'dragon')).toBeUndefined();
    expect(() => module.get('content.monsters', 'dragon')).toThrow(/no entry/);
  });

  it('applies schema defaults', () => {
    const result = compileModule(loadMinimal());
    if (!result.ok) throw new Error('expected success');
    // `stackable` is not written in the fixture.
    expect(result.module.get<{ stackable: boolean }>('content.items', 'cudgel').stackable).toBe(false);
    expect(result.module.source.start.partySize).toBe(1);
  });

  describe('reference integrity', () => {
    // The check that keeps a typo from becoming a crash three rooms deep.
    it('rejects a dangling reference in a nested field', () => {
      const doc = clone(loadMinimal()) as unknown as GameModule;
      doc.content.monsters[0]!.loot = 'no_such_table';

      const result = compileModule(doc);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'dangling_ref', path: expect.stringContaining('loot') }),
      );
    });

    it('rejects a dangling reference inside an array of objects', () => {
      const doc = clone(loadMinimal()) as unknown as GameModule;
      doc.content.classes[0]!.startingItems = [{ item: 'ghost_item', quantity: 1 }];

      const result = compileModule(doc);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.some((e) => e.code === 'dangling_ref')).toBe(true);
    });

    // Record keys are references too — attribute bonuses are keyed by attribute id.
    it('rejects a dangling reference used as a record key', () => {
      const doc = clone(loadMinimal()) as unknown as GameModule;
      doc.content.ancestries[0]!.attributeBonuses = { charisma: 1 };

      const result = compileModule(doc);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'dangling_ref', message: expect.stringContaining('charisma') }),
      );
    });

    it('rejects a dangling reference at the top of the rules', () => {
      const doc = clone(loadMinimal()) as unknown as GameModule;
      doc.rules.vitalResource = 'stamina';

      const result = compileModule(doc);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.some((e) => e.code === 'dangling_ref')).toBe(true);
    });

    it('accepts every reference in the fixture, proving the walker reaches them', () => {
      // A walker that silently visits nothing would also report zero errors, so confirm it found
      // references by breaking one of each kind.
      const kinds: Array<(doc: GameModule) => void> = [
        (d) => { d.content.monsters[0]!.abilities = ['nope']; },
        (d) => { d.world.biomes[0]!.roomTemplates = ['nope']; },
        (d) => { d.world.dungeons[0]!.biome = 'nope'; },
        (d) => { d.content.items[0]!.slot = 'nope'; },
        (d) => { d.content.skills[0]!.attribute = 'nope'; },
        (d) => { d.content.abilities[0]!.attack = { stat: 'nope', against: 'ward' }; },
        (d) => { d.start.startingDungeon = 'nope'; },
      ];
      for (const [i, corrupt] of kinds.entries()) {
        const doc = clone(loadMinimal()) as unknown as GameModule;
        corrupt(doc);
        const result = compileModule(doc);
        expect(result.ok, `corruption #${i} should have been caught`).toBe(false);
      }
    });
  });

  it('rejects duplicate ids', () => {
    const doc = clone(loadMinimal()) as unknown as GameModule;
    doc.content.monsters.push(clone(doc.content.monsters[0]!));

    const result = compileModule(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'duplicate_id' }));
  });

  it('reports schema errors with a path', () => {
    const doc = clone(loadMinimal());
    (doc['rules'] as Record<string, unknown>)['attributes'] = [];

    const result = compileModule(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe('schema');
    expect(result.errors[0]!.path).toContain('attributes');
  });

  it('rejects unknown top-level keys rather than ignoring them', () => {
    const doc = clone(loadMinimal());
    doc['rulez'] = {};
    expect(compileModule(doc).ok).toBe(false);
  });

  it('rejects invalid dice notation at load, not in combat', () => {
    const doc = clone(loadMinimal()) as unknown as GameModule;
    doc.content.classes[0]!.hitDie = '1d';

    const result = compileModule(doc);
    expect(result.ok).toBe(false);
  });

  it('warns about a thin text pool without failing', () => {
    const doc = clone(loadMinimal()) as unknown as GameModule;
    doc.narrative.textGrammar[0]!.variants = [{ text: 'A room.', weight: 1, tags: [] }];

    const result = compileModule(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'thin_text_pool' }),
    );
  });
});

describe('hashModule', () => {
  it('is stable across key reordering but changes with content', () => {
    const result = compileModule(loadMinimal());
    if (!result.ok) throw new Error('expected success');
    const original = result.module.hash;

    // Same content, every object's keys rebuilt in reverse order.
    const reordered = reverseKeys(result.module.source) as GameModule;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(result.module.source));
    expect(hashModule(reordered)).toBe(original);

    const changed = clone(result.module.source);
    changed.content.monsters[0]!.xp = 999;
    expect(hashModule(changed)).not.toBe(original);
  });

  /**
   * Do not "fix" this test by updating the expected values.
   *
   * `compileModule` hashes `parsed.data` — the document after zod applies defaults — so any new
   * top-level field carrying a `.default()` changes the hash of every module ever authored, and
   * `load()` refuses a save whose recorded hash no longer matches.
   *
   * If this test fails, a schema change did it. The fix is to make the new field `.optional()`,
   * since an absent key stays absent in `parsed.data`.
   *
   * One change cannot take that fix: a new sentence for the engine to say. `systemTextSchema` gives
   * every `message` a `.default()`, so a new `SYSTEM_TEXT` entry appears in `parsed.data` for every
   * module that has not declared it. Making messages `.optional()` would not help — the messages
   * `minimal` leaves to their defaults would then vanish from the document and move the hash by as
   * much.
   *
   * The number below has been re-stamped for: the `lore.learned` sentences;
   * `rules.resolution.swingStacking`; `rules.resolution.criticalScope`; and `rules.temperament`
   * with `rules.perception.maxMarksPerTile`. Each is a policy the ruleset holds an opinion about,
   * which is declared rather than invented as a fallback. Their per-entry companions —
   * `rules.conditions[].swings`, `content.monsters[].temperament`, `content.npcs[].temperament`,
   * `world.terrains[].marks` — are `.optional()` and moved nothing. Saves from before each move
   * need `allowModuleDrift`.
   */
  it('is unchanged for a module that declares no mods', () => {
    // `minimal` is the witness rather than greenmarch: greenmarch carries mods and authored `extra`
    // data, so its hash moves whenever its content does. `minimal` declares no mods, so only the
    // schema can move this number.
    const at = (name: string) => fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url));
    expect(loadModuleFrom(at('minimal')).hash).toBe('25b811d298a743a2');
  });

  it('treats an absent `mods` key as absent, not as an empty list', () => {
    // The property the pinned number depends on. If `mods` were `.default([])` rather than
    // `.optional()`, zod would insert `mods: []` into every document ever parsed and every module
    // hash would change. The two hashes below being different is what proves the key stays out.
    const bare = compileModule(loadMinimal());
    const doc = loadMinimal();
    doc['mods'] = [];
    const empty = compileModule(doc);
    if (!bare.ok || !empty.ok) throw new Error('expected both to compile');

    expect(empty.module.hash).not.toBe(bare.module.hash);
    expect(bare.module.source.mods).toBeUndefined();
    expect(empty.module.source.mods).toEqual([]);
  });
});

describe('checkMods', () => {
  it('rejects two pins for one mod', () => {
    const doc = loadMinimal();
    doc['mods'] = [
      { id: 'thorns', hash: '0'.repeat(16) },
      { id: 'thorns', hash: '1'.repeat(16) },
    ];
    const result = compileModule(doc);
    if (result.ok) throw new Error('expected duplicate_mod');
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'duplicate_mod' }));
  });

  it('warns that `required` on an editor mod does not gate play', () => {
    const doc = loadMinimal();
    doc['mods'] = [{ id: 'thorns_studio', hash: '0'.repeat(16), target: 'editor', required: true }];
    const result = compileModule(doc);
    if (!result.ok) throw new Error(`expected success: ${JSON.stringify(result.errors)}`);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'mod_required_editor' }));
  });

  it('changes the module hash, so a pin cannot drift unnoticed', () => {
    const bare = compileModule(loadMinimal());
    const doc = loadMinimal();
    doc['mods'] = [{ id: 'thorns', hash: 'a'.repeat(16), required: true }];
    const pinned = compileModule(doc);
    if (!bare.ok || !pinned.ok) throw new Error('expected both to compile');
    expect(pinned.module.hash).not.toBe(bare.module.hash);
  });
});
