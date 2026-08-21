/** Edit a prefab and preview which instances would change. */

'use client';

import { useMemo, useState } from 'react';
import { planFanout, fanoutEdits } from '@dm/module';
import type { Prefab, InstanceMap, StyleTables } from '@dm/module';
import { JsonBox } from '@/components/JsonBox';
import type { ModuleStore } from '@/lib/store';

export function PrefabsView(props: {
  store: ModuleStore;
  prefabs: readonly Prefab[];
  instances: InstanceMap;
  style: StyleTables;
  /** Persist the edited prefab definition through the studio autosave. */
  onSavePrefab: (prefab: Prefab) => void;
  onOpen: (collection: string, index: number) => void;
}) {
  const [selectedId, setSelectedId] = useState(props.prefabs[0]?.id ?? '');
  const [edited, setEdited] = useState<Prefab | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  const original = props.prefabs.find((prefab) => prefab.id === selectedId) ?? null;
  const current = edited ?? original;

  /** Count how many instances follow each prefab. */
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const links of Object.values(props.instances)) {
      for (const link of Object.values(links)) out.set(link.id, (out.get(link.id) ?? 0) + 1);
    }
    return out;
  }, [props.instances]);

  const plan = useMemo(
    () => (current ? planFanout(current, props.store.doc, props.instances, props.style) : null),
    [current, props.store.doc, props.instances, props.style],
  );

  const apply = () => {
    if (!current || !plan || plan.changed.length === 0) return;
    setSaving(true);
    try {
      // Save the prefab definition and the fan-out updates together so they stay in sync.
      props.onSavePrefab(current);
      // Apply the full fan-out in one undo step so unchanged entries keep their object identity.
      props.store.setMany(fanoutEdits(plan));
      setNote(`${plan.changed.length} updated`);
      setEdited(null);
    } finally {
      setSaving(false);
    }
  };

  if (props.prefabs.length === 0) {
    return (
      <div className="prefabs">
        <div className="pane-head">
          <h2 className="pane-title">Prefabs</h2>
        </div>
        <p className="hint">
          This module has none. A prefab lives in <code>project/prefabs/</code> and describes an entry
          once so it can be placed many times — the vocabulary a world is built out of rather than each
          of its five hundred instances.
        </p>
      </div>
    );
  }

  return (
    <div className="prefabs">
      <div className="pane-head">
        <h2 className="pane-title">
          Prefabs
          <code className="pane-path">project/prefabs/</code>
        </h2>
      </div>

      <div className="prefab-list">
        {props.prefabs.map((prefab) => (
          <button
            key={prefab.id}
            className={`btn tiny ${prefab.id === selectedId ? 'primary' : ''}`}
            onClick={() => {
              setSelectedId(prefab.id);
              setEdited(null);
              setNote('');
            }}
          >
            {prefab.label ?? prefab.id}
            <span className="count"> {counts.get(prefab.id) ?? 0}</span>
          </button>
        ))}
      </div>

      {current && (
        <div className="prefab-body">
          <div>
            <div className="group-head">
              <span className="group-label">Definition</span>
              <code className="pane-path">{current.collection}</code>
            </div>
            <JsonBox
              value={current}
              onChange={(next) => setEdited(next as Prefab)}
              rows={22}
            />
          </div>

          <div>
            <div className="group-head">
              <span className="group-label">What applying this would do</span>
            </div>

            {plan?.problems.length ? (
              <p className="json-error">{plan.problems[0]}</p>
            ) : null}

            <p className="hint">
              {plan && plan.changed.length === 0
                ? `Nothing to do — ${plan.unchanged} instance${plan.unchanged === 1 ? '' : 's'} already match.`
                : `${plan?.changed.length ?? 0} of ${(plan?.changed.length ?? 0) + (plan?.unchanged ?? 0)} instances change.`}
            </p>

            <div className="usedby-list">
              {plan?.changed.map((change) => (
                <div key={`${change.collection}:${change.id}`} className="fanout-row">
                  <button className="usedby-item" onClick={() => props.onOpen(change.collection, change.index)}>
                    <span className="usedby-label">{change.id}</span>
                  </button>
                  {change.changes.map((field) => (
                    <div key={field.path} className="fanout-field">
                      <code>{field.path}</code>
                      <span className="fanout-from">{show(field.from)}</span>
                      <span className="fanout-arrow">→</span>
                      <span className="fanout-to">{show(field.to)}</span>
                    </div>
                  ))}
                  {/* Show values the prefab wanted but could not override. */}
                  {change.kept.length > 0 && (
                    <div className="fanout-kept">
                      kept as yours: {change.kept.map((path) => <code key={path}>{path}</code>)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="dialog-actions">
              <button
                className="btn primary"
                disabled={!edited || !plan || plan.changed.length === 0 || saving}
                onClick={() => apply()}
              >
                {saving ? 'Applying…' : `Apply to ${plan?.changed.length ?? 0}`}
              </button>
              {edited && (
                <button className="btn" onClick={() => { setEdited(null); setNote(''); }}>
                  Revert
                </button>
              )}
              {note && <span className="hint">{note}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Truncate long values so lists remain readable in a narrow fan-out view. */
function show(value: unknown): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}
