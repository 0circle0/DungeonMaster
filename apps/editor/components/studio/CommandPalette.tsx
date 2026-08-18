/**
 * ⌘K: one box over the whole module.
 *
 * The command list is rebuilt only while the palette is open, and only when the
 * document changes underneath it — building it walks every collection, which is
 * a few milliseconds nobody should pay for on a keystroke in a form.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCommands, search } from '@/lib/palette';
import type { Command } from '@/lib/palette';
import type { ModuleDoc } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

const GLYPH: Record<Command['kind'], string> = {
  entry: '◆',
  collection: '▤',
  view: '◫',
  action: '⚡',
};

export function CommandPalette(props: {
  doc: ModuleDoc;
  actions: readonly Command[];
  onClose: () => void;
  onRun: (command: Command) => void;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo(() => buildCommands(props.doc, props.actions), [props.doc, props.actions]);
  const results = useMemo(() => search(commands, query), [commands, query]);

  // A new search is a new list; keeping the old position would run whatever
  // happened to land under it.
  useEffect(() => setCursor(0), [query]);

  // Follow the cursor when it walks off the visible part of the list.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    props.onRun(command);
    props.onClose();
  };

  return (
    <div className={styles.paletteBackdrop} onClick={props.onClose}>
      <div className={styles.palette} onClick={(e) => e.stopPropagation()}>
        <input
          className={styles.paletteInput}
          placeholder="Go to anything — an entry, a collection, a view…"
          value={query}
          autoFocus
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(results[cursor]);
            } else if (e.key === 'Escape') {
              props.onClose();
            }
          }}
        />

        <div className={styles.paletteList} ref={listRef}>
          {results.map((command, i) => (
            <button
              key={command.id}
              data-active={i === cursor}
              className={`${styles.paletteRow} ${i === cursor ? styles.paletteRowActive : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => run(command)}
            >
              <span className={styles.paletteGlyph}>{GLYPH[command.kind]}</span>
              <span className={styles.paletteLabel}>{command.label}</span>
              <code className={styles.paletteHint}>{command.hint}</code>
            </button>
          ))}
          {results.length === 0 && <p className={styles.paletteEmpty}>Nothing matches.</p>}
        </div>
      </div>
    </div>
  );
}
