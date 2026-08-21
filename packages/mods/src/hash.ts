/** Mod content hashing. */

import { hash64, stableStringify } from '@dm/core';

/** posix-relative path within the mod directory to file contents. */
export type ModFiles = Readonly<Record<string, string>>;

/** The manifest file name, excluded from the file list because it is hashed separately. */
export const MANIFEST_FILE = 'mod.json';

/** Field separator. */
const SEP = String.fromCharCode(0);

/** Content tag over a mod. */
export function hashMod(manifest: Record<string, unknown>, files: ModFiles): string {
  const rest: Record<string, unknown> = { ...manifest };
  delete rest['hash'];

  const parts = [stableStringify(rest)];

  const paths = Object.keys(files)
    .filter((path) => path !== MANIFEST_FILE)
    .sort();

  for (const path of paths) {
    const contents = files[path] ?? '';
    parts.push([path, String(contents.length), contents].join(SEP));
  }

  return hash64(parts.join('\n'));
}
