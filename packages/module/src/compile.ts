/** Module compilation: validate, prove references resolve, index, and hash. */

import { z } from 'zod';
import { hash64, stableStringify } from '@dm/core';
import { gameModuleSchema, COLLECTION_PATHS } from './schema/module.js';
import type { GameModule, CollectionPath } from './schema/module.js';
import { refTarget } from './schema/common.js';
import { SYSTEM_TEXT } from './schema/systemText.js';

export interface CompileIssue {
  /** Dotted location in the document, e.g. `content.monsters[2].loot`. */
  readonly path: string;
  readonly message: string;
  readonly code:
    | 'schema'
    | 'duplicate_id'
    | 'dangling_ref'
    | 'unknown_collection'
    | 'thin_text_pool'
    | 'missing_system_text'
    | 'blank_system_text'
    | 'system_text_placeholder'
    | 'unreachable_content'
    | 'duplicate_mod'
    | 'mod_required_editor';
}

/** Anything with an id; every indexed collection entry has one. */
interface Identified {
  readonly id: string;
}

/** A validated module with lookup tables built. */
export class CompiledModule {
  readonly source: GameModule;
  readonly warnings: readonly CompileIssue[];
  private readonly index: ReadonlyMap<string, ReadonlyMap<string, Identified>>;
  private cachedHash: string | null = null;

  constructor(
    source: GameModule,
    index: ReadonlyMap<string, ReadonlyMap<string, Identified>>,
    warnings: readonly CompileIssue[],
  ) {
    this.source = source;
    this.index = index;
    this.warnings = warnings;
  }

  /** Content hash — computed on first read, then kept. */
  get hash(): string {
    this.cachedHash ??= hashModule(this.source);
    return this.cachedHash;
  }

  /** `id@version`, the identity a save records. */
  get identity(): string {
    return `${this.source.id}@${this.source.version}`;
  }

  /** Look up a content entry, throwing if absent. */
  get<T = unknown>(collection: CollectionPath | string, id: string): T {
    const found = this.index.get(collection)?.get(id);
    if (found === undefined) {
      throw new Error(`no entry ${JSON.stringify(id)} in ${collection}`);
    }
    return found as T;
  }

  find<T = unknown>(collection: CollectionPath | string, id: string): T | undefined {
    return this.index.get(collection)?.get(id) as T | undefined;
  }

  all<T = unknown>(collection: CollectionPath | string): readonly T[] {
    const map = this.index.get(collection);
    return map ? ([...map.values()] as T[]) : [];
  }

  has(collection: CollectionPath | string, id: string): boolean {
    return this.index.get(collection)?.has(id) ?? false;
  }

  ids(collection: CollectionPath | string): readonly string[] {
    return [...(this.index.get(collection)?.keys() ?? [])];
  }
}

export type CompileResult =
  | { readonly ok: true; readonly module: CompiledModule; readonly warnings: readonly CompileIssue[] }
  | { readonly ok: false; readonly errors: readonly CompileIssue[] };

/** Below this many phrasings, players start noticing the repetition. */
const THIN_TEXT_POOL = 3;

/** Check the engine's own vocabulary. */
function checkSystemText(module: GameModule, errors: CompileIssue[]): void {
  const declared = module.narrative.systemText as Record<string, unknown>;

  for (const item of SYSTEM_TEXT) {
    const value = declared[item.key];
    const path = `narrative.systemText.${item.key}`;

    if (value === undefined) {
      if (item.tier === 'fragment') {
        errors.push({
          path,
          message:
            `${JSON.stringify(item.key)} is missing, and other messages are built from it — ` +
            `without it they render with a hole where it should be. ${item.doc} ` +
            `The shipped wording is ${JSON.stringify(item.text)}.`,
          code: 'missing_system_text',
        });
      }
      continue;
    }

    // Only a literal string can be blank or lose a placeholder here.
    if (typeof value !== 'string') continue;

    if (value.trim() === '') {
      errors.push({
        path,
        message: `${JSON.stringify(item.key)} is blank; a message that says nothing reads as a broken command`,
        code: 'blank_system_text',
      });
      continue;
    }

    const missing = item.placeholders.filter((name: string) => !value.includes(`{${name}}`));
    if (missing.length > 0) {
      errors.push({
        path,
        message:
          `${JSON.stringify(item.key)} no longer has ${missing.map((name: string) => `{${name}}`).join(', ')}, ` +
          `so the sentence loses what it was carrying`,
        code: 'system_text_placeholder',
      });
    }
  }
}

/** Read a `section.collection` path off the document. */
function collectionAt(module: GameModule, path: string): Identified[] {
  const [section, name] = path.split('.') as [keyof GameModule, string];
  const container = module[section] as Record<string, unknown> | undefined;
  const value = container?.[name];
  return Array.isArray(value) ? (value as Identified[]) : [];
}

/** One reference found in a document. */
export interface RefSite {
  readonly path: string;
  readonly target: string;
  readonly id: string;
  readonly kind: 'value' | 'key';
}

/** Walk a Zod schema alongside a value, collecting every `ref:` marked string. */
export function collectRefs(
  schema: z.ZodTypeAny,
  value: unknown,
  path: string,
  out: RefSite[],
): void {
  if (value === undefined || value === null) return;

  const def = schema._def as { typeName?: string; [k: string]: unknown };

  switch (def.typeName) {
    // Unwrap the modifier types, which carry the real schema underneath.
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'ZodReadonly':
      collectRefs(def['innerType'] as z.ZodTypeAny, value, path, out);
      return;

    case 'ZodEffects':
      // `.refine()` / `.superRefine()` wrap the schema they validate.
      collectRefs(def['schema'] as z.ZodTypeAny, value, path, out);
      return;

    // DSL nodes are the only recursive schemas and contain no refs; skipping avoids infinite descent.
    case 'ZodLazy':
      return;

    case 'ZodObject': {
      if (typeof value !== 'object' || Array.isArray(value)) return;
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      for (const [key, child] of Object.entries(shape)) {
        const childValue = (value as Record<string, unknown>)[key];
        if (childValue !== undefined) {
          collectRefs(child, childValue, path ? `${path}.${key}` : key, out);
        }
      }
      return;
    }

    case 'ZodArray': {
      if (!Array.isArray(value)) return;
      const element = def['type'] as z.ZodTypeAny;
      value.forEach((item, i) => collectRefs(element, item, `${path}[${i}]`, out));
      return;
    }

    case 'ZodTuple': {
      if (!Array.isArray(value)) return;
      const items = def['items'] as z.ZodTypeAny[];
      value.forEach((item, i) => {
        const itemSchema = items[i];
        if (itemSchema) collectRefs(itemSchema, item, `${path}[${i}]`, out);
      });
      return;
    }

    case 'ZodRecord': {
      if (typeof value !== 'object' || Array.isArray(value)) return;
      const keyType = def['keyType'] as z.ZodTypeAny;
      const valueType = def['valueType'] as z.ZodTypeAny;
      // Record keys are frequently refs themselves, e.g. attribute bonuses keyed by attribute id.
      const keyTarget = refTarget(keyType.description);
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (keyTarget) out.push({ path: `${path}.${key}`, target: keyTarget, id: key, kind: 'key' });
        collectRefs(valueType, child, `${path}.${key}`, out);
      }
      return;
    }

    case 'ZodUnion': {
      // Find the branch that accepts this value, then descend into it.
      const options = def['options'] as z.ZodTypeAny[];
      for (const option of options) {
        if (option.safeParse(value).success) {
          collectRefs(option, value, path, out);
          return;
        }
      }
      return;
    }

    case 'ZodString': {
      const target = refTarget(schema.description);
      if (target && typeof value === 'string') out.push({ path, target, id: value, kind: 'value' });
      return;
    }

    default:
      return;
  }
}

/** Internal consistency of the `mods` section. */
function checkMods(module: GameModule, errors: CompileIssue[], warnings: CompileIssue[]): void {
  const mods = module.mods ?? [];
  const seen = new Set<string>();

  mods.forEach((entry, i) => {
    if (seen.has(entry.id)) {
      errors.push({
        path: `mods[${i}]`,
        message: `duplicate mod ${JSON.stringify(entry.id)} — two pins for one mod cannot both load`,
        code: 'duplicate_mod',
      });
      return;
    }
    seen.add(entry.id);

    // An editor mod is not consulted at play time, so `required` promises nothing.
    if (entry.target === 'editor' && entry.required) {
      warnings.push({
        path: `mods[${i}].required`,
        message: `${entry.id} is an editor mod, so \`required\` does not gate play — it only affects the studio`,
        code: 'mod_required_editor',
      });
    }
  });
}

/** Content hash, for change detection rather than security. */
export function hashModule(module: GameModule): string {
  return hash64(stableStringify(module));
}

/** Validate and compile a raw JSON document into a playable module. */
export function compileModule(raw: unknown): CompileResult {
  const parsed = gameModuleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: 'schema' as const,
      })),
    };
  }

  return compileParsed(parsed.data);
}

/** Compile a document that has already been through the schema. */
export function compileParsed(module: GameModule): CompileResult {
  const errors: CompileIssue[] = [];
  const warnings: CompileIssue[] = [];

  // Index every collection, rejecting duplicate ids as we go.
  const index = new Map<string, Map<string, Identified>>();
  for (const path of COLLECTION_PATHS) {
    const entries = collectionAt(module, path);
    const map = new Map<string, Identified>();
    entries.forEach((entry, i) => {
      if (map.has(entry.id)) {
        errors.push({
          path: `${path}[${i}]`,
          message: `duplicate id ${JSON.stringify(entry.id)} in ${path}`,
          code: 'duplicate_id',
        });
        return;
      }
      map.set(entry.id, entry);
    });
    index.set(path, map);
  }

  // Prove every reference resolves, so a typo cannot become a crash three rooms into a dungeon.
  const refs: RefSite[] = [];
  collectRefs(gameModuleSchema, module, '', refs);

  for (const reference of refs) {
    const targetIndex = index.get(reference.target);
    if (!targetIndex) {
      errors.push({
        path: reference.path,
        message: `reference points at unknown collection ${JSON.stringify(reference.target)}`,
        code: 'unknown_collection',
      });
      continue;
    }
    if (!targetIndex.has(reference.id)) {
      errors.push({
        path: reference.path,
        message: `${JSON.stringify(reference.id)} does not exist in ${reference.target}`,
        code: 'dangling_ref',
      });
    }
  }

  checkSystemText(module, errors);
  checkMods(module, errors, warnings);

  // A thin template pool is surfaced here rather than discovered in play.
  for (const pool of module.narrative.textGrammar) {
    if (pool.variants.length < THIN_TEXT_POOL) {
      warnings.push({
        path: `narrative.textGrammar.${pool.id}`,
        message: `only ${pool.variants.length} phrasing(s); players will notice the repetition (aim for ${THIN_TEXT_POOL}+)`,
        code: 'thin_text_pool',
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    module: new CompiledModule(module, index, warnings),
    warnings,
  };
}

/** Format issues for a terminal or the editor's problem list. */
export function formatIssues(issues: readonly CompileIssue[]): string {
  return issues
    .map((issue) => `  ${issue.path || '<root>'}: ${issue.message} [${issue.code}]`)
    .join('\n');
}
