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
  flagWritersCanRun,
  roadsAreTwoWay,
  effectsRunBeforeChecks,
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
 * The pair that looks like one rule in a report and is two problems to fix.
 *
 * A flag nobody wrote is a typo. A flag written only inside a dialogue no NPC
 * owns is worse: the writer is in the file, so searching for the name finds it,
 * `flag_never_set` is correctly silent, and the objective still never
 * completes. Splitting them is the whole point, so the test proves each stays
 * quiet on the other's case.
 */
describe('a flag whose writer cannot be reached', () => {
  /** Add a dialogue nobody owns that sets `ghost_flag`, and wait on it. */
  const stranded = (own: boolean) =>
    broken('greenmarch', (doc) => {
      doc.narrative.dialogues.push({
        id: 'orphan_talk',
        start: 'greet',
        nodes: [
          {
            id: 'greet',
            says: [{ text: 'A voice from nowhere.' }],
            options: [
              { id: 'go', text: 'Leave.', effects: [{ setFlag: { flag: 'ghost_flag', value: true } }] },
            ],
          },
        ],
      });
      if (own) doc.content.npcs[0].dialogue = 'orphan_talk';
      doc.narrative.quests[0].requires = { flags: [{ flag: 'ghost_flag' }] };
    });

  it('fires where flag_never_set is correctly silent', () => {
    const found = runRules(stranded(false)).filter((d) => d.message.includes('ghost_flag'));
    expect(found.map((d) => d.code)).toEqual(['flag_writer_unreachable']);
    // And on its own, so the finding is this rule and not an interaction.
    expect(runRules(stranded(false), [flagWritersCanRun]).map((d) => d.code)).toEqual([
      'flag_writer_unreachable',
    ]);
    expect(found[0]?.message).toContain('no NPC owns');
  });

  it('says nothing once somebody owns the dialogue', () => {
    expect(runRules(stranded(true)).filter((d) => d.message.includes('ghost_flag'))).toEqual([]);
  });

  it('and the broken one compiles', () => {
    expect(compileModule(stranded(false)).ok).toBe(true);
  });
});

/**
 * Zero one-sided roads across 296 in Aurendel is not luck — `edges()` emits
 * both directions from one declaration. A world authored by hand has no such
 * guarantee, and the symptom is a party that walks somewhere and cannot walk
 * back, which reads as design.
 */
describe('roads', () => {
  it('says nothing about the modules that ship', () => {
    for (const name of ['greenmarch', 'aurendel']) {
      expect(runRules(load(name), [roadsAreTwoWay])).toEqual([]);
    }
  });

  it('catches a road with no return, and the module still compiles', () => {
    const doc = broken('aurendel', (d) => {
      const areas = d.world.areas;
      const from = areas[0];
      const to = areas.find((a: any) => a.id === from.connections[0].to);
      to.connections = to.connections.filter((c: any) => c.id !== from.id && c.to !== from.id);
    });
    const found = runRules(doc, [roadsAreTwoWay]);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toMatch(/has none back/);
    expect(compileModule(doc).ok).toBe(true);
  });

  it('accepts one that says it is one-way', () => {
    const doc = broken('aurendel', (d) => {
      const areas = d.world.areas;
      const from = areas[0];
      const to = areas.find((a: any) => a.id === from.connections[0].to);
      to.connections = to.connections.filter((c: any) => c.to !== from.id);
      from.connections[0].oneWay = true;
    });
    expect(runRules(doc, [roadsAreTwoWay])).toEqual([]);
  });
});

/**
 * The ordering that makes a persuasion check free.
 */
describe('effects before checks', () => {
  it('says nothing about the modules that ship', () => {
    for (const name of ['greenmarch', 'aurendel']) {
      expect(runRules(load(name), [effectsRunBeforeChecks])).toEqual([]);
    }
  });

  it('catches a reward that is handed over on a failed roll, and it compiles', () => {
    const doc = broken('greenmarch', (d) => {
      const node = d.narrative.dialogues[0].nodes[0];
      node.options[0].check = { skill: 'persuasion', difficulty: 12, onSuccess: node.id, onFailure: node.id };
      node.options[0].effects = [{ setFlag: { flag: 'paid_early', value: true } }];
    });
    const found = runRules(doc, [effectsRunBeforeChecks]);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toMatch(/either way/);
    expect(found[0]?.hint).toMatch(/move it to the onEnter/);
    expect(compileModule(doc).ok).toBe(true);
  });

  it('leaves an option with no check alone', () => {
    const doc = broken('greenmarch', (d) => {
      d.narrative.dialogues[0].nodes[0].options[0].effects = [{ setFlag: { flag: 'x', value: true } }];
    });
    expect(runRules(doc, [effectsRunBeforeChecks])).toEqual([]);
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
