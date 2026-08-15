/**
 * Which of a type's fields the engine ignores — see lib/inertFields.ts.
 *
 * Shown wherever those fields can be edited, so a field that looks authorable
 * and does nothing says so next to itself rather than in a changelog.
 */

import { coverageNotesFor } from '@/lib/inertFields';
import styles from '@/app/studio/studio.module.css';

export function Coverage(props: { path: string }) {
  const notes = coverageNotesFor(props.path);
  if (notes.length === 0) return null;
  return (
    <div className={styles.coverage}>
      <div className={styles.coverageHead}>Engine coverage</div>
      {notes.map((note) => (
        <p className={styles.coverageItem} key={note.field}>
          {note.field === '*' ? <em>whole collection</em> : <code>{note.field}</code>} — {note.note}
        </p>
      ))}
    </div>
  );
}
