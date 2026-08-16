/**
 * Editor mods at work.
 *
 * The engine's `ModRuntime` applies directives to a `GameState`; this one
 * applies them to the authored document and the studio's own surfaces. Kept in
 * the app rather than in `@dm/mods` because everything it produces —
 * diagnostics, field specs, patches — is shaped for this editor.
 *
 * Every call is wrapped: a mod that throws produces a diagnostic against
 * itself, never a broken studio.
 */

import {
  editorDirectivesSchema,
  type EditorDirective,
  type ModCommand,
  type ModDiagnostic,
  type ModField,
  type ModPatch,
  type ModWidget,
} from '@dm/mods';
import type { LoadedMod, SandboxHost } from '@dm/mods';

import type { Diagnostic } from '@dm/module';
import type { ModuleDoc, Path } from './store';

export interface EditorModRuntime {
  readonly mods: readonly LoadedMod[];
  /** Extra problems for the console, already prefixed with the mod that raised them. */
  lint(doc: ModuleDoc): readonly Diagnostic[];
  /** Extra fields for whatever is selected. */
  fields(doc: ModuleDoc, selection: { path: Path; value: unknown } | null): readonly OwnedField[];
  commands(doc: ModuleDoc): readonly OwnedCommand[];
  /** Run a command, returning edits to apply. */
  runCommand(doc: ModuleDoc, modId: string, commandId: string): readonly ModPatch[];
  /** A mod's panel, refreshed after every interaction. */
  panel(doc: ModuleDoc, modId: string, event?: { widgetId: string }): ModWidget | null;
}

export interface OwnedField extends ModField {
  readonly modId: string;
}

export interface OwnedCommand extends ModCommand {
  readonly modId: string;
}

const NO_DIRECTIVES: readonly EditorDirective[] = [];

export function createEditorModRuntime(
  host: SandboxHost,
  mods: readonly LoadedMod[],
): EditorModRuntime {
  const declares = (mod: LoadedMod, hook: string) =>
    mod.manifest.hooks.some((decl) => decl.hook === hook);

  /**
   * One crossing. Never throws — a broken mod must not be able to stop the
   * studio from rendering the document the author is trying to fix.
   */
  function call(
    mod: LoadedMod,
    hook: string,
    payload: unknown,
    onFailure: (message: string) => void,
  ): readonly EditorDirective[] {
    if (host.quarantined(mod.manifest.id)) return NO_DIRECTIVES;

    const result = host.call({
      mod: mod.manifest.id,
      hook,
      payload: JSON.stringify(payload),
      // Editor hooks are not part of a game's replay, so there is no derived
      // stream to draw from. A mod that wants randomness while authoring can
      // have it; nothing downstream depends on the sequence.
      random: () => 0.5,
      query: () => null,
    });

    if (!result.ok) {
      onFailure(`${mod.manifest.id} failed on ${hook}: ${result.error}`);
      return NO_DIRECTIVES;
    }

    const parsed = editorDirectivesSchema.safeParse(result.directives);
    if (!parsed.success) {
      onFailure(
        `${mod.manifest.id} returned something ${hook} cannot use: ` +
          parsed.error.issues.map((issue: { message: string }) => issue.message).join('; '),
      );
      return NO_DIRECTIVES;
    }
    return parsed.data;
  }

  return {
    mods,

    lint(doc) {
      const out: Diagnostic[] = [];
      for (const mod of mods) {
        if (!declares(mod, 'editor.lint')) continue;
        const fail = (message: string) =>
          out.push({ severity: 'warning', code: 'mod_failed', path: '', message, hint: null, position: null, excerpt: null });

        for (const directive of call(mod, 'editor.lint', { doc, meta: metaOf(doc) }, fail)) {
          if (directive.kind !== 'diagnostics') continue;
          for (const diagnostic of directive.diagnostics) {
            // Prefixed so a reader can tell at a glance which mod is
            // complaining — an unattributed complaint from a mod reads as an
            // engine bug.
            out.push(toDiagnostic(mod.manifest.id, diagnostic));
          }
        }
      }
      return out;
    },

    fields(doc, selection) {
      const out: OwnedField[] = [];
      for (const mod of mods) {
        if (!declares(mod, 'editor.fields')) continue;
        const payload = {
          meta: metaOf(doc),
          selection: selection ? { path: selection.path, value: selection.value } : null,
        };
        for (const directive of call(mod, 'editor.fields', payload, () => {})) {
          if (directive.kind !== 'fields') continue;
          for (const field of directive.fields) out.push({ ...field, modId: mod.manifest.id });
        }
      }
      return out;
    },

    commands(doc) {
      const out: OwnedCommand[] = [];
      for (const mod of mods) {
        if (!declares(mod, 'editor.commands')) continue;
        for (const directive of call(mod, 'editor.commands', { meta: metaOf(doc) }, () => {})) {
          if (directive.kind !== 'commands') continue;
          for (const command of directive.commands) out.push({ ...command, modId: mod.manifest.id });
        }
      }
      return out;
    },

    runCommand(doc, modId, commandId) {
      const mod = mods.find((m) => m.manifest.id === modId);
      if (!mod) return [];
      const out: ModPatch[] = [];
      for (const directive of call(mod, 'editor.commands', { meta: metaOf(doc), doc, run: commandId }, () => {})) {
        if (directive.kind === 'patch') out.push(...directive.patches);
      }
      return out;
    },

    panel(doc, modId, event) {
      const mod = mods.find((m) => m.manifest.id === modId);
      if (!mod || !declares(mod, 'editor.panel')) return null;
      for (const directive of call(mod, 'editor.panel', { meta: metaOf(doc), doc, event: event ?? null }, () => {})) {
        if (directive.kind === 'widget') return directive.root;
      }
      return null;
    },
  };
}

function metaOf(doc: ModuleDoc): { id: string; version: string; title: string } {
  const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
  return {
    id: String(doc['id'] ?? ''),
    version: String(doc['version'] ?? ''),
    title: String(meta['title'] ?? ''),
  };
}

function toDiagnostic(modId: string, diagnostic: ModDiagnostic): Diagnostic {
  return {
    severity: diagnostic.severity,
    // Prefixed so a reader can tell at a glance which mod is complaining. An
    // unattributed complaint from a mod reads as an engine bug.
    code: `mod:${modId}:${diagnostic.code}`,
    path: diagnostic.path,
    message: diagnostic.message,
    hint: diagnostic.hint,
    // The host fills these: a mod has no view of the source text, so it cannot
    // know where in the file its complaint lands.
    position: null,
    excerpt: null,
  };
}
