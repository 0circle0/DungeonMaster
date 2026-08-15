'use client';

/**
 * The studio shell: toolbar, left dock, viewport, inspector, console.
 *
 * State is `useModuleStore` unchanged, plus one selection value and one
 * viewport value. The selection decides what the
 * inspector edits; the viewport shows the big picture and is deliberately
 * sticky — selecting a singleton doesn't tear down the map you were looking
 * at, the way selecting an asset in a game engine doesn't close the scene.
 */

import { useEffect, useMemo, useState } from 'react';
import { useModuleStore, exportModule, getAt } from '@/lib/store';
import type { ModuleDoc } from '@/lib/store';
import { collectionAt } from '@/lib/schema';
import { startOf } from '@/lib/worldModel';
import type { Diagnostic } from '@dm/module';
import { Toolbar } from '@/components/studio/Toolbar';
import { Dock } from '@/components/studio/Dock';
import { Viewport } from '@/components/studio/Viewport';
import { Inspector } from '@/components/studio/Inspector';
import { ProblemsConsole } from '@/components/studio/ProblemsConsole';
import { NewModuleDialog } from '@/components/studio/NewModuleDialog';
import { emptyValue } from '@/components/Field';
import type { MapTarget, Selection, ViewId, ViewportKind } from './selection';
import { mapTargetFor, selectionForDiagnostic } from './selection';
import styles from './studio.module.css';

export function Studio(props: {
  initialDoc: ModuleDoc;
  initialName: string;
  templates: readonly string[];
}) {
  const store = useModuleStore(props.initialDoc, props.initialName);
  const [selection, setSelection] = useState<Selection>({ kind: 'start' });
  const [viewportKind, setViewportKind] = useState<ViewportKind>('map');
  const [mapTarget, setMapTarget] = useState<MapTarget>({ type: 'start' });
  const [tablePath, setTablePath] = useState<string | null>(null);
  const [newDialog, setNewDialog] = useState(false);

  const { validation } = store;

  // Leaving the page with unsaved edits deserves one browser prompt.
  useEffect(() => {
    if (!store.dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [store.dirty]);

  const errorsByCollection = useMemo(() => {
    const out: Record<string, number> = {};
    for (const issue of validation.errors) {
      const match = /^([a-z]+)\.([a-zA-Z]+)/.exec(issue.path);
      if (match) {
        const key = `${match[1]}.${match[2]}`;
        out[key] = (out[key] ?? 0) + 1;
      }
    }
    return out;
  }, [validation.errors]);

  // — navigation ————————————————————————————————————————————

  const openStart = () => {
    setSelection({ kind: 'start' });
    setMapTarget({ type: 'start' });
    setViewportKind('map');
  };

  const openSingleton = (path: string) => setSelection({ kind: 'singleton', path });

  const openCollection = (path: string) => {
    setTablePath(path);
    setViewportKind('table');
  };

  const openItem = (path: string, index: number) => {
    setSelection({ kind: 'item', path, index });
    const entries = getAt(store.doc, path.split('.'));
    const entry = Array.isArray(entries) ? (entries[index] as Record<string, unknown>) : undefined;
    const target = mapTargetFor(path, entry);
    if (target) {
      setMapTarget(target);
      setViewportKind('map');
    } else {
      setTablePath(path);
      setViewportKind('table');
    }
  };

  const openView = (id: ViewId) => setViewportKind(id);

  const openDiagnostic = (diagnostic: Diagnostic) => {
    const resolved = selectionForDiagnostic(diagnostic);
    if (resolved.kind === 'raw') {
      setViewportKind('rawjson');
      return;
    }
    if (resolved.kind === 'start') openStart();
    else if (resolved.kind === 'item') openItem(resolved.path, resolved.index);
    else if (resolved.kind === 'singleton') openSingleton(resolved.path);
  };

  // — edits ————————————————————————————————————————————————

  const addEntry = (path: string, seed: Record<string, unknown> = {}) => {
    const info = collectionAt(path);
    if (!info) return;
    const entries = getAt(store.doc, path.split('.'));
    const list = Array.isArray(entries) ? (entries as Record<string, unknown>[]) : [];
    const draft = { ...(emptyValue(info.spec) as Record<string, unknown>), ...seed };
    draft['id'] = uniqueId(list, String(seed['id'] ?? `new_${info.name.replace(/s$/, '')}`));
    if ('name' in draft && !seed['name']) draft['name'] = 'Untitled';

    // A schema-empty static map would be invalid (no layers). Start it as a
    // small paintable room: a filled base terrain and an entry marker.
    if (path === 'world.maps' && !seed['layers']) {
      const terrains = getAt(store.doc, ['world', 'terrains']);
      const first = Array.isArray(terrains)
        ? (terrains as { id?: unknown; passable?: unknown }[])
        : [];
      const floor = String(first.find((t) => t.passable !== false)?.id ?? first[0]?.id ?? 'floor');
      const wall = String(first.find((t) => t.passable === false)?.id ?? floor);
      const W = 12;
      const H = 10;
      const terrain = Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) =>
          x === 0 || y === 0 || x === W - 1 || y === H - 1 ? wall : floor));
      const markers = Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) =>
          x === Math.floor(W / 2) && y === Math.floor(H / 2) ? 'entry' : ''));
      draft['entry'] = 'entry';
      draft['layers'] = [
        { kind: 'terrain', cells: terrain },
        { kind: 'markers', cells: markers },
      ];
    }

    store.set([...path.split('.'), list.length], draft);
    openItem(path, list.length);
  };

  const duplicateEntry = (path: string, index: number) => {
    const entries = getAt(store.doc, path.split('.'));
    if (!Array.isArray(entries)) return;
    const source = entries[index] as Record<string, unknown> | undefined;
    if (!source) return;
    const copy = structuredClone(source);
    copy['id'] = uniqueId(entries as Record<string, unknown>[], `${String(source['id'] ?? 'entry')}_copy`);
    store.set([...path.split('.'), entries.length], copy);
    openItem(path, entries.length);
  };

  const deleteEntry = (path: string, index: number) => {
    store.remove([...path.split('.'), index]);
    setSelection({ kind: 'none' });
  };

  /**
   * "Start here": one history entry that sets the chosen field and clears the
   * other two, so undo undoes the whole decision and the exported start block
   * never carries redundant fields.
   */
  const setStart = (field: 'startingPoi' | 'startingArea' | 'startingDungeon', id: string) => {
    const start = { ...startOf(store.doc) };
    delete start['startingPoi'];
    delete start['startingArea'];
    delete start['startingDungeon'];
    start[field] = id;
    store.set(['start'], start);
    openStart();
  };

  const loadFile = (file: File) => {
    if (store.dirty && !confirm(`"${store.filename}" has unsaved changes. Discard them and load ${file.name}?`)) {
      return;
    }
    void file.text().then((text) => {
      try {
        store.load(JSON.parse(text) as ModuleDoc, file.name);
        openStart();
      } catch (err) {
        alert(`Could not parse ${file.name}: ${(err as Error).message}`);
      }
    });
  };

  return (
    <div className={styles.shell}>
      <Toolbar
        store={store}
        onNew={() => setNewDialog(true)}
        onLoadFile={loadFile}
        onOpenStart={openStart}
      />

      <div className={styles.main}>
        <Dock
          store={store}
          selection={selection}
          viewportKind={viewportKind}
          tablePath={tablePath}
          errorsByCollection={errorsByCollection}
          onOpenCollection={openCollection}
          onOpenSingleton={openSingleton}
          onOpenStart={openStart}
          onOpenView={openView}
          onOpenItem={openItem}
          onAdd={addEntry}
          onSetStart={setStart}
        />

        <Viewport
          kind={viewportKind}
          mapTarget={mapTarget}
          tablePath={tablePath}
          store={store}
          selection={selection}
          onShowMap={() => setViewportKind('map')}
          onShowTable={() => setViewportKind('table')}
          onShowView={openView}
          onSelectItem={openItem}
          onAddEntry={addEntry}
        />

        <Inspector
          store={store}
          selection={selection}
          onOpenItem={openItem}
          onDuplicate={duplicateEntry}
          onDelete={deleteEntry}
          onPreviewStart={() => {
            setMapTarget({ type: 'start' });
            setViewportKind('map');
          }}
        />
      </div>

      <ProblemsConsole validation={validation} onOpen={openDiagnostic} />

      {newDialog && (
        <NewModuleDialog
          templates={props.templates}
          dirty={store.dirty}
          onExportFirst={() => {
            exportModule(store.doc, store.filename);
            store.markSaved();
          }}
          onCreate={(doc, filename) => {
            store.load(doc, filename);
            setNewDialog(false);
            openStart();
          }}
          onClose={() => setNewDialog(false)}
        />
      )}
    </div>
  );
}

function uniqueId(entries: readonly Record<string, unknown>[], base: string): string {
  const taken = new Set(entries.map((e) => e['id']));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) {
    const candidate = `${base}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}
