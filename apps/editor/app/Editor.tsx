/**
 * The editor shell.
 *
 * Three panes: collections on the left, entries in the middle, the selected
 * entry on the right. Navigation is generated from the module schema, so every
 * part of the system and the story is reachable — and a collection added to the
 * schema later shows up here with no change to this file.
 */

'use client';

import { useMemo, useRef, useState } from 'react';
import { COLLECTIONS, SECTIONS, SINGLETONS, collectionAt, labelFor } from '@/lib/schema';
import { useModuleStore, exportModule, getAt } from '@/lib/store';
import type { ModuleDoc, Path } from '@/lib/store';
import { Field, emptyValue } from '@/components/Field';
import { JsonBox } from '@/components/JsonBox';
import { WorldTree } from '@/components/WorldTree';
import { EventsView } from '@/components/EventsView';
import { BalanceView } from '@/components/BalanceView';
import { DialogueGraph } from '@/components/DialogueGraph';
import { TimelineView } from '@/components/TimelineView';
import { PerceptionView } from '@/components/PerceptionView';
import { UsedBy } from '@/components/UsedBy';

type View =
  | { kind: 'collection'; path: string; index: number }
  | { kind: 'world' }
  | { kind: 'events' }
  | { kind: 'balance' }
  | { kind: 'dialogue' }
  | { kind: 'timeline' }
  | { kind: 'perception' }
  | { kind: 'singleton'; path: string }
  | { kind: 'raw' };

export function Editor({ initialDoc, initialName }: { initialDoc: ModuleDoc; initialName: string }) {
  const store = useModuleStore(initialDoc, initialName);
  const [view, setView] = useState<View>({ kind: 'singleton', path: 'meta' });
  const [filter, setFilter] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const { doc, validation, idsByCollection } = store;

  /** Errors grouped by the collection they occur in, for the sidebar badges. */
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

  const openFile = (file: File) => {
    void file.text().then((text) => {
      try {
        store.load(JSON.parse(text) as ModuleDoc, file.name);
        setView({ kind: 'singleton', path: 'meta' });
      } catch (err) {
        alert(`Could not parse ${file.name}: ${(err as Error).message}`);
      }
    });
  };

  const entriesFor = (path: string): Record<string, unknown>[] => {
    const value = getAt(doc, path.split('.'));
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  };

  const addEntry = (path: string) => {
    const info = collectionAt(path);
    if (!info) return;
    const entries = entriesFor(path);
    const draft = emptyValue(info.spec) as Record<string, unknown>;
    draft['id'] = uniqueId(entries, `new_${info.name.replace(/s$/, '')}`);
    if ('name' in draft) draft['name'] = 'Untitled';
    store.set([...path.split('.'), entries.length], draft);
    setView({ kind: 'collection', path, index: entries.length });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>DungeonMaster</strong>
          <span className="sub">module editor</span>
        </div>

        <div className="identity">
          {validation.ok ? (
            <>
              <span className="ok-dot" /> {validation.identity}
              <code className="hash">{validation.hash.slice(0, 8)}</code>
            </>
          ) : (
            <>
              <span className="err-dot" /> {validation.errors.length} error
              {validation.errors.length === 1 ? '' : 's'}
            </>
          )}
          {validation.warnings.length > 0 && (
            <span className="warn">{validation.warnings.length} warning{validation.warnings.length === 1 ? '' : 's'}</span>
          )}
          {store.dirty && <span className="dirty">● unsaved</span>}
        </div>

        <div className="actions">
          <button className="btn" disabled={!store.canUndo} onClick={store.undo}>
            Undo
          </button>
          <button className="btn" disabled={!store.canRedo} onClick={store.redo}>
            Redo
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Load…
          </button>
          <button
            className="btn primary"
            onClick={() => {
              exportModule(doc, store.filename);
              store.markSaved();
            }}
          >
            Export
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) openFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="body">
        <nav className="sidebar">
          <div className="nav-section">
            <div className="nav-head">Module</div>
            {SINGLETONS.map((s) => (
              <button
                key={s.path}
                className={`nav-item ${view.kind === 'singleton' && view.path === s.path ? 'active' : ''}`}
                onClick={() => setView({ kind: 'singleton', path: s.path })}
              >
                {s.label}
              </button>
            ))}
            <button
              className={`nav-item ${view.kind === 'world' ? 'active' : ''}`}
              onClick={() => setView({ kind: 'world' })}
            >
              World map
            </button>
            <button
              className={`nav-item ${view.kind === 'events' ? 'active' : ''}`}
              onClick={() => setView({ kind: 'events' })}
            >
              Events
            </button>
            <button
              className={`nav-item ${view.kind === 'balance' ? 'active' : ''}`}
              onClick={() => setView({ kind: 'balance' })}
            >
              Balance
            </button>
            <button
              className={`nav-item ${view.kind === 'dialogue' ? 'active' : ''}`}
              onClick={() => setView({ kind: 'dialogue' })}
            >
              Dialogue graph
            </button>
            <button
              className={`nav-item ${view.kind === 'timeline' ? 'active' : ''}`}
              onClick={() => setView({ kind: 'timeline' })}
            >
              Timeline
            </button>
            <button
              className={`nav-item ${view.kind === 'perception' ? 'active' : ''}`}
              onClick={() => setView({ kind: 'perception' })}
            >
              Perception
            </button>
            <button
              className={`nav-item ${view.kind === 'raw' ? 'active' : ''}`}
              onClick={() => setView({ kind: 'raw' })}
            >
              Raw JSON
            </button>
          </div>

          {SECTIONS.map((section) => (
            <div className="nav-section" key={section.id}>
              <div className="nav-head">{section.label}</div>
              {section.collections.map((collection) => {
                const count = entriesFor(collection.path).length;
                const errors = errorsByCollection[collection.path] ?? 0;
                const active = view.kind === 'collection' && view.path === collection.path;
                return (
                  <button
                    key={collection.path}
                    className={`nav-item ${active ? 'active' : ''}`}
                    onClick={() => setView({ kind: 'collection', path: collection.path, index: 0 })}
                  >
                    <span>{collection.label}</span>
                    {errors > 0 ? <span className="pill err">{errors}</span> : <span className="pill">{count}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {view.kind === 'collection' && (
          <CollectionView
            path={view.path}
            index={view.index}
            entries={entriesFor(view.path)}
            filter={filter}
            setFilter={setFilter}
            onSelect={(index) => setView({ kind: 'collection', path: view.path, index })}
            onAdd={() => addEntry(view.path)}
            onDelete={(index) => {
              store.remove([...view.path.split('.'), index]);
              setView({ kind: 'collection', path: view.path, index: 0 });
            }}
            store={store}
            idsByCollection={idsByCollection}
            onNavigate={(path, index) => setView({ kind: 'collection', path, index })}
          />
        )}

        {view.kind === 'singleton' && (
          <main className="pane wide">
            <SingletonView path={view.path} store={store} idsByCollection={idsByCollection} />
          </main>
        )}

        {view.kind === 'world' && (
          <main className="pane wide">
            <WorldTree
              doc={doc}
              onOpen={(path, index) => setView({ kind: 'collection', path, index })}
              onAdd={(path, seed) => {
                const entries = entriesFor(path);
                const info = collectionAt(path);
                if (!info) return;
                const draft = { ...(emptyValue(info.spec) as Record<string, unknown>), ...seed };
                draft['id'] = uniqueId(entries, String(seed['id'] ?? `new_${info.name.replace(/s$/, '')}`));
                store.set([...path.split('.'), entries.length], draft);
                setView({ kind: 'collection', path, index: entries.length });
              }}
            />
          </main>
        )}

        {view.kind === 'events' && (
          <main className="pane wide">
            <EventsView
              doc={doc}
              onOpen={(path, index) => setView({ kind: 'collection', path, index })}
            />
          </main>
        )}

        {view.kind === 'balance' && (
          <main className="pane wide">
            <BalanceView doc={doc} />
          </main>
        )}

        {view.kind === 'dialogue' && (
          <main className="pane wide">
            <DialogueGraph doc={doc} />
          </main>
        )}

        {view.kind === 'timeline' && (
          <main className="pane wide">
            <TimelineView doc={doc} />
          </main>
        )}

        {view.kind === 'perception' && (
          <main className="pane wide">
            <PerceptionView doc={doc} />
          </main>
        )}

        {view.kind === 'raw' && (
          <main className="pane wide">
            <h2 className="pane-title">Raw module JSON</h2>
            <p className="hint">
              The whole document. Edits apply once the JSON parses, and the exported file is exactly what you
              write here — no schema defaults are injected.
            </p>
            <JsonBox fill value={doc} onChange={(next) => store.replace(next as ModuleDoc)} />
          </main>
        )}
      </div>

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <footer className="problems">
          <div className="problems-head">
            Problems
            <span className="problems-count">
              {validation.errors.length} error{validation.errors.length === 1 ? '' : 's'},{' '}
              {validation.warnings.length} warning{validation.warnings.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="problems-list">
            {[...validation.errors, ...validation.warnings].map((issue, i) => (
              <button
                className={`problem ${issue.severity === 'error' ? 'err' : 'warn'}`}
                key={i}
                title="Show this in the raw JSON"
                onClick={() => setView({ kind: 'raw' })}
              >
                <span className="problem-where">
                  {issue.position ? `${issue.position.line}:${issue.position.column}` : issue.path || '<root>'}
                </span>
                <span className="problem-body">
                  <span className="problem-message">{issue.message}</span>
                  {issue.hint && <span className="problem-hint">→ {issue.hint}</span>}
                  {issue.path && <code className="problem-path">{issue.path}</code>}
                </span>
                <span className="code">{issue.code}</span>
              </button>
            ))}
          </div>
        </footer>
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

function CollectionView(props: {
  path: string;
  index: number;
  entries: Record<string, unknown>[];
  filter: string;
  setFilter: (v: string) => void;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  store: ReturnType<typeof useModuleStore>;
  idsByCollection: Record<string, string[]>;
  onNavigate: (collection: string, index: number) => void;
}) {
  const info = collectionAt(props.path);
  if (!info) return <main className="pane">Unknown collection.</main>;

  const needle = props.filter.toLowerCase();
  const visible = props.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) =>
      needle === ''
        ? true
        : `${String(entry['id'] ?? '')} ${String(entry['name'] ?? '')}`.toLowerCase().includes(needle),
    );

  const selected = props.entries[props.index];
  const basePath: Path = [...props.path.split('.'), props.index];

  return (
    <>
      <section className="list">
        <div className="list-head">
          <input
            className="input"
            placeholder={`Filter ${info.label.toLowerCase()}…`}
            value={props.filter}
            onChange={(e) => props.setFilter(e.target.value)}
          />
          <button className="btn primary" onClick={props.onAdd}>
            + New
          </button>
        </div>
        <div className="list-items">
          {visible.map(({ entry, index }) => (
            <button
              key={index}
              className={`list-item ${index === props.index ? 'active' : ''}`}
              onClick={() => props.onSelect(index)}
            >
              <span className="item-name">{String(entry['name'] ?? entry['id'] ?? `#${index}`)}</span>
              <code className="item-id">{String(entry['id'] ?? '')}</code>
            </button>
          ))}
          {visible.length === 0 && <p className="empty">No {info.label.toLowerCase()} yet.</p>}
        </div>
      </section>

      <main className="pane">
        {selected ? (
          <>
            <div className="pane-head">
              <h2 className="pane-title">
                {String(selected['name'] ?? selected['id'] ?? 'Entry')}
                <code className="pane-path">{info.path}</code>
              </h2>
              <button className="btn danger" onClick={() => props.onDelete(props.index)}>
                Delete
              </button>
            </div>
            <Field
              spec={info.spec}
              value={selected}
              path={basePath}
              idsByCollection={props.idsByCollection}
              onChange={props.store.set}
              onRemove={props.store.remove}
            />
            <UsedBy
              doc={props.store.doc}
              collection={info.path}
              id={String(selected['id'] ?? '')}
              onOpen={(collection, index) => props.onNavigate(collection, index)}
            />
            <details className="raw-entry">
              <summary>Raw JSON for this entry</summary>
              <JsonBox value={selected} onChange={(next) => props.store.set(basePath, next)} rows={14} />
            </details>
          </>
        ) : (
          <p className="empty">Select or create an entry.</p>
        )}
      </main>
    </>
  );
}

function SingletonView(props: {
  path: string;
  store: ReturnType<typeof useModuleStore>;
  idsByCollection: Record<string, string[]>;
}) {
  const singleton = SINGLETONS.find((s) => s.path === props.path);
  if (!singleton) return <p className="empty">Unknown section.</p>;

  const path = props.path.split('.');
  return (
    <>
      <h2 className="pane-title">
        {singleton.label}
        <code className="pane-path">{props.path}</code>
      </h2>
      <Field
        spec={singleton.spec}
        value={getAt(props.store.doc, path) ?? {}}
        path={path}
        label={labelFor(singleton.label)}
        idsByCollection={props.idsByCollection}
        onChange={props.store.set}
        onRemove={props.store.remove}
      />
    </>
  );
}

export { COLLECTIONS };
