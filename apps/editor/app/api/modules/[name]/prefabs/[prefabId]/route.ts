/**
 * Writing a prefab definition.
 *
 * Prefabs are authored files rather than derived ones — nothing in the document
 * mentions them — so they need their own way to disk. Unlike an entry, a prefab
 * is not validated against the module schema: it is a template, and the things
 * it produces are what get checked.
 */

import { NextResponse } from 'next/server';
import { writePrefab, isProject } from '@/lib/modulesOnDisk';

const NAME = /^[a-z][a-z0-9_]*$/;

export async function PUT(
  request: Request,
  context: { params: Promise<{ name: string; prefabId: string }> },
) {
  const { name, prefabId } = await context.params;
  if (!NAME.test(name) || !NAME.test(prefabId)) {
    return NextResponse.json({ error: 'bad name' }, { status: 400 });
  }
  if (!isProject(name)) {
    return NextResponse.json({ error: `${name} has no project/` }, { status: 409 });
  }

  let prefab: Record<string, unknown>;
  try {
    prefab = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'body is not JSON' }, { status: 400 });
  }

  // The id in the file has to be the id in its name, or a link that resolves by
  // id would find a prefab the filename disagrees with.
  if (prefab['id'] !== prefabId) {
    return NextResponse.json(
      { error: `the prefab says its id is ${JSON.stringify(prefab['id'])}, but the file is ${prefabId}` },
      { status: 400 },
    );
  }

  try {
    writePrefab(name, prefabId, prefab);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
