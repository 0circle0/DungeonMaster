/**
 * Serves bundled modules from `modules/` as new-module templates. The name is
 * checked against the directory listing, so the route can never read outside
 * the modules directory.
 */

import { NextResponse } from 'next/server';
import { readModuleByName } from '@/lib/modulesOnDisk';

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return NextResponse.json({ error: 'bad module name' }, { status: 400 });
  }
  const doc = readModuleByName(name);
  if (!doc) return NextResponse.json({ error: `no bundled module "${name}"` }, { status: 404 });
  return NextResponse.json(doc);
}
