/**
 * The right-hand properties panel: whatever is selected renders here as its
 * schema-generated form — a new zod field appears with no UI work. The studio
 * adds three things around the form: duplicate, used-by navigation, and
 * engine-coverage notes.
 */

import { useMemo, useState } from 'react';
import { getAt } from '@/lib/store';
import type { ModuleStore, Path } from '@/lib/store';
import { SINGLETONS, collectionAt, labelFor } from '@/lib/schema';
import { singletonLabel } from '@/lib/labels';
import { JsonBox } from '@/components/JsonBox';
import { UsedBy } from '@/components/UsedBy';
import { FieldDiagnostics, diagnosticsByPath } from '@/components/Field';
import { planMove } from '@/lib/bulk';
import { RenamePanel } from './RenamePanel';
import { ModFields } from './ModFields';
import { PrefabPanel } from './PrefabPanel';
import { linkFor } from '@dm/module';
import type { ProjectAuthoring } from '@/lib/modulesOnDisk';
import type { OwnedField } from '@/lib/modRuntime';
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
  /** Fields the installed mods add to the current selection. */
  modFields: readonly OwnedField[];
  authoring: ProjectAuthoring;
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
  const [renaming, setRenaming] = useState(false);

  // A different entry is a different rename, so the panel does not carry over.
  const selectionKey = selection.kind === 'item' ? `${selection.path}.${selection.index}` : selection.kind;
  const [lastKey, setLastKey] = useState(selectionKey);
  if (lastKey !== selectionKey) {
    setLastKey(selectionKey);
    setRenaming(false);
  }

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

  /**
   * Move this entry one place, and follow it.
   *
   * The selection is by index, so leaving it where it was would silently open
   * whichever entry took this one's place.
   */
  const moveEntry = (delta: number) => {
    const list = Array.isArray(entries) ? (entries as Record<string, unknown>[]) : [];
    const plan = planMove(list, selection.path, selection.index, selection.index + delta);
    if (plan.edits.length === 0) return;
    store.setMany(plan.edits);
    props.onOpenItem(selection.path, selection.index + delta);
  };

  return (
    <aside className={styles.inspector}>
      <div className={styles.inspectorHead}>
        <h2 className={styles.inspectorTitle}>{String(entry['name'] ?? entry['id'] ?? labelFor(info.name))}</h2>
        <code className={styles.inspectorPath}>{info.path}</code>
      </div>
      <div className={styles.inspectorActions}>
        {/* Where an entry sits in its collection is part of the document, and
            there has been no way to change it. Emitted order is what a diff
            reads, and for some collections it is what the engine reads too. */}
        <button
          className="btn tiny"
          title="Move earlier in the collection"
          disabled={selection.index === 0}
          onClick={() => moveEntry(-1)}
        >
          ↑
        </button>
        <button
          className="btn tiny"
          title="Move later in the collection"
          disabled={selection.index >= (Array.isArray(entries) ? entries.length : 0) - 1}
          onClick={() => moveEntry(1)}
        >
          ↓
        </button>
        <button className="btn tiny" onClick={() => setRenaming(true)}>
          Rename…
        </button>
        <button className="btn tiny" onClick={() => props.onDuplicate(selection.path, selection.index)}>
          Duplicate
        </button>
        <button className="btn tiny danger" onClick={() => props.onDelete(selection.path, selection.index)}>
          Delete
        </button>
      </div>
      {renaming && typeof entry['id'] === 'string' && (
        <RenamePanel
          store={store}
          collection={selection.path}
          id={entry['id']}
          onClose={() => setRenaming(false)}
          onRenamed={() => props.onOpenItem(selection.path, selection.index)}
        />
      )}
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
        <PrefabFor
          store={store}
          basePath={basePath}
          entry={entry}
          collection={info.path}
          authoring={props.authoring}
        />
        <ModFields store={store} basePath={basePath} fields={props.modFields} />
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

/** The prefab panel, when this entry came from one. */
function PrefabFor(props: {
  store: ModuleStore;
  basePath: Path;
  entry: Record<string, unknown>;
  collection: string;
  authoring: ProjectAuthoring;
}) {
  const id = typeof props.entry['id'] === 'string' ? props.entry['id'] : '';
  const link = id ? linkFor(props.authoring.instances, props.collection, id) : null;
  const prefab = link ? props.authoring.prefabs.find((p) => p.id === link.id) : undefined;

  // A link naming a prefab nobody can find is worth saying out loud: it means
  // the entry will never follow anything again, and silence looks like "not
  // generated" rather than "generated by something that is gone".
  if (link && !prefab) {
    return (
      <p className="hint">
        Placed from a prefab called <code>{link.id}</code>, which is not in this project.
      </p>
    );
  }
  if (!link || !prefab) return null;

  return (
    <PrefabPanel
      store={props.store}
      basePath={props.basePath}
      entry={props.entry}
      prefab={prefab}
      link={link}
      style={props.authoring.style}
    />
  );
}
