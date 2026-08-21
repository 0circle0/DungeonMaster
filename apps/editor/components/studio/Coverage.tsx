/** Which of a type's fields the engine ignores — see lib/inertFields.ts. */

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
