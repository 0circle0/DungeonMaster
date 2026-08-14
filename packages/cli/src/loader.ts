/**
 * Loading a module from disk.
 *
 * The only place in the CLI that touches the filesystem, so the rest stays as
 * portable as the engine it drives.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { compileModule, resolveExtends, formatIssues } from '@dm/module';
import type { CompiledModule } from '@dm/module';

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/** Load and compile a module, resolving any `extends` chain from siblings. */
export function loadModule(input: string): CompiledModule {
  const target = resolve(input);
  const path = existsSync(target) && !target.endsWith('.json') ? join(target, 'module.json') : target;
  if (!existsSync(path)) throw new Error(`no such module: ${input}`);

  const modulesRoot = dirname(dirname(path));
  const resolved = resolveExtends(readJson(path), (identity) => {
    if (!existsSync(modulesRoot)) return undefined;
    for (const entry of readdirSync(modulesRoot)) {
      const candidate = join(modulesRoot, entry, 'module.json');
      if (!existsSync(candidate)) continue;
      const doc = readJson(candidate);
      if (`${String(doc['id'])}@${String(doc['version'])}` === identity) return doc;
    }
    return undefined;
  });
  if (!resolved.ok) throw new Error(resolved.error);

  const result = compileModule(resolved.document);
  if (!result.ok) throw new Error(`module failed to compile:\n${formatIssues(result.errors)}`);
  return result.module;
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
