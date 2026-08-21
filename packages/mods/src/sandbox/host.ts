/**
 * The sandbox contract.
 *
 * Separated from the QuickJS implementation so the engine depends on an interface rather than a
 * WASM module, and so tests can substitute a fake host.
 *
 * Two properties the engine relies on:
 *
 *   - `call` is synchronous. `reduce()` is a pure synchronous function and is not becoming async
 *     for mods; QuickJS instantiation is async, so a host is built once up front and handed in
 *     ready.
 *   - `call` never throws. A mod that explodes, hangs, or returns nonsense produces a failed
 *     result, which the engine turns into a reported `modError` event.
 */

import type { ModManifest } from '../schema/manifest.js';
import type { ModFiles } from '../hash.js';

/** A mod as the host needs it: manifest plus every source file. */
export interface LoadedMod {
  readonly manifest: ModManifest;
  readonly files: ModFiles;
  /** Recomputed from the files, never taken on trust. */
  readonly hash: string;
}

/** Why a crossing failed. Distinguished because the fixes differ. */
export type SandboxFailure =
  /** The mod threw. Its bug. */
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
  /** Bound as `dm.state.get(path)`. Returns JSON text, or null when absent. */
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
  /** Evaluate a mod's entry once and register its hooks. Synchronous. */
  install(mod: LoadedMod): InstallResult;
  /** Never throws. Repeated failures quarantine the mod. */
  call(call: SandboxCall): SandboxResult;
  quarantined(modId: string): boolean;
  installed(modId: string): boolean;
  dispose(): void;
}

export interface HostOptions {
  readonly target: 'engine' | 'editor';
  /**
   * Failures before a mod is switched off for the rest of the run. Tests that assert determinism
   * pass `Infinity`, so a throwing mod fails loudly instead of being quietly disabled halfway
   * through.
   */
  readonly quarantineAfter?: number;
}
