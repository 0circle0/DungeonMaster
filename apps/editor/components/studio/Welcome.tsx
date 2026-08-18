'use client';

/**
 * The shelf, before a world is open.
 *
 * The studio used to open straight into whichever module the server picked,
 * because there was always one on disk to pick. There is no disk now: a fresh
 * browser has an empty library, and the honest first screen says so and offers
 * every way out of it — start something, add an example, or open a file.
 *
 * Nothing is downloaded until asked. An example is a file this deployment
 * happens to be carrying; it may not be carrying any, and that is a normal
 * state rather than an error.
 */

import { useRef, useState } from 'react';
import { blankModule } from '@/lib/templates';
import type { EditorLibraryApi } from '@/lib/useEditorLibrary';
import type { ModuleDoc } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

const kb = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

export function Welcome(props: {
  library: EditorLibraryApi;
  opening: string | null;
  error: string | null;
  onOpen: (key: string) => void;
  onNew: (doc: ModuleDoc, filename: string) => void;
}) {
  const { library } = props;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const guard = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeInner}>
        <h1>DungeonMaster studio</h1>

        {library.ephemeral && (
          <p className={styles.welcomeNote}>
            This browser will not let the page store anything, so work here cannot be kept.
            Export what you make before closing the tab.
          </p>
        )}
        {(props.error ?? library.error) && (
          <p className="json-error">{props.error ?? library.error}</p>
        )}

        <h2>Your worlds</h2>
        {library.loading && <p className={styles.welcomeEmpty}>Looking…</p>}
        {!library.loading && library.worlds.length === 0 && (
          <p className={styles.welcomeEmpty}>
            Nothing yet. Start a new world, add an example to take apart, or open a file.
          </p>
        )}
        {library.worlds.map((world) => (
          <div className={styles.welcomeRow} key={world.key}>
            <button
              className="btn primary"
              disabled={busy || props.opening !== null}
              onClick={() => props.onOpen(world.key)}
            >
              {props.opening === world.key ? 'Opening…' : 'Open'}
            </button>
            <span className={styles.welcomeTitle}>{world.title}</span>
            <span className={styles.welcomeMeta}>
              {kb(world.storedBytes)} · edited {new Date(world.updatedAt).toLocaleDateString()}
            </span>
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete “${world.title}”? This cannot be undone.`)) {
                  void guard(() => library.remove(world.key));
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}

        <h2>Start something</h2>
        <div className={styles.welcomeRow}>
          <button
            className="btn"
            disabled={busy}
            onClick={() => props.onNew(blankModule(), 'untitled.module.json')}
          >
            New world
          </button>
          <span className={styles.welcomeMeta}>
            The smallest document that compiles. The console reads as a to-do list from there.
          </span>
        </div>
        <div className={styles.welcomeRow}>
          <button className="btn" disabled={busy} onClick={() => file.current?.click()}>
            Open a file…
          </button>
          <span className={styles.welcomeMeta}>
            A module exported from here or anywhere else. It joins your library.
          </span>
          <input
            ref={file}
            type="file"
            accept="application/json,.json,.gz"
            hidden
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = '';
              if (picked) {
                void guard(async () => {
                  const meta = await library.importFile(picked);
                  if (meta) props.onOpen(meta.key);
                });
              }
            }}
          />
        </div>

        {library.available.length > 0 && (
          <>
            <h2>Examples</h2>
            <p className={styles.welcomeEmpty}>
              Downloaded once and then yours — edit it in place, or delete it and add it again.
            </p>
            {library.available.map((entry) => (
              <div className={styles.welcomeRow} key={entry.id}>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void guard(async () => {
                    const meta = await library.addExample(entry.id);
                    if (meta) props.onOpen(meta.key);
                  })}
                >
                  Add
                </button>
                <span className={styles.welcomeTitle}>{entry.title}</span>
                <span className={styles.welcomeMeta}>{kb(entry.storedBytes)} download</span>
              </div>
            ))}
          </>
        )}

        {library.usage && library.usage.quota > 0 && (
          <p className={styles.welcomeMeta}>
            Using {kb(library.usage.usage)} of about {kb(library.usage.quota)} on this device.
          </p>
        )}
      </div>
    </div>
  );
}
