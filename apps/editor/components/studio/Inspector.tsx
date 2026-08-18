/**
 * The right-hand properties panel: whatever is selected renders here as its
 * schema-generated form — a new zod field appears with no UI work. The studio
 * adds three things around the form: duplicate, used-by navigation, and
 * engine-coverage notes.
 */

import { useMemo } from 'react';
import { getAt } from '@/lib/store';
import type { ModuleStore, Path } from '@/lib/store';
import { SINGLETONS, collectionAt, labelFor } from '@/lib/schema';
import { singletonLabel } from '@/lib/labels';
import { JsonBox } from '@/components/JsonBox';
import { UsedBy } from '@/components/UsedBy';
import { FieldDiagnostics, diagnosticsByPath } from '@/components/Field';
import { Coverage } from './Coverage';
import { ItemForm } from './ItemForm';
import { StartInspector } from './StartInspector';
import type { Selection } from '@/app/studio/selection';
import styles from '@/app/studio/studio.module.css';

interface InspectorProps {
  store: ModuleStore;
  selection: Selection;
  onOpenItem: (path: string, index: number) => void;
  onDuplicate: (path: string, index: number) => void;
  onDelete: (path: string, index: number) => void;
  onPreviewStart: () => void;
}

export function Inspector(props: InspectorProps) {
  /**
   * Problems, indexed for the forms inside.
   *
   * The console has always said what is wrong; this puts it on the field it is
   * about, so fixing happens where the author already is rather than after a
   * round trip through the path at the bottom of the screen. Warnings are
   * included — a thin text pool is worth seeing beside the pool.
   */
  const problems = useMemo(
    () => diagnosticsByPath([...props.store.validation.errors, ...props.store.validation.warnings]),
    [props.store.validation],
  );

  return (
    <FieldDiagnostics.Provider value={problems}>
      <InspectorPanel {...props} />
    </FieldDiagnostics.Provider>
  );
}

function InspectorPanel(props: InspectorProps) {
  const { store, selection } = props;

  if (selection.kind === 'none') {
    return (
      <aside className={styles.inspector}>
        <p className={styles.inspectorEmpty}>
          Select something — a place in the World tree, an entry in a table, or a section from the dock —
          and its properties appear here.
        </p>
      </aside>
    );
  }

  if (selection.kind === 'start') {
    return (
      <aside className={styles.inspector}>
        <div className={styles.inspectorHead}>
          <h2 className={styles.inspectorTitle}>Start &amp; creation</h2>
          <code className={styles.inspectorPath}>start</code>
        </div>
        <div className={styles.inspectorBody}>
          <StartInspector store={store} onPreview={props.onPreviewStart} />
          <Coverage path="start" />
        </div>
      </aside>
    );
  }

  if (selection.kind === 'singleton') {
    const singleton = SINGLETONS.find((s) => s.path === selection.path);
    if (!singleton) return <aside className={styles.inspector} />;
    const path = singleton.path.split('.');
    return (
      <aside className={styles.inspector}>
        <div className={styles.inspectorHead}>
          <h2 className={styles.inspectorTitle}>{singletonLabel(singleton.path, singleton.label)}</h2>
          <code className={styles.inspectorPath}>{singleton.path}</code>
        </div>
        <div className={styles.inspectorBody}>
          <ItemForm spec={singleton.spec} registryPath={singleton.path} basePath={path} store={store} />
          <Coverage path={singleton.path} />
        </div>
      </aside>
    );
  }

  const info = collectionAt(selection.path);
  const entries = getAt(store.doc, selection.path.split('.'));
  const entry = Array.isArray(entries) ? (entries[selection.index] as Record<string, unknown>) : undefined;
  if (!info || !entry) {
    return (
      <aside className={styles.inspector}>
        <p className={styles.inspectorEmpty}>Nothing here — the entry may have been deleted.</p>
      </aside>
    );
  }

  const basePath: Path = [...selection.path.split('.'), selection.index];
  return (
    <aside className={styles.inspector}>
      <div className={styles.inspectorHead}>
        <h2 className={styles.inspectorTitle}>{String(entry['name'] ?? entry['id'] ?? labelFor(info.name))}</h2>
        <code className={styles.inspectorPath}>{info.path}</code>
      </div>
      <div className={styles.inspectorActions}>
        <button className="btn tiny" onClick={() => props.onDuplicate(selection.path, selection.index)}>
          Duplicate
        </button>
        <button className="btn tiny danger" onClick={() => props.onDelete(selection.path, selection.index)}>
          Delete
        </button>
      </div>
      <div className={styles.inspectorBody}>
        {info.path === 'world.maps' && (
          <p className="hint">The grid itself is painted in the map viewport, not here.</p>
        )}
        <ItemForm
          spec={info.spec}
          registryPath={info.path}
          basePath={basePath}
          store={store}
          // A static map's layers are thousands of cells; the generic array
          // editor would render them as a wall of inputs. The painter owns them.
          {...(info.path === 'world.maps' ? { omit: new Set(['layers']) } : {})}
        />
        <UsedBy
          doc={store.doc}
          collection={info.path}
          id={String(entry['id'] ?? '')}
          onOpen={props.onOpenItem}
        />
        <details className="raw-entry">
          <summary>Raw JSON for this entry</summary>
          <JsonBox value={entry} onChange={(next) => store.set(basePath, next)} rows={14} />
        </details>
        <Coverage path={info.path} />
      </div>
    </aside>
  );
}
