/** Parsing a module again after one field changed. */

import { z } from 'zod';
import { gameModuleSchema, COLLECTION_PATHS } from '../schema/module.js';
import type { GameModule, CollectionPath } from '../schema/module.js';
import { COLLECTION_SCHEMAS, COLLECTION_MIN_LENGTHS } from '../schema/collections.js';
import type { CompileIssue } from '../compile.js';

export type IncrementalParse =
  | { readonly ok: true; readonly data: GameModule }
  | { readonly ok: false; readonly errors: readonly CompileIssue[] };

/** Read a collection off a raw document without assuming anything about it. */
function rawCollection(doc: Record<string, unknown>, path: CollectionPath): unknown {
  const [section, name] = path.split('.') as [string, string];
  const container = doc[section];
  if (typeof container !== 'object' || container === null) return undefined;
  return (container as Record<string, unknown>)[name];
}

function issuesFrom(error: z.ZodError, prefix: string): CompileIssue[] {
  return error.issues.map((issue) => ({
    path: prefix ? [prefix, ...issue.path].join('.') : issue.path.join('.'),
    message: issue.message,
    code: 'schema' as const,
  }));
}

/** A document parser that remembers what it has already seen. */
export class ValidationIndex {
  /** Raw entry object → the parsed entry, with defaults applied. */
  private readonly entries = new WeakMap<object, unknown>();

  /** Raw collection array → its parsed elements, so an untouched list is free. */
  private readonly lists = new WeakMap<object, readonly unknown[]>();

  /** Misses since the last reset, for the dev-mode warning in the editor. */
  private misses = 0;

  /** How many entries had to be parsed on the last `parse()` call. */
  get lastMisses(): number {
    return this.misses;
  }

  /** Parse a document, reusing what has not changed. */
  parse(raw: unknown): IncrementalParse {
    this.misses = 0;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      const parsed = gameModuleSchema.safeParse(raw);
      return parsed.success
        ? { ok: true, data: parsed.data }
        : { ok: false, errors: issuesFrom(parsed.error, '') };
    }

    const doc = raw as Record<string, unknown>;
    const errors: CompileIssue[] = [];

    // The shell: the same document with every collection lifted out.
    const shell: Record<string, unknown> = { ...doc };
    const sections = new Set<string>();
    for (const path of COLLECTION_PATHS) {
      const [section] = path.split('.') as [string, string];
      sections.add(section);
    }
    for (const section of sections) {
      const value = doc[section];
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        shell[section] = { ...(value as Record<string, unknown>) };
      }
    }

    for (const path of COLLECTION_PATHS) {
      const [section, name] = path.split('.') as [string, string];
      const value = rawCollection(doc, path);

      // Not a list at all: leave it for the shell parse to complain about.
      if (value !== undefined && !Array.isArray(value)) continue;

      // Absent stays absent.
      if (value === undefined) continue;

      const container = shell[section];
      if (typeof container !== 'object' || container === null) continue;

      // A collection with a declared minimum keeps just enough entries to meet it.
      const keep = COLLECTION_MIN_LENGTHS.get(path) ?? 0;
      (container as Record<string, unknown>)[name] =
        keep > 0 && Array.isArray(value) ? (value as unknown[]).slice(0, keep) : [];
    }

    const shellParse = gameModuleSchema.safeParse(shell);
    if (!shellParse.success) {
      // The fast path needs a sound shell; otherwise parse the whole document.
      const full = gameModuleSchema.safeParse(doc);
      return full.success
        ? { ok: true, data: full.data }
        : { ok: false, errors: issuesFrom(full.error, '') };
    }

    // With the shell parsed, fill the collections back in entry by entry.
    const data = shellParse.data;

    for (const [path, schema] of COLLECTION_SCHEMAS) {
      const rawList = rawCollection(doc, path);
      if (!Array.isArray(rawList) || rawList.length === 0) continue;

      const parsedList = this.parseList(rawList, schema, path, errors);
      const [section, name] = path.split('.') as [string, string];
      const container = (data as unknown as Record<string, Record<string, unknown>>)[section];
      if (container) container[name] = parsedList;
    }

    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, data };
  }

  /** Parse one collection, reusing the whole list when the array itself is unchanged. */
  private parseList(
    rawList: readonly unknown[],
    schema: z.ZodTypeAny,
    path: string,
    errors: CompileIssue[],
  ): unknown[] {
    const cachedList = this.lists.get(rawList);
    if (cachedList) return cachedList as unknown[];

    const out: unknown[] = new Array(rawList.length) as unknown[];
    let clean = true;

    rawList.forEach((entry, i) => {
      if (typeof entry === 'object' && entry !== null) {
        const cached = this.entries.get(entry);
        if (cached !== undefined) {
          out[i] = cached;
          return;
        }
      }

      this.misses += 1;
      const parsed = schema.safeParse(entry);
      if (parsed.success) {
        out[i] = parsed.data;
        if (typeof entry === 'object' && entry !== null) this.entries.set(entry, parsed.data);
      } else {
        clean = false;
        errors.push(...issuesFrom(parsed.error, `${path}.${i}`));
      }
    });

    // Only remember a list that parsed cleanly.
    if (clean) this.lists.set(rawList, out);
    return out;
  }
}
