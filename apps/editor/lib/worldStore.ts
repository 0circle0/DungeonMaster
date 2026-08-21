'use client';

/** Writing a world back to the library. */

import { writeWorldFiles, factsFor } from '@dm/library';
import type { WorldAuthoring, WorldMeta } from '@dm/library';
import { recomputeInstances } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { diffProject } from './projectDiff';
import type { ProjectSnapshot } from './projectDiff';

/** The sidecar, brought up to date with the document. */
export function recomputeInstancesFor(
  doc: Record<string, unknown>,
  authoring: WorldAuthoring,
): WorldAuthoring {
  const instances = recomputeInstances(doc, authoring.prefabs, authoring.instances, authoring.style);
  return instances ? { ...authoring, instances } : authoring;
}

/** A save: work out which files moved, and write those. */
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
  const { sweep: _sweep, ...safe } = change;

  const written = await writeWorldFiles(
    world.key,
    safe,
    {
      facts: factsFor(doc, compiled),
      // The title follows the document.
      title: typeof meta['title'] === 'string' && meta['title'] ? meta['title'] : world.title,
      storedBytes,
    },
    world,
  );

  return { meta: written, snapshot };
}
