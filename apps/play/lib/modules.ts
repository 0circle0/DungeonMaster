/**
 * Modules, from raw JSON to something playable.
 *
 * Raw documents cross the server→client boundary; compiling happens here, in
 * the browser — the editor already proves `compileModule` runs there. A module
 * exported from the editor loads through the same door.
 */

import { compileModule, formatIssues } from '@dm/module';
import type { CompiledModule } from '@dm/module';

/** A module on offer: shipped from `modules/`, or dropped in by the player. */
export interface ModuleChoice {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly doc: Record<string, unknown>;
}

export type CompileOutcome =
  | { readonly ok: true; readonly module: CompiledModule }
  | { readonly ok: false; readonly error: string };

export function compileDoc(doc: unknown): CompileOutcome {
  const result = compileModule(doc);
  if (!result.ok) return { ok: false, error: formatIssues(result.errors) };
  return { ok: true, module: result.module };
}
