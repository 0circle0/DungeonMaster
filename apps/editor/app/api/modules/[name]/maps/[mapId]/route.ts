/**
 * The editor's first write path: saving a painted static map to disk.
 *
 * `PUT` takes an assembled `world.maps` entry (cells inline), validates it
 * against the schema, and writes the folder form — `maps/<mapId>/map.json`
 * plus one CSV per layer — under the named bundled module. Both path segments
 * are validated against the id grammar and the module against the directory
 * listing, so the route cannot write outside `modules/`.
 */

import { NextResponse } from 'next/server';
import { staticMapSchema } from '@dm/module';
import { writeStaticMap, deleteStaticMap } from '@/lib/modulesOnDisk';

const ID = /^[a-z][a-z0-9_]*$/;

export async function PUT(
  request: Request,
  context: { params: Promise<{ name: string; mapId: string }> },
) {
  const { name, mapId } = await context.params;
  if (!ID.test(name) || !ID.test(mapId)) {
    return NextResponse.json({ error: 'bad module or map name' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const parsed = staticMapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'not a valid static map',
        issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      },
      { status: 400 },
    );
  }
  if (parsed.data.id !== mapId) {
    return NextResponse.json({ error: 'map id must match the URL' }, { status: 400 });
  }

  try {
    // The raw body is written, not the parsed copy: the raw authored document
    // is the source of truth, and zod defaults must not leak into the files.
    const { written } = writeStaticMap(name, mapId, body as Record<string, unknown>);
    return NextResponse.json({ written });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ name: string; mapId: string }> },
) {
  const { name, mapId } = await context.params;
  if (!ID.test(name) || !ID.test(mapId)) {
    return NextResponse.json({ error: 'bad module or map name' }, { status: 400 });
  }
  const removed = deleteStaticMap(name, mapId);
  if (!removed) return NextResponse.json({ error: 'no such map folder' }, { status: 404 });
  return NextResponse.json({ removed: true });
}
