/**
 * A mod as it crosses from the server.
 *
 * Split from `modsOnDisk.ts` so a client component can import the *type*
 * without dragging `node:fs` into the browser bundle — the same split
 * `@dm/mods` makes between its index and `./load`.
 */

import type { ModManifest } from '@dm/mods';

export interface ModWire {
  readonly manifest: ModManifest;
  readonly files: Readonly<Record<string, string>>;
  readonly hash: string;
  readonly issues: readonly {
    readonly message: string;
    readonly severity: string;
    readonly code: string;
  }[];
}
