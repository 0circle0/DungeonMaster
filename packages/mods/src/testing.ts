/** Test helpers. */

import { fileURLToPath } from 'node:url';

import { prepareSandbox, createHost } from './sandbox/quickjs.js';
import type { HostOptions, LoadedMod, SandboxHost } from './sandbox/host.js';
import { loadModsFrom } from './load.js';
import type { LoadedModFromDisk } from './load.js';

/** The repo's `mods/` directory. */
export const MODS_ROOT = fileURLToPath(new URL('../../../mods', import.meta.url));

/** Every installed mod, as the sandbox wants them. */
export function installedMods(root = MODS_ROOT): readonly LoadedModFromDisk[] {
  return loadModsFrom(root).mods;
}

/** One mod by id, or a clear failure — a missing fixture should say so. */
export function modById(id: string, root = MODS_ROOT): LoadedModFromDisk {
  const found = installedMods(root).find((mod) => mod.manifest.id === id);
  if (!found) throw new Error(`no mod ${JSON.stringify(id)} under ${root}`);
  return found;
}

/** A ready host. */
export async function testHost(options: Partial<HostOptions> = {}): Promise<SandboxHost> {
  await prepareSandbox();
  return createHost({ target: 'engine', quarantineAfter: Infinity, ...options });
}

/** Build a mod out of literal source, for cases a fixture would overstate. */
export function inlineMod(
  manifest: LoadedMod['manifest'],
  files: Record<string, string>,
): LoadedMod {
  return { manifest, files, hash: manifest.hash };
}
