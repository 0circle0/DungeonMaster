'use client';

/**
 * What this dungeon actually generates, next to what it says.
 *
 * `roomCount` is a request, not a promise. `placeRooms` gives each room forty
 * attempts at a spot that keeps `corridorLength`'s mean clear of every other
 * room, and when it runs out it stops — no error, no diagnostic, just a map
 * with fewer rooms than the number in the file. Fifteen rooms with `5d3`
 * corridors on a 47×27 map produced two.
 *
 * Nothing else can tell an author this. Every field is valid, the module
 * compiles, and the only symptom is a dungeon that reads bigger than it walks.
 *
 * The figure is *measured*, by generating the dungeon several times and taking
 * the worst run. Predicting it by inverting the sizing arithmetic was the first
 * attempt and was badly wrong — it called 63 of Aurendel's 68 dungeons broken
 * when the engine builds all but one of them in full. Placement is seeded, so
 * a dungeon that comes up short one run in five is short.
 *
 * A reading, never a rule: it says what will happen and offers a size that
 * would make the file true. It does not edit on its own.
 */

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

  /**
   * Generating a dungeon five times is milliseconds, but it is milliseconds on
   * every keystroke if it is not held. Keyed on the compiled module, which the
   * idle tier replaces — so this follows the settled document rather than the
   * one being typed into.
   */
  const measured = useMemo(() => {
    if (!compiled || !id) return null;
    if (String(entry['algorithm'] ?? 'rooms') !== 'rooms') return null;
    try {
      return measureRooms(compiled, id, 5);
    } catch {
      // A dungeon mid-edit may name a biome that does not exist yet. That is
      // the console's business, not this panel's.
      return null;
    }
  }, [compiled, id, entry]);

  if (!measured || !measured.wanted) return null;

  const short = measured.worst < measured.wanted;
  const width = Number.parseInt(String(entry['width'] ?? ''), 10);
  const height = Number.parseInt(String(entry['height'] ?? ''), 10);
  const sized = Number.isFinite(width) && Number.isFinite(height);

  // A dungeon with no size of its own is sized by the engine, and that is
  // exactly the case that comes up short — so it gets a suggestion too.
  const suggestion =
    short && compiled
      ? sizeToFit(compiled, id, sized ? { width, height } : undefined)
      : null;

  // A suggestion that is the size it already is means the map is not the
  // constraint — placement succeeds there and something later drops the room.
  // Offering "size it to fit" then is a dead end, and an author who takes it
  // twice has been told the tool does not work.
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
