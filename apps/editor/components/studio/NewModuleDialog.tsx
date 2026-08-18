/**
 * "New module": blank scaffold or a bundled module as a starting point. When
 * the current document has unsaved edits the dialog says so and offers to
 * export first — silently discarding on load is exactly the kind of workflow
 * trap the studio exists to remove.
 */

import { useState } from 'react';
import type { ModuleDoc } from '@/lib/store';
import { blankModule } from '@/lib/templates';
import styles from '@/app/studio/studio.module.css';

export function NewModuleDialog(props: {
  templates: readonly string[];
  dirty: boolean;
  onExportFirst: () => void;
  onCreate: (doc: ModuleDoc, filename: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const fromTemplate = (name: string) => {
    void fetch(`/api/modules/${name}`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? response.statusText);
        return response.json() as Promise<ModuleDoc>;
      })
      // A *copy*, under no name, so it cannot be mistaken for opening the
      // original — with autosave on, "From greenmarch" writing back to
      // greenmarch is editing it, not starting from it. Opening is the
      // switcher in the toolbar.
      .then((doc) => props.onCreate(doc, 'untitled.module.json'))
      .catch((err: Error) => setError(`Could not load template: ${err.message}`));
  };

  return (
    <div className={styles.dialogBackdrop} onClick={props.onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3>New module</h3>
        {props.dirty && (
          <p>
            The current module has <strong>unsaved changes</strong> — creating a new one discards them.{' '}
            <button className="btn tiny" onClick={props.onExportFirst}>
              Export current first
            </button>
          </p>
        )}
        <div className={styles.dialogOptions}>
          <button
            className={styles.dialogOption}
            onClick={() => props.onCreate(blankModule(), 'untitled.module.json')}
          >
            Blank module
            <em>
              The smallest valid module — one attribute, one resource, one class. The console shows what to
              do next: add a world and pick a start.
            </em>
          </button>
          {props.templates.map((name) => (
            <button key={name} className={styles.dialogOption} onClick={() => fromTemplate(name)}>
              From “{name}”
              <em>
                A copy of the bundled {name} module, unnamed — export it, or save it once it has a
                home. To edit {name} itself, open it from the toolbar.
              </em>
            </button>
          ))}
        </div>
        {error && <p className="json-error">{error}</p>}
        <div className={styles.dialogActions}>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
