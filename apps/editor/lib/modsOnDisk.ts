/**
 * Reading mods for the studio.
 *
 * Server-only, mirroring `modulesOnDisk.ts`. The studio wants both targets:
 * editor mods run here, and engine mods are listed read-only so an author can
 * see whether the mods their game pins are actually installed.
 */

import { join } from 'node:path';
import { loadModsFrom } from '@dm/mods/load';
import type { ModWire } from './modWire';

const MODS_DIR = join(process.cwd(), '..', '..', 'mods');

export function readInstalledMods(): ModWire[] {
  try {
    return loadModsFrom(MODS_DIR).mods.map((mod) => ({
      manifest: mod.manifest,
      files: mod.files,
      hash: mod.hash,
      issues: mod.issues.map((issue) => ({
        message: issue.message,
        severity: issue.severity,
        code: issue.code,
      })),
    }));
  } catch {
    // No `mods/` at all is the ordinary case for a fresh checkout.
    return [];
  }
}
