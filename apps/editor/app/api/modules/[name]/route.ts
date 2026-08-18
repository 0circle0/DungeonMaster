/**
 * Serves bundled modules from `modules/` as new-module templates. The name is
 * checked against the directory listing, so the route can never read outside
 * the modules directory.
 */

import { NextResponse } from 'next/server';
import { lintModule } from '@dm/module';
import { readModuleByName, writeModule } from '@/lib/modulesOnDisk';

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return NextResponse.json({ error: 'bad module name' }, { status: 400 });
  }
  const doc = readModuleByName(name);
  if (!doc) return NextResponse.json({ error: `no bundled module "${name}"` }, { status: 404 });
  return NextResponse.json(doc);
}

/**
 * Save the module back to `modules/<name>/`.
 *
 * Refuses a document with errors. The studio already shows them, so a save that
 * lands anyway would only produce a module the game cannot load — and this
 * writes over a file the repository is tracking.
 */
export async function PUT(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return NextResponse.json({ error: 'bad module name' }, { status: 400 });
  }

  let doc: Record<string, unknown>;
  try {
    doc = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'body is not JSON' }, { status: 400 });
  }

  const errors = lintModule(doc).diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: `${errors.length} error${errors.length === 1 ? '' : 's'} — fix them before saving`,
        issues: errors.slice(0, 5).map((d) => `${d.path}: ${d.message}`),
      },
      { status: 422 },
    );
  }

  try {
    const result = writeModule(name, doc);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
