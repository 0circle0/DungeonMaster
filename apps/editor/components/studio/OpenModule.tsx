'use client';

/**
 * Switching between the modules in this repository.
 *
 * There was no way to do this. A studio holding four modules could only ever
 * open the one you were last in — the cookie decided, and nothing else could —
 * and the nearest thing to a switcher was inside the "New module" dialog,
 * where "From greenmarch" quietly opened greenmarch itself under its own name.
 * With autosave on, that is not a copy; it is editing.
 *
 * A full navigation rather than a client-side swap, deliberately. A module's
 * prefabs, instances, style tables, contract and recovered draft are all read
 * on the server for one named module, so fetching a different document into
 * the running page would leave every one of them belonging to the last one.
 * Reloading costs a second and is correct by construction.
 */

import { MODULE_COOKIE } from '@/lib/placeCookie';
import styles from '@/app/studio/studio.module.css';

export function OpenModule(props: {
  /** Modules on disk, which are the ones with somewhere to save back to. */
  names: readonly string[];
  current: string;
  /** True when there is unsaved work, so leaving can say so. */
  dirty: boolean;
}) {
  if (props.names.length < 2) return null;

  const open = (name: string) => {
    if (name === props.current) return;
    if (props.dirty && !window.confirm(`${props.current} has unsaved changes. Open ${name} anyway?`)) {
      return;
    }
    document.cookie = `${MODULE_COOKIE}=${encodeURIComponent(name)}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  };

  return (
    <select
      className={`input ${styles.openModule}`}
      value={props.names.includes(props.current) ? props.current : ''}
      title="Open another module from this repository"
      onChange={(e) => open(e.target.value)}
    >
      {!props.names.includes(props.current) && <option value="">{props.current}</option>}
      {props.names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
