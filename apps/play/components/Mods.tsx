'use client';

/** Mod status and toggles. */

import type { ModSetup } from '@/lib/mods';
import type { ModsApi } from '@/lib/useMods';

/** A persistent warning that a mod is not the build the game was authored against. */
export function ModBanner({ setup }: { setup: ModSetup | null }) {
  if (!setup) return null;
  const { drifted } = setup.resolution;
  const failures = setup.installIssues;
  if (drifted.length === 0 && failures.length === 0) return null;

  return (
    <div className="error-note" style={{ marginBottom: 8 }}>
      {drifted.map((entry) => (
        <p key={entry.id}>
          <strong>{entry.id}</strong> is version <code>{entry.found.slice(0, 8)}</code>, but this game
          was written for <code>{entry.want.slice(0, 8)}</code>. Playing anyway — things may not
          behave the way the author intended.
          {entry.note ? ` ${entry.note}` : ''}
        </p>
      ))}
      {failures.map((issue, i) => (
        <p key={i}>{issue}</p>
      ))}
    </div>
  );
}

/** What one mod is currently holding. */
function ModState({ held }: { held: Readonly<Record<string, unknown>> | undefined }) {
  const entries = Object.entries(held ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="meta">
      {entries
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(' · ')}
    </div>
  );
}

export function ModsPanel({
  api,
  setup,
  modState,
}: {
  api: ModsApi;
  setup: ModSetup | null;
  /** What each active mod is currently holding, straight off `GameState`. */
  modState: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}) {
  const shadowed = setup?.resolution.shadowed ?? [];
  const missing = setup?.resolution.missing ?? [];

  return (
    <div>
      <p className="meta">
        Mods change how the game plays. A game can require one, and those stay on.
        Changing what runs takes effect on the next new game or reload — swapping
        mods mid-run would make the log unable to replay itself.
      </p>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {api.toggles.map((mod) => (
          <li key={mod.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <input
                type="checkbox"
                checked={mod.on}
                disabled={mod.required}
                onChange={(event) => api.setEnabled(mod.id, event.target.checked)}
              />
              <span>
                <code>{mod.id}</code>
                {mod.required && <span className="meta"> — required by this game</span>}
                {mod.note && <div className="meta">{mod.note}</div>}
                {/*
                  What the mod is holding right now.
                  Without this a mod's state is invisible, and the only way to
                  tell whether it is doing anything is to infer it from
                  behaviour — which is exactly how `thorns` came to look broken.
                */}
                {mod.on && <ModState held={modState[mod.id]} />}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <p className="meta">
          Not installed: {missing.map((m) => `${m.id}-${m.hash.slice(0, 8)}`).join(', ')}
        </p>
      )}

      {shadowed.length > 0 && (
        <p className="meta">
          {/* Never silently: a mod that quietly did nothing is the most
              confusing outcome available to a player. */}
          Overridden: {shadowed.map((s) => `${s.id}'s ${s.hook} (by ${s.by})`).join(', ')}
        </p>
      )}

      {api.toggles.length === 0 && <p className="meta">This game does not use mods.</p>}
    </div>
  );
}
