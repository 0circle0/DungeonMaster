/**
 * Work in progress, kept where a crash cannot reach it.
 *
 * The studio saves as you type rather than when you ask, which is the only
 * behaviour that makes sense for a tool people leave open for hours — but the
 * files it saves *to* are the ones the game loads, and those have to stay
 * valid. A half-typed id is a normal state of a text box and a broken module.
 *
 * So there are two destinations. A document that validates goes to its real
 * files. One that does not goes here instead, and comes back when the module is
 * reopened. Nothing an author types is ever only in memory.
 *
 * Drafts live outside `modules/` and outside git: they are somebody's
 * half-finished sentence, not content.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DRAFTS_DIR = join(process.cwd(), '..', '..', '.studio');

export interface Draft {
  /** ISO timestamp, so the recovery notice can say how old it is. */
  readonly savedAt: string;
  readonly doc: Record<string, unknown>;
}

function pathFor(name: string): string {
  return join(DRAFTS_DIR, `${name}.draft.json`);
}

export function writeDraft(name: string, doc: Record<string, unknown>): void {
  mkdirSync(DRAFTS_DIR, { recursive: true });
  const draft: Draft = { savedAt: new Date().toISOString(), doc };
  writeFileSync(pathFor(name), `${JSON.stringify(draft)}\n`);
}

export function readDraft(name: string): Draft | null {
  const path = pathFor(name);
  if (!existsSync(path)) return null;
  try {
    const draft = JSON.parse(readFileSync(path, 'utf8')) as Draft;
    return draft.doc && typeof draft.doc === 'object' ? draft : null;
  } catch {
    // A draft that will not parse is worse than none: it cannot be restored and
    // reporting it would only offer the author a choice they cannot act on.
    return null;
  }
}

/** Called once the real files hold the same work. */
export function clearDraft(name: string): void {
  rmSync(pathFor(name), { force: true });
}
