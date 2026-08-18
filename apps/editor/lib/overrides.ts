'use client';

/**
 * What a placed entry no longer takes from its prefab.
 *
 * One derivation, used in two places that must never disagree: the prefab
 * panel, which lists the overrides, and the form itself, which marks them
 * where the author is actually looking. Two implementations of "is this field
 * overridden?" would eventually answer differently, and the state they would
 * disagree about — whether editing the prefab still reaches this field — is
 * the one an author cannot afford to be wrong about.
 *
 * The comparison is live rather than stored: an override is whatever differs
 * from what the prefab would produce *now*. That is the only definition that
 * stays true when the prefab changes, and it means nothing has to be migrated
 * when it does.
 */

import { useMemo } from 'react';
import { expandPrefab, linkFor, overriddenPaths } from '@dm/module';
import type { Prefab, PrefabLink } from '@dm/module';
import type { ExpandIssue } from '@dm/module';
import type { OverrideInfo } from '@/components/Field';
import type { ModuleStore, Path } from '@/lib/store';
import type { WorldAuthoring } from '@dm/library';

export interface PrefabState {
  /** Null when this entry did not come from a prefab. */
  readonly info: OverrideInfo | null;
  readonly prefab: Prefab | undefined;
  readonly link: PrefabLink | null;
  /** Problems expanding the prefab as it stands, e.g. a missing parameter. */
  readonly issues: readonly ExpandIssue[];
  readonly resetAll: () => void;
  /** A link naming a prefab that is not in the project. */
  readonly danglingLink: string | null;
}

export function usePrefabState(args: {
  store: ModuleStore;
  basePath: Path;
  entry: Record<string, unknown>;
  collection: string;
  authoring: WorldAuthoring;
}): PrefabState {
  const { store, basePath, entry, collection, authoring } = args;
  const id = typeof entry['id'] === 'string' ? entry['id'] : '';
  const link = id ? linkFor(authoring.instances, collection, id) : null;
  const prefab = link ? authoring.prefabs.find((candidate) => candidate.id === link.id) : undefined;

  return useMemo<PrefabState>(() => {
    if (!link || !prefab) {
      return {
        info: null,
        prefab,
        link,
        issues: [],
        resetAll: () => {},
        danglingLink: link && !prefab ? link.id : null,
      };
    }

    const expanded = expandPrefab(prefab, link.params, authoring.style);
    const paths = new Set(overriddenPaths(prefab, entry, link, authoring.style));

    /** Hand one field back. Absent from the prefab means the field goes. */
    const reset = (relativePath: string) => {
      const segments = relativePath.split('.');
      const value = segments.reduce<unknown>(
        (node, key) =>
          typeof node === 'object' && node !== null
            ? (node as Record<string, unknown>)[key]
            : undefined,
        expanded.entry,
      );
      if (value === undefined) store.remove([...basePath, ...segments]);
      else store.set([...basePath, ...segments], value);
    };

    return {
      info: { base: basePath, paths, reset },
      prefab,
      link,
      issues: expanded.issues,
      resetAll: () => store.set(basePath, expanded.entry),
      danglingLink: null,
    };
    // `basePath` must be a stable reference for this memo to hold; the
    // inspector memoizes it for exactly that reason.
  }, [prefab, link, entry, authoring.style, store, basePath]);
}
