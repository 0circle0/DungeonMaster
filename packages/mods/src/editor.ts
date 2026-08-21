/**
 * The editor mod contract.
 *
 * An engine mod changes how a game plays; an editor mod changes how a game is authored. They are
 * separate targets because they run against different hosts, and a feature normally ships as one of
 * each — an editor mod adds a field, and its paired engine mod reads it.
 *
 * Why widgets are described rather than rendered
 *
 * Mod code runs inside QuickJS, which has no DOM and no React, so it returns a description of a
 * component and the host renders it with the editor's own components. That covers extra fields,
 * tables, buttons and text. It cannot express a canvas, a map overlay, a graph, drag-and-drop, or
 * per-keystroke feedback; an editor mod that needs those needs a core editor change.
 *
 * Why fields write into `extra`
 *
 * `schema/common.ts` documents `extra` as the supported way to exceed what the format ships with. A
 * mod adding `morale` to a monster writes into that bag, so the module still validates and hashes
 * stably against a stock engine.
 */

import { z } from 'zod';

/** Editor hooks. Smaller than the engine's, and for a different job. */
export type EditorHookName =
  /** Extra validation over the whole document, surfaced in the problems console. */
  | 'editor.lint'
  /** Extra fields on whatever the author has selected. */
  | 'editor.fields'
  /** Named actions offered in the Mods dock. */
  | 'editor.commands'
  /** A panel the mod draws, refreshed on every interaction. */
  | 'editor.panel';

export const EDITOR_HOOK_NAMES: readonly EditorHookName[] = [
  'editor.lint',
  'editor.fields',
  'editor.commands',
  'editor.panel',
];

export function isEditorHookName(value: string): value is EditorHookName {
  return (EDITOR_HOOK_NAMES as readonly string[]).includes(value);
}

/**
 * A field description. A subset of the editor's own `FieldSpec`, which is already plain data, so
 * the existing `Field` component renders a mod's field with no new rendering code.
 */
export const modFieldSchema = z
  .object({
    /** Where the value lives, relative to the selected entry. Usually under `extra`. */
    path: z.array(z.union([z.string(), z.number().int()])).min(1).max(8),
    label: z.string().min(1).max(120),
    kind: z.enum(['string', 'number', 'boolean', 'select']),
    // `.optional()` rather than `.default()` so the schema's input and output types stay identical:
    // `modWidgetSchema` is recursive and needs an explicit `ZodType<ModWidget>` annotation, which a
    // default would break. Readers use `?? []` / `?? ''`.
    /** For `select`. */
    options: z.array(z.string()).max(200).optional(),
    help: z.string().max(400).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict();

export type ModField = z.infer<typeof modFieldSchema>;

/** A widget tree the host renders with the editor's own components. */
// The `| undefined` on every optional is `exactOptionalPropertyTypes`: zod's parsed output admits
// it, so the hand-written mirror has to as well.
export type ModWidget =
  | { readonly kind: 'text'; readonly text: string; readonly tone?: 'note' | 'warn' | 'error' | undefined }
  | { readonly kind: 'field'; readonly field: ModField }
  | { readonly kind: 'button'; readonly id: string; readonly label: string; readonly danger?: boolean | undefined }
  | { readonly kind: 'table'; readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly kind: 'rows'; readonly children: readonly ModWidget[] };

// `z.lazy` plus an explicit annotation is how Zod expresses a recursive shape, and the trailing
// cast is what `dsl/schema.ts` does for the same reason: the defaults inside make the parsed output
// differ from the accepted input.
export const modWidgetSchema: z.ZodType<ModWidget> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text'), text: z.string().max(4000), tone: z.enum(['note', 'warn', 'error']).optional() }).strict(),
    z.object({ kind: z.literal('field'), field: modFieldSchema }).strict(),
    z.object({ kind: z.literal('button'), id: z.string().min(1).max(64), label: z.string().min(1).max(120), danger: z.boolean().optional() }).strict(),
    z.object({
      kind: z.literal('table'),
      columns: z.array(z.string().max(120)).max(12),
      rows: z.array(z.array(z.string().max(400)).max(12)).max(500),
    }).strict(),
    z.object({ kind: z.literal('rows'), children: z.array(modWidgetSchema).max(200) }).strict(),
  ]),
);

/** Same shape as the editor's own diagnostics, minus what the host fills in. */
export const modDiagnosticSchema = z
  .object({
    severity: z.enum(['error', 'warning', 'info']),
    code: z.string().min(1).max(64),
    path: z.string().max(400),
    message: z.string().min(1).max(1000),
    hint: z.string().max(1000).nullable().default(null),
  })
  .strict();

export type ModDiagnostic = z.infer<typeof modDiagnosticSchema>;

/** A document edit. Maps one-to-one onto the editor's `setAt` / `deleteAt`. */
export const modPatchSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), path: z.array(z.union([z.string(), z.number().int()])).min(1).max(16), value: z.unknown() }).strict(),
  z.object({ op: z.literal('delete'), path: z.array(z.union([z.string(), z.number().int()])).min(1).max(16) }).strict(),
]);

export type ModPatch = z.infer<typeof modPatchSchema>;

export const modCommandSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(120),
    group: z.string().max(64).default(''),
  })
  .strict();

export type ModCommand = z.infer<typeof modCommandSchema>;

export const editorDirectiveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('diagnostics'), diagnostics: z.array(modDiagnosticSchema).max(500) }).strict(),
  z.object({ kind: z.literal('fields'), fields: z.array(modFieldSchema).max(100) }).strict(),
  z.object({ kind: z.literal('commands'), commands: z.array(modCommandSchema).max(100) }).strict(),
  z.object({ kind: z.literal('widget'), root: modWidgetSchema }).strict(),
  /** Edits land in the editor's existing undo stack, so a mod transform is undoable. */
  z.object({ kind: z.literal('patch'), patches: z.array(modPatchSchema).max(2000) }).strict(),
]);

export type EditorDirective = z.infer<typeof editorDirectiveSchema>;
export const editorDirectivesSchema = z.array(editorDirectiveSchema);
