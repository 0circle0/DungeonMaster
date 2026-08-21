/** Four strings, and an entry. */

'use client';

import { useMemo, useState } from 'react';
import { expandPrefab, checkParams, withDefaults } from '@dm/module';
import type { Prefab, PrefabParam, PrefabLink, StyleTables } from '@dm/module';
import { Field } from '@/components/Field';
import { JsonBox } from '@/components/JsonBox';
import type { FieldSpec } from '@/lib/schema';
import type { ModuleStore } from '@/lib/store';
import { getAt } from '@/lib/store';
import styles from '@/app/studio/studio.module.css';

/** A prefab's parameter, in the terms the generated form already speaks. */
function specFor(param: PrefabParam): FieldSpec {
  switch (param.kind) {
    case 'number':
      return { kind: 'number', int: false, min: null, max: null };
    case 'boolean':
      return { kind: 'boolean' };
    case 'enum':
      return { kind: 'enum', options: param.options ?? [] };
    case 'ref':
      return { kind: 'string', ref: param.target ?? null, refHelp: param.help ?? null, long: false, pattern: null };
    case 'text':
      return { kind: 'string', ref: null, refHelp: null, long: true, pattern: null };
    default:
      return { kind: 'string', ref: null, refHelp: null, long: false, pattern: null };
  }
}

export function PlaceFromPrefab(props: {
  store: ModuleStore;
  prefabs: readonly Prefab[];
  style: StyleTables;
  /** Record where this entry came from. */
  onLinkInstance: (collection: string, entryId: string, link: PrefabLink) => void;
  collection: string;
  onClose: () => void;
  onPlaced: (index: number) => void;
}) {
  const offered = useMemo(
    () => props.prefabs.filter((prefab) => prefab.collection === props.collection),
    [props.prefabs, props.collection],
  );
  const [chosen, setChosen] = useState<Prefab | null>(offered[0] ?? null);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const filled = useMemo(() => (chosen ? withDefaults(chosen, params) : {}), [chosen, params]);
  const problems = useMemo(() => (chosen ? checkParams(chosen, params) : []), [chosen, params]);
  const preview = useMemo(
    () => (chosen ? expandPrefab(chosen, params, props.style).entry : {}),
    [chosen, params, props.style],
  );

  const existing = getAt(props.store.doc, props.collection.split('.'));
  const taken = Array.isArray(existing)
    ? new Set((existing as Record<string, unknown>[]).map((e) => String(e['id'] ?? '')))
    : new Set<string>();
  const duplicate = typeof filled['id'] === 'string' && taken.has(filled['id']);

  const place = () => {
    if (!chosen || problems.length > 0 || duplicate) return;
    setBusy(true);

    const list = Array.isArray(existing) ? (existing as unknown[]) : [];
    const index = list.length;
    const entryId = String(filled['id']);

    // The entry, and any prose bundle it names that does not exist yet.
    const edits: { path: (string | number)[]; value: unknown }[] = [
      { path: [...props.collection.split('.'), index], value: preview },
    ];
    const named = typeof preview['descriptionKey'] === 'string' ? preview['descriptionKey'] : '';
    const pools = (getAt(props.store.doc, ['narrative', 'textGrammar']) ?? []) as { id?: unknown }[];
    if (named && !pools.some((pool) => String(pool['id']) === named)) {
      const words = typeof filled['description'] === 'string' ? filled['description'].trim() : '';
      edits.push({
        path: ['narrative', 'textGrammar', pools.length],
        value: {
          id: named,
          description: '',
          variants: [{ text: words || `${String(filled['name'] ?? named)}.` }],
        },
      });
    }
    // One edit, so placing a thing is one press of undo.
    props.store.setMany(edits);
    try {
      props.onLinkInstance(props.collection, entryId, {
        id: chosen.id,
        params: filled,
        overrides: [],
      });
    } finally {
      setBusy(false);
      props.onPlaced(index);
      props.onClose();
    }
  };

  return (
    <div className={styles.dialogBackdrop} onClick={props.onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3>Place from a prefab</h3>

        {offered.length === 0 ? (
          <p className="hint">
            No prefab in this project makes a <code>{props.collection}</code>.
          </p>
        ) : (
          <>
            <div className={styles.prefabPicker}>
              {offered.map((prefab) => (
                <button
                  key={prefab.id}
                  className={`btn tiny ${chosen?.id === prefab.id ? 'primary' : ''}`}
                  onClick={() => {
                    setChosen(prefab);
                    setParams({});
                  }}
                >
                  {prefab.label ?? prefab.id}
                </button>
              ))}
            </div>

            {chosen?.description && <p className="hint">{chosen.description}</p>}

            <div className={styles.placeBody}>
              <div className={styles.placeForm}>
                {chosen?.params.map((param) => (
                  <Field
                    key={param.key}
                    spec={specFor(param)}
                    value={filled[param.key]}
                    path={[param.key]}
                    label={param.label ?? param.key}
                    description={param.help ?? null}
                    optional={!param.required}
                    idsByCollection={props.store.idsByCollection}
                    onChange={(path, value) =>
                      setParams((current) => ({ ...current, [String(path[0])]: value }))
                    }
                    onRemove={(path) =>
                      setParams((current) => {
                        const next = { ...current };
                        delete next[String(path[0])];
                        return next;
                      })
                    }
                  />
                ))}
              </div>

              <div className={styles.placePreview}>
                <div className="group-head">
                  <span className="group-label">What this makes</span>
                  <span className="count">{Object.keys(preview).length} fields</span>
                </div>
                <JsonBox value={preview} onChange={() => undefined} rows={14} />
              </div>
            </div>

            {duplicate && (
              <p className="json-error">
                {String(filled['id'])} is already in {props.collection}.
              </p>
            )}
            {problems.map((problem) => (
              <p key={problem.path} className="json-error">
                {problem.message}
              </p>
            ))}
          </>
        )}

        <div className={styles.dialogActions}>
          <button
            className="btn primary"
            disabled={!chosen || problems.length > 0 || duplicate || busy}
            onClick={() => void place()}
          >
            {busy ? 'Placing…' : 'Place it'}
          </button>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
