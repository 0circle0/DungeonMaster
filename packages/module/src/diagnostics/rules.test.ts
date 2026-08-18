/**
 * Each of these has the same shape: a module that passes every existing check
 * and is broken anyway. That is the whole reason the file exists — if `validate`
 * already caught it, a second checker would just be noise.
 *
 * So every rule is tested twice: it fires on the broken document, and the
 * broken document *compiles*. The second assertion is the interesting one.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readAssembledModule } from '../load.js';
import { compileModule } from '../compile.js';
import {
  runRules,
  DEFAULT_RULES,
  objectiveTargetsResolve,
  flagsHaveWriters,
  questsAreReachable,
  killTargetsCanSpawn,
  dialoguesAreReachable,
  ENGINE_FLAG_PREFIXES,
} from './rules.js';

const load = (name: string): Record<string, unknown> =>
  readAssembledModule(fileURLToPath(new URL(`../../../../modules/${name}`, import.meta.url))).doc;

/** Deep-clone so a mutation in one test cannot reach another. */
const broken = (name: string, mutate: (doc: any) => void): Record<string, unknown> => {
  const doc = JSON.parse(JSON.stringify(load(name))) as Record<string, unknown>;
  mutate(doc);
  return doc;
};

const codes = (doc: Record<string, unknown>, rules = DEFAULT_RULES) =>
  runRules(doc, rules).map((d) => d.code);

/**
 * What the rules say about the modules that ship — pinned rather than asserted
 * empty, because they are not empty and that is the point.
 *
 * Every one of these compiles, validates and plays. They are flags that three
 * places wait on and nothing sets, which is the exact failure this file exists
 * for: silent at load, silent at validate, and visible only to whoever
 * eventually plays far enough to notice a door that never opens.
 *
 * `dmkit/lint.py` has a check with the same name and misses all four, because
 * it counts *any* value under a `flag` key as a write — including the reads in
 * a structured gate. Worth recording as the reason this is not a port.
 */
describe('what the rules find in the modules that ship', () => {
  it('says nothing about minimal, which has no quests to get wrong', () => {
    expect(runRules(load('minimal'))).toEqual([]);
  });

  it('finds greenmarch waiting on a flag nothing sets', () => {
    const found = runRules(load('greenmarch'));
    expect(found.map((d) => d.code)).toEqual(['flag_never_set']);
    expect(found[0]?.message).toContain('vess_dead');
  });

  it('finds three of them in aurendel', () => {
    const found = runRules(load('aurendel'));
    expect(found.every((d) => d.code === 'flag_never_set')).toBe(true);
    expect(found.map((d) => d.message.match(/"([^"]+)"/)?.[1]).sort()).toEqual([
      'barrow_cleared',
      'eelweir_told_keepers',
      'strand_informed',
    ]);
  });

  /**
   * The same missing flag breaks two opposite ways, and an author sent looking
   * for the wrong one looks in the wrong place. Two of aurendel's three are
   * read only under `without`: the gate they guard never closes, and telling
   * that author it "never comes true" points them at the wrong end of it.
   */
  it('says which way the gate is stuck', () => {
    const gate = (requires: unknown) =>
      runRules(
        broken('greenmarch', (doc) => {
          doc.narrative.quests[0].requires = requires;
        }),
      ).find((d) => d.message.includes('ghost_flag'))?.message ?? '';

    expect(gate({ flags: [{ flag: 'ghost_flag' }] })).toContain('never comes true');
    expect(gate({ without: { flags: [{ flag: 'ghost_flag' }] } })).toContain('always open');
  });

});

/**
 * The engine keeps its own records in the same flag space, under computed
 * names. A rule that did not know would call every one a broken flag.
 */
describe('flags the engine writes', () => {
  it('still appears in the engine', () => {
    const source: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) source.push(readFileSync(path, 'utf8'));
      }
    };
    walk(fileURLToPath(new URL('../../../engine/src', import.meta.url)));
    const haystack = source.join('\n');

    for (const prefix of ENGINE_FLAG_PREFIXES) {
      expect(haystack, `nothing in the engine writes ${prefix} any more`).toContain(prefix);
    }
  });

  it('does not complain about one', () => {
    const doc = broken('greenmarch', (d) => {
      d.narrative.quests[0].objectives = [
        { id: 'x', description: 'x', kind: 'custom', when: { test: { ref: 'flags.trigger:mill_cleared' } } },
      ];
    });
    expect(runRules(doc, [flagsHaveWriters]).map((x) => x.message)).not.toContain(
      expect.stringContaining('trigger:mill_cleared'),
    );
  });
});

describe('objective targets', () => {
  it('catches a kill objective naming a monster that does not exist', () => {
    const doc = broken('greenmarch', (d) => {
      const quest = d.narrative.quests.find((q: any) =>
        [...(q.objectives ?? []), ...(q.stages ?? []).flatMap((s: any) => s.objectives ?? [])]
          .some((o: any) => o.kind === 'kill'),
      );
      const objective = [...(quest.objectives ?? []), ...(quest.stages ?? []).flatMap((s: any) => s.objectives ?? [])]
        .find((o: any) => o.kind === 'kill');
      objective.target = 'bog_hownd';
    });

    expect(codes(doc, [objectiveTargetsResolve])).toEqual(['objective_target_missing']);
    // The point: nothing else complains.
    expect(compileModule(doc).ok, 'this is why the rule has to exist').toBe(true);
  });

  it('accepts a reach objective pointing at a trigger rather than a place', () => {
    const doc = broken('greenmarch', (d) => {
      const trigger = d.world.pointsOfInterest.flatMap((p: any) => p.triggers ?? [])[0];
      d.narrative.quests[0].objectives = [
        { id: 'go', description: 'Go', kind: 'reach', target: trigger.id },
      ];
    });
    expect(codes(doc, [objectiveTargetsResolve])).toEqual([]);
  });
});

describe('flags', () => {
  it('catches a flag nothing sets, and suggests the one that exists', () => {
    const doc = broken('greenmarch', (d) => {
      d.narrative.quests[0].objectives = [
        {
          id: 'wait',
          description: 'Wait for something that never happens',
          kind: 'custom',
          when: { test: { ref: 'flags.mill_cleer' } },
        },
      ];
    });

    // greenmarch already has one of these, so look for the injected one rather
    // than for a count — see the pinned findings above.
    const found = runRules(doc, [flagsHaveWriters]).filter((d) => d.message.includes('mill_cleer'));
    expect(found).toHaveLength(1);
    expect(found[0]?.hint).toMatch(/mill_clear/);
    expect(compileModule(doc).ok).toBe(true);
  });
});

describe('reachability', () => {
  it('catches a quest nobody can be offered', () => {
    // Cut one quest off rather than gutting the module: the point is that the
    // document is otherwise entirely well-formed, which a wholesale deletion
    // would stop being.
    let orphaned = '';
    const doc = broken('greenmarch', (d) => {
      const quest = d.narrative.quests.at(-1);
      orphaned = quest.id;
      delete quest.giver;
      quest.autoStart = false;
      for (const other of d.narrative.quests) {
        other.unlocks = (other.unlocks ?? []).filter((id: string) => id !== orphaned);
      }
      for (const npc of d.content.npcs) {
        npc.offersQuests = (npc.offersQuests ?? []).filter((id: string) => id !== orphaned);
      }
    });

    const found = runRules(doc, [questsAreReachable]);
    expect(found.map((d) => d.message.match(/"([^"]+)"/)?.[1])).toContain(orphaned);
    expect(compileModule(doc).ok, 'this is why the rule has to exist').toBe(true);
  });

  it('follows unlocks, so a chain reached through its head is fine', () => {
    const doc = broken('greenmarch', (d) => {
      const [first, second] = d.narrative.quests;
      first.autoStart = true;
      first.unlocks = [second.id];
      delete second.giver;
      second.autoStart = false;
      for (const npc of d.content.npcs) npc.offersQuests = [];
    });
    const unreachable = runRules(doc, [questsAreReachable]).map((x) => x.path);
    expect(unreachable).not.toContain('narrative.quests.1');
  });
});

describe('kill targets can appear', () => {
  it('catches a creature no referenced table produces', () => {
    const doc = broken('greenmarch', (d) => {
      // The monster exists and the objective is correct; it just cannot be met,
      // because nothing draws from a table that produces it any more.
      d.world.encounterTables = [];
      for (const area of d.world.areas) area.encounterTables = [];
      for (const poi of d.world.pointsOfInterest) poi.encounterTables = [];
      for (const dungeon of d.world.dungeons ?? []) delete dungeon.bossTable;
      for (const room of d.world.roomTemplates ?? []) room.encounterTables = [];
    });

    expect(codes(doc, [killTargetsCanSpawn])).toContain('kill_target_never_spawns');
  });
});

describe('dialogues', () => {
  it('catches prose nobody can open', () => {
    const doc = broken('greenmarch', (d) => {
      d.narrative.dialogues.push({
        id: 'forgotten',
        start: 'greet',
        nodes: [{ id: 'greet', says: [{ text: 'Nobody will ever hear this.' }] }],
      });
    });

    expect(codes(doc, [dialoguesAreReachable])).toEqual(['dialogue_unowned']);
    expect(compileModule(doc).ok).toBe(true);
  });
});

describe('a rule is data', () => {
  it('says what it reads and why it exists', () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.reads.length, `${rule.code} should say what it reads`).toBeGreaterThan(0);
      expect(rule.why.length, `${rule.code} should say why`).toBeGreaterThan(40);
      expect(['error', 'warning', 'info']).toContain(rule.severity);
    }
  });

  it('lets the caller choose and order the list', () => {
    const doc = load('greenmarch');
    expect(runRules(doc, [])).toEqual([]);
  });
});
