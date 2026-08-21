'use client';

/** Where a session begins. */

import { useRef, useState } from 'react';
import type { LibraryApi } from '@/lib/useLibrary';
import type { ModuleChoice } from '@/lib/modules';

const kb = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

export function Launcher({
  library, onOpen,
}: {
  library: LibraryApi;
  onOpen: (choice: ModuleChoice) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, action: () => Promise<ModuleChoice | null>): Promise<void> => {
    setBusy(label);
    try {
      const choice = await action();
      if (choice) onOpen(choice);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="app launcher">
      <div className="launcher-inner">
        <h1>DungeonMaster</h1>

        {library.ephemeral && (
          <p className="note">
            This browser will not let the page store anything, so a world opened here lasts
            until you close the tab. Everything still plays.
          </p>
        )}
        {library.error && <p className="error-note">{library.error}</p>}

        <section>
          <h2>Your worlds</h2>
          {library.loading && <p className="empty">Looking…</p>}
          {!library.loading && library.worlds.length === 0 && (
            <p className="empty">
              Nothing here yet. Add an example below, or open a world file you already have.
            </p>
          )}
          {library.worlds.map((world) => (
            <div className="world-row" key={world.key}>
              <button
                className="btn primary"
                disabled={busy !== null}
                onClick={() => void run(world.key, () => library.open(world.key))}
              >
                Play
              </button>
              <span className="world-title">{world.title}</span>
              <span className="meta">
                {kb(world.storedBytes)}
                {world.origin === 'imported' ? ' · imported' : ''}
                {world.origin === 'example' ? ' · from an example' : ''}
              </span>
              <button
                className="btn"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm(`Delete “${world.title}”? Its saved games stay until you clear them.`)) {
                    void library.remove(world.key);
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </section>

        {library.available.length > 0 && (
          <section>
            <h2>Examples</h2>
            <p className="empty">
              Downloaded once and then yours: edit it, break it, delete it and add it again.
            </p>
            {library.available.map((entry) => (
              <div className="world-row" key={entry.id}>
                <button
                  className="btn"
                  disabled={busy !== null}
                  onClick={() => void run(entry.id, () => library.addExample(entry.id))}
                >
                  {busy === entry.id ? 'Adding…' : 'Add'}
                </button>
                <span className="world-title">{entry.title}</span>
                <span className="meta">{kb(entry.storedBytes)} download</span>
              </div>
            ))}
          </section>
        )}

        <section>
          <h2>Open a world file</h2>
          <p className="empty">
            A module exported from the studio, or a world someone sent you. It joins your
            library, so it is here next time.
          </p>
          <button className="btn" disabled={busy !== null} onClick={() => file.current?.click()}>
            Choose a file…
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json,.gz"
            hidden
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = '';
              if (picked) void run('file', () => library.importFile(picked));
            }}
          />
        </section>

        {library.usage && library.usage.quota > 0 && (
          <p className="meta">
            Using {kb(library.usage.usage)} of about {kb(library.usage.quota)} available on this device.
          </p>
        )}
      </div>
    </div>
  );
}
