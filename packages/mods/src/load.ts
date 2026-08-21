/**
 * Reading mods off disk.
 *
 * Node-only, and published as `@dm/mods/load` rather than from the index, so a client import of
 * this file is a build error — the same arrangement `@dm/module/load` uses.
 *
 * Layout, mirroring how modules are directories:
 *
 *     mods/engine/<id>-<hash>/mod.json
 *     mods/engine/<id>-<hash>/main.js
 *     mods/engine/<id>-<hash>/lib/anything.js
 *     mods/editor/<id>-<hash>/...
 *
 * The folder name is the mod's address and `mod.json` has to agree with it, checked the way
 * `readAssembledModule` checks a map folder's id.
 *
 * Every directory walk is sorted, so the file map — and therefore the hash — never depends on
 * filesystem enumeration order.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, sep } from 'node:path';

import { hashMod, MANIFEST_FILE } from './hash.js';
import type { ModFiles } from './hash.js';
import { modManifestSchema, parseModIdentity } from './schema/manifest.js';
import type { ModManifest } from './schema/manifest.js';

export type ModTarget = 'engine' | 'editor';

export interface ModFileIssue {
  /** Relative to the mod directory, e.g. `mod.json`. */
  readonly file: string;
  readonly code:
    | 'mod_bad_manifest'
    | 'mod_bad_json'
    | 'mod_folder_mismatch'
    | 'mod_hash_drift'
    | 'mod_no_entry'
    | 'mod_unreadable';
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export interface LoadedModFromDisk {
  readonly manifest: ModManifest;
  readonly files: ModFiles;
  /** Recomputed from the files. Never the manifest's own claim. */
  readonly hash: string;
  readonly dir: string;
  readonly issues: readonly ModFileIssue[];
}

/**
 * A mod that could not be read at all. Kept separate from `LoadedModFromDisk` rather than served as
 * one with a null manifest: a mod whose manifest failed to parse has no id, no entry and no hooks.
 */
export interface UnreadableMod {
  readonly dir: string;
  readonly issues: readonly ModFileIssue[];
}

export type ModReadResult =
  | { readonly ok: true; readonly mod: LoadedModFromDisk }
  | { readonly ok: false; readonly failure: UnreadableMod };

/** Files a mod directory never contributes. */
const IGNORED = new Set(['node_modules', '.git']);

/** Extensions worth reading. Anything else is not something the host can use. */
const READABLE = /\.(js|json|txt|md)$/;

function walk(root: string, prefix: string, out: Record<string, string>): void {
  for (const entry of readdirSync(root).sort()) {
    if (entry.startsWith('.') || IGNORED.has(entry)) continue;
    const full = join(root, entry);
    const rel = prefix ? posix.join(prefix, entry) : entry;
    if (statSync(full).isDirectory()) {
      walk(full, rel, out);
      continue;
    }
    if (!READABLE.test(entry)) continue;
    out[rel] = readFileSync(full, 'utf8');
  }
}

/** List mod folder names under one target, sorted. */
export function listMods(root: string, target: ModTarget): string[] {
  const dir = join(root, target);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => existsSync(join(dir, entry, MANIFEST_FILE)))
    .sort();
}

/** Read one mod directory. Never throws: problems come back as issues. */
export function readMod(dir: string): ModReadResult | null {
  const issues: ModFileIssue[] = [];
  const manifestPath = join(dir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      failure: {
        dir,
        issues: [
          {
            file: MANIFEST_FILE,
            code: 'mod_bad_json',
            message: error instanceof Error ? error.message : String(error),
            severity: 'error',
          },
        ],
      },
    };
  }

  const parsed = modManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        dir,
        issues: parsed.error.issues.map((issue) => ({
          file: MANIFEST_FILE,
          code: 'mod_bad_manifest' as const,
          message: `${issue.path.join('.') || '<root>'}: ${issue.message}`,
          severity: 'error' as const,
        })),
      },
    };
  }

  const manifest = parsed.data;
  const files: Record<string, string> = {};
  walk(dir, '', files);

  if (files[manifest.entry] === undefined) {
    issues.push({
      file: manifest.entry,
      code: 'mod_no_entry',
      message: `entry ${JSON.stringify(manifest.entry)} does not exist in the mod`,
      severity: 'error',
    });
  }

  const hash = hashMod(manifest, files);

  // The folder name is the address. A mismatch means tooling and the manifest disagree about which
  // mod this is.
  const folder = dir.split(sep).filter(Boolean).pop() ?? '';
  const identity = parseModIdentity(folder);
  if (!identity) {
    issues.push({
      file: MANIFEST_FILE,
      code: 'mod_folder_mismatch',
      message: `folder ${JSON.stringify(folder)} is not named <id>-<hash>`,
      severity: 'warning',
    });
  } else if (identity.id !== manifest.id) {
    issues.push({
      file: MANIFEST_FILE,
      code: 'mod_folder_mismatch',
      message: `folder says id ${JSON.stringify(identity.id)} but the manifest says ${JSON.stringify(manifest.id)}`,
      severity: 'error',
    });
  }

  // Drift warns rather than blocks. The hash sits in a file the author can edit, so refusing to
  // load only teaches people to edit the hash.
  if (manifest.hash !== hash) {
    issues.push({
      file: MANIFEST_FILE,
      code: 'mod_hash_drift',
      message: `manifest claims ${manifest.hash} but the contents hash to ${hash} — run \`npm run mod:hash\` to re-stamp it`,
      severity: 'warning',
    });
  }

  return { ok: true, mod: { manifest, files, hash, dir, issues } };
}

export interface LoadedMods {
  readonly mods: readonly LoadedModFromDisk[];
  /** Directories that hold something mod-shaped but could not be read. */
  readonly failures: readonly UnreadableMod[];
}

/**
 * Read every mod under a root, both targets, in sorted order. Unreadable mods are reported rather
 * than dropped: a mod that silently fails to appear looks exactly like one that was never
 * installed.
 */
export function loadModsFrom(root: string): LoadedMods {
  const mods: LoadedModFromDisk[] = [];
  const failures: UnreadableMod[] = [];
  for (const target of ['editor', 'engine'] as const) {
    for (const name of listMods(root, target)) {
      const result = readMod(join(root, target, name));
      if (!result) continue;
      if (result.ok) mods.push(result.mod);
      else failures.push(result.failure);
    }
  }
  return { mods, failures };
}

/** Format issues for a terminal or the editor's problem list. */
export function formatModIssues(issues: readonly ModFileIssue[]): string {
  return issues.map((issue) => `  ${issue.file}: ${issue.message} [${issue.code}]`).join('\n');
}
