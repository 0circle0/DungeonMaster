/**
 * Inspector for the selected module item.
 * It renders the generated form plus item-specific actions and diagnostics.
 */

import { useMemo, useState } from 'react';
import { getAt } from '@/lib/store';
import type { ModuleStore, Path } from '@/lib/store';
import { SINGLETONS, collectionAt, labelFor } from '@/lib/schema';
import { singletonLabel } from '@/lib/labels';
import { JsonBox } from '@/components/JsonBox';
import { UsedBy } from '@/components/UsedBy';
import type { Diagnostic } from '@dm/module';
import { FieldDiagnostics, FieldOverrides, diagnosticsByPath } from '@/components/Field';
import { planMove } from '@/lib/bulk';
import { RenamePanel } from './RenamePanel';
import { ModFields } from './ModFields';
import { PrefabPanel } from './PrefabPanel';
import { usePrefabState } from '@/lib/overrides';
import { DungeonFit } from './DungeonFit';
import { Roads } from './Roads';
import { LayOut } from './LayOut';
import { DialoguePieces } from './DialoguePieces';
import { QuestChain } from './QuestChain';
import { Description } from './Description';
import { Hidden } from './Hidden';
import { Noticing } from './Noticing';
import { ThreadPanel } from './ThreadPanel';
import { derivePrefab } from '@dm/module';
import type { WorldAuthoring } from '@dm/library';
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
  authoring: WorldAuthoring;
  onAuthoringChange: (next: WorldAuthoring) => void;
  /**
   * Everything wrong with the module, mods and rules included.
   *
   * Not `store.validation`, which is the schema alone: a mod that says which
   * field is wrong, and a rule that says which entry is, were both being told
   * to the console and to nobody else.
   */
  diagnostics: {
    errors: readonly Diagnostic[];
    warnings: readonly Diagnostic[];
    infos: readonly Diagnostic[];
  };
}

/**
 * Collections whose entries carry a `descriptionKey` — the three that name a
 * bundle of arrival prose. Dungeons and biomes carry a plain `description`
 * string instead, which the generated form already handles.
 */
const DESCRIBED = new Set(['world.pointsOfInterest', 'world.areas', 'world.roomTemplates']);

export function Inspector(props: InspectorProps) {
  /** Diagnostics grouped by field path for the generated form. */
  const problems = useMemo(
    () =>
      diagnosticsByPath(
        [...props.diagnostics.errors, ...props.diagnostics.warnings, ...props.diagnostics.infos],
        props.store.doc,
      ),
    [props.diagnostics, props.store.doc],
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

  // Rename state is scoped to the current selection.
  const selectionKey = selection.kind === 'item' ? `${selection.path}.${selection.index}` : selection.kind;
  const [lastKey, setLastKey] = useState(selectionKey);
  if (lastKey !== selectionKey) {
    setLastKey(selectionKey);
    setRenaming(false);
  }

  // Compute item metadata before the early returns so hooks stay stable.
  const info = selection.kind === 'item' ? collectionAt(selection.path) : null;
  const entries = selection.kind === 'item' ? getAt(store.doc, selection.path.split('.')) : null;
  const entry =
    selection.kind === 'item' && Array.isArray(entries)
      ? (entries[selection.index] as Record<string, unknown> | undefined)
      : undefined;
  // Keep the base path stable so prefab state memoization remains effective.
  const basePath: Path = useMemo(
    () => (selection.kind === 'item' ? [...selection.path.split('.'), selection.index] : []),
    [selection],
  );

  const prefabState = usePrefabState({
    store,
    basePath,
    entry: entry ?? {},
    collection: info?.path ?? '',
    authoring: props.authoring,
  });

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

  if (!info || !entry) {
    return (
      <aside className={styles.inspector}>
        <p className={styles.inspectorEmpty}>Nothing here — the entry may have been deleted.</p>
      </aside>
    );
  }

  /** Save the current entry as a prefab and link it to the generated prefab definition. */
  const saveAsPrefab = () => {
    const entryId = String(entry['id'] ?? '');
    if (!entryId) return;
    const prefabId = window.prompt('Call the prefab:', `${entryId}_like`)?.trim();
    if (!prefabId || !/^[a-z][a-z0-9_]*$/.test(prefabId)) return;

    const { prefab, params } = derivePrefab(entry, info.path, prefabId);

    // Client state, and that is the whole change: the prefab list used to be a
    // server prop, so the only way to see a new one was to reload the page and
    // read it again. It lives in the studio now, and the panel re-renders.
    props.onAuthoringChange({
      ...props.authoring,
      prefabs: [...props.authoring.prefabs.filter((p) => p.id !== prefabId), prefab],
      instances: {
        ...props.authoring.instances,
        [info.path]: {
          ...(props.authoring.instances[info.path] ?? {}),
          [entryId]: { id: prefabId, params, overrides: [] },
        },
      },
    });
  };

  /** Move the selected entry in its collection and keep the selection on the new item. */
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
        {!prefabState.link && (
          <button
            className="btn tiny"
            title="Turn this into a prefab, so the next thirty like it are three fields"
            onClick={saveAsPrefab}
          >
            Save as prefab…
          </button>
        )}
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
        <FieldOverrides.Provider value={prefabState.info}>
          <ItemForm
            spec={info.spec}
            registryPath={info.path}
            basePath={basePath}
            store={store}
            // A static map's layers are thousands of cells; the generic array
            // editor would render them as a wall of inputs. The painter owns them.
            {...(info.path === 'world.maps' ? { omit: new Set(['layers']) } : {})}
          />
        </FieldOverrides.Provider>
        {DESCRIBED.has(info.path) && (
          <Description
            store={store}
            collection={info.path}
            index={selection.index}
            entry={entry}
          />
        )}
        {info.path === 'world.pointsOfInterest' && (
          <Hidden store={store} index={selection.index} entry={entry} />
        )}
        {info.path === 'world.pointsOfInterest' && (
          <Noticing store={store} index={selection.index} entry={entry} />
        )}
        {info.path === 'narrative.loreThreads' && (
          <ThreadPanel store={store} entry={entry} onOpen={props.onOpenItem} />
        )}
        {info.path === 'world.areas' && <LayOut store={store} area={entry} />}
        {info.path === 'world.areas' && <Roads store={store} areaIndex={selection.index} />}
        {info.path === 'narrative.quests' && (
          <QuestChain store={store} questIndex={selection.index} />
        )}
        {info.path === 'narrative.dialogues' && (
          <DialoguePieces store={store} dialogueIndex={selection.index} />
        )}
        {info.path === 'world.dungeons' && (
          <DungeonFit store={store} basePath={basePath} entry={entry} />
        )}
        {prefabState.danglingLink && (
          <p className="hint">
            Placed from a prefab called <code>{prefabState.danglingLink}</code>, which is not in
            this project.
          </p>
        )}
        {prefabState.prefab && prefabState.info && (
          <PrefabPanel
            entry={entry}
            prefab={prefabState.prefab}
            overrides={prefabState.info}
            issues={prefabState.issues}
            onResetAll={prefabState.resetAll}
          />
        )}
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

