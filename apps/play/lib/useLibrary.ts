'use client';

/** The player's own worlds, and the examples a deployment happens to carry. */

import { useCallback, useEffect, useState } from 'react';
import {
  fetchCatalog, fetchExampleEnvelope, EMPTY_CATALOG,
  listWorlds, readWorld, createWorld, deleteWorld, renameWorld,
  readWorldFile, hasStorage, estimateStorage,
} from '@dm/library';
import type { Catalog, CatalogEntry, WorldMeta, WorldEnvelope, StorageEstimate } from '@dm/library';
import type { ModuleChoice } from './modules';
import { choiceOf, transientChoice } from './modules';

export interface LibraryApi {
  readonly loading: boolean;
  readonly worlds: readonly WorldMeta[];
  /** Catalog entries not already in the library, so nothing is offered twice. */
  readonly available: readonly CatalogEntry[];
  readonly catalog: Catalog;
  /** Null until measured, and on browsers that do not report it. */
  readonly usage: StorageEstimate | null;
  /** True when there is nowhere to store a world; play still works. */
  readonly ephemeral: boolean;
  readonly error: string | null;
  readonly addExample: (id: string) => Promise<ModuleChoice | null>;
  readonly importFile: (file: File) => Promise<ModuleChoice | null>;
  readonly open: (key: string) => Promise<ModuleChoice | null>;
  readonly remove: (key: string) => Promise<void>;
  readonly rename: (key: string, title: string) => Promise<void>;
}

export function useLibrary(): LibraryApi {
  const [loading, setLoading] = useState(true);
  const [worlds, setWorlds] = useState<readonly WorldMeta[]>([]);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);
  const [usage, setUsage] = useState<StorageEstimate | null>(null);
  const [ephemeral, setEphemeral] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<readonly WorldMeta[]> => {
    if (!hasStorage()) { setEphemeral(true); return []; }
    try {
      const next = await listWorlds();
      setWorlds(next);
      setUsage(await estimateStorage());
      return next;
    } catch (err) {
      // A browser with storage disabled still plays; it just cannot keep anything.
      setEphemeral(true);
      setError(`Worlds cannot be saved in this browser: ${(err as Error).message}`);
      return [];
    }
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      // The catalog is optional and never throws.
      const [loadedCatalog] = await Promise.all([fetchCatalog(), refresh()]);
      if (!live) return;
      setCatalog(loadedCatalog);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [refresh]);

  /** Store an envelope, or fall back to playing it unstored. */
  const adopt = useCallback(async (
    envelope: WorldEnvelope,
    origin: WorldMeta['origin'],
    originId: string | null,
  ): Promise<ModuleChoice | null> => {
    if (!hasStorage()) return transientChoice(envelope);
    try {
      const meta = await createWorld(envelope, origin, originId);
      await refresh();
      setError(null);
      return choiceOf(meta, envelope);
    } catch (err) {
      setError((err as Error).message);
      return transientChoice(envelope);
    }
  }, [refresh]);

  const addExample = useCallback(async (id: string): Promise<ModuleChoice | null> => {
    const envelope = await fetchExampleEnvelope(id);
    if (!envelope) {
      setError(`“${id}” is not available on this server.`);
      return null;
    }
    return adopt(envelope, 'example', id);
  }, [adopt]);

  const importFile = useCallback(async (file: File): Promise<ModuleChoice | null> => {
    try {
      const envelope = await readWorldFile(file);
      return await adopt(envelope, 'imported', null);
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [adopt]);

  const open = useCallback(async (key: string): Promise<ModuleChoice | null> => {
    try {
      const found = await readWorld(key);
      if (!found) { setError('That world is no longer in your library.'); return null; }
      return choiceOf(found.meta, found.envelope);
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const remove = useCallback(async (key: string): Promise<void> => {
    await deleteWorld(key);
    await refresh();
  }, [refresh]);

  const rename = useCallback(async (key: string, title: string): Promise<void> => {
    await renameWorld(key, title);
    await refresh();
  }, [refresh]);

  // An example already in the library is not offered again; deleting it puts it back.
  const taken = new Set(worlds.map((w) => w.originId).filter((id): id is string => id !== null));
  const available = catalog.modules.filter((entry) => !taken.has(entry.id));

  return {
    loading, worlds, available, catalog, usage, ephemeral, error,
    addExample, importFile, open, remove, rename,
  };
}
