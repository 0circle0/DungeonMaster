'use client';

/** Switching between the worlds in your library. */

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
