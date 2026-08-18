/**
 * Entry point — the studio. A bundled starter module is read on the server so
 * the editor opens with something real in it rather than an empty document.
 */

import type { Metadata } from 'next';
import { listModuleNames, readModuleByName } from '@/lib/modulesOnDisk';
import { readInstalledMods } from '@/lib/modsOnDisk';
import { readAuthoring, NO_AUTHORING } from '@/lib/modulesOnDisk';
import { readDraft } from '@/lib/drafts';
import { cookies } from 'next/headers';
import { MODULE_COOKIE } from '@/lib/placeCookie';
import { Studio } from './studio/Studio';

/**
 * Rendered per request, not once at build.
 *
 * This page reads `modules/` from disk — the starter document, the project's
 * prefabs, and any recovered draft. Next prerenders a page like this by
 * default, which bakes whatever was on disk when the editor was *built* and
 * then serves it forever: edits made in one session would be invisible in the
 * next, and a recovered draft could never appear at all, because it did not
 * exist when the page was rendered.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'DungeonMaster — studio',
  description: 'World-first module authoring: a scene tree, a live map preview, and an inspector.',
};

export default async function Page() {
  const names = listModuleNames();

  // The module someone was last in wins over the default. Chosen here rather
  // than on the client so the right document renders first, instead of the
  // wrong one appearing and being swapped out a moment later.
  const remembered = (await cookies()).get(MODULE_COOKIE)?.value;
  const starter =
    (remembered && names.includes(remembered) ? remembered : null) ??
    ['greenmarch', 'core_fantasy', 'minimal'].find((name) => names.includes(name)) ??
    names[0];
  const doc = starter ? readModuleByName(starter) : null;

  return (
    <Studio
      initialDoc={doc ?? {}}
      initialName={starter ? `${starter}.json` : 'untitled.module.json'}
      templates={names}
      mods={readInstalledMods()}
      authoring={starter ? readAuthoring(starter) : NO_AUTHORING}
      draft={starter ? readDraft(starter) : null}
    />
  );
}
