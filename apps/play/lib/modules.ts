/** Modules, from stored bytes to something playable. */

import { compileModule, formatIssues } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import type { WorldEnvelope, WorldMeta } from '@dm/library';

/** A world on offer. */
export interface ModuleChoice {
  readonly key: string;
  /** The library row this came from, or null when the browser has no storage. */
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
