/** Renaming an id, with what it will touch shown first. */

'use client';

import { useMemo, useState } from 'react';
import { planRename, applyRename } from '@dm/module';
import type { ModuleStore } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

export function RenamePanel(props: {
  store: ModuleStore;
  collection: string;
  id: string;
  onClose: () => void;
  /** Called with the new id once the rename lands, so the caller can re-select. */
  onRenamed: (id: string) => void;
}) {
  const { store, collection, id } = props;
  const [next, setNext] = useState(id);

  // Planning walks the document, so it waits for a complete id.
  const plan = useMemo(
    () => (next === id ? null : planRename(store.doc, collection, id, next)),
    [store.doc, collection, id, next],
  );

  const blocked = plan?.problems ?? [];
  const canApply = plan !== null && blocked.length === 0;

  const exact = plan?.mentions.filter((m) => m.how === 'exact') ?? [];
  const embedded = plan?.mentions.filter((m) => m.how === 'embedded') ?? [];

  const apply = () => {
    if (!canApply || !plan) return;
    store.replace(applyRename(store.doc, plan) as typeof store.doc);
    props.onRenamed(next);
    props.onClose();
  };

  return (
    <div className={styles.renamePanel}>
      <div className={styles.renameHead}>
        Rename <code>{id}</code>
      </div>

      <input
        className={`input ${blocked.length > 0 ? 'invalid' : ''}`}
        value={next}
        autoFocus
        spellCheck={false}
        onChange={(e) => setNext(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
          if (e.key === 'Escape') props.onClose();
        }}
      />

      {blocked.map((problem) => (
        <p key={problem} className={styles.renameProblem}>
          {problem}
        </p>
      ))}

      {canApply && plan && (
        <>
          <p className={styles.renameCount}>
            {/* The entry's own id is one of the edits, hence the subtraction. */}
            {plan.edits.length - 1} reference{plan.edits.length - 1 === 1 ? '' : 's'} will be
            rewritten.
          </p>

          {(exact.length > 0 || embedded.length > 0) && (
            <div className={styles.renameWarn}>
              <strong>
                {exact.length + embedded.length === 1
                  ? 'One other place says '
                  : `${exact.length + embedded.length} other places say `}
                <code>{id}</code>
              </strong>
              <p>
                The format does not call these references — a quest objective&apos;s target is a
                plain id, and flags are free strings — so they are left as they are. Anything
                below that meant this entry needs changing by hand.
              </p>
              <ul>
                {[...exact, ...embedded].slice(0, 8).map((mention) => (
                  <li key={mention.path}>
                    <code>{mention.path.replace(/#key$/, '')}</code>
                    {mention.how === 'embedded' && (
                      <span className={styles.renameInline}> {mention.value}</span>
                    )}
                  </li>
                ))}
              </ul>
              {exact.length + embedded.length > 8 && (
                <p>…and {exact.length + embedded.length - 8} more.</p>
              )}
            </div>
          )}
        </>
      )}

      <div className={styles.renameActions}>
        <button className="btn tiny primary" disabled={!canApply} onClick={apply}>
          Rename
        </button>
        <button className="btn tiny" onClick={props.onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
