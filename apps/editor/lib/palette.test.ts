/** The palette's one job is that the obvious answer is first. */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { COLLECTION_PATHS } from '@dm/module';
import { readAssembledModule } from '@dm/module/load';
import { score, buildCommands, search } from './palette.js';
import type { ModuleDoc } from './store.js';

const AURENDEL = fileURLToPath(new URL('../../../modules/aurendel', import.meta.url));

describe('score', () => {
  it('ranks an exact match above a prefix above a substring', () => {
    expect(score('bog_hound', 'bog_hound')).toBeGreaterThan(score('bog_hound', 'bog'));
    expect(score('bog_hound', 'bog')).toBeGreaterThan(score('the_bog_hound', 'bog'));
  });

  it('prefers a match at a word boundary', () => {
    expect(score('fen_hound', 'hound')).toBeGreaterThan(score('greyhounds', 'hound'));
  });

  it('finds letters in order', () => {
    expect(score('bog_hound', 'boghou')).toBeGreaterThan(0);
    expect(score('bog_hound', 'zzz')).toBe(0);
  });

  it('matches everything when nothing is typed', () => {
    expect(score('anything', '')).toBeGreaterThan(0);
  });
});

describe('over a real module', () => {
  const doc = readAssembledModule(AURENDEL).doc as ModuleDoc;
  const commands = buildCommands(doc, [
    { kind: 'action', id: 'save', label: 'Save', hint: '⌘S', run: () => undefined },
  ]);

  it('indexes every collection and a couple of thousand entries', () => {
    expect(commands.filter((c) => c.kind === 'collection').length).toBe(COLLECTION_PATHS.length);
    expect(commands.filter((c) => c.kind === 'entry').length).toBeGreaterThan(2000);
  });

  it('finds an entry by its id', () => {
    const [first] = search(commands, 'barrowgate');
    expect(first?.kind).toBe('entry');
    expect(first && 'collection' in first ? first.collection : '').toContain('world.');
  });

  it('finds a collection by its name', () => {
    const hit = search(commands, 'monsters').find((c) => c.kind === 'collection');
    expect(hit && 'path' in hit ? hit.path : '').toBe('content.monsters');
  });

  it('offers actions and views before anything is typed', () => {
    const initial = search(commands, '');
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.every((c) => c.kind === 'action' || c.kind === 'view')).toBe(true);
  });

  it('puts an exact id first even when many things contain it', () => {
    const monsters = (doc['content'] as Record<string, Record<string, unknown>[]>)['monsters'];
    const id = String(monsters?.[0]?.['id'] ?? '');
    const [first] = search(commands, id);
    expect(first && 'collection' in first ? `${first.collection}` : '').toBe('content.monsters');
  });

  it('stays quick enough to run on every keystroke', () => {
    const started = performance.now();
    for (const q of ['b', 'ba', 'bar', 'barr', 'barro', 'barrow']) search(commands, q);
    // Six keystrokes over ~2,300 commands.
    expect(performance.now() - started).toBeLessThan(500);
  });
});
