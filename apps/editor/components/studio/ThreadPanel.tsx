'use client';

/**
 * A thread, and the places that hold it up.
 *
 * A lore thread lists its clues, and nothing anywhere lists its *anchors* — the
 * hidden places that get easier to find as those clues come in. That link
 * exists only as a `threads.<id>.known` reference buried inside a discovery
 * formula, which is also the only way the Python's own linter finds them.
 *
 * So "show me this thread" is a question the studio could not answer, and
 * deleting a thread left its places hidden behind a check that would never
 * fall again. This answers it, by looking where the link actually is.
 */

import { threadAnchored, readRumoured, dcKnowing, floorOf } from '@dm/authoring';
import { getAt } from '@/lib/store';
import type { ModuleStore } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

export function ThreadPanel(props: {
  store: ModuleStore;
  entry: Record<string, unknown>;
  onOpen: (collection: string, index: number) => void;
}) {
  const { store, entry } = props;
  const id = String(entry['id'] ?? '');
  const clues = Array.isArray(entry['entries']) ? (entry['entries'] as unknown[]) : [];

  const pois = (getAt(store.doc, ['world', 'pointsOfInterest']) ?? []) as Record<string, unknown>[];
  const anchors = pois
    .map((poi, index) => ({ poi, index }))
    .filter(({ poi }) => threadAnchored(poi['discover']) === id);

  // Two tellers in two areas is the rule the Python checks: a thread that dies
  // with one missed visit is a thread nobody finishes.
  const areas = new Set(anchors.map(({ poi }) => String(poi['area'] ?? '')));

  return (
    <div className={styles.threadPanel} data-ok={anchors.length > 0}>
      <div className={styles.prefabHead}>
        Anchors
        <code>
          {anchors.length} {anchors.length === 1 ? 'place' : 'places'}
        </code>
      </div>

      {anchors.length === 0 ? (
        <p className={styles.prefabNote}>
          No place gets easier to find as this thread fills, so its {clues.length} clue
          {clues.length === 1 ? '' : 's'} teach lore and nothing else. That is a fine thing for a
          thread to be — but if one of these clues was meant to open somewhere, the link is the
          discovery check on that place.
        </p>
      ) : (
        <>
          <ul className={styles.threadList}>
            {anchors.map(({ poi, index }) => {
              const spec = readRumoured(poi['discover']);
              return (
                <li key={String(poi['id'])}>
                  <button
                    className={styles.threadAnchor}
                    onClick={() => props.onOpen('world.pointsOfInterest', index)}
                  >
                    {String(poi['name'] ?? poi['id'])}
                  </button>
                  {spec ? (
                    <span className={styles.threadDc}>
                      {dcKnowing(spec, 0)} → {floorOf(spec)}
                      <em>{spec.skill ?? 'perception'}</em>
                    </span>
                  ) : (
                    <span className={styles.threadDc}>
                      <em>written by hand</em>
                    </span>
                  )}
                  <code className={styles.chainId}>{String(poi['area'] ?? '')}</code>
                </li>
              );
            })}
          </ul>
          {anchors.length > 1 && areas.size === 1 && (
            <p className={styles.prefabNote}>
              Every anchor is in {[...areas][0]}. A party that never goes there never meets any of
              this.
            </p>
          )}
        </>
      )}

      {clues.length > 0 && anchors.length > 0 && (
        <p className={styles.prefabNote}>
          Each of the {clues.length} clues takes a step off every check above.
        </p>
      )}
    </div>
  );
}
