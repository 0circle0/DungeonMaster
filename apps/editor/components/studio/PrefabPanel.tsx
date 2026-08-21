/** What a prefab put here, and what you changed afterwards. */

'use client';

import type { ExpandIssue, Prefab } from '@dm/module';
import type { OverrideInfo } from '@/components/Field';
import { getAt } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

export function PrefabPanel(props: {
  entry: Record<string, unknown>;
  prefab: Prefab;
  overrides: OverrideInfo;
  issues: readonly ExpandIssue[];
  onResetAll: () => void;
}) {
  const { entry, prefab, overrides, issues } = props;
  const paths = [...overrides.paths].sort();

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

      {paths.length === 0 ? (
        <p className={styles.prefabNote}>
          Every field is the prefab&rsquo;s. Editing <code>{prefab.id}</code> updates this entry with
          the rest.
        </p>
      ) : (
        <>
          <p className={styles.prefabNote}>
            {paths.length} field{paths.length === 1 ? '' : 's'} changed here — marked in the form
            above. {paths.length === 1 ? 'It stays' : 'They stay'} as{' '}
            {paths.length === 1 ? 'it is' : 'they are'} when the prefab changes.
          </p>
          <ul className={styles.prefabOverrides}>
            {paths.map((path) => (
              <li key={path}>
                <code>{path}</code>
                <span className={styles.prefabValue}>{preview(getAt(entry, path.split('.')))}</span>
                <button
                  className="btn tiny"
                  title="Take the prefab's value"
                  onClick={() => overrides.reset(path)}
                >
                  Reset
                </button>
              </li>
            ))}
          </ul>
          <button className="btn tiny" onClick={props.onResetAll}>
            Reset all {paths.length}
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
