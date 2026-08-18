'use client';

/**
 * Writing a world back to the library.
 *
 * A thin seam over `@dm/library`, and it earns its place by holding the two
 * facts the studio knows and the library does not: an envelope carries an
 * authoring sidecar alongside the document, and that sidecar's `overrides` are
 * derived from the document rather than remembered.
 *
 * This is what `writeModule` in `modulesOnDisk.ts` used to be. Everything it
 * did about files — splitting maps back into folders, diffing 2,760 project
 * files, pruning empty directories — was policy for a repository that a browser
 * does not have. What survives is this: the document, its sidecar, and keeping
 * the two in step.
 */

import {
  writeWorld as libraryWrite,
  writeDraft as libraryDraft,
  clearDraft as libraryClear,
} from '@dm/library';
import type { WorldAuthoring, WorldMeta } from '@dm/library';
import { recomputeInstances } from '@dm/module';

/**
 * The sidecar, brought up to date with the document.
 *
 * `params` are what somebody typed when they placed an entry and are carried
 * through untouched; `overrides` are recomputed every time, because "a field I
 * changed by hand" is not a thing to remember — it is a thing to observe.
 */
export function recomputeInstancesFor(
  doc: Record<string, unknown>,
  authoring: WorldAuthoring,
): WorldAuthoring {
  const instances = recomputeInstances(doc, authoring.prefabs, authoring.instances, authoring.style);
  return instances ? { ...authoring, instances } : authoring;
}

export async function writeWorld(
  world: WorldMeta,
  doc: Record<string, unknown>,
  authoring: WorldAuthoring,
): Promise<WorldMeta> {
  const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
  return libraryWrite(
    world.key,
    {
      dmWorld: 1,
      format: 1,
      doc,
      authoring,
      // The title follows the document, so renaming a world in its own `meta`
      // is not contradicted by a stale label in the switcher.
      title: typeof meta['title'] === 'string' && meta['title'] ? meta['title'] : world.title,
      filename: world.filename,
    },
    world,
  );
}

export const writeDraft = libraryDraft;
export const clearDraft = libraryClear;
