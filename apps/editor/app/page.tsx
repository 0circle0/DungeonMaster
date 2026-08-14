/**
 * Entry point. The bundled starter module is read on the server so the editor
 * opens with something real in it rather than an empty document.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Editor } from './Editor';
import type { ModuleDoc } from '@/lib/store';

function loadStarter(): { doc: ModuleDoc; name: string } {
  const candidates = ['greenmarch', 'core_fantasy', 'minimal'];
  for (const name of candidates) {
    const path = join(process.cwd(), '..', '..', 'modules', name, 'module.json');
    if (existsSync(path)) {
      return { doc: JSON.parse(readFileSync(path, 'utf8')) as ModuleDoc, name: `${name}.json` };
    }
  }
  return { doc: {}, name: 'module.json' };
}

export default function Page() {
  const { doc, name } = loadStarter();
  return <Editor initialDoc={doc} initialName={name} />;
}
