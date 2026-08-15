/**
 * The session reducer — the one piece of app logic that is not a component.
 *
 * Relative imports throughout: the vitest config aliases `@` to the *editor's*
 * directory, so app lib tests keep to `./x.js` specifiers.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadModuleFrom } from '@dm/module/load';
import { startSession } from '@dm/play';
import { sessionReducer } from './useSession.js';
import type { SessionFrame } from './useSession.js';

const MODULE = loadModuleFrom(
  fileURLToPath(new URL('../../../modules/greenmarch', import.meta.url)),
);

function frame(): SessionFrame {
  const session = startSession(MODULE, 7);
  return { state: session.state, transcript: session.transcript, seed: 7, run: 0 };
}

describe('sessionReducer', () => {
  it('files an applied turn: new state, appended lines', () => {
    const before = frame();
    const next = sessionReducer(before, {
      type: 'applied',
      state: { ...before.state, minute: before.state.minute + 5 },
      lines: [{ text: 'Five minutes pass.', kind: 'note' }],
    });

    expect(next.state.minute).toBe(before.state.minute + 5);
    expect(next.transcript.length).toBe(before.transcript.length + 1);
    expect(next.transcript.at(-1)!.text).toBe('Five minutes pass.');
    // The reducer never mutates — the old frame is untouched.
    expect(before.transcript.length).toBeLessThan(next.transcript.length);
  });

  it('appends a note without touching state', () => {
    const before = frame();
    const next = sessionReducer(before, {
      type: 'note',
      line: { text: 'Saved.', kind: 'note' },
    });
    expect(next.state).toBe(before.state);
    expect(next.transcript.at(-1)!.text).toBe('Saved.');
  });

  it('resets to a fresh run and bumps the run counter', () => {
    const before = frame();
    const again = startSession(MODULE, 99);
    const next = sessionReducer(before, {
      type: 'reset', state: again.state, transcript: again.transcript, seed: 99,
    });
    expect(next.seed).toBe(99);
    expect(next.run).toBe(before.run + 1);
  });

  it('is a pure function: same message twice gives the same frame', () => {
    // React 19 StrictMode double-invokes reducers; the engine call lives in
    // the event handler precisely so this double-run is harmless.
    const before = frame();
    const msg = {
      type: 'applied' as const,
      state: before.state,
      lines: [{ text: 'x', kind: 'note' as const }],
    };
    const a = sessionReducer(before, msg);
    const b = sessionReducer(before, msg);
    expect(a.transcript.length).toBe(b.transcript.length);
    expect(a.state).toBe(b.state);
  });
});
