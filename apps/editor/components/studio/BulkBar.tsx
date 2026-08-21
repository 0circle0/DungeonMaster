/** What to do with the rows that are checked. */

'use client';

import { useState } from 'react';
import { planSetField, planTag, planReplace } from '@/lib/bulk';
import type { BulkPlan } from '@/lib/bulk';
import type { ModuleStore } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

type Mode = 'tag' | 'set' | 'replace' | 'delete';

export function BulkBar(props: {
  store: ModuleStore;
  collection: string;
  entries: readonly Record<string, unknown>[];
  selected: readonly number[];
  onDone: () => void;
}) {
  const { store, collection, entries, selected } = props;
  const [mode, setMode] = useState<Mode>('tag');
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const plan: BulkPlan | null =
    mode === 'tag'
      ? planTag(entries, collection, selected, a, 'add')
      : mode === 'set'
        ? planSetField(entries, collection, selected, a, coerce(b))
        : mode === 'replace'
          ? planReplace(entries, collection, selected, a, b, '')
          : null;

  const apply = (made: BulkPlan) => {
    if (made.edits.length === 0) return;
    store.setMany(made.edits);
    props.onDone();
  };

  const removeSelected = () => {
    store.removeMany(selected.map((index) => [...collection.split('.'), index]));
    props.onDone();
  };

  return (
    <div className={styles.bulkBar}>
      <span className={styles.bulkCount}>
        {selected.length} selected
      </span>

      <div className={styles.bulkModes}>
        {(['tag', 'set', 'replace', 'delete'] as const).map((option) => (
          <button
            key={option}
            className={`btn tiny ${mode === option ? 'primary' : ''}`}
            onClick={() => {
              setMode(option);
              setA('');
              setB('');
            }}
          >
            {option === 'tag' ? 'Tag' : option === 'set' ? 'Set field' : option === 'replace' ? 'Replace' : 'Delete'}
          </button>
        ))}
      </div>

      {mode === 'tag' && (
        <>
          <input
            className="input narrow"
            placeholder="tag"
            value={a}
            spellCheck={false}
            onChange={(e) => setA(e.target.value)}
          />
          <button
            className="btn tiny"
            disabled={planTag(entries, collection, selected, a, 'add').changed === 0}
            onClick={() => apply(planTag(entries, collection, selected, a, 'add'))}
          >
            Add to {planTag(entries, collection, selected, a, 'add').changed}
          </button>
          <button
            className="btn tiny"
            disabled={planTag(entries, collection, selected, a, 'remove').changed === 0}
            onClick={() => apply(planTag(entries, collection, selected, a, 'remove'))}
          >
            Remove from {planTag(entries, collection, selected, a, 'remove').changed}
          </button>
        </>
      )}

      {mode === 'set' && (
        <>
          <input
            className="input narrow"
            placeholder="field"
            value={a}
            spellCheck={false}
            onChange={(e) => setA(e.target.value)}
          />
          <input
            className="input narrow"
            placeholder="value"
            value={b}
            spellCheck={false}
            onChange={(e) => setB(e.target.value)}
          />
          <button className="btn tiny" disabled={!plan || plan.changed === 0} onClick={() => plan && apply(plan)}>
            Set {plan?.changed ?? 0}
          </button>
        </>
      )}

      {mode === 'replace' && (
        <>
          <input
            className="input narrow"
            placeholder="field"
            value={a}
            spellCheck={false}
            onChange={(e) => setA(e.target.value)}
          />
          <input
            className="input narrow"
            placeholder="find"
            value={b}
            spellCheck={false}
            onChange={(e) => setB(e.target.value)}
          />
          <ReplaceAction
            entries={entries}
            collection={collection}
            selected={selected}
            field={a}
            find={b}
            onApply={apply}
          />
        </>
      )}

      {mode === 'delete' && (
        <>
          <span className={styles.bulkWarn}>
            Deleting does not update anything pointing at these — check &ldquo;Used by&rdquo; first.
          </span>
          <button className="btn tiny danger" onClick={removeSelected}>
            Delete {selected.length}
          </button>
        </>
      )}

      <button className={`btn tiny ${styles.bulkClear}`} onClick={props.onDone}>
        Clear
      </button>
    </div>
  );
}

/** Replace needs its own "with" box, and the count depends on all three. */
function ReplaceAction(props: {
  entries: readonly Record<string, unknown>[];
  collection: string;
  selected: readonly number[];
  field: string;
  find: string;
  onApply: (plan: BulkPlan) => void;
}) {
  const [to, setTo] = useState('');
  const plan = planReplace(props.entries, props.collection, props.selected, props.field, props.find, to);
  return (
    <>
      <input
        className="input narrow"
        placeholder="with"
        value={to}
        spellCheck={false}
        onChange={(e) => setTo(e.target.value)}
      />
      <button className="btn tiny" disabled={plan.changed === 0} onClick={() => props.onApply(plan)}>
        Replace in {plan.changed}
      </button>
    </>
  );
}

/** `"3"` typed into a value box means the number three. */
function coerce(text: string): unknown {
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text.trim() !== '' && !Number.isNaN(Number(text))) return Number(text);
  return text;
}
