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
      // A walker that silently visits nothing would also report zero errors, so
      // confirm it actually found references by breaking one of each kind.
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
   * ⚠️ DO NOT "fix" this test by updating the expected values. ⚠️
   *
   * `compileModule` hashes `parsed.data` — the document *after* zod applies
   * defaults. So any new top-level field carrying a `.default()` silently
   * changes the hash of every module ever authored, and `load()` in the engine
   * refuses a save whose recorded module hash no longer matches. The first
   * symptom is every player's save file failing to load.
   *
   * If this test fails, a schema change did that. The fix is to make the new
   * field `.optional()` (an absent key stays absent in `parsed.data`, so the
   * hash is untouched), not to re-stamp the numbers below.
   *
   * There is **one** change that cannot take that fix, and it is worth naming
   * so the next person does not go looking for a way out that is not there:
   * **a new sentence for the engine to say.** `systemTextSchema` gives every
   * `message` a `.default()` so an author writes only what they want to change,
   * which means a new `SYSTEM_TEXT` entry appears in `parsed.data` for every
   * module that has not declared it. Making messages `.optional()` with the
   * reader falling back would not avoid it either — the nine messages `minimal`
   * currently leaves to their defaults would then vanish from the document, and
   * the hash would move by exactly as much. Adding engine prose moves the hash.
   * Everything else has a way not to.
   *
   * The number below was re-stamped once, for the `lore.learned` pair. The lore
   * feature's three *structural* additions — `narrative.lore`,
   * `narrative.loreThreads` and `requirement.lore` — are all `.optional()`
   * precisely so they contributed nothing to that move; the sentences were the
   * whole of it. Saves written before it need `allowModuleDrift`.
   *
   * Re-stamped a second time for `rules.resolution.swingStacking`. That one
   * could have been `.optional()` with the engine falling back to `cancel`,
   * and the hash would not have moved — but an invented fallback is the thing
   * `hardcoded-audit.md` spent a pass removing, and a resolution policy an
   * author cannot see in their own document is not a policy they can change.
   * A declared default is worth a hash move. Its companion
   * `rules.conditions[].swings` landed in the same pass and is `.optional()`,
   * and the number below did not budge for it — which is the distinction
   * working: a policy the ruleset holds an opinion about is declared, and
   * per entry structure that is usually absent stays absent.
   *
   * Re-stamped a third time for `rules.resolution.criticalScope`, on the same
   * reasoning: which rolls can crit is an opinion, and an author who cannot
   * see it in their own document cannot tell they hold it.
   */
  it('is unchanged for a module that declares no mods', () => {
    // `minimal` is the witness, and deliberately not greenmarch: greenmarch
    // carries mods and authored `extra` data now, so its hash moves whenever
    // its *content* does, which would make this test noise. `minimal` declares
    // no mods and is the no-hardcoding control, so the only thing that can
    // move this number is the schema itself.
    const at = (name: string) => fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url));
    expect(loadModuleFrom(at('minimal')).hash).toBe('601a1f7d06eb69df');
  });

  it('treats an absent `mods` key as absent, not as an empty list', () => {
    // The property the pinned number above depends on, stated directly.
    //
    // `compileModule` hashes `parsed.data`, so if `mods` were `.default([])`
    // rather than `.optional()`, zod would insert `mods: []` into every
    // document ever parsed and every module hash in existence would change —
    // and `load()` refuses a save whose recorded hash no longer matches. The
    // two hashes below being *different* is what proves the key stays out.
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
