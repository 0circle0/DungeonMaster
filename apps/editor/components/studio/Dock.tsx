/** The left dock: five tabs over the module, World first on the containment tree. */

import { useState } from 'react';
import { SECTIONS, SINGLETONS } from '@/lib/schema';
import { singletonLabel } from '@/lib/labels';
import { getAt } from '@/lib/store';
import type { ModuleStore } from '@/lib/store';
import type { Selection, ViewId, ViewportKind } from '@/app/studio/selection';
import { VIEW_LABELS } from '@/app/studio/selection';
import { StudioWorldTree } from './StudioWorldTree';
import styles from '@/app/studio/studio.module.css';

type DockTab = 'world' | 'content' | 'rules' | 'story' | 'module';

const TABS: readonly { id: DockTab; label: string }[] = [
  { id: 'world', label: 'World' },
  { id: 'content', label: 'Content' },
  { id: 'rules', label: 'Rules' },
  { id: 'story', label: 'Story' },
  { id: 'module', label: 'Module' },
];

const SECTION_FOR_TAB: Record<DockTab, string | null> = {
  world: 'world',
  content: 'content',
  rules: 'rules',
  story: 'narrative',
  module: null,
};

const VIEWS_FOR_TAB: Record<DockTab, readonly ViewId[]> = {
  world: [],
  content: [],
  rules: ['balance'],
  story: ['dialogue', 'timeline', 'events'],
  module: ['perception', 'orphans', 'prefabs', 'rawjson'],
};

export function Dock(props: {
  store: ModuleStore;
  selection: Selection;
  viewportKind: ViewportKind;
  /** Collection currently shown as a table in the viewport, if any. */
  tablePath: string | null;
  errorsByCollection: Record<string, number>;
  onOpenCollection: (path: string) => void;
  onOpenSingleton: (path: string) => void;
  onOpenStart: () => void;
  onOpenView: (id: ViewId) => void;
  onOpenItem: (path: string, index: number) => void;
  onAdd: (path: string, seed: Record<string, unknown>) => void;
  onSetStart: (field: 'startingPoi' | 'startingArea' | 'startingDungeon', id: string) => void;
}) {
  const [tab, setTab] = useState<DockTab>('world');
  const { store } = props;

  const countFor = (path: string): number => {
    const value = getAt(store.doc, path.split('.'));
    return Array.isArray(value) ? value.length : 0;
  };

  const section = SECTIONS.find((s) => s.id === SECTION_FOR_TAB[tab]);
  const views = VIEWS_FOR_TAB[tab];

  return (
    <nav className={styles.dock}>
      <div className={styles.dockTabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${styles.dockTab} ${tab === t.id ? styles.dockTabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.dockBody}>
        {tab === 'world' && (
          <StudioWorldTree
            doc={store.doc}
            selection={props.selection}
            onOpenStart={props.onOpenStart}
            onOpenItem={props.onOpenItem}
            onAdd={props.onAdd}
            onSetStart={props.onSetStart}
          />
        )}

        {tab === 'module' && (
          <>
            <div className={styles.dockHead}>Configuration</div>
            {SINGLETONS.map((singleton) => {
              const isStart = singleton.path === 'start';
              const active = isStart
                ? props.selection.kind === 'start'
                : props.selection.kind === 'singleton' && props.selection.path === singleton.path;
              return (
                <button
                  key={singleton.path}
                  className={`${styles.dockItem} ${active ? styles.dockItemActive : ''}`}
                  onClick={() => (isStart ? props.onOpenStart() : props.onOpenSingleton(singleton.path))}
                >
                  <span>{singletonLabel(singleton.path, singleton.label)}</span>
                </button>
              );
            })}
          </>
        )}

        {section && (
          <>
            <div className={styles.dockHead}>{section.label}</div>
            {section.collections.map((collection) => {
              const count = countFor(collection.path);
              const errors = props.errorsByCollection[collection.path] ?? 0;
              const active =
                (props.selection.kind === 'item' && props.selection.path === collection.path) ||
                (props.viewportKind === 'table' && props.tablePath === collection.path);
              return (
                <button
                  key={collection.path}
                  className={`${styles.dockItem} ${active ? styles.dockItemActive : ''}`}
                  onClick={() => props.onOpenCollection(collection.path)}
                >
                  <span>{collection.label}</span>
                  {errors > 0 ? <span className="pill err">{errors}</span> : <span className="pill">{count}</span>}
                </button>
              );
            })}
          </>
        )}

        {views.length > 0 && (
          <>
            <div className={styles.dockHead}>Views</div>
            {views.map((id) => (
              <button
                key={id}
                className={`${styles.dockItem} ${props.viewportKind === id ? styles.dockItemActive : ''}`}
                onClick={() => props.onOpenView(id)}
              >
                <span>{VIEW_LABELS[id]}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </nav>
  );
}
