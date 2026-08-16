/**
 * Mods, from source text to a running hook table.
 *
 * The server reads `mods/` and hands over plain objects — a manifest and a map
 * of file contents, all strings, which cross the RSC boundary as easily as a
 * module document does. Everything else happens here, in the browser, for the
 * same reason modules are compiled here: the result is a live object with a
 * WASM context behind it and cannot be serialized.
 */

import { prepareSandbox, createHost, resolveMods, activeModIdentities } from '@dm/mods';
import type { LoadedMod, ModDeclaration, ModResolution, SandboxHost } from '@dm/mods';
import { ModRuntime } from '@dm/engine';
import type { CompiledModule } from '@dm/module';

/** A mod as it crosses from the server. */
export interface ModWire {
  readonly manifest: LoadedMod['manifest'];
  readonly files: Readonly<Record<string, string>>;
  readonly hash: string;
  /** Problems found while reading it off disk, already formatted. */
  readonly issues: readonly { readonly message: string; readonly severity: string }[];
}

export interface ModSetup {
  readonly resolution: ModResolution;
  /** Null when nothing is active — which is exactly the unmodded engine. */
  readonly runtime: ModRuntime | null;
  /** `<id>-<hash>` for every active mod, sorted. What a save records. */
  readonly identities: readonly string[];
  /** Install-time complaints, one line each. */
  readonly installIssues: readonly string[];
}

/** What the game document asks for. */
export function declarationsOf(module: CompiledModule): readonly ModDeclaration[] {
  return (module.source.mods ?? []).map((entry) => ({
    id: entry.id,
    hash: entry.hash,
    target: entry.target,
    required: entry.required,
    note: entry.note,
  }));
}

let host: SandboxHost | null = null;

/**
 * Build the runtime for one module.
 *
 * Async only because instantiating the WASM module is; every call after that
 * is synchronous, which is what keeps `reduce` a synchronous pure function.
 * The host is created once and reused, so switching modules does not pay for
 * it again.
 */
export async function setUpMods(
  module: CompiledModule,
  available: readonly ModWire[],
  isEnabled: (id: string) => boolean,
): Promise<ModSetup> {
  const declared = declarationsOf(module);
  const loaded: LoadedMod[] = available.map((wire) => ({
    manifest: wire.manifest,
    files: wire.files,
    hash: wire.hash,
  }));

  const resolution = resolveMods(declared, loaded, isEnabled, 'engine');
  if (resolution.active.length === 0) {
    return { resolution, runtime: null, identities: [], installIssues: [] };
  }

  await prepareSandbox();
  host ??= createHost({ target: 'engine' });

  const installIssues: string[] = [];
  const installed: LoadedMod[] = [];
  for (const mod of resolution.active) {
    if (host.installed(mod.manifest.id)) {
      installed.push(mod);
      continue;
    }
    const result = host.install(mod);
    for (const issue of result.issues) installIssues.push(`${mod.manifest.id}: ${issue}`);
    // A mod that failed to evaluate has no handlers, so it is left out of the
    // runtime rather than left in to fail on every hook.
    if (result.ok) installed.push(mod);
  }

  const shadowed = new Set(resolution.shadowed.map((s) => `${s.id} ${s.hook}`));
  return {
    resolution,
    runtime: installed.length > 0 ? new ModRuntime({ host, mods: installed, shadowed }) : null,
    identities: activeModIdentities(installed),
    installIssues,
  };
}

/**
 * Which optional mods the player has switched off, per module.
 *
 * Mirrors the `dm.save.<moduleId>.<slot>` convention already in `useSaves`.
 * Required mods are never consulted against this — `resolveMods` forces them
 * on regardless.
 */
const keyFor = (moduleId: string) => `dm.mods.${moduleId}`;

export function readEnabled(moduleId: string): ReadonlySet<string> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(keyFor(moduleId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : null;
  } catch {
    return null;
  }
}

export function writeEnabled(moduleId: string, enabled: Iterable<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(keyFor(moduleId), JSON.stringify([...enabled].sort()));
  } catch {
    // A full or blocked store is not worth failing a game over.
  }
}
