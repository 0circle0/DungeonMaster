'use client';

/** The studio shell: toolbar, left dock, viewport, inspector, console. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModuleStore, exportModule, getAt } from '@/lib/store';
import type { ModuleDoc } from '@/lib/store';
import { collectionAt } from '@/lib/schema';
import { startOf } from '@/lib/worldModel';
import type { Diagnostic, Prefab, PrefabLink } from '@dm/module';
import { Toolbar } from '@/components/studio/Toolbar';
import { Dock } from '@/components/studio/Dock';
import { Viewport } from '@/components/studio/Viewport';
import { Inspector } from '@/components/studio/Inspector';
import { ProblemsConsole } from '@/components/studio/ProblemsConsole';
import { ModsPanel } from '@/components/studio/ModsPanel';
import { RulesPanel } from '@/components/studio/RulesPanel';
import { useRules } from '@/lib/useRules';
import { useEditorMods } from '@/lib/useEditorMods';
import type { ModWire } from '@/lib/modWire';
import type { WorldAuthoring, WorldMeta } from '@dm/library';
import { claimWorld, downloadProject, lastOpened, rememberLastOpened } from '@dm/library';
import type { WorldClaim } from '@dm/library';
import { useEditorLibrary, loadWorld } from '@/lib/useEditorLibrary';
import type { LoadedWorld } from '@/lib/useEditorLibrary';
import type { ProjectSnapshot } from '@/lib/projectDiff';
import type { EditorLibraryApi } from '@/lib/useEditorLibrary';
import { useAutosave, interruptedAt, clearInterrupted } from '@/lib/useAutosave';
import { Welcome } from '@/components/studio/Welcome';
import { rememberPlace, readPlace, placeStillExists } from '@/lib/place';
import { runRules } from '@dm/module';
import { NewModuleDialog } from '@/components/studio/NewModuleDialog';
import { CommandPalette } from '@/components/studio/CommandPalette';
import { PlaceFromPrefab } from '@/components/studio/PlaceFromPrefab';
import type { Command } from '@/lib/palette';
import { emptyValue } from '@/components/Field';
import type { MapTarget, Selection, ViewId, ViewportKind } from './selection';
import { mapTargetFor, selectionForDiagnostic } from './selection';
import styles from './studio.module.css';

/** Empty mod list for the shipped editor build. */
const NO_MODS: readonly ModWire[] = [];

/** Studio shell for an already loaded world document. */
function StudioShell(props: {
  initialDoc: ModuleDoc;
  initialName: string;
  world: WorldMeta;
  library: EditorLibraryApi;
  /** Prefabs, style tables and instance links, when the world has them. */
  authoring: WorldAuthoring;
  /** The world as it was read, so the first save is a diff and not a rewrite. */
  loadedSnapshot: ProjectSnapshot | null;
  /** False when another tab has this world open, and this one must not write. */
  claimed: boolean;
  onAuthoringChange: (next: WorldAuthoring) => void;
  /** Work that did not validate last session, kept rather than lost. */
  onOpenWorld: (key: string) => void;
  onNewWorld: (doc: ModuleDoc, filename: string) => void;
}) {
  const store = useModuleStore(props.initialDoc, props.initialName);
  const [selection, setSelection] = useState<Selection>({ kind: 'start' });
  const [viewportKind, setViewportKind] = useState<ViewportKind>('map');
  const [mapTarget, setMapTarget] = useState<MapTarget>({ type: 'start' });
  const [tablePath, setTablePath] = useState<string | null>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [modsOpen, setModsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const rules = useRules();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  /** What this module pins, which decides whose opinions apply to it. */
  const declaredMods = useMemo(
    () =>
      (Array.isArray(store.doc['mods']) ? (store.doc['mods'] as { id?: unknown }[]) : [])
        .map((entry) => String(entry?.id ?? ''))
        .filter(Boolean),
    [store.doc],
  );
  const mods = useEditorMods(NO_MODS, declaredMods);

  const { validation } = store;

  /** Engine diagnostics plus any runtime warnings from installed editor mods. */
  const [modDiagnostics, setModDiagnostics] = useState<readonly Diagnostic[]>([]);
  useEffect(() => {
    if (!mods.runtime) {
      setModDiagnostics([]);
      return;
    }
    const runtime = mods.runtime;
    const timer = setTimeout(() => setModDiagnostics(runtime.lint(store.doc)), 600);
    return () => clearTimeout(timer);
  }, [mods.runtime, store.doc]);

  /** Semantic diagnostics that run after the document settles. */
  const [semantic, setSemantic] = useState<readonly Diagnostic[]>([]);
  /** False until the idle tier has run once, so the panel does not claim 0. */
  const [semanticReady, setSemanticReady] = useState(false);
  useEffect(() => {
    if (!validation.ok) {
      // A document that does not compile has nothing coherent to check.
      setSemantic([]);
      setSemanticReady(false);
      return;
    }
    const timer = setTimeout(() => {
      setSemantic(runRules(store.doc, rules.enabled, props.authoring.contract));
      setSemanticReady(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [store.doc, validation.ok, props.authoring.contract, rules.enabled]);

  const validationWithMods = useMemo(() => {
    const extra = [...modDiagnostics, ...semantic];
    if (extra.length === 0) return validation;
    const errors = extra.filter((d) => d.severity === 'error');
    const warnings = extra.filter((d) => d.severity === 'warning');
    const infos = extra.filter((d) => d.severity === 'info');
    return {
      ...validation,
      // A mod can raise an error but cannot make a valid module invalid.
      errors: [...validation.errors, ...errors],
      warnings: [...validation.warnings, ...warnings],
      infos: [...validation.infos, ...infos],
    };
  }, [validation, modDiagnostics, semantic]);


  /** Saving is always allowed for a claimed world in the library. */
  const moduleName = store.filename.replace(/\.module\.json$|\.json$/, '');
  /** Save is gated by the world claim so only one tab writes at a time. */
  const canSave = props.claimed;

  /** Unsaved work from a previous session, offered to reopen if it still exists. */
  const [interrupted, setInterrupted] = useState(() => interruptedAt(props.world));

  /** Restore the last opened location once, if the entry still exists in the loaded document. */
  useEffect(() => {
    const place = readPlace();
    if (!place || place.module !== props.world.key) return;
    if (!placeStillExists(place, store.doc)) return;

    setSelection(place.selection);
    setViewportKind(place.viewportKind);
    setTablePath(place.tablePath);
    setMapTarget(place.mapTarget);
    // Once, with no dependencies: this restores a position rather than enforcing one, and re-
    // running it would fight every click.
  }, []);

  // And remember it, whenever it moves.
  useEffect(() => {
    if (!canSave) return;
    rememberPlace({ module: props.world.key, selection, viewportKind, tablePath, mapTarget });
  }, [canSave, props.world.key, selection, viewportKind, tablePath, mapTarget]);

  /** The authoring sidecar's two mutations. */
  const savePrefab = useCallback((prefab: Prefab) => {
    props.onAuthoringChange({
      ...props.authoring,
      prefabs: [...props.authoring.prefabs.filter((p) => p.id !== prefab.id), prefab],
    });
  }, [props]);

  const linkInstance = useCallback((collection: string, entryId: string, link: PrefabLink) => {
    props.onAuthoringChange({
      ...props.authoring,
      instances: {
        ...props.authoring.instances,
        [collection]: { ...(props.authoring.instances[collection] ?? {}), [entryId]: link },
      },
    });
  }, [props]);

  const autosave = useAutosave(store, props.world, props.authoring, canSave, props.loadedSnapshot);
  const saveToDisk = autosave.flush;

  /** The "are you sure" prompt, only when a save actually failed. */
  useEffect(() => {
    if (autosave.state !== 'error') return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [autosave.state]);

  // Keyboard shortcuts for undo, redo and save.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (key === 's') {
        event.preventDefault();
        void saveToDisk();
      } else if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        store.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveToDisk, store]);

  /** The commands that are not simply somewhere to go. */
  const paletteActions: readonly Command[] = useMemo(
    () => [
      // Writes the project files that moved to the store, now rather than at the end of the idle window.
      { kind: 'action', id: 'act:save', label: 'Save now', hint: '⌘S', run: () => void saveToDisk() },
      // The compile.
      { kind: 'action', id: 'act:export', label: 'Compile module.json', hint: 'to play', run: () => {
        exportModule(store.doc, store.filename);
      } },
      // The project as a repository holds it: `project/` for entries, `maps/` for static maps.
      { kind: 'action', id: 'act:export-project', label: 'Download project files', hint: 'for git', run: () => {
        void downloadProject(store.doc, store.filename, props.authoring);
      } },
      { kind: 'action', id: 'act:new', label: 'New module…', hint: 'from a template', run: () => setNewDialog(true) },
      { kind: 'action', id: 'act:undo', label: 'Undo', hint: '⌘Z', run: () => store.undo() },
      { kind: 'action', id: 'act:redo', label: 'Redo', hint: '⌘⇧Z', run: () => store.redo() },
      { kind: 'action', id: 'act:start', label: 'Start & creation', hint: 'where play begins', run: () => openStart() },
      { kind: 'action', id: 'act:mods', label: 'Mods', hint: `${NO_MODS.length} installed`, run: () => setModsOpen((open) => !open) },
    ],
    // The navigation helpers close over nothing that changes, so they are not dependencies.
    [store, saveToDisk, props.authoring],
  );

  /** Fields the installed mods want on whatever is selected. */
  const selectedEntry = useMemo(() => {
    if (selection.kind !== 'item') return null;
    const entries = getAt(store.doc, selection.path.split('.'));
    const value = Array.isArray(entries) ? entries[selection.index] : undefined;
    if (value === undefined) return null;
    return { path: [...selection.path.split('.'), selection.index] as (string | number)[], value };
  }, [store.doc, selection]);

  const modFields = useMemo(
    () => (mods.runtime ? mods.runtime.fields(store.doc, selectedEntry) : []),
    [mods.runtime, store.doc, selectedEntry],
  );

  /** Which collections a prefab can make, so the button only offers real work. */
  const prefabCollections = useMemo(
    () => new Set(props.authoring.prefabs.map((prefab) => prefab.collection)),
    [props.authoring.prefabs],
  );

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
    const resolved = selectionForDiagnostic(diagnostic, store.doc);
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

    // A schema-empty static map is invalid, so start with a filled base and an entry marker.
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

  /** One history entry that sets the chosen field and clears the other two. */
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
        onOpenMods={() => setModsOpen((open) => !open)}
        onOpenRules={() => setRulesOpen((open) => !open)}
        worlds={props.library.worlds}
        worldKey={props.world.key}
        onOpenWorld={props.onOpenWorld}
        ruleFindings={semanticReady ? semantic.length : null}
        modCount={NO_MODS.length}
        onSave={() => void saveToDisk()}
        canSave={canSave}
        moduleName={moduleName}
        saveState={autosave.state}
        saveNote={autosave.note}
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
          onPlaceFromPrefab={setPlacing}
          prefabCollections={prefabCollections}
          authoring={props.authoring}
          onSavePrefab={savePrefab}
        />

        <Inspector
          store={store}
          selection={selection}
          diagnostics={validationWithMods}
          modFields={modFields}
          authoring={props.authoring}
          onAuthoringChange={props.onAuthoringChange}
          onOpenItem={openItem}
          onDuplicate={duplicateEntry}
          onDelete={deleteEntry}
          onPreviewStart={() => {
            setMapTarget({ type: 'start' });
            setViewportKind('map');
          }}
        />
      </div>

      <ProblemsConsole validation={validationWithMods} onOpen={openDiagnostic} />

      {rulesOpen && (
        <RulesPanel
          rules={rules}
          findings={semantic}
          contract={props.authoring.contract}
          ready={semanticReady}
          onOpen={openDiagnostic}
        />
      )}

      {modsOpen && (
        <ModsPanel
          mods={mods}
          doc={store.doc}
          declared={(store.doc['mods'] as { id: string; hash: string; target?: string; required?: boolean }[] | undefined)?.map((entry) => ({
            id: entry.id,
            hash: entry.hash,
            target: entry.target ?? 'engine',
            required: entry.required ?? false,
          })) ?? []}
          onPatch={(patches) => {
            // Batched, because a mod command is one thing the author did and should be one press of undo.
            const writes = patches.filter((patch) => patch.op === 'set');
            const deletes = patches.filter((patch) => patch.op === 'delete');
            if (writes.length > 0) {
              store.setMany(writes.map((patch) => ({ path: patch.path, value: patch.value })));
            }
            if (deletes.length > 0) store.removeMany(deletes.map((patch) => patch.path));
          }}
        />
      )}

      {!props.claimed && (
        <div className={styles.recovery}>
          <span>
            Another tab has this world open, so nothing typed here will be saved. Two tabs
            writing one world do not overwrite each other — they each save the files they
            changed, and what is left is a mixture of both. Close the other tab and reopen
            this world to edit it here.
          </span>
        </div>
      )}

      {interrupted !== null && (
        <div className={styles.recovery}>
          <span>
            The last few seconds before this world was closed on{' '}
            {new Date(interrupted).toLocaleString()} may not have been saved — a browser can
            cut a write short while a tab is closing.
          </span>
          <button
            className="btn tiny"
            onClick={() => { clearInterrupted(); setInterrupted(null); }}
          >
            Dismiss
          </button>
        </div>
      )}


      {modsOpen && (
        <ModsPanel
          mods={mods}
          doc={store.doc}
          declared={(store.doc['mods'] as { id: string; hash: string; target?: string; required?: boolean }[] | undefined)?.map((entry) => ({
            id: entry.id,
            hash: entry.hash,
            target: entry.target ?? 'engine',
            required: entry.required ?? false,
          })) ?? []}
          onPatch={(patches) => {
            // Batched, because a mod command is one thing the author did and should be one press of undo.
            const writes = patches.filter((patch) => patch.op === 'set');
            const deletes = patches.filter((patch) => patch.op === 'delete');
            if (writes.length > 0) {
              store.setMany(writes.map((patch) => ({ path: patch.path, value: patch.value })));
            }
            if (deletes.length > 0) store.removeMany(deletes.map((patch) => patch.path));
          }}
        />
      )}

      {interrupted !== null && (
        <div className={styles.recovery}>
          <span>
            The last few seconds before this world was closed on{' '}
            {new Date(interrupted).toLocaleString()} may not have been saved — a browser can
            cut a write short while a tab is closing.
          </span>
          <button
            className="btn tiny"
            onClick={() => { clearInterrupted(); setInterrupted(null); }}
          >
            Dismiss
          </button>
        </div>
      )}

      {placing && (
        <PlaceFromPrefab
          store={store}
          prefabs={props.authoring.prefabs}
          style={props.authoring.style}
          onLinkInstance={linkInstance}
          collection={placing}
          onClose={() => setPlacing(null)}
          onPlaced={(index) => openItem(placing, index)}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          doc={store.doc}
          actions={paletteActions}
          onClose={() => setPaletteOpen(false)}
          onRun={(command) => {
            if (command.kind === 'entry') openItem(command.collection, command.index);
            else if (command.kind === 'collection') openCollection(command.path);
            else if (command.kind === 'view') openView(command.view);
            else command.run();
          }}
        />
      )}

      {newDialog && (
        <NewModuleDialog
          library={props.library}
          dirty={store.dirty}
          // This world keeps its own files under its own key; flushing closes the idle window.
          onSaveFirst={() => void saveToDisk()}
          onCreate={(doc, filename) => {
            // A new world is a library row before it is a document on screen.
            props.onNewWorld(doc, filename);
            setNewDialog(false);
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

/** Choosing a world, and getting it into the shell. */
export function Studio() {
  const library = useEditorLibrary();
  const [world, setWorld] = useState<LoadedWorld | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(true);

  /** The claim on the world this tab has open, given up when it opens another. */
  const claim = useRef<WorldClaim | null>(null);
  useEffect(() => () => claim.current?.release(), []);

  const open = useCallback(async (key: string): Promise<void> => {
    setOpening(key);
    try {
      // Claim before letting go, and let go only once the new world is in hand.
      const [loaded, held] = await Promise.all([loadWorld(key), claimWorld(key)]);
      if (!loaded) {
        if (held !== claim.current) held.release();
        setFailed('That world is no longer in your library.');
        return;
      }
      const previous = claim.current;
      claim.current = held;
      if (previous && previous !== held) previous.release();
      setClaimed(held.held);
      setFailed(null);
      setWorld(loaded);
      void rememberLastOpened(key);
    } finally {
      setOpening(null);
    }
  }, []);

  // Resume where the author was, if that world is still here.
  useEffect(() => {
    if (library.loading || world) return;
    let live = true;
    void (async () => {
      const remembered = await lastOpened();
      if (!live || !remembered) return;
      if (!library.worlds.some((candidate) => candidate.key === remembered)) return;
      await open(remembered);
    })();
    return () => { live = false; };
  }, [library.loading, library.worlds, world, open]);

  const newWorld = useCallback(async (doc: ModuleDoc, filename: string): Promise<void> => {
    const meta = await library.createFrom(doc, filename);
    if (meta) await open(meta.key);
  }, [library, open]);

  if (!world) {
    return (
      <Welcome
        library={library}
        opening={opening}
        error={failed}
        onOpen={(key) => void open(key)}
        onNew={(doc, filename) => void newWorld(doc, filename)}
      />
    );
  }

  return (
    <StudioShell
      // Remounting on the world: store, selection and undo history all belong to one document.
      key={world.meta.key}
      initialDoc={world.doc}
      initialName={world.meta.filename}
      world={world.meta}
      library={library}
      authoring={world.authoring}
      loadedSnapshot={world.snapshot}
      claimed={claimed}
      onAuthoringChange={(next) => {
        setWorld((current) => (current ? { ...current, authoring: next } : current));
      }}
      onOpenWorld={(key) => void open(key)}
      onNewWorld={(doc, filename) => void newWorld(doc, filename)}
    />
  );
}
