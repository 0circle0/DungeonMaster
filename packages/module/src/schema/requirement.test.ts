import { describe, it, expect } from 'vitest';
import { Rng } from '@dm/core';
import { requirementSchema, compileRequirement, isEmptyRequirement } from './requirement.js';
import { evalPredicate } from '../dsl/eval.js';
import type { Scope } from '../dsl/eval.js';

/** Parse through the schema so defaults are applied, as a real module would. */
function req(partial: Record<string, unknown>) {
  const parsed = requirementSchema.safeParse(partial);
  if (!parsed.success) throw new Error(parsed.error.message);
  return parsed.data;
}

/** A party member and world state to evaluate gates against. */
const SCOPE: Scope = {
  actor: {
    level: 5,
    class: 'stalker',
    ancestry: 'dwarf',
    abilities: ['cleave', 'read_runes'],
    attr: { might: 16, wits: 9 },
    skills: { lockpicking: 3, lore: 1 },
    inventory: { brass_key: 1, rope: 2 },
    equippedItems: { warded_blade: 1 },
    conditions: { burning: 2 },
  },
  reputation: { wardens: 20, thieves: -5 },
  // Supplied by the engine's `buildScope`: the rank a tier starts at, and each
  // faction's own ladder. Both are scoped exactly as the engine scopes them.
  tiers: { novice: 1, adept: 3, master: 6 },
  ranks: { wardens: { friend: 10, trusted: 25 }, thieves: { trusted: 5 } },
  flags: { met_vess: true, tithe_paid: false, chapter: 3 },
  quests: {
    find_the_mill: { status: 'complete', objectives: { burn_it: true } },
    the_long_road: { status: 'active' },
  },
  memory: {
    speaker: { theft: { at: 4 } },
    party: {},
  },
  world: { day: 9 },
};

const holds = (r: ReturnType<typeof req>, scope: Scope = SCOPE) =>
  evalPredicate(compileRequirement(r), { scope, rng: Rng.fromSeed(1) });

describe('isEmptyRequirement', () => {
  it('treats an all-defaults requirement as no gate at all', () => {
    expect(isEmptyRequirement(req({}))).toBe(true);
    expect(isEmptyRequirement(undefined)).toBe(true);
    expect(compileRequirement(req({}))).toBe(true);
  });

  it('is not empty once any clause is set', () => {
    expect(isEmptyRequirement(req({ minLevel: 2 }))).toBe(false);
  });
});

describe('character development gates', () => {
  it('gates on level', () => {
    expect(holds(req({ minLevel: 5 }))).toBe(true);
    expect(holds(req({ minLevel: 6 }))).toBe(false);
    expect(holds(req({ maxLevel: 4 }))).toBe(false);
    expect(holds(req({ minLevel: 3, maxLevel: 7 }))).toBe(true);
  });

  it('gates on class and ancestry as alternatives', () => {
    expect(holds(req({ classes: ['stalker', 'warden'] }))).toBe(true);
    expect(holds(req({ classes: ['warden'] }))).toBe(false);
    expect(holds(req({ ancestries: ['dwarf'] }))).toBe(true);
  });

  it('gates on a known ability', () => {
    expect(holds(req({ abilities: ['read_runes'] }))).toBe(true);
    expect(holds(req({ abilities: ['read_runes', 'fly'] }))).toBe(false);
  });

  it('gates on skill rank — mastery', () => {
    expect(holds(req({ skills: [{ skill: 'lockpicking', minRank: 3 }] }))).toBe(true);
    expect(holds(req({ skills: [{ skill: 'lockpicking', minRank: 4 }] }))).toBe(false);
    // An untrained skill must read as rank 0, not as an error.
    expect(holds(req({ skills: [{ skill: 'smithing', minRank: 1 }] }))).toBe(false);
  });

  it('gates on a named mastery tier', () => {
    // lockpicking is rank 3, and `adept` starts at rank 3.
    expect(holds(req({ skills: [{ skill: 'lockpicking', minTier: 'adept' }] }))).toBe(true);
    expect(holds(req({ skills: [{ skill: 'lockpicking', minTier: 'master' }] }))).toBe(false);
    // lore is rank 1 — trained, but not yet adept.
    expect(holds(req({ skills: [{ skill: 'lore', minTier: 'adept' }] }))).toBe(false);
    expect(holds(req({ skills: [{ skill: 'lore', minTier: 'novice' }] }))).toBe(true);
  });

  it('does not throw when a tier gate is evaluated', () => {
    // A tier compiled against an unpopulated namespace resolved to null and
    // then threw inside the comparison, from call sites that do not catch —
    // so a gate, an ability, a quest or a dialogue option carrying a `minTier`
    // took the whole reduction down.
    expect(() => holds(req({ skills: [{ skill: 'lore', minTier: 'adept' }] }))).not.toThrow();
  });

  it('gates on attribute scores', () => {
    expect(holds(req({ attributes: [{ attribute: 'might', min: 16 }] }))).toBe(true);
    expect(holds(req({ attributes: [{ attribute: 'wits', min: 12 }] }))).toBe(false);
  });
});

describe('possession and progress gates', () => {
  it('gates on carried items and quantity', () => {
    expect(holds(req({ items: [{ item: 'brass_key' }] }))).toBe(true);
    expect(holds(req({ items: [{ item: 'rope', quantity: 2 }] }))).toBe(true);
    expect(holds(req({ items: [{ item: 'rope', quantity: 3 }] }))).toBe(false);
    expect(holds(req({ items: [{ item: 'lantern' }] }))).toBe(false);
  });

  it('distinguishes equipped from merely carried', () => {
    expect(holds(req({ items: [{ item: 'warded_blade', equipped: true }] }))).toBe(true);
    expect(holds(req({ items: [{ item: 'brass_key', equipped: true }] }))).toBe(false);
  });

  it('gates on quest status, including never having started one', () => {
    expect(holds(req({ quests: [{ quest: 'find_the_mill', status: 'complete' }] }))).toBe(true);
    expect(holds(req({ quests: [{ quest: 'the_long_road', status: 'complete' }] }))).toBe(false);
    expect(holds(req({ quests: [{ quest: 'the_long_road', status: 'active' }] }))).toBe(true);
    expect(holds(req({ quests: [{ quest: 'never_offered', status: 'unstarted' }] }))).toBe(true);
    expect(holds(req({ quests: [{ quest: 'find_the_mill', status: 'unstarted' }] }))).toBe(false);
  });

  it('gates on a single objective within a quest', () => {
    expect(holds(req({ quests: [{ quest: 'find_the_mill', objective: 'burn_it' }] }))).toBe(true);
    expect(holds(req({ quests: [{ quest: 'find_the_mill', objective: 'spare_it' }] }))).toBe(false);
  });

  it('gates on faction standing', () => {
    expect(holds(req({ factions: [{ faction: 'wardens', minStanding: 10 }] }))).toBe(true);
    expect(holds(req({ factions: [{ faction: 'wardens', minStanding: 30 }] }))).toBe(false);
    expect(holds(req({ factions: [{ faction: 'thieves', maxStanding: 0 }] }))).toBe(true);
    // An unknown faction reads as neutral rather than failing.
    expect(holds(req({ factions: [{ faction: 'cult', minStanding: 0 }] }))).toBe(true);
  });

  it('gates on a named faction rank', () => {
    // Standing with the wardens is 20: past `friend` (10), short of `trusted` (25).
    expect(holds(req({ factions: [{ faction: 'wardens', minRank: 'friend' }] }))).toBe(true);
    expect(holds(req({ factions: [{ faction: 'wardens', minRank: 'trusted' }] }))).toBe(false);
  });

  it('scopes ranks to their own faction', () => {
    // Both ladders name a `trusted` rank at different standings; asking about
    // the wardens must not be answered by the thieves' threshold.
    expect(holds(req({ factions: [{ faction: 'thieves', minRank: 'trusted' }] }))).toBe(false);
    expect(() => holds(req({ factions: [{ faction: 'wardens', minRank: 'trusted' }] }))).not.toThrow();
  });

  it('gates on flags, with and without a value', () => {
    expect(holds(req({ flags: [{ flag: 'met_vess' }] }))).toBe(true);
    expect(holds(req({ flags: [{ flag: 'tithe_paid' }] }))).toBe(false);
    expect(holds(req({ flags: [{ flag: 'chapter', equals: 3 }] }))).toBe(true);
    expect(holds(req({ flags: [{ flag: 'chapter', equals: 4 }] }))).toBe(false);
    expect(holds(req({ flags: [{ flag: 'never_set' }] }))).toBe(false);
  });
});

describe('memory gates', () => {
  it('asks whether this NPC knows about a deed', () => {
    expect(holds(req({ memories: [{ deedKind: 'theft', who: 'speaker' }] }))).toBe(true);
    expect(holds(req({ memories: [{ deedKind: 'murder', who: 'speaker' }] }))).toBe(false);
  });

  it('can require that they have NOT heard', () => {
    expect(holds(req({ memories: [{ deedKind: 'theft', who: 'speaker', known: false }] }))).toBe(false);
    expect(holds(req({ memories: [{ deedKind: 'theft', who: 'party', known: false }] }))).toBe(true);
  });

  it('lets memory fade with a time window', () => {
    // The deed was on day 4 and it is now day 9.
    expect(holds(req({ memories: [{ deedKind: 'theft', withinDays: 10 }] }))).toBe(true);
    expect(holds(req({ memories: [{ deedKind: 'theft', withinDays: 3 }] }))).toBe(false);
  });
});

// "Requirements (lack of, or completed)" — absence is as common as presence.
describe('negative gates', () => {
  it('requires the absence of items, abilities, classes, and conditions', () => {
    expect(holds(req({ without: { items: ['lantern'] } }))).toBe(true);
    expect(holds(req({ without: { items: ['brass_key'] } }))).toBe(false);
    expect(holds(req({ without: { abilities: ['fly'] } }))).toBe(true);
    expect(holds(req({ without: { abilities: ['cleave'] } }))).toBe(false);
    expect(holds(req({ without: { classes: ['warden'] } }))).toBe(true);
    expect(holds(req({ without: { conditions: ['frozen'] } }))).toBe(true);
    expect(holds(req({ without: { conditions: ['burning'] } }))).toBe(false);
  });

  it('requires a quest not to be in a given state', () => {
    expect(holds(req({ without: { quests: [{ quest: 'find_the_mill', status: 'failed' }] } }))).toBe(true);
    expect(holds(req({ without: { quests: [{ quest: 'find_the_mill', status: 'complete' }] } }))).toBe(false);
  });
});

describe('combining clauses', () => {
  it('requires every clause present to hold', () => {
    expect(holds(req({ minLevel: 3, items: [{ item: 'brass_key' }] }))).toBe(true);
    expect(holds(req({ minLevel: 3, items: [{ item: 'lantern' }] }))).toBe(false);
  });

  // The door opened by the key *or* by picking the lock.
  it('accepts any alternative in anyOf', () => {
    const gate = req({
      anyOf: [
        { items: [{ item: 'brass_key' }] },
        { skills: [{ skill: 'lockpicking', minRank: 5 }] },
      ],
    });
    expect(holds(gate)).toBe(true);

    const harder = req({
      anyOf: [
        { items: [{ item: 'iron_key' }] },
        { skills: [{ skill: 'lockpicking', minRank: 5 }] },
      ],
    });
    expect(holds(harder)).toBe(false);
  });

  it('supports a custom predicate escape hatch', () => {
    expect(holds(req({ custom: { gte: [{ ref: 'actor.attr.might' }, 16] } }))).toBe(true);
    expect(holds(req({ custom: { gte: [{ ref: 'actor.attr.might' }, 17] } }))).toBe(false);
  });

  it('combines a structured clause with a custom one', () => {
    expect(holds(req({ minLevel: 5, custom: { test: { ref: 'flags.met_vess' } } }))).toBe(true);
    expect(holds(req({ minLevel: 9, custom: { test: { ref: 'flags.met_vess' } } }))).toBe(false);
  });
});

describe('compiled output', () => {
  it('produces a plain predicate the engine can evaluate with no special cases', () => {
    expect(compileRequirement(req({ minLevel: 3 }))).toEqual({
      gte: [{ ref: 'actor.level' }, 3],
    });
  });

  it('collapses a single clause rather than wrapping it in `all`', () => {
    const compiled = compileRequirement(req({ minLevel: 3 }));
    expect(Object.keys(compiled as object)).toEqual(['gte']);
  });

  it('is deterministic, so gates do not flicker between evaluations', () => {
    const gate = req({ minLevel: 3, items: [{ item: 'brass_key' }] });
    expect(JSON.stringify(compileRequirement(gate))).toBe(JSON.stringify(compileRequirement(gate)));
  });
});
