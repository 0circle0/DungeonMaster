'use client';

/**
 * The play shell.
 *
 * One client component owns everything: which module is compiled, the session
 * hook, which overlay is open. View routing is a discriminated union in state,
 * not Next routes — the editor's pattern, and the right one for an app that is
 * a single continuous scene.
 */

import { useMemo, useRef, useState } from 'react';
import type { CharacterChoices } from '@dm/engine';
import { placeNameOf } from '@dm/engine';
import type { CompiledModule } from '@dm/module';
import type { MetaCommand } from '@dm/play';
import { traderNearby } from '@dm/play';
import type { ModuleChoice } from '@/lib/modules';
import { compileDoc } from '@/lib/modules';
import { useSession } from '@/lib/useSession';
import type { SessionApi } from '@/lib/useSession';
import { MapView } from '@/components/MapView';
import { ContextBar } from '@/components/ContextBar';
import { StatusBar } from '@/components/StatusBar';
import { InitiativeStrip } from '@/components/InitiativeStrip';
import { Sidebar } from '@/components/Sidebar';
import { Transcript } from '@/components/Transcript';
import { Dialogue } from '@/components/Dialogue';
import { CommandBar } from '@/components/CommandBar';
import { Overlay, Journal, Sheet, Inventory, Shop, SaveMenu, Help } from '@/components/Overlays';
import { Creation } from '@/components/Creation';

type Panel = 'journal' | 'sheet' | 'inventory' | 'shop' | 'saves' | 'help' | 'creation' | null;

export function Play({ shipped }: { shipped: readonly ModuleChoice[] }) {
  const [chosen, setChosen] = useState<ModuleChoice | null>(shipped[0] ?? null);
  const [dropped, setDropped] = useState<ModuleChoice | null>(null);

  const active = dropped ?? chosen;
  const compiled = useMemo(() => (active ? compileDoc(active.doc) : null), [active]);

  if (!active || !compiled) {
    return <div className="app"><p className="error-note">No modules found in modules/.</p></div>;
  }
  if (!compiled.ok) {
    return (
      <div className="app">
        <p className="error-note">{active.title} does not compile: {compiled.error}</p>
      </div>
    );
  }

  return (
    <Game
      key={active.id}
      module={compiled.module}
      shipped={shipped}
      activeId={active.id}
      onChoose={(choice) => { setDropped(null); setChosen(choice); }}
      onDrop={setDropped}
    />
  );
}

function Game({
  module, shipped, activeId, onChoose, onDrop,
}: {
  module: CompiledModule;
  shipped: readonly ModuleChoice[];
  activeId: string;
  onChoose: (choice: ModuleChoice) => void;
  onDrop: (choice: ModuleChoice) => void;
}) {
  const session: SessionApi = useSession(module, 12345);
  // Who the party could trade with, so the panel and its button agree.
  const trader = traderNearby({ module: session.module, state: session.frame.state });
  const [panel, setPanel] = useState<Panel>(null);
  const file = useRef<HTMLInputElement>(null);

  const { frame } = session;
  const over = frame.state.outcome !== 'playing';

  const onMeta = (command: MetaCommand) => {
    switch (command.kind) {
      case 'journal': setPanel('journal'); break;
      case 'sheet': setPanel('sheet'); break;
      case 'inventory': setPanel('inventory'); break;
      case 'shop': setPanel('shop'); break;
      case 'save': case 'load': setPanel('saves'); break;
      case 'help': setPanel('help'); break;
      case 'quit': setPanel('saves'); break;
      case 'map': case 'exits':
        // Both are always on screen here; say so rather than doing nothing.
        session.note('The map and the ways out are already on screen — right side.');
        break;
      case 'scroll':
        session.note('The log scrolls — mouse wheel or trackpad.');
        break;
    }
  };

  const newGame = (roster?: CharacterChoices[]) => {
    session.restart(Math.floor(Math.random() * 0x7fffffff) + 1, roster);
    setPanel(null);
  };

  return (
    <div className="app">
      <div className="topbar">
        <span className="title">DungeonMaster</span>
        <select
          value={activeId}
          onChange={(event) => {
            const next = shipped.find((choice) => choice.id === event.target.value);
            if (next) onChoose(next);
          }}
          style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px' }}
        >
          {shipped.map((choice) => (
            <option key={choice.id} value={choice.id}>{choice.title}</option>
          ))}
          {!shipped.some((choice) => choice.id === activeId) && (
            <option value={activeId}>{activeId} (opened)</option>
          )}
        </select>
        <button className="btn" onClick={() => file.current?.click()}>Open…</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) {
              void picked.text().then((text) => {
                try {
                  const doc = JSON.parse(text) as Record<string, unknown>;
                  const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
                  onDrop({
                    id: String(doc['id'] ?? picked.name),
                    title: String(meta['title'] ?? picked.name),
                    description: '',
                    doc,
                  });
                } catch (error) {
                  window.alert(`Could not parse ${picked.name}: ${(error as Error).message}`);
                }
              });
            }
            event.target.value = '';
          }}
        />
        <span className="spacer" />
        <span className="meta">seed {frame.seed}</span>
        <button className="btn" onClick={() => setPanel('creation')}>New game…</button>
        <button className="btn" onClick={() => newGame()}>Reroll</button>
        <button className="btn" onClick={() => setPanel('journal')}>Journal</button>
        <button className="btn" onClick={() => setPanel('sheet')}>Sheet</button>
        <button className="btn" onClick={() => setPanel('inventory')}>Inventory</button>
        <button className="btn" onClick={() => setPanel('saves')}>Saves</button>
        <button className="btn" onClick={() => setPanel('help')}>?</button>
      </div>

      <div className="play-body">
        <div className="map-pane">
          <MapHeader session={session} />
          <InitiativeStrip session={session} />
          <MapView session={session} />
          {over && (
            <div className={`game-over ${frame.state.outcome}`}>
              {frame.state.outcome === 'victory' ? 'You have won.' : 'Your party is dead.'}
              {' '}
              <button className="btn" onClick={() => newGame()}>Play again</button>
            </div>
          )}
          {!over && <ContextBar session={session} />}
        </div>

        <Sidebar session={session} />

        <div className="log-pane">
          <Transcript lines={frame.transcript} />
          <Dialogue session={session} />
          {!over && <CommandBar session={session} onMeta={onMeta} />}
        </div>
      </div>

      <StatusBar session={session} />

      {panel === 'journal' && (
        <Overlay title="Journal" onClose={() => setPanel(null)}><Journal session={session} /></Overlay>
      )}
      {panel === 'sheet' && (
        <Overlay title="Character" onClose={() => setPanel(null)}><Sheet session={session} /></Overlay>
      )}
      {panel === 'inventory' && (
        <Overlay title="Carried" onClose={() => setPanel(null)}><Inventory session={session} /></Overlay>
      )}
      {panel === 'shop' && trader && (
        <Overlay title="Trade" onClose={() => setPanel(null)}>
          <Shop session={session} npc={trader} />
        </Overlay>
      )}
      {panel === 'saves' && (
        <Overlay title="Saved games" onClose={() => setPanel(null)}>
          <SaveMenu session={session} onClose={() => setPanel(null)} />
        </Overlay>
      )}
      {panel === 'help' && (
        <Overlay title="How to play" onClose={() => setPanel(null)}><Help /></Overlay>
      )}
      {panel === 'creation' && (
        <Overlay title="New game" onClose={() => setPanel(null)}>
          <Creation
            module={module}
            onDone={(roster) => newGame(roster)}
            onCancel={() => newGame()}
          />
        </Overlay>
      )}
    </div>
  );
}

function MapHeader({ session }: { session: SessionApi }) {
  const { module, frame } = session;
  const actor = frame.state.entities[frame.state.selected];

  return (
    <div className="map-header">
      <span className="place">{placeNameOf(module, frame.state)}</span>
      {actor && <span className="coords">({actor.position.x},{actor.position.y})</span>}
      <span className="zoom">
        {[12, 16, 20].map((size) => (
          <button
            key={size}
            className="btn"
            onClick={() => document.documentElement.style.setProperty('--cell', `${size}px`)}
          >
            {size === 12 ? 'S' : size === 16 ? 'M' : 'L'}
          </button>
        ))}
      </span>
    </div>
  );
}
