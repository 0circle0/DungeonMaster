'use client';

/**
 * "New module": a blank scaffold, or somebody else's rules to start from.
 *
 * The second option is the one that did not exist. `blankModule()` gives one
 * attribute, one resource and one class, and the only way to a real ruleset was
 * a Python script in the repository — so an author working in a browser typed
 * six attributes, ten damage types and five classes by hand or gave up.
 *
 * Every section is on by default, because "the full ruleset" is what somebody
 * asking for a beginner's starting point means. Each one can be turned off, and
 * turning one off takes whatever refers to it, since the alternative is a
 * document that fails to compile for reasons expressed nowhere on this screen.
 */

import { useMemo, useState } from 'react';
import type { ModuleDoc } from '@/lib/store';
import { blankModule } from '@/lib/templates';
import {
  RULESET_SECTIONS, DEFAULT_SECTIONS, composeModule, withPrerequisites, dependents,
} from '@/lib/ruleset';
import { readWorld } from '@dm/library';
import type { EditorLibraryApi } from '@/lib/useEditorLibrary';
import styles from '@/app/studio/studio.module.css';

type Source = { kind: 'example'; id: string } | { kind: 'world'; key: string };

export function NewModuleDialog(props: {
  library: EditorLibraryApi;
  dirty: boolean;
  onExportFirst: () => void;
  onCreate: (doc: ModuleDoc, filename: string) => void;
  onClose: () => void;
}) {
  const { library } = props;

  /**
   * Where the rules come from.
   *
   * The catalog first — a deployment usually carries one ruleset for exactly
   * this — then any world already in the library, because build.py's trick of
   * lifting a ruleset out of a finished world works just as well from here.
   */
  const sources: readonly { value: string; label: string; source: Source }[] = useMemo(() => [
    ...library.catalog.modules.map((entry) => ({
      value: `example:${entry.id}`,
      label: entry.title,
      source: { kind: 'example' as const, id: entry.id },
    })),
    ...library.worlds.map((world) => ({
      value: `world:${world.key}`,
      label: `${world.title} (yours)`,
      source: { kind: 'world' as const, key: world.key },
    })),
  ], [library.catalog, library.worlds]);

  const [sourceValue, setSourceValue] = useState(sources[0]?.value ?? '');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(DEFAULT_SECTIONS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((current) => {
      if (!current.has(id)) return withPrerequisites([...current, id]);
      // Dropping a section drops what refers to it. Leaving them behind would
      // produce dangling references the author never chose.
      const falling = new Set([id, ...dependents(id, current)]);
      return new Set([...current].filter((held) => !falling.has(held)));
    });
  };

  const create = async () => {
    const chosen = sources.find((candidate) => candidate.value === sourceValue);
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const doc = chosen.source.kind === 'example'
        ? await library.exampleDoc(chosen.source.id)
        : await readWorld(chosen.source.key).then((found) => found?.envelope.doc ?? null);
      if (!doc) { setError('That world could not be read.'); return; }
      props.onCreate(composeModule(doc, selected), 'untitled.module.json');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.dialogBackdrop} onClick={props.onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3>New module</h3>
        {props.dirty && (
          <p>
            The current module has <strong>unsaved changes</strong>.{' '}
            <button className="btn tiny" onClick={props.onExportFirst}>Export current first</button>
          </p>
        )}

        <div className={styles.dialogOptions}>
          <button
            className={styles.dialogOption}
            disabled={busy}
            onClick={() => props.onCreate(blankModule(), 'untitled.module.json')}
          >
            Blank module
            <em>
              The smallest valid document — one attribute, one resource, one class. The console
              shows what to do next: add a world and pick a start.
            </em>
          </button>
        </div>

        {sources.length > 0 && (
          <>
            <h4 style={{ margin: '18px 0 6px' }}>Start from a ruleset</h4>
            <p className="hint" style={{ marginTop: 0 }}>
              Copies the rules out of another world and leaves its content behind — no places, no
              people, no quests. Everything is taken unless you say otherwise.
            </p>

            <select
              className="input"
              value={sourceValue}
              disabled={busy}
              onChange={(event) => setSourceValue(event.target.value)}
              style={{ width: '100%', marginBottom: 10 }}
            >
              {sources.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>{candidate.label}</option>
              ))}
            </select>

            <div className={styles.sectionList}>
              {RULESET_SECTIONS.map((section) => {
                const on = selected.has(section.id);
                return (
                  <label key={section.id} className={styles.sectionRow}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy}
                      onChange={() => toggle(section.id)}
                    />
                    <span>
                      <strong>{section.label}</strong>
                      {section.required && on && (
                        <span className={styles.sectionFlag}> · falls back to the blank one</span>
                      )}
                      <em className={styles.sectionDetail}>{section.detail}</em>
                    </span>
                  </label>
                );
              })}
            </div>

            <p className="hint">
              The 54 engine phrasings other messages are built from are always included — a
              document does not load without them.
            </p>

            {error && <p className="json-error">{error}</p>}

            <div className={styles.dialogActions}>
              <button className="btn" onClick={props.onClose} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={() => void create()} disabled={busy || !sourceValue}>
                {busy ? 'Building…' : 'Create'}
              </button>
            </div>
          </>
        )}

        {sources.length === 0 && (
          <div className={styles.dialogActions}>
            <button className="btn" onClick={props.onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
