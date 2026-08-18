/**
 * The autosave destination for a document that does not yet validate.
 *
 * Separate from `PUT /api/modules/[name]` on purpose: that one refuses invalid
 * work, because it writes the files the game loads. This one accepts anything,
 * because the alternative is losing it.
 */

import { NextResponse } from 'next/server';
import { writeDraft, clearDraft } from '@/lib/drafts';

const NAME = /^[a-z][a-z0-9_]*$/;

export async function PUT(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!NAME.test(name)) return NextResponse.json({ error: 'bad module name' }, { status: 400 });

  let doc: Record<string, unknown>;
  try {
    doc = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'body is not JSON' }, { status: 400 });
  }

  writeDraft(name, doc);
  return NextResponse.json({ ok: true });
}

/**
 * The same thing, for `navigator.sendBeacon`.
 *
 * A tab closing mid-delay is the exact window autosave exists to close, and
 * `fetch` does not survive teardown where a beacon does — but a beacon can only
 * POST. Without this the last edit before a close would be dropped, silently,
 * which is the failure the whole mechanism is meant to prevent.
 */
export const POST = PUT;

export async function DELETE(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!NAME.test(name)) return NextResponse.json({ error: 'bad module name' }, { status: 400 });
  clearDraft(name);
  return NextResponse.json({ ok: true });
}
