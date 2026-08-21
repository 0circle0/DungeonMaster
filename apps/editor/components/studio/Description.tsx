'use client';

/**
 * Edit a place's arrival description and handle shared versus local text bundles.
 */

import { useState } from 'react';
import { getAt } from '@/lib/store';
import type { ModuleStore, Path } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

interface Variant {
  text?: unknown;
  [key: string]: unknown;
}

interface Pool {
  id?: unknown;
  variants?: unknown;
  [key: string]: unknown;
}

/** Default bundle id for a place that owns its own arrival text. */
export function ownPoolId(entryId: string): string {
  return `${entryId}_desc`;
}

export function Description(props: {
  store: ModuleStore;
  collection: string;
  index: number;
  entry: Record<string, unknown>;
}) {
  const { store, entry } = props;
  const [drafting, setDrafting] = useState('');

  const id = String(entry['id'] ?? '');
  const key = typeof entry['descriptionKey'] === 'string' ? entry['descriptionKey'] : '';
  const pools = (getAt(store.doc, ['narrative', 'textGrammar']) ?? []) as Pool[];
  const poolIndex = pools.findIndex((pool) => String(pool['id']) === key);
  const pool = poolIndex >= 0 ? pools[poolIndex] : undefined;

  const keyPath: Path = [...props.collection.split('.'), props.index, 'descriptionKey'];
  const own = ownPoolId(id);

  /** Create the text bundle and link it to this place in one edit. */
  const write = (text: string) => {
    if (!text.trim() || !id) return;
    const existing = pools.findIndex((entry_) => String(entry_['id']) === own);
    const at = existing >= 0 ? existing : pools.length;
    store.setMany([
      {
        path: ['narrative', 'textGrammar', at],
        value: { id: own, description: '', variants: [{ text: text.trim() }] },
      },
      { path: keyPath, value: own },
    ]);
    setDrafting('');
  };

  // --- no bundle yet -------------------------------------------------------

  if (!key) {
    return (
      <div className={styles.describe}>
        <div className={styles.prefabHead}>Description</div>
        <p className={styles.prefabNote}>
          Nothing is said when the party arrives here. Write it and a bundle called{' '}
          <code>{own}</code> is made and linked.
        </p>
        <textarea
          className="input"
          rows={3}
          value={drafting}
          placeholder="What they see when they get here."
          onChange={(e) => setDrafting(e.target.value)}
        />
        <button className="btn tiny primary" disabled={!drafting.trim()} onClick={() => write(drafting)}>
          Write it
        </button>
      </div>
    );
  }

  // --- a bundle that belongs to something else -----------------------------

  if (key !== own) {
    const sharers = countUsers(store.doc, key);
    return (
      <div className={styles.describe}>
        <div className={styles.prefabHead}>
          Description
          <code>{key}</code>
        </div>
        <p className={styles.prefabNote}>
          {pool
            ? `Shared with ${sharers - 1} other ${sharers - 1 === 1 ? 'place' : 'places'}. Editing it here would change all of them, so it is left to its own table.`
            : `Points at ${key}, which does not exist.`}
        </p>
        {pool && (
          <ul className={styles.variantList}>
            {asVariants(pool).map((variant, i) => (
              <li key={i} className={styles.variantShared}>
                {String(variant['text'] ?? '')}
              </li>
            ))}
          </ul>
        )}
        <button
          className="btn tiny"
          title={`Copy it to ${own} and point this place at that instead`}
          onClick={() => {
            const copied = asVariants(pool ?? {}).map((variant) => ({ ...variant }));
            store.setMany([
              {
                path: ['narrative', 'textGrammar', pools.length],
                value: { id: own, description: '', variants: copied.length > 0 ? copied : [{ text: '' }] },
              },
              { path: keyPath, value: own },
            ]);
          }}
        >
          Give it words of its own
        </button>
      </div>
    );
  }

  // --- its own bundle, named but never written -----------------------------

  // A prefab template can name `{{id}}_desc` before the bundle exists; allow the author to create it here.
  if (!pool) {
    return (
      <div className={styles.describe}>
        <div className={styles.prefabHead}>
          Description
          <code>{key}</code>
        </div>
        <p className={styles.prefabNote}>
          This place expects a bundle called <code>{key}</code> and there is not one yet, so the
          reference dangles. Write it and it will be made.
        </p>
        <textarea
          className="input"
          rows={3}
          value={drafting}
          placeholder="What they see when they get here."
          onChange={(e) => setDrafting(e.target.value)}
        />
        <button className="btn tiny primary" disabled={!drafting.trim()} onClick={() => write(drafting)}>
          Write it
        </button>
      </div>
    );
  }

  // --- its own bundle ------------------------------------------------------

  const variants = asVariants(pool);
  const variantPath = (i: number): Path => ['narrative', 'textGrammar', poolIndex, 'variants', i];

  return (
    <div className={styles.describe}>
      <div className={styles.prefabHead}>
        Description
        <code>{key}</code>
      </div>
      <ul className={styles.variantList}>
        {variants.map((variant, i) => (
          <li key={i}>
            <textarea
              className="input"
              rows={2}
              value={String(variant['text'] ?? '')}
              onChange={(e) => store.set([...variantPath(i), 'text'], e.target.value)}
            />
            {variants.length > 1 && (
              <button
                className="btn tiny"
                title="Remove this variant"
                onClick={() => store.remove(variantPath(i))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        className="btn tiny"
        title="Another way of saying it, picked at random on arrival"
        onClick={() => store.set(variantPath(variants.length), { text: '' })}
      >
        Another way of saying it
      </button>
    </div>
  );
}

function asVariants(pool: Pool): Variant[] {
  return Array.isArray(pool['variants']) ? (pool['variants'] as Variant[]) : [];
}

/** Count how many entries reference a text bundle across the whole document. */
function countUsers(doc: unknown, key: string): number {
  let count = 0;
  const walk = (node: unknown, depth: number): void => {
    if (depth > 12 || typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
      if (name === 'descriptionKey' && value === key) count += 1;
      else walk(value, depth + 1);
    }
  };
  walk(doc, 0);
  return count;
}
