/**
 * Mod content hashing.
 *
 * The primitive takes a **file map**, not a directory, and that is the whole
 * trick: the on-disk folder and a packed single-file bundle produce the same
 * tag, so a mod can be shared either way and still satisfy the hash a game
 * pinned. `load.ts` only builds the map; it never hashes a directory.
 *
 * Ordering is fixed here rather than inherited from the filesystem, mirroring
 * the sorted discovery in `@dm/module/load` — a hash that depended on
 * `readdir` order would differ between machines for identical content.
 */

import { hash64, stableStringify } from '@dm/core';

/** posix-relative path within the mod directory to file contents. */
export type ModFiles = Readonly<Record<string, string>>;

/** The manifest file name, excluded from the file list because it is hashed separately. */
export const MANIFEST_FILE = 'mod.json';

/**
 * Field separator. A NUL rather than a space, because a space can appear in a
 * path and the point of a separator is that it cannot. Built with
 * `fromCharCode` so this source stays plain ASCII.
 */
const SEP = String.fromCharCode(0);

/**
 * Content tag over a mod.
 *
 * The manifest's own `hash` field is removed before hashing, because it cannot
 * describe a text it is part of. Each file then contributes its path, its
 * length, and its contents: the length is what stops contents that happen to
 * look like a path boundary from forging a different layout with the same tag.
 */
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
