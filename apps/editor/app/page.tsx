/**
 * Entry point — the studio.
 *
 * A static shell, and deliberately nothing else. This page used to read
 * `modules/` from disk on every request: the starter document, its prefabs, its
 * recovered draft, and a cookie deciding which module to open. All of it now
 * happens in the browser against the author's own library, which is what lets
 * the studio be served by anything that can serve a file — and what stops a
 * deployment being a shared, unauthenticated editor of the repository's own
 * content.
 */

import type { Metadata } from 'next';
import { Studio } from './studio/Studio';

export const metadata: Metadata = {
  title: 'DungeonMaster — studio',
  description: 'World-first module authoring: a scene tree, a live map preview, and an inspector.',
};

export default function Page() {
  return <Studio />;
}
