/** One assertion matters more than the rest: nothing is ever granted from an option's `effects`. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import { readAssembledModule } from '@dm/module/load';
import { rumour, favour, talk, givenFlag } from './dialogue.js';
import type { Voice, Fragment } from './dialogue.js';

const VOICE: Voice = {
  goOn: 'Go on.',
  leaveIt: 'Leave it.',
  rumourRefused: '"I have nothing to say to you."',
  thanks: 'Thank you.',
  favourRefused: '"It is not mine to give."',
};

const BASE = readAssembledModule(
  fileURLToPath(new URL('../../../modules/greenmarch', import.meta.url)),
).doc;

/** Put a fragment into a real module and compile it. */
function compiled(fragments: readonly Fragment[]) {
  const doc = JSON.parse(JSON.stringify(BASE)) as {
    narrative: {
      dialogues: { id: string; nodes: Record<string, unknown>[] }[];
      lore?: Record<string, unknown>[];
    };
  };
  doc.narrative.lore = [
    ...(doc.narrative.lore ?? []),
    { id: 'vess_journal_clue', name: 'The journal', description: 'Vess kept one.' },
  ];
  const dialogue = doc.narrative.dialogues[0]!;
  const greet = dialogue.nodes[0]!;
  greet['options'] = [
    ...((greet['options'] ?? []) as unknown[]),
    ...fragments.map((fragment) => fragment.option),
  ];
  dialogue.nodes.push(...fragments.flatMap((fragment) => fragment.nodes));
  return compileModule(doc);
}

describe('the trap', () => {
  it('never grants anything from an option', () => {
    const fragments = [
      rumour({ key: 'ask_mill', ask: 'What happened at the mill?', told: '"It burned."', clue: 'mill_fire', voice: VOICE }),
      favour({ key: 'ask_key', ask: 'Lend me the key.', given: '"Take it."', item: 'mill_key', voice: VOICE }),
      talk({ key: 'ask_name', ask: 'Who are you?', says: '"Vess."', voice: VOICE }),
    ];
    for (const fragment of fragments) {
      expect(fragment.option['effects']).toEqual([]);
    }
  });

  it('puts the payload on the success node, where the check has already run', () => {
    const clue = rumour({ key: 'k', ask: 'a', told: 't', clue: 'mill_fire', voice: VOICE });
    const [yes, no] = clue.nodes;
    expect(yes?.['onEnter']).toEqual([{ learnLore: { entry: 'mill_fire' } }]);
    expect(no?.['onEnter']).toEqual([]);
    expect((clue.option['check'] as { onSuccess: string }).onSuccess).toBe(yes?.['id']);
    expect((clue.option['check'] as { onFailure: string }).onFailure).toBe(no?.['id']);
  });

  it('hands the item over on the success node, with the record of it', () => {
    const gift = favour({ key: 'k', ask: 'a', given: 'g', item: 'mill_key', voice: VOICE });
    expect(gift.nodes[0]?.['onEnter']).toEqual([
      { grantItem: { target: { ref: 'actor.id' }, item: 'mill_key', quantity: 1 } },
      { setFlag: { flag: givenFlag('mill_key'), value: true } },
    ]);
  });
});

describe('the gates', () => {
  it('makes a clue vanish once it is known', () => {
    const clue = rumour({ key: 'k', ask: 'a', told: 't', clue: 'mill_fire', voice: VOICE });
    expect(clue.option['requires']).toEqual({ without: { lore: ['mill_fire'] } });
  });

  it('gates a gift on not having it and on it not already being given', () => {
    const gift = favour({ key: 'k', ask: 'a', given: 'g', item: 'mill_key', voice: VOICE });
    expect(gift.option['requires']).toEqual({
      without: { items: ['mill_key'], flags: [{ flag: 'given:mill_key' }] },
    });
  });

  it('unions a caller’s own `without` rather than replacing it', () => {
    const clue = rumour({
      key: 'k', ask: 'a', told: 't', clue: 'mill_fire', voice: VOICE,
      requires: { without: { flags: [{ flag: 'vess_cold' }] }, minLevel: 2 },
    });
    expect(clue.option['requires']).toEqual({
      without: { lore: ['mill_fire'], flags: [{ flag: 'vess_cold' }] },
      minLevel: 2,
    });
  });

  it('never gates on standing — the roll gets harder, asking stays possible', () => {
    const gift = favour({ key: 'k', ask: 'a', given: 'g', item: 'mill_key', voice: VOICE, faction: 'wardens' });
    expect(JSON.stringify(gift.option['requires'])).not.toMatch(/reputation|standing|faction/);
    expect(JSON.stringify(gift.option['check'])).toMatch(/reputation.wardens/);
  });

  it('costs standing on a refusal, and only when there is a faction to lose it with', () => {
    const withFaction = rumour({ key: 'k', ask: 'a', told: 't', clue: 'c', voice: VOICE, faction: 'wardens', cost: 3 });
    expect(withFaction.nodes[1]?.['onEnter']).toEqual([
      { adjustReputation: { faction: 'wardens', amount: -3 } },
    ]);
    const without = rumour({ key: 'k', ask: 'a', told: 't', clue: 'c', voice: VOICE });
    expect(without.nodes[1]?.['onEnter']).toEqual([]);
  });
});

describe('what it emits', () => {
  it('compiles inside a real module', () => {
    const back = 'opening';
    const result = compiled([
      rumour({ key: 'ask_fire', ask: 'What burned?', told: '"The mill."', clue: 'vess_journal_clue', voice: VOICE, back }),
      talk({ key: 'ask_who', ask: 'Who are you?', says: '"Vess."', voice: VOICE, back }),
    ]);
    if (!result.ok) throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
    expect(result.ok).toBe(true);
  });

  it('prefixes every id it makes, so two fragments cannot collide', () => {
    const a = rumour({ key: 'one', ask: 'a', told: 't', clue: 'c', voice: VOICE });
    const b = rumour({ key: 'two', ask: 'a', told: 't', clue: 'c', voice: VOICE });
    const ids = [...a.nodes, ...b.nodes].map((node) => node['id']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sends both outcomes back where they came from', () => {
    const clue = rumour({ key: 'k', ask: 'a', told: 't', clue: 'c', voice: VOICE, back: 'the_docks' });
    for (const node of clue.nodes) {
      expect((node['options'] as { goto: string }[])[0]?.goto).toBe('the_docks');
    }
  });
});
