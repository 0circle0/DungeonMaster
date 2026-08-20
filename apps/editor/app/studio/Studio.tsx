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

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { NO_AUTHORING, clearDraft, downloadProject, lastOpened, rememberLastOpened } from '@dm/library';
import { useEditorLibrary, loadWorld } from '@/lib/useEditorLibrary';
import type { LoadedWorld } from '@/lib/useEditorLibrary';
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

/**
 * Mods, which nothing currently installs.
 *
 * The machinery is intact and the shipped examples declare none, so this is the
 * unmodded studio by construction. Distributing mods to a static deployment has
 * no story yet; they remain a local-development feature until it does.
 */
const NO_MODS: readonly ModWire[] = [];

/**
 * The studio, once a world is in hand.
 *
 * Split from the loader below so that everything here can go on assuming it has
 * a document — the alternative is every panel learning to render "still
 * loading", which is a lot of code to describe a tenth of a second.
 */
function StudioShell(props: {
  initialDoc: ModuleDoc;
  initialName: string;
  world: WorldMeta;
  library: EditorLibraryApi;
  /** Prefabs, style tables and instance links, when the world has them. */
  authoring: WorldAuthoring;
  onAuthoringChange: (next: WorldAuthoring) => void;
  /** Work that did not validate last session, kept rather than lost. */
  draft: { savedAt: number; doc: Record<string, unknown> } | null;
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
  /**
   * What this module pins, which is what decides whose opinions apply to it.
   * Read from the document rather than passed in, so adopting a mod takes
   * effect as soon as the pin is written.
   */
  const declaredMods = useMemo(
    () =>
      (Array.isArray(store.doc['mods']) ? (store.doc['mods'] as { id?: unknown }[]) : [])
        .map((entry) => String(entry?.id ?? ''))
        .filter(Boolean),
    [store.doc],
  );
  const mods = useEditorMods(NO_MODS, declaredMods);

  const { validation } = store;

  /**
   * The engine's own problems plus whatever the mods raise.
   *
   * Merged rather than shown separately: an author fixing a module wants one
   * list of what is wrong with it, and a mod's complaint is prefixed with the
   * mod that raised it so its origin is never a guess.
   *
   * On the idle tier, with the semantic rules. This pushes the whole document
   * across the QuickJS boundary, which was flagged as a per-keystroke cost when
   * the scale work was planned and then not acted on — it is only visible on a
   * module that a mod has a lot to say about, and Aurendel with the morale mod
   * installed is 127 notes an edit.
   */
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

  /**
   * The contracts the schema cannot see — a flag nothing sets, a quest nobody
   * can be offered — on the idle tier with the line numbers and the hash.
   *
   * They cost about 32 ms on Aurendel, which is half a keystroke budget, and
   * almost all of it is indexing the document once so the rules themselves are
   * free. Nothing here changes while a word is being typed, so waiting for a
   * pause costs an author nothing and running per keystroke would cost them
   * half the gain of the last three weeks.
   */
  const [semantic, setSemantic] = useState<readonly Diagnostic[]>([]);
  /** False until the idle tier has run once, so the panel does not claim 0. */
  const [semanticReady, setSemanticReady] = useState(false);
  useEffect(() => {
    if (!validation.ok) {
      // A document that does not compile has nothing coherent to check, and
      // the errors it already has are the ones worth reading first.
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
      // A mod can raise an error, but it cannot make a valid module invalid:
      // `ok` still reflects the format, so a mod's opinion never blocks export.
      errors: [...validation.errors, ...errors],
      warnings: [...validation.warnings, ...warnings],
      infos: [...validation.infos, ...infos],
    };
  }, [validation, modDiagnostics, semantic]);


  /**
   * Saving, which now always has somewhere to go.
   *
   * This used to be gated on the document matching a directory in the
   * repository, which meant a brand-new module — the one case where losing work
   * costs the most — autosaved nowhere at all and survived only if somebody
   * remembered to export it. Every world is a row in the library from the
   * moment it exists, so the gate is gone.
   */
  const moduleName = store.filename.replace(/\.module\.json$|\.json$/, '');
  const canSave = true;

  /**
   * Work from a previous session that never validated.
   *
   * Offered rather than applied. The document on disk is the last thing that
   * *worked*, and quietly replacing it with a half-finished edit would take a
   * choice away at the moment an author has least context — they have just
   * opened the module and do not yet know what is in either version.
   */
  const [draft, setDraft] = useState(props.draft);
  const [interrupted, setInterrupted] = useState(() => interruptedAt(props.world));

  /**
   * Put the author back where they were.
   *
   * Once, on mount, and only if the place is still somewhere the document can
   * go — an entry that has since been deleted would open onto "nothing here",
   * which is a worse greeting than the default.
   *
   * The module itself is chosen on the server from a cookie, so by the time
   * this runs the right document is already loaded and only the position
   * inside it is missing.
   */
  useEffect(() => {
    const place = readPlace();
    if (!place || place.module !== props.world.key) return;
    if (!placeStillExists(place, store.doc)) return;

    setSelection(place.selection);
    setViewportKind(place.viewportKind);
    setTablePath(place.tablePath);
    setMapTarget(place.mapTarget);
    // Deliberately once, with no dependencies: this restores a position, it
    // does not keep enforcing one, and re-running it would fight every click.
  }, []);

  // And remember it, whenever it moves.
  useEffect(() => {
    if (!canSave) return;
    rememberPlace({ module: props.world.key, selection, viewportKind, tablePath, mapTarget });
  }, [canSave, props.world.key, selection, viewportKind, tablePath, mapTarget]);

  /**
   * The authoring sidecar's two mutations.
   *
   * Both used to be `fetch` calls to routes that wrote files, followed — in the
   * prefab case — by a full page reload, because the list they changed was a
   * server prop and there was no other way to see it. They are state now, and
   * the next autosave carries them to the library alongside the document, so a
   * prefab and the entries made from it can never be written apart.
   */
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

  const autosave = useAutosave(store, props.world, props.authoring, canSave);
  const saveToDisk = autosave.flush;

  /**
   * The "are you sure" prompt, now only when it is true.
   *
   * It used to fire on any unsaved edit, which was right when `⌘S` was the only
   * way to disk. Autosave writes as you type and a beacon catches whatever is
   * still in the idle window, so a dirty document is not lost work — it is work
   * that is about to be written. Prompting anyway trains people to dismiss the
   * one case that matters: a save that actually failed.
   */
  useEffect(() => {
    if (autosave.state !== 'error') return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [autosave.state]);

  // The three shortcuts the editor had none of. Undo was a button only, which
  // on a tool people type into all day is the wrong shape.
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

  /**
   * The commands that are not simply somewhere to go.
   *
   * Memoised on what they close over, so the palette's own index is not
   * rebuilt every time the studio re-renders behind it.
   */
  const paletteActions: readonly Command[] = useMemo(
    () => [
      { kind: 'action', id: 'act:save', label: 'Save to disk', hint: '⌘S', run: () => void saveToDisk() },
      { kind: 'action', id: 'act:export', label: 'Export module', hint: 'download', run: () => {
        exportModule(store.doc, store.filename);
        store.markSaved();
      } },
      // The same world as the files a repository holds, rather than as one
      // document: `project/` for entries and `maps/` for static maps, which is
      // what git wants and what `npm run project -- unpack` reads back.
      { kind: 'action', id: 'act:export-project', label: 'Export project files', hint: 'for git', run: () => {
        void downloadProject(store.doc as Record<string, unknown>, store.filename, props.authoring)
          .then(() => store.markSaved());
      } },
      { kind: 'action', id: 'act:new', label: 'New module…', hint: 'from a template', run: () => setNewDialog(true) },
      { kind: 'action', id: 'act:undo', label: 'Undo', hint: '⌘Z', run: () => store.undo() },
      { kind: 'action', id: 'act:redo', label: 'Redo', hint: '⌘⇧Z', run: () => store.redo() },
      { kind: 'action', id: 'act:start', label: 'Start & creation', hint: 'where play begins', run: () => openStart() },
      { kind: 'action', id: 'act:mods', label: 'Mods', hint: `${NO_MODS.length} installed`, run: () => setModsOpen((open) => !open) },
    ],
    // The navigation helpers are redefined every render and close over nothing
    // that changes, so they are deliberately not dependencies. `props.authoring`
    // is one, because exporting project files has to carry the prefabs a
    // compressed project rebuilds against.
    [store, saveToDisk, props.authoring],
  );

  /**
   * Fields the installed mods want on whatever is selected.
   *
   * Keyed on the selected entry rather than the document: the hook is handed
   * the module's meta and the one entry, so it costs a QuickJS call per
   * selection and not one per keystroke.
   */
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
            // Batched, because a mod command is one thing the author did and
            // should be one press of undo. Applying them one at a time made a
            // forty-patch transform need forty undos — which is the opposite
            // of what both this panel and the mod ABI say happens.
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

      {draft && (
        <div className={styles.recovery}>
          <span>
            Unsaved work from {new Date(draft.savedAt).toLocaleString()} — it had errors, so it was
            kept here rather than written to the module.
          </span>
          <button
            className="btn tiny primary"
            onClick={() => {
              store.replace(draft.doc);
              setDraft(null);
            }}
          >
            Restore it
          </button>
          <button
            className="btn tiny"
            onClick={() => {
              void clearDraft(props.world.key);
              setDraft(null);
            }}
          >
            Discard
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
          onExportFirst={() => {
            exportModule(store.doc, store.filename);
            store.markSaved();
          }}
          onCreate={(doc, filename) => {
            // A new world is a library row before it is a document on screen,
            // so there is never a state where typing goes nowhere.
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

/**
 * Choosing a world, and getting it into the shell.
 *
 * This replaces a server component that read `modules/` from disk on every
 * request, picked a starting module from a cookie, and handed the whole thing
 * across the boundary. All of that is here now, in the browser, against the
 * library — which is what makes the studio a page a static host can serve.
 *
 * First paint is a skeleton rather than a guess. The old arrangement existed
 * partly to avoid the wrong document appearing and being swapped a moment
 * later; with no server render there is nothing to be wrong, so there is
 * nothing to hide.
 */
export function Studio() {
  const library = useEditorLibrary();
  const [world, setWorld] = useState<LoadedWorld | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const open = useCallback(async (key: string): Promise<void> => {
    setOpening(key);
    try {
      const loaded = await loadWorld(key);
      if (!loaded) { setFailed('That world is no longer in your library.'); return; }
      setFailed(null);
      setWorld(loaded);
      void rememberLastOpened(key);
    } finally {
      setOpening(null);
    }
  }, []);

  // Resume where the author was, if that world is still here. No fallback to
  // "some other world": opening something nobody asked for is worse than
  // showing the shelf.
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
      // Remounting on the world is the point: the store, the selection and the
      // undo history all belong to one document, and carrying any of them
      // across a switch is how an edit lands in the wrong world.
      key={world.meta.key}
      initialDoc={world.envelope.doc}
      initialName={world.envelope.filename}
      world={world.meta}
      library={library}
      authoring={world.envelope.authoring ?? NO_AUTHORING}
      onAuthoringChange={(next) => {
        setWorld((current) => (current
          ? { ...current, envelope: { ...current.envelope, authoring: next } }
          : current));
      }}
      draft={world.draft}
      onOpenWorld={(key) => void open(key)}
      onNewWorld={(doc, filename) => void newWorld(doc, filename)}
    />
  );
}
