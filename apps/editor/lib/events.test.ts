import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collectEvents, summariseEffects, summariseRequirement } from './events.js';
import type { ModuleDoc } from './store.js';

const doc = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../modules/greenmarch/module.json', import.meta.url)), 'utf8'),
) as ModuleDoc;

const events = collectEvents(doc);
const byKind = (kind: string) => events.filter((e) => e.kind === kind);

describe('collectEvents', () => {
  it('finds events of every kind the module defines', () => {
    for (const kind of ['trigger', 'reaction', 'gate', 'quest', 'dialogue', 'condition']) {
      expect(byKind(kind).length, `expected at least one ${kind}`).toBeGreaterThan(0);
    }
  });

  it('answers all five questions for a place trigger', () => {
    const millCleared = events.find((e) => e.where.startsWith('The Old Mill') && e.mode === 'untilComplete')!;

    expect(millCleared.when).toBe('combatEnd'); // when
    expect(millCleared.where).toContain('The Old Mill'); // where
    expect(millCleared.who).toBe('the party'); // who
    expect(millCleared.what).toContain('set mill_clear'); // what
    expect(millCleared.what.some((w) => w.includes('wardens'))).toBe(true);
    expect(millCleared.remembered).toBe(true);
  });

  // The half of the world that is easiest to lose track of.
  it('surfaces creature reactions with who they belong to', () => {
    const fury = byKind('reaction').find((e) => e.when === 'allyKilled')!;
    expect(fury.who).toBe('Bog Hound');
    expect(fury.what).toContain('apply emboldened');
  });

  it('shows a reaction gated on memory in the why column', () => {
    const remembers = byKind('reaction').find((e) => e.who === 'Barrow Wight')!;
    expect(remembers.why.join(' ')).toContain('remembers barrow_robbed');
  });

  it('shows an NPC reaction gated on what they have heard', () => {
    const vess = byKind('reaction').find((e) => e.who === 'Vess the Miller')!;
    expect(vess.why.join(' ')).toContain('theft');
  });

  it('describes a gate by what opens it', () => {
    const millDoor = byKind('gate').find((e) => e.where === 'The Mill Door')!;
    expect(millDoor.why).toContain('has brass_key');
    expect(millDoor.what.join(' ')).toContain('bypass: lockpicking');

    const ward = byKind('gate').find((e) => e.where === 'The Barrow Ward')!;
    expect(ward.why.join(' ')).toContain('any of');
  });

  it('records the repetition mode, which is the property most often wrong', () => {
    const modes = new Set(byKind('trigger').map((e) => e.mode));
    expect(modes).toContain('once');
    expect(modes).toContain('everyEntry');
    expect(modes).toContain('untilComplete');
    expect(modes).toContain('loop');
    expect(modes).toContain('restart');
  });

  it('reports ambient events as not remembered', () => {
    const mist = byKind('trigger').find((e) => e.where.includes('biome'))!;
    expect(mist.remembered).toBe(false);
    expect(mist.chance).toBeCloseTo(0.4);
  });

  it('includes gated dialogue options with their conditions', () => {
    const takeJob = byKind('dialogue').find((e) => e.when.includes("We'll clear it"))!;
    expect(takeJob.what.join(' ')).toContain('give brass_key');
    expect(takeJob.why.join(' ')).toContain('the_mill_door');
  });

  it('includes a persuasion check as something that happens', () => {
    const haggle = byKind('dialogue').find((e) => e.when.includes('cost you more'))!;
    expect(haggle.what.join(' ')).toContain('persuasion check');
    expect(haggle.mode).toBe('once');
  });

  it('links every event back to an entry that exists', () => {
    for (const event of events) {
      const segments = event.source.collection.split('.');
      const collection = (doc[segments[0]] as Record<string, unknown>)[segments[1]] as unknown[];
      expect(Array.isArray(collection), event.source.collection).toBe(true);
      expect(collection[event.source.index], event.key).toBeDefined();
    }
  });

  it('gives every event a unique key', () => {
    expect(new Set(events.map((e) => e.key)).size).toBe(events.length);
  });

  it('works on a document that does not validate', () => {
    // Authors need this view most while the module is still broken.
    const broken = { world: { areas: [{ id: 'a', triggers: [{ on: 'enter', effects: [] }] }] } };
    expect(collectEvents(broken as ModuleDoc)).toHaveLength(1);
    expect(collectEvents({})).toEqual([]);
  });
});

describe('summariseEffects', () => {
  it('describes each effect in a few words', () => {
    expect(summariseEffects([{ damage: { target: { ref: 'target.id' }, amount: 3 } }])).toEqual(['damage target']);
    expect(summariseEffects([{ setFlag: { flag: 'x' } }])).toEqual(['set x']);
    expect(summariseEffects([{ adjustReputation: { faction: 'wardens', amount: 15 } }])).toEqual(['+15 wardens']);
    expect(summariseEffects([{ adjustReputation: { faction: 'wardens', amount: -5 } }])).toEqual(['-5 wardens']);
  });

  it('looks inside control flow', () => {
    const summary = summariseEffects([
      { if: { when: true, then: [{ heal: { target: 'a', amount: 1 } }], else: [{ setFlag: { flag: 'y' } }] } },
    ]);
    expect(summary).toContain('heal a');
    expect(summary).toContain('set y');
  });

  it('deduplicates repeated effects', () => {
    const summary = summariseEffects([{ setFlag: { flag: 'x' } }, { setFlag: { flag: 'x' } }]);
    expect(summary).toEqual(['set x']);
  });

  it('returns nothing for an empty list, so a dead trigger is visible', () => {
    expect(summariseEffects([])).toEqual([]);
    expect(summariseEffects(undefined)).toEqual([]);
  });
});

describe('summariseRequirement', () => {
  it('describes every clause kind briefly', () => {
    const summary = summariseRequirement({
      minLevel: 3,
      classes: ['warden'],
      skills: [{ skill: 'lore', minRank: 2 }],
      items: [{ item: 'brass_key' }],
      quests: [{ quest: 'the_mill_door', status: 'complete' }],
      factions: [{ faction: 'wardens', minStanding: 10 }],
      memories: [{ deedKind: 'theft', who: 'speaker', known: false }],
      flags: [{ flag: 'mill_clear' }],
      without: { items: ['lantern'], quests: [], abilities: [], classes: [], conditions: [], flags: [] },
    });

    expect(summary).toContain('level 3+');
    expect(summary).toContain('warden');
    expect(summary).toContain('lore 2');
    expect(summary).toContain('has brass_key');
    expect(summary).toContain('the_mill_door complete');
    expect(summary).toContain('wardens 10');
    expect(summary).toContain('speaker has not heard theft');
    expect(summary).toContain('mill_clear');
    expect(summary).toContain('no lantern');
  });

  it('prefers a mastery tier over a raw rank when both are given', () => {
    expect(summariseRequirement({ skills: [{ skill: 'lore', minRank: 2, minTier: 'adept' }] })).toContain('lore adept');
  });

  it('returns nothing for an absent or empty gate', () => {
    expect(summariseRequirement(undefined)).toEqual([]);
    expect(summariseRequirement({})).toEqual([]);
  });
});
