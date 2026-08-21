'use client';

/** What a place gives up when you are standing on it. */

import { useState } from 'react';
import { noticing } from '@dm/authoring';
import type { ModuleStore, Path } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

interface Trigger {
  id?: unknown;
  on?: unknown;
  mode?: unknown;
  description?: unknown;
  effects?: unknown;
  [key: string]: unknown;
}

/** The clue a trigger teaches, if it teaches one. */
function taught(trigger: Trigger): string | null {
  const effects = Array.isArray(trigger['effects']) ? (trigger['effects'] as Record<string, unknown>[]) : [];
  for (const effect of effects) {
    const learn = effect['learnLore'];
    if (typeof learn === 'object' && learn !== null) {
      const entry = (learn as Record<string, unknown>)['entry'];
      if (typeof entry === 'string') return entry;
    }
  }
  return null;
}

export function Noticing(props: { store: ModuleStore; index: number; entry: Record<string, unknown> }) {
  const { store, entry } = props;
  const [open, setOpen] = useState(false);
  const [sentence, setSentence] = useState('');
  const [clue, setClue] = useState('');
  const [always, setAlways] = useState(false);

  const base: Path = ['world', 'pointsOfInterest', props.index];
  const triggers = (Array.isArray(entry['triggers']) ? entry['triggers'] : []) as Trigger[];
  const arriving = triggers.filter((trigger) => trigger['on'] === 'enter');
  const lore = store.idsByCollection['narrative.lore'] ?? [];

  const id = `${String(entry['id'] ?? 'here')}_noticed${arriving.length > 0 ? `_${arriving.length + 1}` : ''}`;
  const ready = sentence.trim() !== '' && clue !== '';

  const add = () => {
    if (!ready) return;
    store.setMany([
      {
        path: [...base, 'triggers', triggers.length],
        value: noticing({
          id,
          description: sentence.trim(),
          clue,
          ...(always ? { mode: 'always' as const } : {}),
        }),
      },
    ]);
    setSentence('');
    setClue('');
    setOpen(false);
  };

  return (
    <div className={styles.noticing}>
      <div className={styles.prefabHead}>
        On arriving
        <code>{arriving.length}</code>
      </div>

      {arriving.length > 0 && (
        <ul className={styles.noticeList}>
          {arriving.map((trigger, i) => {
            const clueId = taught(trigger);
            return (
              <li key={String(trigger['id'] ?? i)}>
                <span>{String(trigger['description'] ?? trigger['id'] ?? '')}</span>
                {clueId ? <code>{clueId}</code> : <em className={styles.prefabNote}>no clue</em>}
              </li>
            );
          })}
        </ul>
      )}

      {!open ? (
        <button
          className="btn tiny"
          disabled={lore.length === 0}
          title={lore.length === 0 ? 'There is no lore for a place to give up yet' : undefined}
          onClick={() => setOpen(true)}
        >
          {arriving.length > 0 ? 'Something else they notice' : 'Something they notice here'}
        </button>
      ) : (
        <>
          <p className={styles.prefabNote}>
            One sentence: what they see close up that they could not from away. It teaches the
            clue the first time, and nobody has to be standing here to say it.
          </p>
          <textarea
            className="input"
            rows={2}
            value={sentence}
            placeholder="Close up, standing on it, what the shape is actually made of."
            onChange={(e) => setSentence(e.target.value)}
          />
          <div className={styles.noticeRow}>
            <select className="input" value={clue} onChange={(e) => setClue(e.target.value)}>
              <option value="">— what they learn —</option>
              {lore.map((entryId) => (
                <option key={entryId} value={entryId}>
                  {entryId}
                </option>
              ))}
            </select>
            <label className={styles.roadOneWay} title="Say it on every visit, not just the first">
              <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
              every time
            </label>
            <button className="btn tiny primary" disabled={!ready} onClick={add}>
              Add it
            </button>
            <button className="btn tiny" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
