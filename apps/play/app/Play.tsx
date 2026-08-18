'use client';

/**
 * The play shell.
 *
 * One client component owns everything: which world is compiled, the session
 * hook, which overlay is open. View routing is a discriminated union in state,
 * not Next routes — the editor's pattern, and the right one for an app that is
 * a single continuous scene.
 *
 * Nothing here talks to a server. Worlds come out of the library on this
 * machine; the examples a deployment carries are static files, fetched once
 * when somebody asks for one.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { CharacterChoices } from '@dm/engine';
import { placeNameOf } from '@dm/engine';
import type { CompiledModule } from '@dm/module';
import type { MetaCommand } from '@dm/play';
import { traderNearby } from '@dm/play';
import type { ModuleChoice } from '@/lib/modules';
import { compileDoc } from '@/lib/modules';
import { useLibrary } from '@/lib/useLibrary';
import type { LibraryApi } from '@/lib/useLibrary';
import type { ModWire, ModSetup } from '@/lib/mods';
import { useMods } from '@/lib/useMods';
import type { ModsApi } from '@/lib/useMods';
import { ModsPanel, ModBanner } from '@/components/Mods';
import { useSession } from '@/lib/useSession';
import type { SessionApi } from '@/lib/useSession';
import { Launcher } from '@/components/Launcher';
import { MapView } from '@/components/MapView';
import { ContextBar } from '@/components/ContextBar';
import { StatusBar } from '@/components/StatusBar';
import { InitiativeStrip } from '@/components/InitiativeStrip';
import { Sidebar } from '@/components/Sidebar';
import { Transcript } from '@/components/Transcript';
import { Dialogue } from '@/components/Dialogue';
import { CommandBar } from '@/components/CommandBar';
import { Overlay, Quests, Lore, Sheet, Inventory, Shop, SaveMenu, Help } from '@/components/Overlays';
import { Creation } from '@/components/Creation';

type Panel = 'journal' | 'lore' | 'sheet' | 'inventory' | 'shop' | 'saves' | 'help' | 'creation' | 'mods' | null;

/**
 * Mods, which nothing currently installs.
 *
 * The engine-side machinery is intact and the shipped examples declare no mods,
 * so this is the unmodded engine by construction. Distributing mods to a static
 * deployment has no story yet: they are a local-development feature until it
 * does.
 */
const NO_MODS: readonly ModWire[] = [];

export function Play() {
  const library = useLibrary();
  const [active, setActive] = useState<ModuleChoice | null>(null);

  const compiled = useMemo(() => (active ? compileDoc(active.doc) : null), [active]);
  const leave = useCallback(() => setActive(null), []);

  if (!active || !compiled) {
    return <Launcher library={library} onOpen={setActive} />;
  }

  if (!compiled.ok) {
    return (
      <div className="app launcher">
        <div className="launcher-inner">
          <p className="error-note">{active.title} does not compile: {compiled.error}</p>
          <button className="btn" onClick={leave}>Back to your worlds</button>
        </div>
      </div>
    );
  }

  return (
    <Gate
      // Composite, never the module id: two worlds may both be called
      // `aurendel`, and keying on the id would carry a live session from one
      // into the other.
      key={active.key}
      module={compiled.module}
      installed={NO_MODS}
      choice={active}
      library={library}
      onLeave={leave}
      onOpen={setActive}
    />
  );
}

/**
 * Mods resolve before the game mounts.
 *
 * Not a nicety: a session started without its mods and then re-created with
 * them would already have advanced the RNG, so the run would no longer match
 * its own replay. A module that declares no mods skips all of this and mounts
 * on the first render exactly as it did before mods existed.
 */
function Gate({
  module, installed, choice, library, onLeave, onOpen,
}: {
  module: CompiledModule;
  installed: readonly ModWire[];
  choice: ModuleChoice;
  library: LibraryApi;
  onLeave: () => void;
  onOpen: (choice: ModuleChoice) => void;
}) {
  const mods = useMods(module, installed);

  if (mods.state.status === 'preparing') {
    return <div className="app"><p className="error-note">Preparing mods…</p></div>;
  }

  // A missing required mod is the one thing that stops play outright. The game
  // said it needs it; running anyway produces a broken session that reads as an
  // engine bug rather than a missing download.
  if (mods.state.status === 'blocked') {
    const { missing, issues } = mods.state.setup.resolution;
    return (
      <div className="app">
        <div className="error-note">
          <p><strong>{module.source.meta.title}</strong> cannot start: it requires mods that are not installed.</p>
          <ul>
            {missing.map((entry) => (
              <li key={entry.id}>
                <code>{entry.id}-{entry.hash}</code>
                {entry.note ? ` — ${entry.note}` : ''}
              </li>
            ))}
          </ul>
          <p>Mods are not distributed to this build yet.</p>
          {issues.filter((i) => i.severity === 'error').map((issue, i) => (
            <p key={i}>{issue.message}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Game
      module={module}
      setup={mods.state.setup}
      modsApi={mods}
      choice={choice}
      library={library}
      onLeave={onLeave}
      onOpen={onOpen}
    />
  );
}

function Game({
  module, setup, modsApi, choice, library, onLeave, onOpen,
}: {
  module: CompiledModule;
  setup: ModSetup | null;
  modsApi: ModsApi;
  choice: ModuleChoice;
  library: LibraryApi;
  onLeave: () => void;
  onOpen: (choice: ModuleChoice) => void;
}) {
  const session: SessionApi = useSession(module, 12345, setup);
  // Who the party could trade with, so the panel and its button agree.
  const trader = traderNearby({ module: session.module, state: session.frame.state });
  const [panel, setPanel] = useState<Panel>(null);
  const file = useRef<HTMLInputElement>(null);

  const { frame } = session;
  const over = frame.state.outcome !== 'playing';

  const onMeta = (command: MetaCommand) => {
    switch (command.kind) {
      case 'journal': setPanel('journal'); break;
      case 'lore': setPanel('lore'); break;
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
        <button className="btn" onClick={onLeave} title="Your worlds">◄ Worlds</button>
        <span className="world-title">{choice.title}</span>
        <button className="btn" onClick={() => file.current?.click()}>Open…</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json,.gz"
          hidden
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = '';
            // Imported worlds join the library rather than living in this
            // tab's memory: the file was opened once, and it should be here
            // next time without being found again.
            if (picked) void library.importFile(picked).then((next) => { if (next) onOpen(next); });
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
        {modsApi.toggles.length > 0 && (
          <button className="btn" onClick={() => setPanel('mods')}>Mods</button>
        )}
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
          <ModBanner setup={setup} />
          <Transcript lines={frame.transcript} />
          <Dialogue session={session} />
          {!over && <CommandBar session={session} onMeta={onMeta} />}
        </div>
      </div>

      <StatusBar session={session} />

      {panel === 'mods' && (
        <Overlay title="Mods" onClose={() => setPanel(null)}>
          <ModsPanel api={modsApi} setup={setup} modState={frame.state.modState} />
        </Overlay>
      )}
      {(panel === 'journal' || panel === 'lore') && (
        <Overlay title="Journal" onClose={() => setPanel(null)}>
          {/* Two halves of one book: what you were asked to do, and what you
              worked out. Tabs rather than two panels, because the second is
              worthless without the first to read it against. */}
          <div className="tabs">
            <button
              className={`btn ${panel === 'journal' ? 'on' : ''}`}
              onClick={() => setPanel('journal')}
            >Quests</button>
            <button
              className={`btn ${panel === 'lore' ? 'on' : ''}`}
              onClick={() => setPanel('lore')}
            >Lore</button>
          </div>
          {panel === 'journal' ? <Quests session={session} /> : <Lore session={session} />}
        </Overlay>
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
          <SaveMenu session={session} worldKey={choice.worldKey} onClose={() => setPanel(null)} />
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
