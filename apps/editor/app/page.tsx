/** Entry point — the studio. */

import type { Metadata } from 'next';
import { Studio } from './studio/Studio';

export const metadata: Metadata = {
  title: 'DungeonMaster — studio',
  description: 'World-first module authoring: a scene tree, a live map preview, and an inspector.',
};

export default function Page() {
  return <Studio />;
}
