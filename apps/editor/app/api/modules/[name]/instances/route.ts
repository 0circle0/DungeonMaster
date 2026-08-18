/**
 * Recording that an entry came from a prefab.
 *
 * Separate from the document: the entry itself is ordinary content and goes to
 * disk with everything else, while the link is project bookkeeping and has
 * nowhere to live inside a `.strict()` schema.
 */

import { NextResponse } from 'next/server';
import { addInstanceLink, isProject } from '@/lib/modulesOnDisk';
import type { PrefabLink } from '@dm/module';

const NAME = /^[a-z][a-z0-9_]*$/;

export async function POST(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!NAME.test(name)) return NextResponse.json({ error: 'bad module name' }, { status: 400 });
  if (!isProject(name)) {
    return NextResponse.json(
      { error: `${name} has no project/ — prefabs need somewhere to live` },
      { status: 409 },
    );
  }

  let body: { collection?: string; entryId?: string; link?: PrefabLink };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'body is not JSON' }, { status: 400 });
  }

  const { collection, entryId, link } = body;
  if (!collection || !entryId || !link?.id) {
    return NextResponse.json({ error: 'need a collection, an entry id, and a link' }, { status: 400 });
  }

  try {
    addInstanceLink(name, collection, entryId, link);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
