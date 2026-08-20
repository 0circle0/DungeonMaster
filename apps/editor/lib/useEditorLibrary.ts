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
  fetchCatalog, fetchExampleProject, EMPTY_CATALOG,
  listWorlds, readWorldFiles, readWorldMeta, createWorldFromFiles, deleteWorld, factsFor,
  readProjectFile, hasStorage, estimateStorage, NO_AUTHORING,
} from '@dm/library';
import type {
  Catalog, CatalogEntry, WorldMeta, StorageEstimate, WorldAuthoring,
} from '@dm/library';
import { bundleModule, unbundleModule } from '@dm/module';
import { snapshotFrom } from './projectDiff';
import type { ProjectSnapshot } from './projectDiff';

/**
 * A world opened from the store: its files, joined.
 *
 * No draft. A draft existed because a world was one blob that had to be either
 * valid or set aside, so that the library always held something loadable. Files
 * have no second version to hold — an entry with a half-typed reference is a
 * file like any other and the world opens with a diagnostic against it.
 */
export interface LoadedWorld {
  readonly meta: WorldMeta;
  readonly doc: Record<string, unknown>;
  readonly authoring: WorldAuthoring;
  /** Anything the project could not say — a bad file names itself. */
  readonly issues: readonly string[];
  /**
   * The files as they were read, described. Without it the first save would
   * compare against nothing and rewrite the whole world with the bytes it
   * already had.
   */
  readonly snapshot: ProjectSnapshot;
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

  /**
   * Take a project into the library, once.
   *
   * The files land as they arrived — recipes still recipes, prefabs still
   * prefabs — and are never joined on the way in. Joining happens when the world
   * is opened, and what is stored is what the author was given.
   */
  const store = useCallback(async (
    files: Record<string, string>,
    seed: { title: string; filename: string; origin: WorldMeta['origin']; originId: string | null },
  ): Promise<WorldMeta | null> => {
    try {
      const { document, issues } = unbundleModule(files);
      if (!document) {
        setError(issues[0]?.message ?? 'that project could not be read');
        return null;
      }
      const meta = await createWorldFromFiles(files, {
        title: seed.title,
        filename: seed.filename,
        facts: factsFor(document),
        origin: seed.origin,
        originId: seed.originId,
      });
      await refresh();
      setError(null);
      return meta;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [refresh]);

  const addExample = useCallback(async (id: string): Promise<WorldMeta | null> => {
    const files = await fetchExampleProject(id);
    if (!files) { setError(`“${id}” is not available on this server.`); return null; }
    const entry = catalog.modules.find((module) => module.id === id);
    return store(files, {
      title: entry?.title ?? id,
      filename: `${id}.module.json`,
      origin: 'example',
      originId: id,
    });
  }, [store, catalog]);

  const importFile = useCallback(async (file: File): Promise<WorldMeta | null> => {
    try {
      const files = await readProjectFile(file);
      const named = file.name.replace(/\.project\.json(\.gz)?$/, '');
      return await store(files, {
        title: named,
        filename: `${named}.module.json`,
        origin: 'imported',
        originId: null,
      });
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [store]);

  /**
   * A world the studio itself makes — a template, or a ruleset composed into
   * one. It is split here rather than imported: nothing arrives from outside, so
   * there is a document and it becomes the project it will be edited as.
   */
  const createFrom = useCallback(async (
    doc: Record<string, unknown>,
    filename: string,
    authoring: WorldAuthoring | null = null,
  ): Promise<WorldMeta | null> => {
    const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
    return store(bundleModule(doc, authoring ?? NO_AUTHORING).files, {
      title: typeof meta['title'] === 'string' && meta['title'] ? meta['title'] : filename,
      filename,
      origin: 'created',
      originId: null,
    });
  }, [store]);

  const remove = useCallback(async (key: string): Promise<void> => {
    await deleteWorld(key);
    await refresh();
  }, [refresh]);

  /**
   * The document behind an example, for composing a new world out of it.
   *
   * Joined here and thrown away: nothing is stored, so this is the one place the
   * studio wants a document rather than a project.
   */
  const exampleDoc = useCallback(async (id: string): Promise<Record<string, unknown> | null> => {
    const files = await fetchExampleProject(id);
    if (!files) { setError(`“${id}” is not available on this server.`); return null; }
    return unbundleModule(files).document;
  }, []);

  const taken = new Set(worlds.map((w) => w.originId).filter((id): id is string => id !== null));

  return {
    loading, worlds, catalog, usage, ephemeral, error,
    available: catalog.modules.filter((entry) => !taken.has(entry.id)),
    clearError: useCallback(() => setError(null), []),
    refresh, addExample, importFile, createFrom, remove, exampleDoc,
  };
}

/**
 * One world, joined from its files.
 *
 * This is the only place a project becomes a document, and it happens when a
 * world is opened rather than on every save. Parsing all of Aurendel's files is
 * about as much work as parsing `module.json` was, because it is the same bytes.
 */
export async function loadWorld(key: string): Promise<LoadedWorld | null> {
  // One metadata row, not every row filtered down to one — and both reads at
  // once, because neither depends on the other.
  const [meta, files] = await Promise.all([readWorldMeta(key), readWorldFiles(key)]);
  if (!meta || Object.keys(files).length === 0) return null;

  const { document, authoring, issues } = unbundleModule(files);
  if (!document) return null;
  return {
    meta,
    doc: document,
    authoring,
    issues: issues.map((issue) => `${issue.file}: ${issue.message}`),
    snapshot: snapshotFrom(document, authoring, files),
  };
}
