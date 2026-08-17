'use client';

/**
 * The takeover panels: journal, sheet, inventory, saves, help.
 *
 * Each is a pure rendering of an engine or `@dm/play` view model. The overlay
 * chrome is shared; the content of each is small enough that one file beats
 * six.
 */

import { useMemo, useRef } from 'react';
import { journalByArc, loreByThread, looseLore, narrateFrom } from '@dm/engine';
import { sheetView, inventoryView, shopView, VERB_SPECS } from '@dm/play';
import type { SessionApi } from '../lib/useSession.js';
import { useSaves } from '../lib/useSaves.js';

export function Overlay({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overlay-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="overlay">
        <header>
          {title}
          <button className="btn" onClick={onClose}>Close</button>
        </header>
        <div className="body">{children}</div>
      </div>
    </div>
  );
}

const STATUS_PILL: Record<string, string> = {
  active: 'active', available: 'available', complete: 'done', failed: 'failed',
};

/**
 * The quest log, grouped by the acts the module declares.
 *
 * `journalByArc` had existed and been called by nothing, so a story written in
 * three acts showed the player one flat list of jobs. Quests belonging to no arc
 * come last under no heading, which is exactly what a module with no arcs sees.
 */
export function Quests({ session }: { session: SessionApi }) {
  const { module, frame } = session;
  const groups = useMemo(() => journalByArc(module, frame.state), [module, frame.state]);

  if (groups.length === 0) return <p className="empty">No quests yet. Talk to somebody.</p>;

  return (
    <>
      {groups.map((group) => (
        <section key={group.arc?.id ?? 'loose'}>
          {group.arc && (
            <h3 className="arc">
              {group.arc.name}
              <span className="count"> {group.arc.done}/{group.arc.total}</span>
            </h3>
          )}
          {group.entries.map((entry) => (
            <div className="quest-card" key={entry.quest}>
              <h4>
                {entry.name}
                <span className={`pill ${entry.status === 'complete' ? 'done' : entry.status}`}>
                  {STATUS_PILL[entry.status]}
                </span>
              </h4>
              {entry.description && <p className="desc">{entry.description}</p>}
              {entry.status === 'active' && (
                <>
                  {entry.stageCount > 1 && (
                    <div className="stage">
                      Stage {entry.stageNumber}/{entry.stageCount}
                      {entry.stageName ? ` — ${entry.stageName}` : ''}
                    </div>
                  )}
                  {entry.objectives.map((objective) => (
                    <div key={objective.id} className={`objective ${objective.done ? 'done' : ''}`}>
                      {objective.done ? '✓' : '▸'} {objective.description}
                      {!objective.done && objective.count > 1 && (
                        <span className="count"> {objective.progress}/{objective.count}</span>
                      )}
                    </div>
                  ))}
                  {entry.journalKey && (
                    <p className="prose">
                      “{narrateFrom(module, entry.journalKey, frame.seed, {
                        sceneKey: `stage:${entry.quest}:${entry.stageNumber}`,
                      })}”
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

/**
 * What the party has worked out, as opposed to what it was told to do.
 *
 * A thread nothing is known about still gets its heading — the heading is the
 * only thing you have, and hiding it would hide that there is anything to find.
 * Unknown clues render as a rule rather than as text, because `loreByThread`
 * does not hand out words for a clue that has not been earned.
 */
export function Lore({ session }: { session: SessionApi }) {
  const { module, frame } = session;
  const threads = useMemo(() => loreByThread(module, frame.state), [module, frame.state]);
  const loose = useMemo(() => looseLore(module, frame.state), [module, frame.state]);

  if (threads.length === 0 && loose.length === 0) {
    return <p className="empty">Nothing yet. People talk, if you let them.</p>;
  }

  const said = (entry: (typeof loose)[number]): string =>
    entry.textKey
      ? narrateFrom(module, entry.textKey, frame.seed, { sceneKey: `lore:${entry.id}` })
      : entry.name;

  return (
    <>
      {threads.map((thread) => (
        <div className="quest-card" key={thread.id}>
          <h4>
            {thread.name}
            <span className="count"> {thread.known}/{thread.total}</span>
          </h4>
          {thread.description && thread.known > 0 && <p className="desc">{thread.description}</p>}
          {thread.entries.map((entry) => (
            entry.known ? (
              <div className="clue" key={entry.id}>
                ▸ {said(entry)}
                {entry.source && <span className="source"> — {entry.source}</span>}
              </div>
            ) : (
              <div className="clue unknown" key={entry.id}>▸ ———</div>
            )
          ))}
        </div>
      ))}
      {loose.length > 0 && (
        <section>
          <h3 className="arc">Odds and ends</h3>
          {loose.map((entry) => (
            <div className="clue" key={entry.id}>
              ▸ {said(entry)}
              {entry.source && <span className="source"> — {entry.source}</span>}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export function Sheet({ session }: { session: SessionApi }) {
  const { module, frame } = session;
  const view = useMemo(() => sheetView(module, frame.state), [module, frame.state]);
  if (!view) return null;

  return (
    <>
      <p><b>{view.name}</b> — level {view.level}, {view.xp} xp</p>
      <div className="sheet-grid">
        {view.attributes.map((attribute) => (
          <div className="stat" key={attribute.id}>
            <b>{attribute.abbrev}</b>
            <span>{attribute.score} ({attribute.modifier >= 0 ? '+' : ''}{attribute.modifier})</span>
          </div>
        ))}
      </div>
      <div className="sheet-grid">
        {view.derived.map((stat) => (
          <div className="stat" key={stat.id}><b>{stat.name}</b><span>{stat.value}</span></div>
        ))}
      </div>
      {view.abilities.length > 0 && (
        <p><b>Abilities</b> — {view.abilities.map((ability) => ability.name).join(', ')}</p>
      )}
      {view.skills.length > 0 && (
        <p><b>Skills</b> — {view.skills.map((skill) => `${skill.name} ${skill.rank}`).join(', ')}</p>
      )}
    </>
  );
}

export function Inventory({ session }: { session: SessionApi }) {
  const { module, frame, dispatchAction } = session;
  const carried = useMemo(() => inventoryView(module, frame.state), [module, frame.state]);

  if (carried.length === 0) return <p className="empty">Carrying nothing.</p>;

  return (
    <>
      {carried.map((item) => (
        <div className="inv-row" key={item.item}>
          <span className="name" title={item.description || undefined}>{item.name}</span>
          {item.quantity > 1 && <span className="qty">×{item.quantity}</span>}
          {item.equipped && <span className="slot">{item.slot}</span>}
          {item.usable && (
            <button className="btn" onClick={() => dispatchAction({ type: 'useItem', item: item.item })}>
              Use
            </button>
          )}
          {item.equippable && !item.equipped && (
            <button className="btn" onClick={() => dispatchAction({ type: 'equip', item: item.item })}>
              Equip
            </button>
          )}
          {item.equipped && (
            <button className="btn" onClick={() => dispatchAction({ type: 'unequip', item: item.item })}>
              Unequip
            </button>
          )}
          <button className="btn" onClick={() => dispatchAction({ type: 'drop', item: item.item })}>
            Drop
          </button>
        </div>
      ))}
    </>
  );
}

export function SaveMenu({ session, onClose }: { session: SessionApi; onClose: () => void }) {
  const { module, restore, note, serialize } = session;
  const saves = useSaves(module, serialize);
  const file = useRef<HTMLInputElement>(null);

  const load = (text: string) => {
    const error = restore(text);
    if (error === null) { onClose(); return; }
    // The engine refuses drifted saves by default; offer the override.
    if (window.confirm(`${error}\n\nLoad anyway?`)) {
      const forced = restore(text, true);
      if (forced === null) { onClose(); return; }
      note(forced, 'refusal');
    }
  };

  return (
    <>
      <div className="save-slot">
        <button
          className="btn primary"
          onClick={() => { saves.store(`slot-${Date.now()}`); }}
        >
          Save now
        </button>
        <button className="btn" onClick={() => saves.download()}>Download</button>
        <button className="btn" onClick={() => file.current?.click()}>Upload…</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) {
              void chosen.text().then(load);
            }
            event.target.value = '';
          }}
        />
      </div>
      {saves.slots.length === 0 && <p className="empty">No saved games for this module yet.</p>}
      {saves.slots.map((slot) => (
        <div className="save-slot" key={slot.slot}>
          <span className="when">{new Date(slot.savedAt).toLocaleString()}</span>
          <button className="btn" onClick={() => load(slot.text)}>Load</button>
          <button className="btn" onClick={() => saves.remove(slot.slot)}>Delete</button>
        </div>
      ))}
    </>
  );
}

export function Help() {
  const groups = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const spec of VERB_SPECS) {
      const bucket = spec.meta ? 'Panels & session' : 'In the world';
      const rows = out.get(bucket) ?? [];
      rows.push(`${spec.spellings[0]} — ${spec.summary}`);
      out.set(bucket, rows);
    }
    return [...out];
  }, []);

  return (
    <>
      <p className="hint">
        Mostly, just click: a tile to walk there, a creature to attack it, a
        person to talk. The buttons under the map are what you can do right now.
        The command line still works, and suggests as you type.
      </p>
      {groups.map(([bucket, rows]) => (
        <div key={bucket}>
          <h4>{bucket}</h4>
          {rows.map((row) => <p key={row} className="hint">{row}</p>)}
        </div>
      ))}
    </>
  );
}

/**
 * A shopkeeper's counter.
 *
 * The same `shopView` the terminal paints, with buttons instead of prices in
 * dim text. A barred shop shows the reason rather than an empty shelf, for the
 * same reason a barred door names its key.
 */
export function Shop({ session, npc }: { session: SessionApi; npc: string }) {
  const { module, frame, dispatchAction } = session;
  const view = useMemo(() => shopView(module, frame.state, npc), [module, frame.state, npc]);

  if (!view) return <p className="empty">Nobody here is trading.</p>;

  const coin = (n: number) => `${n}${view.currency.abbrev}`;

  if (view.barred) {
    return (
      <>
        <p className="empty">{view.name} will not deal with you.</p>
        {view.requires.length > 0 && <p className="empty">Needs {view.requires.join(', ')}.</p>}
        <p className="empty">Purse: {coin(view.purse)}</p>
      </>
    );
  }

  return (
    <>
      <h3>For sale</h3>
      {view.stock.length === 0 && <p className="empty">Nothing today.</p>}
      {view.stock.map((entry) => (
        <div className="inv-row" key={`buy:${entry.item}`}>
          <span className="name">{entry.name}</span>
          {entry.quantity > 1 && <span className="qty">×{entry.quantity}</span>}
          <span className="slot">{coin(entry.price)}</span>
          <button
            className="btn"
            disabled={entry.price > view.purse}
            onClick={() => dispatchAction({ type: 'buy', npc: view.npc, item: entry.item })}
          >
            Buy
          </button>
        </div>
      ))}

      <h3>They will buy</h3>
      {view.sellable.length === 0 && <p className="empty">Nothing you are carrying.</p>}
      {view.sellable.map((entry) => (
        <div className="inv-row" key={`sell:${entry.item}`}>
          <span className="name">{entry.name}</span>
          {entry.quantity > 1 && <span className="qty">×{entry.quantity}</span>}
          <span className="slot">{coin(entry.price)}</span>
          <button
            className="btn"
            onClick={() => dispatchAction({ type: 'sell', npc: view.npc, item: entry.item })}
          >
            Sell
          </button>
        </div>
      ))}

      <p className="empty">Purse: {coin(view.purse)}</p>
    </>
  );
}
