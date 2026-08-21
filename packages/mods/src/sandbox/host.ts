/** The sandbox contract. */

import type { ModManifest } from '../schema/manifest.js';
import type { ModFiles } from '../hash.js';

/** A mod as the host needs it: manifest plus every source file. */
export interface LoadedMod {
  readonly manifest: ModManifest;
  readonly files: ModFiles;
  /** Recomputed from the files, never taken on trust. */
  readonly hash: string;
}

/** Why a crossing failed. */
export type SandboxFailure =
  /** The mod threw. */
  | 'threw'
  /** It exceeded its step budget — too slow, or looping. */
  | 'interrupted'
  /** It exceeded its memory budget. */
  | 'oom'
  /** It returned something that is not a directive list. */
  | 'badreturn'
  /** It never installed, so there is nothing to call. */
  | 'uninstalled';

export type SandboxResult =
  | { readonly ok: true; readonly directives: readonly unknown[]; readonly draws: number; readonly logs: readonly string[] }
  | { readonly ok: false; readonly kind: SandboxFailure; readonly error: string };

export interface SandboxCall {
  readonly mod: string;
  readonly hook: string;
  /** Pre-serialized: the caller decides how narrow the payload is. */
  readonly payload: string;
  /** Deterministic entropy, bound as `dm.random()`. */
  readonly random: () => number;
  /** Bound as `dm.state.get(path)`. */
  readonly query: (path: string) => string | null;
}

export interface InstallResult {
  readonly ok: boolean;
  /** Hooks the mod actually registered. */
  readonly registered: readonly string[];
  readonly issues: readonly string[];
}

export interface SandboxHost {
  readonly target: 'engine' | 'editor';
  /** Evaluate a mod's entry once and register its hooks. */
  install(mod: LoadedMod): InstallResult;
  /** Never throws. */
  call(call: SandboxCall): SandboxResult;
  quarantined(modId: string): boolean;
  installed(modId: string): boolean;
  dispose(): void;
}

export interface HostOptions {
  readonly target: 'engine' | 'editor';
  /** Failures before a mod is switched off for the rest of the run. */
  readonly quarantineAfter?: number;
}
