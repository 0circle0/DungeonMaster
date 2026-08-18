/**
 * What a prefab put here, and what you changed afterwards.
 *
 * The point of a linked instance is that editing `inn` updates thirty-six
 * inns; the point of an override is that the one you tuned stays tuned. Both
 * are useless if an author cannot see which fields are which — an entry that
 * silently stops following its prefab, or silently starts, is worse than one
 * that was never linked.
 *
 * So overridden fields are named here and can be handed back individually. The
 * comparison is live rather than stored: what counts as an override is
 * whatever differs from what the prefab would produce *now*, which is the only
 * definition that stays true when the prefab changes.
 */

'use client';

import { useMemo } from 'react';
import { expandPrefab, overriddenPaths } from '@dm/module';
import type { Prefab, PrefabLink, StyleTables } from '@dm/module';
import { getAt } from '@/lib/store';
import type { ModuleStore, Path } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

export function PrefabPanel(props: {
  store: ModuleStore;
  basePath: Path;
  entry: Record<string, unknown>;
  prefab: Prefab;
  link: PrefabLink;
  style: StyleTables;
}) {
  const { store, basePath, entry, prefab, link, style } = props;

  const { overrides, issues } = useMemo(() => {
    const paths = overriddenPaths(prefab, entry, link, style);
    return { overrides: paths, issues: expandPrefab(prefab, link.params, style).issues };
  }, [prefab, entry, link, style]);

  /** Hand one field back to the prefab. */
  const reset = (path: string) => {
    const { entry: fresh } = expandPrefab(prefab, link.params, style);
    const segments = path.split('.');
    const value = segments.reduce<unknown>(
      (node, key) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[key] : undefined),
      fresh,
    );
    if (value === undefined) store.remove([...basePath, ...segments]);
    else store.set([...basePath, ...segments], value);
  };

  const resetAll = () => {
    const { entry: fresh } = expandPrefab(prefab, link.params, style);
    store.set(basePath, fresh);
  };

  return (
    <div className={styles.prefabPanel}>
      <div className={styles.prefabHead}>
        From prefab
        <code>{prefab.label ?? prefab.id}</code>
      </div>

      {issues.length > 0 && (
        <p className={styles.prefabProblem}>
          {issues[0]?.message}
          {issues.length > 1 ? ` (and ${issues.length - 1} more)` : ''}
        </p>
      )}

      {overrides.length === 0 ? (
        <p className={styles.prefabNote}>
          Every field is the prefab&rsquo;s. Editing <code>{prefab.id}</code> updates this entry with
          the rest.
        </p>
      ) : (
        <>
          <p className={styles.prefabNote}>
            {overrides.length} field{overrides.length === 1 ? '' : 's'} changed here.{' '}
            {overrides.length === 1 ? 'It stays' : 'They stay'} as {overrides.length === 1 ? 'it is' : 'they are'}{' '}
            when the prefab changes.
          </p>
          <ul className={styles.prefabOverrides}>
            {overrides.map((path) => (
              <li key={path}>
                <code>{path}</code>
                <span className={styles.prefabValue}>{preview(getAt(entry, path.split('.')))}</span>
                <button className="btn tiny" title="Take the prefab's value" onClick={() => reset(path)}>
                  Reset
                </button>
              </li>
            ))}
          </ul>
          <button className="btn tiny" onClick={resetAll}>
            Reset all {overrides.length}
          </button>
        </>
      )}
    </div>
  );
}

/** Enough of a value to recognise it, and never enough to fill the panel. */
function preview(value: unknown): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}
