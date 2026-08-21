/** The controls that made the map on the left. */

import { useState } from 'react';
import { collectionAt } from '@/lib/schema';
import type { ModuleStore } from '@/lib/store';
import { resolveMapSubjects } from '@/lib/mapSubject';
import type { MapSubject } from '@/lib/mapSubject';
import type { MapTarget } from '@/app/studio/selection';
import { Coverage } from './Coverage';
import { ItemForm } from './ItemForm';
import styles from '@/app/studio/studio.module.css';

/** `id` is omitted: the viewport addresses the map by it, so editing it here blanks the view. */
const OMIT = new Set(['id']);

export function MapGenerationPanel(props: {
  store: ModuleStore;
  target: MapTarget;
  /** True when the layout is drawn verbatim, so most of these do nothing. */
  authored: boolean;
}) {
  const { store } = props;
  const subjects = resolveMapSubjects(store.doc, props.target);

  if (!subjects.place) {
    return (
      <aside className={styles.mapPanel}>
        <p className={styles.mapPanelEmpty}>
          Nothing to edit — this place is not in the document yet.
        </p>
      </aside>
    );
  }

  return (
    <aside className={styles.mapPanel}>
      {subjects.redirect && <p className={styles.mapPanelWhy}>{subjects.redirect}</p>}

      {props.authored && (
        <p className={styles.mapPanelWhy}>
          A hand-authored <code>map.layout</code> is drawn tile for tile. Size, palette scatter and the
          seed have no effect until you clear it.
        </p>
      )}

      <Section subject={subjects.place} store={store} />

      {subjects.palette ? (
        <>
          <p className={styles.mapPanelWhy}>{subjects.paletteReason}</p>
          <Section subject={subjects.palette} store={store} />
        </>
      ) : (
        <p className={styles.mapPanelWhy}>{subjects.paletteReason}</p>
      )}
    </aside>
  );
}

/** One collapsible form for one entry, headed by what it is. */
function Section(props: { subject: MapSubject; store: ModuleStore }) {
  const [open, setOpen] = useState(true);
  const info = collectionAt(props.subject.registryPath);
  if (!info) return null;

  return (
    <div className={styles.mapPanelSection}>
      <button className={styles.mapPanelHead} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {props.subject.label}
        <code className={styles.mapPanelPath}>{props.subject.registryPath}</code>
      </button>
      {open && (
        <>
          <ItemForm
            spec={info.spec}
            registryPath={info.path}
            basePath={props.subject.basePath}
            store={props.store}
            omit={OMIT}
          />
          <Coverage path={info.path} />
        </>
      )}
    </div>
  );
}
