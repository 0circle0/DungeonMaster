/**
 * Loading a module from disk.
 *
 * Delegates to the shared `@dm/module/load` loader, which assembles static map
 * folders and resolves `extends` — the CLI adds nothing of its own.
 */

import { loadModuleFrom } from '@dm/module/load';
import type { CompiledModule } from '@dm/module';

/** Load and compile a module, resolving any `extends` chain from siblings. */
export function loadModule(input: string): CompiledModule {
  return loadModuleFrom(input);
}

/** Read a numeric flag from argv, e.g. `--seed 42`. */
export function numberFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

/** Read a string flag from argv. */
export function stringFlag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

/** Read a presence flag from argv, e.g. `--create`. */
export function boolFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
