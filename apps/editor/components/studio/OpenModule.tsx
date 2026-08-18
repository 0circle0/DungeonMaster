'use client';

/**
 * Switching between the worlds in your library.
 *
 * This used to be a full page navigation: a module's prefabs, style tables,
 * contract and recovered draft were all read on the server for one named
 * module, so swapping the document in the running page would have left every
 * one of them belonging to the last one. Reloading was correct by construction.
 *
 * None of that is true now. A world is one envelope — document, sidecar and
 * draft together — so switching is a single read, and the state that has to be
 * replaced is replaced by remounting the shell on the world's key. A reload
 * would only throw away the page for no gain.
 */

import type { WorldMeta } from '@dm/library';
import styles from '@/app/studio/studio.module.css';

export function OpenModule(props: {
  worlds: readonly WorldMeta[];
  current: string;
  /** True when there is unsaved work, so leaving can say so. */
  dirty: boolean;
  onOpen: (key: string) => void;
}) {
  if (props.worlds.length < 2) return null;

  const open = (key: string) => {
    if (key === props.current) return;
    const from = props.worlds.find((world) => world.key === props.current);
    const to = props.worlds.find((world) => world.key === key);
    if (props.dirty && !window.confirm(
      `${from?.title ?? 'This world'} has unsaved changes. Open ${to?.title ?? 'the other one'} anyway?`,
    )) {
      return;
    }
    props.onOpen(key);
  };

  return (
    <select
      className={`input ${styles.openModule}`}
      value={props.current}
      title="Open another world from your library"
      onChange={(e) => open(e.target.value)}
    >
      {props.worlds.map((world) => (
        <option key={world.key} value={world.key}>
          {world.title}
        </option>
      ))}
    </select>
  );
}
