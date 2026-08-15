/**
 * The start configuration, un-buried.
 *
 * In the generated form every `start` field is optional, so a plain render
 * would collapse all nine behind one "Optional (9)" toggle and the pane
 * would look empty. Here each top-level field renders directly, headed by a
 * plain statement of where play begins — or a red card when it begins
 * nowhere, which is the one authoring mistake that only surfaces at
 * `newGame` time.
 */

import { getAt } from '@/lib/store';
import type { ModuleStore } from '@/lib/store';
import { SINGLETONS, labelFor } from '@/lib/schema';
import { fieldLabel } from '@/lib/labels';
import { Field } from '@/components/Field';
import { resolveStart, startOf } from '@/lib/worldModel';
import styles from '@/app/studio/studio.module.css';

const START_KIND_TEXT = {
  poi: 'point of interest',
  area: 'area',
  dungeon: 'dungeon',
} as const;

export function StartInspector(props: { store: ModuleStore; onPreview: () => void }) {
  const { store } = props;
  const spec = SINGLETONS.find((s) => s.path === 'start')?.spec;
  if (!spec || spec.kind !== 'object') return null;

  const start = resolveStart(store.doc);
  const config = startOf(store.doc);
  const redundantArea =
    start?.kind === 'poi' && typeof config['startingArea'] === 'string' && config['startingArea'] !== '';

  return (
    <div>
      <div className={`${styles.startCard} ${start ? '' : styles.startCardMissing}`}>
        {start ? (
          <>
            <p>
              Play begins at <strong>{start.label}</strong> ({START_KIND_TEXT[start.kind]}
              {start.kind === 'poi' && start.areaId ? ` in ${start.areaId}` : ''}).
            </p>
            <p className={styles.startHint}>
              Precedence when several are set: starting POI, then area, then dungeon.
              {redundantArea && ' The starting area is redundant here — the POI already names its area.'}
            </p>
            <p>
              <button className="btn tiny" onClick={props.onPreview}>
                Preview first map →
              </button>
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>No start location.</strong> A new game throws immediately without one.
            </p>
            <p className={styles.startHint}>
              Set a starting POI (or area, or dungeon) below — or hover a row in the World tree and press
              “▶ start here”.
            </p>
          </>
        )}
      </div>

      {spec.fields.map((field) => (
        <Field
          key={field.key}
          spec={field.spec}
          value={getAt(store.doc, ['start', field.key]) ?? field.defaultValue}
          path={['start', field.key]}
          label={fieldLabel(labelFor(field.key))}
          description={field.description}
          optional={field.optional}
          idsByCollection={store.idsByCollection}
          onChange={store.set}
          onRemove={store.remove}
          depth={1}
          expandOptional
        />
      ))}
    </div>
  );
}
