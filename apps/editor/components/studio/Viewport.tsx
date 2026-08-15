/**
 * The centre of the studio. A tab strip of the big-picture views — the map
 * always first, the analysis views after it — with whatever table a dock
 * click opened slotted in between. The analysis views are standalone
 * components (`components/*View.tsx`) mounted unchanged.
 */

import { collectionAt } from '@/lib/schema';
import { getAt } from '@/lib/store';
import type { ModuleDoc, ModuleStore } from '@/lib/store';
import { EventsView } from '@/components/EventsView';
import { BalanceView } from '@/components/BalanceView';
import { DialogueGraph } from '@/components/DialogueGraph';
import { TimelineView } from '@/components/TimelineView';
import { PerceptionView } from '@/components/PerceptionView';
import { JsonBox } from '@/components/JsonBox';
import { CollectionTable } from './CollectionTable';
import { MapViewport } from './MapViewport';
import { MapPainter } from './MapPainter';
import type { MapTarget, Selection, ViewId, ViewportKind } from '@/app/studio/selection';
import { VIEW_LABELS } from '@/app/studio/selection';
import styles from '@/app/studio/studio.module.css';

const VIEW_TABS: readonly ViewId[] = ['balance', 'dialogue', 'timeline', 'perception', 'events', 'rawjson'];

export function Viewport(props: {
  kind: ViewportKind;
  mapTarget: MapTarget;
  tablePath: string | null;
  store: ModuleStore;
  selection: Selection;
  onShowMap: () => void;
  onShowTable: () => void;
  onShowView: (id: ViewId) => void;
  onSelectItem: (path: string, index: number) => void;
  onAddEntry: (path: string) => void;
}) {
  const { store, kind } = props;
  const doc = store.doc;
  const tableInfo = props.tablePath ? collectionAt(props.tablePath) : undefined;
  const flush = kind === 'map' || kind === 'rawjson';

  return (
    <main className={styles.viewport}>
      <div className={styles.viewportTabs}>
        <button
          className={`${styles.viewportTab} ${kind === 'map' ? styles.viewportTabActive : ''}`}
          onClick={props.onShowMap}
        >
          Map
        </button>
        {tableInfo && (
          <button
            className={`${styles.viewportTab} ${kind === 'table' ? styles.viewportTabActive : ''}`}
            onClick={props.onShowTable}
          >
            {tableInfo.label}
          </button>
        )}
        {VIEW_TABS.map((id) => (
          <button
            key={id}
            className={`${styles.viewportTab} ${kind === id ? styles.viewportTabActive : ''}`}
            onClick={() => props.onShowView(id)}
          >
            {VIEW_LABELS[id]}
          </button>
        ))}
      </div>

      <div className={`${styles.viewportBody} ${flush ? styles.viewportBodyFlush : ''}`}>
        {kind === 'map' &&
          (props.mapTarget.type === 'map' ? (
            <MapPainter store={store} mapId={props.mapTarget.id} />
          ) : (
            <MapViewport store={store} target={props.mapTarget} />
          ))}

        {kind === 'table' && props.tablePath && (
          <CollectionTable
            path={props.tablePath}
            entries={entriesAt(doc, props.tablePath)}
            errors={store.validation.errors}
            selection={props.selection}
            onSelect={(index) => props.onSelectItem(props.tablePath!, index)}
            onAdd={() => props.onAddEntry(props.tablePath!)}
          />
        )}

        {kind === 'balance' && <BalanceView doc={doc} />}
        {kind === 'dialogue' && <DialogueGraph doc={doc} />}
        {kind === 'timeline' && <TimelineView doc={doc} />}
        {kind === 'perception' && <PerceptionView doc={doc} />}
        {kind === 'events' && <EventsView doc={doc} onOpen={props.onSelectItem} />}

        {kind === 'rawjson' && (
          <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1 }}>
            <p className="hint">
              The whole document. Edits apply once the JSON parses, and the exported file is exactly what you
              write here — no schema defaults are injected.
            </p>
            <JsonBox fill value={doc} onChange={(next) => store.replace(next as ModuleDoc)} />
          </div>
        )}
      </div>
    </main>
  );
}

function entriesAt(doc: ModuleDoc, path: string): Record<string, unknown>[] {
  const value = getAt(doc, path.split('.'));
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}
