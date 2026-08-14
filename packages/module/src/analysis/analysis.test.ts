import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  monsterThreat,
  xpToNextLevel,
  standardBudget,
  classify,
  budgetForTable,
  assessTable,
} from './budget.js';
import { buildReferenceIndex, referencesTo, findOrphans } from './references.js';

const doc = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../modules/greenmarch/module.json', import.meta.url)), 'utf8'),
) as Record<string, any>;

const monsters = doc['content']['monsters'] as any[];
const levels = doc['rules']['progression']['levels'] as any[];
const tables = doc['world']['encounterTables'] as any[];
const tableById = (id: string) => tables.find((t) => t.id === id);

describe('monsterThreat', () => {
  it('uses recorded xp', () => {
    expect(monsterThreat({ id: 'a', xp: 120 })).toBe(120);
  });

  it('prefers an explicit challenge over xp', () => {
    expect(monsterThreat({ id: 'a', xp: 10, challenge: 5 })).toBe(500);
  });

  it('falls back to level when nothing is recorded', () => {
    expect(monsterThreat({ id: 'a', level: 4 })).toBeGreaterThan(0);
  });
});

describe('budget thresholds', () => {
  // Derived from the module's own curve, so a different xp scale still works.
  it('reads the xp gap from the progression table', () => {
    expect(xpToNextLevel(levels, 1)).toBe(100); // 0 → 100
    expect(xpToNextLevel(levels, 2)).toBe(200); // 100 → 300
  });

  it('extrapolates past the end of the table', () => {
    expect(xpToNextLevel(levels, 99)).toBeGreaterThan(0);
  });

  it('scales the standard encounter with party size', () => {
    const solo = standardBudget(levels, 1, 1);
    const four = standardBudget(levels, 1, 4);
    expect(four).toBeCloseTo(solo * 4);
  });

  it('classifies threat against the budget', () => {
    expect(classify(10, 100)).toBe('trivial');
    expect(classify(100, 100)).toBe('standard');
    expect(classify(160, 100)).toBe('hard');
    expect(classify(250, 100)).toBe('deadly');
    expect(classify(1000, 100)).toBe('overwhelming');
  });
});

describe('budgetForTable', () => {
  const budget = budgetForTable(tableById('fen_wanderers'), monsters);

  it('computes probabilities that account for the empty weight', () => {
    const total = budget.groups.reduce((sum, g) => sum + g.probability, 0);
    // fen_wanderers has emptyWeight 20, so groups do not sum to 1.
    expect(total).toBeLessThan(1);
    expect(total).toBeGreaterThan(0.5);
  });

  it('derives count bounds from dice notation', () => {
    const pack = budget.groups.find((g) => g.id === 'hound_pack')!;
    expect(pack.minCount).toBe(2); // 1d3+1
    expect(pack.maxCount).toBe(4);
  });

  it('scales threat by the action economy, so a pack outweighs its raw xp', () => {
    const lone = budget.groups.find((g) => g.id === 'lone_hound')!;
    const pack = budget.groups.find((g) => g.id === 'hound_pack')!;
    // Four hounds are worth more than four times one hound.
    expect(pack.maxThreat).toBeGreaterThan(lone.maxThreat * 4);
  });

  it('marks gated groups, which may never appear', () => {
    expect(budget.groups.find((g) => g.id === 'hound_pack')!.gated).toBe(true);
    expect(budget.groups.find((g) => g.id === 'lone_hound')!.gated).toBe(false);
  });

  it('reports the worst case separately from the expected case', () => {
    expect(budget.maxThreat).toBeGreaterThan(budget.expectedThreat);
  });

  it('flags entries whose monster does not exist', () => {
    const broken = budgetForTable(
      { id: 't', groups: [{ id: 'g', entries: [{ monster: 'ghost' }] }] },
      monsters,
    );
    expect(broken.groups[0]!.missingMonsters).toEqual(['ghost']);
  });

  it('folds the table-level chance into the expected threat', () => {
    const certain = budgetForTable({ ...tableById('fen_wanderers'), chance: 1 }, monsters);
    expect(certain.expectedThreat).toBeGreaterThan(budget.expectedThreat);
  });
});

describe('assessTable', () => {
  // The case the feature exists for: an area rated for low levels whose table
  // can produce something far above it.
  it('detects that the fens can outmatch a level 2 party', () => {
    const assessment = assessTable(tableById('fen_wanderers'), monsters, levels, 2, 4);
    expect(assessment.expected).toBe('trivial');
    // The gated wight group is a very different proposition.
    expect(['hard', 'deadly', 'overwhelming']).toContain(assessment.worst);
  });

  it('eases as the party levels up', () => {
    const order = ['trivial', 'easy', 'standard', 'hard', 'deadly', 'overwhelming'];
    const low = assessTable(tableById('barrow_boss'), monsters, levels, 1, 4);
    const high = assessTable(tableById('barrow_boss'), monsters, levels, 5, 4);
    expect(order.indexOf(high.worst)).toBeLessThanOrEqual(order.indexOf(low.worst));
  });
});

describe('reference index', () => {
  const index = buildReferenceIndex(doc);

  it('finds what points at a loot table', () => {
    const refs = referencesTo(index, 'content.lootTables', 'fen_scavenge');
    const sources = refs.map((r) => r.fromId);
    expect(sources).toContain('bog_hound');
    expect(sources).toContain('barrow_wight');
  });

  it('records which field holds each reference', () => {
    const refs = referencesTo(index, 'content.lootTables', 'fen_scavenge');
    expect(refs.find((r) => r.fromId === 'bog_hound')!.field).toBe('loot');
  });

  it('finds references made through record keys', () => {
    // Ancestry attribute bonuses are keyed by attribute id.
    const refs = referencesTo(index, 'rules.attributes', 'presence');
    expect(refs.some((r) => r.fromId === 'human')).toBe(true);
  });

  it('finds references from nested arrays', () => {
    const refs = referencesTo(index, 'content.items', 'iron_sword');
    expect(refs.some((r) => r.fromCollection === 'content.classes')).toBe(true);
  });

  it('finds cross-section references', () => {
    const refs = referencesTo(index, 'world.gates', 'mill_door');
    expect(refs.some((r) => r.fromId === 'the_mill')).toBe(true);
  });

  it('returns nothing for an unreferenced id', () => {
    expect(referencesTo(index, 'content.monsters', 'nonexistent')).toEqual([]);
  });

  it('links every reference back to a real entry', () => {
    for (const [, byId] of index) {
      for (const [, refs] of byId) {
        for (const ref of refs) {
          const [section, name] = ref.fromCollection.split('.') as [string, string];
          expect(doc[section][name][ref.fromIndex]).toBeDefined();
        }
      }
    }
  });
});

describe('findOrphans', () => {
  it('finds content nothing points at', () => {
    const withOrphan = JSON.parse(JSON.stringify(doc)) as Record<string, any>;
    withOrphan['content']['lootTables'].push({
      id: 'forgotten_hoard',
      rolls: '1',
      entries: [{ weight: 1, value: { item: 'rope', quantity: '1' } }],
    });

    const orphans = findOrphans(withOrphan, buildReferenceIndex(withOrphan));
    expect(orphans.some((o) => o.id === 'forgotten_hoard')).toBe(true);
  });

  it('does not report content that is referenced', () => {
    const orphans = findOrphans(doc, buildReferenceIndex(doc));
    expect(orphans.some((o) => o.id === 'fen_scavenge')).toBe(false);
    expect(orphans.some((o) => o.id === 'bog_hound')).toBe(false);
  });

  it('can ignore collections that are legitimately unreferenced', () => {
    const orphans = findOrphans(doc, buildReferenceIndex(doc), ['narrative.textGrammar']);
    expect(orphans.some((o) => o.collection === 'narrative.textGrammar')).toBe(false);
  });
});
