/** The journal panels, rendered. */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { newGame, defaultChoices } from '@dm/engine';
import type { GameState } from '@dm/engine';
import { Quests, Lore } from '../components/Overlays.js';
import type { SessionApi } from './useSession.js';

const MINIMAL = fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url));

function moduleWith(narrativeExtras: Record<string, unknown>): CompiledModule {
  const doc = JSON.parse(readFileSync(MINIMAL, 'utf8')) as Record<string, unknown>;
  doc['narrative'] = { ...(doc['narrative'] as object), ...narrativeExtras };
  const result = compileModule(doc);
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  return result.module;
}

/** Only `module` and `frame` are read by these two panels. */
const sessionOf = (module: CompiledModule, state: GameState): SessionApi =>
  ({ module, frame: { state, seed: 3 } } as unknown as SessionApi);

const render = (module: CompiledModule, state: GameState, panel: typeof Quests | typeof Lore) =>
  renderToStaticMarkup(createElement(panel, { session: sessionOf(module, state) }));

const LORE = {
  lore: [
    { id: 'tide_late', name: 'The tide only falls that far at the turn of the year.', source: 'a netmender' },
    { id: 'cold_iron', name: 'Cold iron will not bite it.' },
  ],
  loreThreads: [
    { id: 'drowned_king', name: 'The Drowned King', description: 'Three people have told you a piece.', entries: ['tide_late', 'cold_iron'] },
  ],
};

describe('the lore panel', () => {
  const module = moduleWith(LORE);
  const fresh = () => newGame(module, { seed: 3, party: [defaultChoices(module, 'Ash')] });

  it('shows the heading and the blanks before anything is known', () => {
    const html = render(module, fresh(), Lore);
    expect(html).toContain('The Drowned King');
    expect(html).toContain('0/2');
    expect(html).toContain('clue unknown');
    expect(html).not.toContain('turn of the year');
  });

  it('shows a learned clue, its attribution, and still blanks the rest', () => {
    const state = { ...fresh(), lore: { tide_late: 120 } };
    const html = render(module, state, Lore);

    expect(html).toContain('1/2');
    expect(html).toContain('turn of the year');
    expect(html).toContain('a netmender');
    expect(html).toContain('clue unknown');
    expect(html).not.toContain('Cold iron');
  });

  it('says so plainly when the module declares no lore at all', () => {
    const bare = moduleWith({});
    const state = newGame(bare, { seed: 3, party: [defaultChoices(bare, 'Ash')] });
    expect(render(bare, state, Lore)).toContain('Nothing yet');
  });
});

describe('the quest panel', () => {
  it('renders a quest that belongs to no arc', () => {
    const module = moduleWith(LORE);
    const state = newGame(module, { seed: 3, party: [defaultChoices(module, 'Ash')] });
    const withQuest: GameState = {
      ...state,
      quests: { ...state.quests, ...Object.fromEntries(
        module.ids('narrative.quests').slice(0, 1).map((id) => [
          id, { quest: id, status: 'active' as const, completedObjectives: [], startedAt: 0 },
        ]),
      ) },
    };

    const html = render(module, withQuest, Quests);
    expect(html).toBeTypeOf('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('says so plainly with no quests taken', () => {
    const module = moduleWith({});
    const state = newGame(module, { seed: 3, party: [defaultChoices(module, 'Ash')] });
    expect(render(module, state, Quests)).toContain('No quests yet');
  });
});
