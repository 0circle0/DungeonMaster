/** A mod as it crosses from the server. */

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
