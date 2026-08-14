/**
 * Entry point.
 *
 * The shipped modules are read on the server from the same `modules/` directory
 * the terminal CLI reads — deliberately one directory, so "the web app and
 * `npm run play` are the same game" is a fact rather than a hope. The raw JSON
 * crosses to the client and is compiled there: a `CompiledModule` is a class
 * holding a Map index and cannot cross the RSC boundary.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Play } from './Play';
import type { ModuleChoice } from '@/lib/modules';

function loadShipped(): ModuleChoice[] {
  const root = join(process.cwd(), '..', '..', 'modules');
  if (!existsSync(root)) return [];

  const out: ModuleChoice[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, 'module.json');
    if (!existsSync(path)) continue;
    try {
      const doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
      out.push({
        id: String(doc['id'] ?? entry.name),
        title: String(meta['title'] ?? entry.name),
        description: String(meta['description'] ?? ''),
        doc,
      });
    } catch {
      // A malformed module simply is not offered; the editor is where it gets fixed.
    }
  }

  // The reference module first, so "New game" with no thought lands somewhere good.
  return out.sort((a, b) =>
    Number(b.id === 'greenmarch') - Number(a.id === 'greenmarch') || a.title.localeCompare(b.title));
}

export default function Page() {
  return <Play shipped={loadShipped()} />;
}
