import { useRef } from 'react';
import type { ModuleStore } from '@/lib/store';
import { exportModule } from '@/lib/store';
import { resolveStart } from '@/lib/worldModel';
import styles from '@/app/studio/studio.module.css';

const START_KIND_LABEL = { poi: 'POI', area: 'area', dungeon: 'dungeon' } as const;

/**
 * Module-level operations plus the two facts worth keeping permanently in
 * view: whether the module validates, and where play begins. The start chip
 * exists because a missing start location is the one error that otherwise
 * stays invisible until someone tries to play.
 */
export function Toolbar(props: {
  store: ModuleStore;
  onNew: () => void;
  onLoadFile: (file: File) => void;
  onOpenStart: () => void;
  onOpenMods: () => void;
  /** How many mods are installed, so the button can say. */
  modCount: number;
}) {
  const { store } = props;
  const { validation } = store;
  const fileInput = useRef<HTMLInputElement>(null);
  const start = resolveStart(store.doc);

  return (
    <header className={styles.toolbar}>
      <span className={styles.brand}>DungeonMaster</span>
      <span className={styles.brandSub}>studio</span>

      <span className={styles.filename}>{store.filename}</span>
      {store.dirty && <span className={styles.dirty}>●</span>}

      <div className={styles.toolGroup}>
        <button className="btn" onClick={props.onNew}>
          New…
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()}>
          Load…
        </button>
        <button
          className="btn primary"
          onClick={() => {
            exportModule(store.doc, store.filename);
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
            if (file) props.onLoadFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className={styles.toolGroup}>
        <button className="btn" disabled={!store.canUndo} onClick={store.undo}>
          Undo
        </button>
        <button className="btn" disabled={!store.canRedo} onClick={store.redo}>
          Redo
        </button>
      </div>

      <button
        className={`${styles.startChip} ${start ? '' : styles.startChipMissing}`}
        onClick={props.onOpenStart}
        title="Where a new game begins. Click to edit the start configuration."
      >
        <span className={styles.treeStartGlyph}>▶</span>
        {start ? (
          <>
            {start.label} <em>{START_KIND_LABEL[start.kind]}</em>
          </>
        ) : (
          'no start set'
        )}
      </button>

      <button
        className="btn"
        onClick={props.onOpenMods}
        title="Mods installed under mods/, and what this module pins."
      >
        Mods{props.modCount > 0 ? ` (${props.modCount})` : ''}
      </button>

      <span className={styles.spacer} />

      <div className={styles.identity}>
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
      </div>
    </header>
  );
}
