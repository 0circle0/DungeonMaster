/**
 * Entry point.
 *
 * The shipped modules are read on the server from the same `modules/` directory
 * the terminal CLI reads — deliberately one directory, so "the web app and
 * `npm run play` are the same game" is a fact rather than a hope. The raw JSON
 * crosses to the client and is compiled there: a `CompiledModule` is a class
 * holding a Map index and cannot cross the RSC boundary.
 */

import { join } from 'node:path';
import { resolveExtends } from '@dm/module';
import { readAssembledModule, siblingLoader, listModules } from '@dm/module/load';
import { Play } from './Play';
import type { ModuleChoice } from '@/lib/modules';

function loadShipped(): ModuleChoice[] {
  const root = join(process.cwd(), '..', '..', 'modules');

  const out: ModuleChoice[] = [];
  for (const name of listModules(root)) {
    try {
      // Assembled (static map folders inlined) and `extends`-resolved on the
      // server; the plain JSON that results crosses the RSC boundary exactly
      // as the raw document used to.
      const assembled = readAssembledModule(join(root, name));
      if (assembled.issues.length > 0) continue;
      const resolved = resolveExtends(assembled.doc, siblingLoader(root));
      if (!resolved.ok) continue;
      const doc = resolved.document;
      const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
      out.push({
        id: String(doc['id'] ?? name),
        title: String(meta['title'] ?? name),
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
