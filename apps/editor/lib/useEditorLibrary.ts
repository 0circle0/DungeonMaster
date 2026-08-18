'use client';

/**
 * The author's own worlds.
 *
 * The studio used to read `modules/` on the server and write back to it, which
 * meant every visitor to a deployment was editing the same files. Now a world
 * belongs to whoever is sitting at the browser: it is stored here, it never
 * leaves, and the only way it reaches another machine is a file the author
 * chooses to export.
 *
 * The shipped examples are static files. One is fetched when somebody asks for
 * it, and from that moment it is theirs — editable in place, with no pristine
 * copy underneath to fork from, because a world you cannot change is not an
 * example of what can be built.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  fetchCatalog, fetchExampleEnvelope, EMPTY_CATALOG,
  listWorlds, readWorld, createWorld, deleteWorld,
  readWorldFile, hasStorage, estimateStorage, envelopeFromDoc,
} from '@dm/library';
import type {
  Catalog, CatalogEntry, WorldMeta, WorldEnvelope, StorageEstimate, WorldAuthoring,
} from '@dm/library';

export interface LoadedWorld {
  readonly meta: WorldMeta;
  readonly envelope: WorldEnvelope;
  readonly draft: { savedAt: number; doc: Record<string, unknown> } | null;
}

export interface EditorLibraryApi {
  readonly loading: boolean;
  readonly worlds: readonly WorldMeta[];
  readonly available: readonly CatalogEntry[];
  readonly catalog: Catalog;
  readonly usage: StorageEstimate | null;
  readonly ephemeral: boolean;
  readonly error: string | null;
  readonly clearError: () => void;
  readonly refresh: () => Promise<readonly WorldMeta[]>;
  readonly addExample: (id: string) => Promise<WorldMeta | null>;
  readonly importFile: (file: File) => Promise<WorldMeta | null>;
  /** A brand-new world, stored from keystroke zero rather than nowhere at all. */
  readonly createFrom: (
    doc: Record<string, unknown>,
    filename: string,
    authoring?: WorldAuthoring | null,
  ) => Promise<WorldMeta | null>;
  readonly remove: (key: string) => Promise<void>;
  /** The document behind an example, for composing a new world out of it. */
  readonly exampleDoc: (id: string) => Promise<Record<string, unknown> | null>;
}

export function useEditorLibrary(): EditorLibraryApi {
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
      setEphemeral(true);
      setError(`Nothing can be saved in this browser: ${(err as Error).message}`);
      return [];
    }
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [loadedCatalog] = await Promise.all([fetchCatalog(), refresh()]);
      if (!live) return;
      setCatalog(loadedCatalog);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [refresh]);

  const store = useCallback(async (
    envelope: WorldEnvelope,
    origin: WorldMeta['origin'],
    originId: string | null,
  ): Promise<WorldMeta | null> => {
    try {
      const meta = await createWorld(envelope, origin, originId);
      await refresh();
      setError(null);
      return meta;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [refresh]);

  const addExample = useCallback(async (id: string): Promise<WorldMeta | null> => {
    const envelope = await fetchExampleEnvelope(id);
    if (!envelope) { setError(`“${id}” is not available on this server.`); return null; }
    return store(envelope, 'example', id);
  }, [store]);

  const importFile = useCallback(async (file: File): Promise<WorldMeta | null> => {
    try {
      return await store(await readWorldFile(file), 'imported', null);
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [store]);

  const createFrom = useCallback(async (
    doc: Record<string, unknown>,
    filename: string,
    authoring: WorldAuthoring | null = null,
  ): Promise<WorldMeta | null> => {
    const envelope = { ...envelopeFromDoc(doc, filename, authoring), filename };
    return store(envelope, 'created', null);
  }, [store]);

  const remove = useCallback(async (key: string): Promise<void> => {
    await deleteWorld(key);
    await refresh();
  }, [refresh]);

  const exampleDoc = useCallback(async (id: string): Promise<Record<string, unknown> | null> => {
    const envelope = await fetchExampleEnvelope(id);
    if (!envelope) { setError(`“${id}” is not available on this server.`); return null; }
    return envelope.doc;
  }, []);

  const taken = new Set(worlds.map((w) => w.originId).filter((id): id is string => id !== null));

  return {
    loading, worlds, catalog, usage, ephemeral, error,
    available: catalog.modules.filter((entry) => !taken.has(entry.id)),
    clearError: useCallback(() => setError(null), []),
    refresh, addExample, importFile, createFrom, remove, exampleDoc,
  };
}

/** One world, with whatever draft was left behind for it. */
export async function loadWorld(key: string): Promise<LoadedWorld | null> {
  const found = await readWorld(key);
  if (!found) return null;
  const { readDraft } = await import('@dm/library');
  return { meta: found.meta, envelope: found.envelope, draft: await readDraft(key) };
}
