'use client';

/**
 * Writing a world back to the library.
 *
 * A thin seam over `@dm/library`, and it earns its place by holding the two
 * facts the studio knows and the library does not: an envelope carries an
 * authoring sidecar alongside the document, and that sidecar's `overrides` are
 * derived from the document rather than remembered.
 *
 * This is what `writeModule` in `modulesOnDisk.ts` used to be, and it does the
 * same job again for the same reason: a world is its project files, and a save
 * writes the ones that moved. What changed is where they live. The filesystem is
 * IndexedDB now, so splitting maps into folders and pruning what a document no
 * longer names is not repository policy — it is what storing a world means.
 */

import { writeWorldFiles, factsFor } from '@dm/library';
import type { WorldAuthoring, WorldMeta } from '@dm/library';
import { recomputeInstances } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { diffProject } from './projectDiff';
import type { ProjectSnapshot } from './projectDiff';

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

/**
 * A save: work out which files moved, and write those.
 *
 * `compiled` is the module the studio already has from drawing its diagnostics.
 * Passing it is not an optimisation detail — recompiling here was a full schema
 * parse, six hundred milliseconds on Aurendel, on every idle save, purely to
 * fill in a hash. `null` means it does not compile, which is a normal state and
 * simply records no hash.
 *
 * The snapshot advances **after** the write resolves and not before. If it moved
 * first and the transaction then aborted — a quota failure does exactly that —
 * the next diff would compare against files that were never stored and those
 * edits would never be written again.
 */
export async function saveWorld(args: {
  world: WorldMeta;
  doc: Record<string, unknown>;
  authoring: WorldAuthoring;
  compiled: CompiledModule | null;
  previous: ProjectSnapshot | null;
}): Promise<{ meta: WorldMeta; snapshot: ProjectSnapshot }> {
  const { world, doc, authoring, compiled, previous } = args;
  const meta = (doc['meta'] ?? {}) as Record<string, unknown>;

  const { change, snapshot, storedBytes } = diffProject({ doc, authoring }, previous);

  // A save never sweeps, whatever the diff decided.
  //
  // `diffProject` asks for one when it has no previous snapshot, which is right
  // for a world being created — and `createWorldFromFiles` is the only caller
  // that creates one. Reaching here without a snapshot means an *existing*
  // world was opened and its baseline went missing, and sweeping then would
  // delete every file the document does not itself reproduce. An import is
  // stored exactly as it arrived, so that is not a hypothetical set.
  const { sweep: _sweep, ...safe } = change;

  const written = await writeWorldFiles(
    world.key,
    safe,
    {
      facts: factsFor(doc, compiled),
      // The title follows the document, so renaming a world in its own `meta`
      // is not contradicted by a stale label in the switcher.
      title: typeof meta['title'] === 'string' && meta['title'] ? meta['title'] : world.title,
      storedBytes,
    },
    world,
  );

  return { meta: written, snapshot };
}
