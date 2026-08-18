'use client';

/**
 * Somewhere the party walks past until they know enough to look.
 *
 * A hidden place is not a locked door. Knowing the thread's clues does not open
 * it — it turns finding it from luck into method, by lowering the check a step
 * for every clue collected. That is stored as a formula rather than a number,
 * and it is the one thing in this format nobody can reasonably write by hand:
 *
 *     { "max": [ 6, { "sub": [ 18, { "mul": [ 3, { "ref": "threads.x.known" } ] } ] } ] }
 *
 * Five values produce it, so this asks for five values and says what they mean
 * in the only terms that matter — *what the party has to roll knowing nothing,
 * and knowing everything*.
 *
 * A place whose formula was written some other way is shown and not touched:
 * the panel says so and leaves the raw field to the form, rather than
 * pretending to understand something it would then overwrite.
 */

import { useState } from 'react';
import { rumoured, readRumoured, threadAnchored, dcKnowing, floorOf } from '@dm/authoring';
import type { Rumoured } from '@dm/authoring';
import type { ModuleStore, Path } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

const SKILLS = ['perception', 'survival', 'arcana', 'lore', 'investigation'];

export function Hidden(props: { store: ModuleStore; index: number; entry: Record<string, unknown> }) {
  const { store, entry } = props;
  const base: Path = ['world', 'pointsOfInterest', props.index];
  const isHidden = entry['hidden'] === true;
  const spec = readRumoured(entry['discover']);
  const anchoredTo = threadAnchored(entry['discover']);
  const threads = store.idsByCollection['narrative.loreThreads'] ?? [];

  /** What the fields show while editing, before anything is written. */
  const [draft, setDraft] = useState<Rumoured>(
    spec ?? { thread: threads[0] ?? '', base: 18, step: 3, entries: 4, skill: 'perception' },
  );
  const current = spec ?? draft;

  const apply = (next: Rumoured) => {
    setDraft(next);
    if (!next.thread) return;
    const made = rumoured(next);
    store.setMany([
      { path: [...base, 'hidden'], value: true },
      { path: [...base, 'discover'], value: made.discover },
    ]);
  };

  const reveal = () => {
    store.setMany([{ path: [...base, 'hidden'], value: false }]);
    store.remove([...base, 'discover']);
  };

  // A formula somebody wrote by hand, or a plain number. Say what it is and
  // leave it alone — rewriting it from five fields would be a guess.
  if (isHidden && !spec) {
    return (
      <div className={styles.hiddenPanel}>
        <div className={styles.prefabHead}>
          Hidden
          {anchoredTo && <code>{anchoredTo}</code>}
        </div>
        <p className={styles.prefabNote}>
          {anchoredTo
            ? `Found by a check written by hand, which gets easier as ${anchoredTo} fills. Edit it in the form above; this panel would have to guess to rewrite it.`
            : 'Found by a check written by hand — a fixed difficulty, or a formula this panel did not write. Edit it in the form above.'}
        </p>
        <button className="btn tiny" onClick={reveal}>
          Stop hiding it
        </button>
      </div>
    );
  }

  return (
    <div className={styles.hiddenPanel}>
      <div className={styles.prefabHead}>
        Hidden
        {isHidden && <code>{current.thread}</code>}
      </div>

      {!isHidden ? (
        <>
          <p className={styles.prefabNote}>
            Listed like anywhere else on arrival. Hiding it means the party has to look — and the
            more of a thread they know, the easier looking gets.
          </p>
          <button
            className="btn tiny"
            disabled={threads.length === 0}
            title={threads.length === 0 ? 'There are no lore threads to hang it on yet' : undefined}
            onClick={() => apply(draft)}
          >
            Hide it behind a thread
          </button>
        </>
      ) : (
        <>
          <div className={styles.hiddenForm}>
            <label className="label">
              Thread
              <select
                className="input"
                value={current.thread}
                onChange={(e) => apply({ ...current, thread: e.target.value })}
              >
                {!threads.includes(current.thread) && (
                  <option value={current.thread}>{current.thread} (missing)</option>
                )}
                {threads.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Looking with
              <select
                className="input"
                value={current.skill ?? 'perception'}
                onChange={(e) => apply({ ...current, skill: e.target.value })}
              >
                {SKILLS.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Knowing nothing
              <input
                className="input narrow"
                type="number"
                value={current.base}
                onChange={(e) => apply({ ...current, base: Number(e.target.value) })}
              />
            </label>
            <label className="label">
              Easier per clue
              <input
                className="input narrow"
                type="number"
                value={current.step}
                onChange={(e) => apply({ ...current, step: Number(e.target.value) })}
              />
            </label>
            <label className="label">
              Clues in the thread
              <input
                className="input narrow"
                type="number"
                value={current.entries}
                onChange={(e) => apply({ ...current, entries: Number(e.target.value) })}
              />
            </label>
          </div>

          <p className={styles.hiddenRange}>
            Rolls <strong>{current.base}</strong> knowing nothing, down to{' '}
            <strong>{floorOf(current)}</strong> knowing all {current.entries}.
          </p>
          <ol className={styles.hiddenLadder}>
            {Array.from({ length: current.entries + 1 }, (_, known) => (
              <li key={known}>
                <span>{known === 0 ? 'no clues' : `${known}`}</span>
                <code>{dcKnowing(current, known)}</code>
              </li>
            ))}
          </ol>
          {floorOf(current) < 1 && (
            <p className={styles.fitProblem}>
              Knowing everything makes it automatic. A hidden place is meant to stay a roll —
              raise the floor, or take fewer steps off it.
            </p>
          )}
          <button className="btn tiny" onClick={reveal}>
            Stop hiding it
          </button>
        </>
      )}
    </div>
  );
}
