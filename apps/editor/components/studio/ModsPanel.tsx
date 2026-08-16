'use client';

/**
 * The Mods panel.
 *
 * Three jobs: say what is installed, let editor mods be switched off, and run
 * whatever those mods offer — their commands and their own panels.
 *
 * The widget renderer below is the honest boundary of this design. Mod code
 * runs inside QuickJS, which has no DOM: it returns a *description* of a UI and
 * this draws it with the studio's own components. That covers text, tables,
 * buttons, and fields. It does not cover a canvas, a map overlay, a graph, or
 * anything that needs per-keystroke feedback — a mod wanting those needs a core
 * editor change, not a mod.
 */

import { useState } from 'react';
import type { ModWidget } from '@dm/mods';

import type { EditorModsApi } from '@/lib/useEditorMods';
import type { ModuleDoc } from '@/lib/store';
import styles from '../../app/studio/studio.module.css';

export function ModsPanel({
  mods,
  doc,
  onPatch,
  declared,
}: {
  mods: EditorModsApi;
  doc: ModuleDoc;
  onPatch: (patches: readonly { op: 'set' | 'delete'; path: readonly (string | number)[]; value?: unknown }[]) => void;
  /** What the open module pins, so a missing engine mod is visible while authoring. */
  declared: readonly { id: string; hash: string; target: string; required: boolean }[];
}) {
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const runtime = mods.runtime;
  const commands = runtime ? runtime.commands(doc) : [];

  const installedIds = new Set(mods.installed.map((mod) => mod.manifest.id));

  return (
    <div className={styles.modsBody}>
      <h3>Installed</h3>
      {mods.installed.length === 0 && (
        <p className={styles.modsHint}>
          Nothing in <code>mods/</code>. Engine mods go in <code>mods/engine/</code>, studio mods in{' '}
          <code>mods/editor/</code>, each in a folder named <code>&lt;id&gt;-&lt;hash&gt;</code>.
        </p>
      )}

      <ul className={styles.modsList}>
        {mods.installed.map((mod) => {
          const editable = mod.manifest.target === 'editor';
          const on = !mods.disabled.has(mod.manifest.id);
          const drifted = mod.issues.some((issue) => issue.code === 'mod_hash_drift');
          return (
            <li key={`${mod.manifest.id}-${mod.hash}`}>
              <label>
                <input
                  type="checkbox"
                  checked={editable ? on : true}
                  // Engine mods are listed here but belong to the play app;
                  // toggling one in the studio would promise something this
                  // app cannot deliver.
                  disabled={!editable}
                  onChange={(event) => mods.setEnabled(mod.manifest.id, event.target.checked)}
                />{' '}
                <strong>{mod.manifest.meta.title}</strong>{' '}
                <span className={styles.modsHint}>
                  {mod.manifest.target} · <code>{mod.hash.slice(0, 8)}</code>
                  {drifted && ' · hash drifted'}
                </span>
              </label>
              {mod.manifest.meta.description && (
                <div className={styles.modsHint}>{mod.manifest.meta.description}</div>
              )}
              {editable && runtime && (
                <button
                  className={styles.modsBtn}
                  onClick={() => setOpenPanel(openPanel === mod.manifest.id ? null : mod.manifest.id)}
                >
                  {openPanel === mod.manifest.id ? 'Hide panel' : 'Open panel'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {declared.length > 0 && (
        <>
          <h3>This module requires</h3>
          <ul className={styles.modsList}>
            {declared.map((entry) => (
              <li key={entry.id}>
                <code>
                  {entry.id}-{entry.hash.slice(0, 8)}
                </code>{' '}
                <span className={styles.modsHint}>
                  {entry.target}
                  {entry.required ? ' · required' : ' · optional'}
                  {installedIds.has(entry.id) ? '' : ' · NOT INSTALLED'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {commands.length > 0 && (
        <>
          <h3>Actions</h3>
          <ul className={styles.modsList}>
            {commands.map((command) => (
              <li key={`${command.modId}:${command.id}`}>
                <button
                  className={styles.modsBtn}
                  onClick={() => {
                    // Patches go through the store, so a mod's bulk edit lands
                    // in the existing undo stack like any other change.
                    onPatch(runtime!.runCommand(doc, command.modId, command.id));
                  }}
                >
                  {command.label}
                </button>{' '}
                <span className={styles.modsHint}>{command.modId}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {openPanel && runtime && (
        <div>
          <h3>{openPanel}</h3>
          <Widget
            node={runtime.panel(doc, openPanel)}
            onEvent={(widgetId) => onPatch(runtime.runCommand(doc, openPanel, widgetId))}
          />
        </div>
      )}
    </div>
  );
}

/** Draws a mod's widget description with the studio's own markup. */
function Widget({ node, onEvent }: { node: ModWidget | null; onEvent: (widgetId: string) => void }) {
  if (!node) return null;

  switch (node.kind) {
    case 'text':
      return <p className={node.tone === 'note' || !node.tone ? styles.modsHint : styles.modsWarn}>{node.text}</p>;

    case 'button':
      return (
        <button className={styles.modsBtn} onClick={() => onEvent(node.id)}>
          {node.label}
        </button>
      );

    case 'table':
      return (
        <table className={styles.modsTable}>
          <thead>
            <tr>
              {node.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'rows':
      return (
        <>
          {node.children.map((child, i) => (
            <Widget key={i} node={child} onEvent={onEvent} />
          ))}
        </>
      );

    case 'field':
      // Fields are drawn where the thing they describe is being edited — the
      // inspector — not here. Showing one in a panel would leave it with
      // nothing to write to.
      return <p className={styles.modsHint}>{node.field.label}</p>;

    default:
      return null;
  }
}
