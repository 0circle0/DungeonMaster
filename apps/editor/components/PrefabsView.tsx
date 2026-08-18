/**
 * Editing a prefab, and seeing what that does to the things placed from it.
 *
 * "Editing `inn` updates thirty-six inns" is the feature and the hazard in one
 * sentence. The planner behind this has been tested since it was written; what
 * was missing was anywhere for an author to stand while they used it. So: the
 * definition on the left, and on the right the answer to the only question that
 * matters before pressing anything — which instances move, and what moves in
 * them.
 *
 * The plan is against the *edited* prefab and the document as it stands, so it
 * updates as the template is typed. Nothing is written until Apply.
 */

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
  moduleName: string;
  onOpen: (collection: string, index: number) => void;
}) {
  const [selectedId, setSelectedId] = useState(props.prefabs[0]?.id ?? '');
  const [edited, setEdited] = useState<Prefab | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  const original = props.prefabs.find((prefab) => prefab.id === selectedId) ?? null;
  const current = edited ?? original;

  /** How many entries follow each prefab, so the list says what is at stake. */
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

  const apply = async () => {
    if (!current || !plan || plan.changed.length === 0) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/modules/${props.moduleName}/prefabs/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setNote(body.error ?? 'could not write the prefab');
        return;
      }
      // One undo step for the whole fan-out, and every entry the plan did not
      // name comes back as the same object.
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
                  {/* What the prefab wanted and did not get. Without this an
                      override reads as the edit doing less than was asked. */}
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
                onClick={() => void apply()}
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

/** Enough of a value to recognise, never enough to fill the column. */
function show(value: unknown): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}
