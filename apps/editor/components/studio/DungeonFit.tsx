'use client';

/** Measure the room count a dungeon actually generates and suggest a safe size. */

import { useMemo, useState } from 'react';
import { measureRooms, sizeToFit } from '@dm/authoring';
import type { ModuleStore, Path } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

export function DungeonFit(props: {
  store: ModuleStore;
  basePath: Path;
  entry: Record<string, unknown>;
}) {
  const { entry, store } = props;
  const id = String(entry['id'] ?? '');
  const compiled = store.validation.compiled;
  const [expanded, setExpanded] = useState(false);

  /** Measure the dungeon against the current compiled module, not the draft being typed. */
  const measured = useMemo(() => {
    if (!compiled || !id) return null;
    if (String(entry['algorithm'] ?? 'rooms') !== 'rooms') return null;
    try {
      return measureRooms(compiled, id, 5);
    } catch {
      // Ignore incomplete dungeon definitions while the document is in flux.
      return null;
    }
  }, [compiled, id, entry]);

  if (!measured || !measured.wanted) return null;

  const short = measured.worst < measured.wanted;
  const width = Number.parseInt(String(entry['width'] ?? ''), 10);
  const height = Number.parseInt(String(entry['height'] ?? ''), 10);
  const sized = Number.isFinite(width) && Number.isFinite(height);

  // If the dungeon relies on engine sizing, suggest a size that avoids a shortfall.
  const suggestion =
    short && compiled
      ? sizeToFit(compiled, id, sized ? { width, height } : undefined)
      : null;

  // If the suggestion matches the current size, the issue is not room sizing but later placement.
  const sizeWouldHelp =
    suggestion !== null && (!sized || suggestion.width !== width || suggestion.height !== height);

  const apply = () => {
    if (!suggestion) return;
    props.store.setMany([
      { path: [...props.basePath, 'width'], value: String(suggestion.width) },
      { path: [...props.basePath, 'height'], value: String(suggestion.height) },
      { path: [...props.basePath, 'corridorLength'], value: suggestion.corridorLength },
    ]);
  };

  const range =
    measured.worst === measured.best ? `${measured.worst}` : `${measured.worst}–${measured.best}`;

  return (
    <div className={styles.fitPanel} data-ok={!short}>
      <button className={styles.fitHead} onClick={() => setExpanded((open) => !open)}>
        Rooms generated
        <span className={styles.fitFigure}>
          {range} of {measured.wanted}
        </span>
      </button>

      {short ? (
        <>
          <p className={styles.fitProblem}>
            {measured.wanted - measured.worst === 1
              ? 'One room does not always fit'
              : `Up to ${measured.wanted - measured.worst} rooms do not fit`}
            . They are dropped while the map is generated — no error, and the dungeon plays
            smaller than it reads.
          </p>
          {suggestion && !sizeWouldHelp && (
            <p className={styles.prefabNote}>
              The map is big enough — room placement succeeds at {suggestion.width}×
              {suggestion.height} on every probe, so the missing room is dropped after it is
              placed. Look at the room templates rather than the size: a static room that does not
              fit, or a role that has nothing to fill it.
            </p>
          )}
          {suggestion && sizeWouldHelp && (
            <p className={styles.prefabNote}>
              {sized ? '' : 'It has no size of its own, so the engine picks one. '}
              {suggestion.width}×{suggestion.height} at {suggestion.corridorLength}
              {suggestion.shortened && ' — the map is at its ceiling, so the corridors give way'}{' '}
              would hold them.{' '}
              <button className="btn tiny primary" onClick={apply}>
                Size it to fit
              </button>
            </p>
          )}
        </>
      ) : (
        expanded && (
          <p className={styles.prefabNote}>
            Measured over {measured.samples} seeds. Room placement is random, so this is what the
            worst run produced — not an estimate.
          </p>
        )
      )}
    </div>
  );
}
