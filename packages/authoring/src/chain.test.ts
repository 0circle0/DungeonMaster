/** A chain is four pieces of bookkeeping that have to agree, and each one fails quietly on its own. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildChain, chainProblems } from './chain.js';

const LINKS = [
  { id: 'a', name: 'A', description: 'first' },
  { id: 'b', name: 'B', description: 'second' },
  { id: 'c', name: 'C', description: 'third' },
];

describe('buildChain', () => {
  const chain = buildChain(LINKS, {
    gate: { flags: [{ flag: 'act_one' }] },
    giver: 'vess',
    minLevel: 3,
    tags: ['side', 'act1', 'millford'],
  });

  it('offers the head and only the head', () => {
    expect(chain.map((quest) => quest['giver'])).toEqual(['vess', undefined, undefined]);
  });

  it('puts the gate and the level floor on the head only', () => {
    expect(chain[0]?.['requires']).toEqual({ flags: [{ flag: 'act_one' }], minLevel: 3 });
    expect((chain[1]?.['requires'] as Record<string, unknown>)['minLevel']).toBeUndefined();
  });

  it('makes every later link wait on the one before it', () => {
    expect(chain[1]?.['requires']).toEqual({ quests: [{ quest: 'a', status: 'complete' }] });
    expect(chain[2]?.['requires']).toEqual({ quests: [{ quest: 'b', status: 'complete' }] });
  });

  it('makes every link but the last unlock the next, which is what makes it reachable', () => {
    expect(chain.map((quest) => quest['unlocks'])).toEqual([['b'], ['c'], undefined]);
  });

  it('stamps the tags on all of them, so containment can be asserted', () => {
    expect(chain.every((quest) => Array.isArray(quest['tags']))).toBe(true);
  });

  it('keeps what the link already said', () => {
    const built = buildChain(
      [
        { id: 'a', name: 'A', description: 'x', xpReward: 50, requires: { minLevel: 2 } },
        { id: 'b', name: 'B', description: 'y', unlocks: ['elsewhere'] },
      ],
      { giver: 'vess' },
    );
    expect(built[0]?.['xpReward']).toBe(50);
    // The link's own requirement survives the gate being merged onto it.
    expect(built[0]?.['requires']).toEqual({ minLevel: 2 });
    // And an unlock it already had is not replaced by the chain's.
    expect(built[1]?.['unlocks']).toEqual(['elsewhere']);
  });

  it('does not touch the links it was given', () => {
    const links = [{ id: 'a', name: 'A', description: 'x' }];
    const before = JSON.stringify(links);
    buildChain(links, { giver: 'vess' });
    expect(JSON.stringify(links)).toBe(before);
  });
});

describe('chainProblems', () => {
  it('says nothing about a chain it built', () => {
    expect(chainProblems(buildChain(LINKS, { giver: 'vess' }))).toEqual([]);
  });

  it('catches two heads, which validates and plays as two chains', () => {
    const broken = buildChain(LINKS, { giver: 'vess' });
    delete broken[1]!['requires'];
    expect(chainProblems(broken).join(' ')).toMatch(/2 quests wait on nothing/);
  });

  it('catches a link nothing unlocks, which is where the chain stops', () => {
    const broken = buildChain(LINKS, { giver: 'vess' });
    delete broken[0]!['unlocks'];
    expect(chainProblems(broken).join(' ')).toMatch(/does not unlock b/);
  });

  it('catches a chain that waits on a quest outside itself', () => {
    const broken = buildChain(LINKS, { giver: 'vess' });
    broken[0]!['requires'] = { quests: [{ quest: 'somewhere_else', status: 'complete' }] };
    expect(chainProblems(broken).join(' ')).toMatch(/neither in this chain nor a declared gate/);
    // …and nothing, once it is declared as one.
    expect(chainProblems(broken, { gates: ['somewhere_else'] })).toEqual([]);
  });

  it('passes the chains in aurendel', () => {
    const doc = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../modules/aurendel/module.json', import.meta.url)), 'utf8'),
    ) as { narrative: { quests: Record<string, unknown>[] } };

    // `chain()` stamps tags positionally as [side, act, key, region].
    const byKey = new Map<string, Record<string, unknown>[]>();
    for (const quest of doc.narrative.quests) {
      const tags = quest['tags'];
      if (!Array.isArray(tags) || tags[0] !== 'side' || typeof tags[2] !== 'string') continue;
      const list = byKey.get(tags[2]) ?? [];
      list.push(quest);
      byKey.set(tags[2], list);
    }

    expect(byKey.size).toBeGreaterThan(10);
    // Aurendel's act gates, which ten of its chains legitimately wait on.
    const gates = ['the_open_door', 'the_undercroft'];
    const complaints = [...byKey].flatMap(([key, quests]) =>
      chainProblems(quests, { gates }).map((problem) => `${key}: ${problem}`),
    );
    expect(complaints).toEqual([]);
  });
});
