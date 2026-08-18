/**
 * Modules, from stored bytes to something playable.
 *
 * Nothing arrives from a server any more. A world comes out of the library on
 * this machine, or out of a file the player picked, and is compiled here in the
 * browser — the editor already proved `compileModule` runs in one.
 */

import { compileModule, formatIssues } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import type { WorldEnvelope, WorldMeta } from '@dm/library';

/**
 * A world on offer.
 *
 * `key` is composite — `world:<uuid>` — and is what React keys the session on.
 * It cannot be the module id: two worlds can both call themselves `aurendel`
 * the moment somebody imports a copy of one they already have, and keying on
 * the id would carry a live session across the switch between them.
 */
export interface ModuleChoice {
  readonly key: string;
  /**
   * The library row this came from, or null when it is being played without
   * being stored — which only happens where the browser has no storage at all.
   * Save slots hang off this, so two worlds sharing a module id keep separate
   * saved games.
   */
  readonly worldKey: string | null;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly doc: Record<string, unknown>;
}

export function choiceOf(meta: WorldMeta, envelope: WorldEnvelope): ModuleChoice {
  return {
    key: `world:${meta.key}`,
    worldKey: meta.key,
    id: meta.moduleId,
    title: meta.title,
    description: meta.description,
    doc: envelope.doc,
  };
}

/** A world played without being stored: no library, so no key to hang saves on. */
export function transientChoice(envelope: WorldEnvelope): ModuleChoice {
  const id = typeof envelope.doc['id'] === 'string' ? envelope.doc['id'] : 'untitled';
  return {
    key: `transient:${id}`,
    worldKey: null,
    id,
    title: envelope.title,
    description: '',
    doc: envelope.doc,
  };
}

export type CompileOutcome =
  | { readonly ok: true; readonly module: CompiledModule }
  | { readonly ok: false; readonly error: string };

export function compileDoc(doc: unknown): CompileOutcome {
  const result = compileModule(doc);
  if (!result.ok) return { ok: false, error: formatIssues(result.errors) };
  return { ok: true, module: result.module };
}
