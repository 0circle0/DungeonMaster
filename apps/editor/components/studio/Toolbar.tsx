import { useRef } from 'react';
import type { ModuleStore } from '@/lib/store';
import { exportModule } from '@/lib/store';
import { resolveStart } from '@/lib/worldModel';
import type { WorldMeta } from '@dm/library';
import { OpenModule } from './OpenModule';
import styles from '@/app/studio/studio.module.css';

const START_KIND_LABEL = { poi: 'POI', area: 'area', dungeon: 'dungeon' } as const;

/**
 * What autosave last did.
 *
 * There is no `draft` any more. A world is its project files, so a document with
 * errors in it is stored as itself rather than set aside — there is no last-valid
 * copy underneath to be truthful about.
 */
const AUTOSAVE_LABEL: Record<string, string> = {
  idle: 'Saved',
  pending: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};

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
  onOpenRules: () => void;
  /** How many findings the enabled rules have, or null before they first run. */
  ruleFindings: number | null;
  /** How many mods are installed, so the button can say. */
  modCount: number;
  /** Write back to `modules/<name>/`. Absent for a document loaded from a file. */
  onSave: () => void;
  canSave: boolean;
  moduleName: string;
  worldKey: string;
  worlds: readonly WorldMeta[];
  onOpenWorld: (key: string) => void;
  /** Every module in this repository, for the switcher. */
  saveState: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  saveNote: string;
}) {
  const { store } = props;
  const { validation } = store;
  const fileInput = useRef<HTMLInputElement>(null);
  const start = resolveStart(store.doc);

  return (
    <header className={styles.toolbar}>
      <span className={styles.brand}>DungeonMaster</span>
      <span className={styles.brandSub}>studio</span>

      <OpenModule
        worlds={props.worlds}
        current={props.worldKey}
        dirty={store.dirty}
        onOpen={props.onOpenWorld}
      />
      {!props.canSave && <span className={styles.filename}>{store.filename}</span>}
      {store.dirty && <span className={styles.dirty}>●</span>}

      <div className={styles.toolGroup}>
        <button className="btn" onClick={props.onNew}>
          New…
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()}>
          Load…
        </button>
        {/* Not a Save button. The studio writes as you type; this only says
            what it last did, and gives ⌘S somewhere to point. */}
        <button
          className="btn"
          disabled={!props.canSave}
          title={
            props.canSave
              ? 'Autosaving to your library on this device — ⌘S writes now'
              : 'Autosave writes back to a module in this repository; this document did not come from one'
          }
          onClick={props.onSave}
        >
          {AUTOSAVE_LABEL[props.saveState]}
        </button>
        <button
          className="btn"
          onClick={() => {
            exportModule(store.doc, store.filename);
          }}
        >
          Compile
        </button>
        {props.saveNote && (
          <span
            className={styles.saveNote}
            data-state={props.saveState}
            title={props.saveNote}
          >
            {props.saveNote}
          </span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json,.gz"
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

      {/* Separate from the problems console on purpose: the console says what
          is wrong, this says what the studio thinks "wrong" means. */}
      <button
        className="btn"
        onClick={props.onOpenRules}
        title="Contracts the schema cannot check — what each one is for, and a switch."
      >
        Rules{props.ruleFindings ? ` (${props.ruleFindings})` : ''}
      </button>

      <span className={styles.spacer} />

      <div className={styles.identity}>
        {validation.ok ? (
          <>
            <span className="ok-dot" /> {validation.identity}
            {/* Hashing serializes the whole document, so it waits for a pause
                in typing. Showing the previous hash dimmed says "this is one
                edit behind" rather than quietly asserting it is current. */}
            <code
              className="hash"
              style={validation.settling ? { opacity: 0.45 } : undefined}
              title={validation.settling ? 'Recomputing…' : 'Content hash'}
            >
              {validation.hash.slice(0, 8)}
            </code>
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
