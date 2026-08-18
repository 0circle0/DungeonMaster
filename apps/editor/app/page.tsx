/**
 * Entry point — the studio. A bundled starter module is read on the server so
 * the editor opens with something real in it rather than an empty document.
 */

import type { Metadata } from 'next';
import { listModuleNames, readModuleByName } from '@/lib/modulesOnDisk';
import { readInstalledMods } from '@/lib/modsOnDisk';
import { readAuthoring, NO_AUTHORING } from '@/lib/modulesOnDisk';
import { Studio } from './studio/Studio';

export const metadata: Metadata = {
  title: 'DungeonMaster — studio',
  description: 'World-first module authoring: a scene tree, a live map preview, and an inspector.',
};

export default function Page() {
  const names = listModuleNames();
  const starter = ['greenmarch', 'core_fantasy', 'minimal'].find((name) => names.includes(name)) ?? names[0];
  const doc = starter ? readModuleByName(starter) : null;

  return (
    <Studio
      initialDoc={doc ?? {}}
      initialName={starter ? `${starter}.json` : 'untitled.module.json'}
      templates={names}
      mods={readInstalledMods()}
      authoring={starter ? readAuthoring(starter) : NO_AUTHORING}
    />
  );
}
