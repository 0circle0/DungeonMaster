'use client';

/**
 * Editor mods as a hook.
 *
 * Unlike the play side, nothing here blocks: the studio must always render, so
 * an author can fix whatever is broken — including a module that pins a mod
 * they do not have. Mods arrive when they arrive, and the panels that use them
 * are empty until then.
 */

import { useEffect, useMemo, useState } from 'react';
import { prepareSandbox, createHost } from '@dm/mods';
import type { LoadedMod, SandboxHost } from '@dm/mods';

import { createEditorModRuntime } from './modRuntime';
import type { EditorModRuntime } from './modRuntime';
import type { ModWire } from './modWire';

const STORAGE_KEY = 'dm.editor.mods';

function readDisabled(): ReadonlySet<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export interface EditorModsApi {
  /** Null until the sandbox is ready, or when no editor mod is enabled. */
  readonly runtime: EditorModRuntime | null;
  /** Every installed mod, both targets — the Mods panel lists all of them. */
  readonly installed: readonly ModWire[];
  readonly disabled: ReadonlySet<string>;
  readonly setEnabled: (id: string, on: boolean) => void;
  readonly ready: boolean;
}

export function useEditorMods(installed: readonly ModWire[]): EditorModsApi {
  const [disabled, setDisabled] = useState<ReadonlySet<string>>(readDisabled);
  const [host, setHost] = useState<SandboxHost | null>(null);
  const [ready, setReady] = useState(false);

  const active = useMemo(
    () =>
      installed
        .filter((mod) => mod.manifest.target === 'editor' && !disabled.has(mod.manifest.id))
        // Sorted by id: the studio has no game document deciding load order, so
        // the only stable ordering available is the ids themselves.
        .sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : a.manifest.id > b.manifest.id ? 1 : 0)),
    [installed, disabled],
  );

  useEffect(() => {
    if (active.length === 0) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void prepareSandbox().then(() => {
      if (cancelled) return;
      setHost((current) => current ?? createHost({ target: 'editor' }));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active.length]);

  const runtime = useMemo(() => {
    if (!host || active.length === 0) return null;
    const loaded: LoadedMod[] = [];
    for (const wire of active) {
      const mod: LoadedMod = { manifest: wire.manifest, files: wire.files, hash: wire.hash };
      if (!host.installed(mod.manifest.id)) {
        const result = host.install(mod);
        if (!result.ok) continue;
      }
      loaded.push(mod);
    }
    return loaded.length > 0 ? createEditorModRuntime(host, loaded) : null;
  }, [host, active]);

  return {
    runtime,
    installed,
    disabled,
    ready,
    setEnabled: (id, on) => {
      setDisabled((current) => {
        const next = new Set(current);
        if (on) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify([...next].sort()));
        } catch {
          // A blocked store is not worth failing the studio over.
        }
        return next;
      });
    },
  };
}
