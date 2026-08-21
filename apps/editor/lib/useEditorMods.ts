'use client';

/** Editor mods as a hook. */

import { useEffect, useMemo, useState } from 'react';
import { prepareSandbox, createHost } from '@dm/mods';
import type { LoadedMod, SandboxHost } from '@dm/mods';

import { createEditorModRuntime } from './modRuntime';
import type { EditorModRuntime } from './modRuntime';
import type { ModWire } from './modWire';

const STORAGE_KEY = 'dm.editor.mods';
const BORROWED_KEY = 'dm.editor.mods.borrowed';

function readSet(key: string): ReadonlySet<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function store(key: string, ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...ids].sort()));
  } catch {
    // A blocked store is not worth failing the studio over.
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
  /** Whether the open module pins this mod. */
  readonly declares: (id: string) => boolean;
  /** Whether it is actually running against the open module. */
  readonly isActive: (id: string) => boolean;
}

/** Which editor mods run against the document that is open. */
export function useEditorMods(
  installed: readonly ModWire[],
  /** Mod ids the open module pins. */
  declared: readonly string[],
): EditorModsApi {
  const [disabled, setDisabled] = useState<ReadonlySet<string>>(() => readSet(STORAGE_KEY));
  const [borrowed, setBorrowed] = useState<ReadonlySet<string>>(() => readSet(BORROWED_KEY));
  const [host, setHost] = useState<SandboxHost | null>(null);
  const [ready, setReady] = useState(false);

  const declaredIds = useMemo(() => new Set(declared), [declared]);

  const active = useMemo(
    () =>
      installed
        .filter((mod) => mod.manifest.target === 'editor')
        .filter((mod) => {
          const id = mod.manifest.id;
          if (borrowed.has(id)) return true;
          return declaredIds.has(id) && !disabled.has(id);
        })
        // Sorted by id: the studio has no game document deciding load order, so
        // the only stable ordering available is the ids themselves.
        .sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : a.manifest.id > b.manifest.id ? 1 : 0)),
    [installed, disabled, borrowed, declaredIds],
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

  const activeIds = useMemo(() => new Set(active.map((mod) => mod.manifest.id)), [active]);

  return {
    runtime,
    installed,
    disabled,
    ready,
    declares: (id) => declaredIds.has(id),
    isActive: (id) => activeIds.has(id),
    setEnabled: (id, on) => {
      // Turning a declared mod off is a preference; turning an undeclared one on is borrowing.
      if (declaredIds.has(id)) {
        setDisabled((current) => {
          const next = new Set(current);
          if (on) next.delete(id);
          else next.add(id);
          store(STORAGE_KEY, next);
          return next;
        });
        return;
      }
      setBorrowed((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        store(BORROWED_KEY, next);
        return next;
      });
    },
  };
}
