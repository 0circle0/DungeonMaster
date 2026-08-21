/**
 * Changing an id, and everything that points at it.
 *
 * The schema already knows where every reference is — `ref()` marks 178 sites across 44 collections
 * — so the rewrite is exact rather than textual.
 *
 * What this can and cannot promise
 *
 * It promises the declared references: every field the schema marks with `ref:`, rewritten
 * precisely, including record keys and the ones outside any collection — `start.startingArea` is a
 * reference, and a rename that missed it would move the start of the game.
 *
 * It cannot promise the rest. `objective.target` is a plain id because a `reach` target may be a
 * point of interest, a map, a trigger or a gate; flags are free strings. So every other place the
 * old id appears is reported rather than rewritten.
 */

import { gameModuleSchema, COLLECTION_PATHS } from '../schema/module.js';
import type { CollectionPath } from '../schema/module.js';
import { collectRefs } from '../compile.js';
import type { RefSite } from '../compile.js';
import { idSchema } from '../schema/common.js';

/** One place the rename has to touch. */
export interface RenameEdit {
  /** Dotted path, e.g. `content.monsters.3.loot` or `start.startingArea`. */
  readonly path: string;
  /** `value` overwrites what is at the path; `key` renames the record key there. */
  readonly kind: 'value' | 'key';
}

/** A place the old id appears that the format cannot prove is a reference. */
export interface RenameMention {
  readonly path: string;
  /** The whole string, so the caller can show what it is looking at. */
  readonly value: string;
  /** `exact` is the whole value; `embedded` is the id inside a longer string. */
  readonly how: 'exact' | 'embedded';
}

export interface RenamePlan {
  readonly collection: string;
  readonly from: string;
  readonly to: string;
  /** Empty when the rename can go ahead. */
  readonly problems: readonly string[];
  /** Declared references, rewritten exactly. Includes the entry's own `id`. */
  readonly edits: readonly RenameEdit[];
  /** Everything else that says the old id. Reported, never rewritten. */
  readonly mentions: readonly RenameMention[];
}

/**
 * One spelling for a path. The compiler's walk writes array indices as `groups[0]` while everything
 * the editor holds is dotted, so normalising here means a plan can be handed straight to the store
 * and the sweep for undeclared mentions can recognise the declared paths.
 */
function toDotted(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1');
}

function collectionEntries(doc: Record<string, unknown>, collection: string): Record<string, unknown>[] {
  const [section, name] = collection.split('.') as [string, string];
  const container = doc[section] as Record<string, unknown> | undefined;
  const value = container?.[name];
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/**
 * Walk every string in the document, so nothing that says the old id is missed. Deliberately not
 * schema-driven: the point is to find what the schema does not describe as a reference.
 */
function walkStrings(
  value: unknown,
  path: string,
  visit: (path: string, text: string) => void,
  depth = 0,
): void {
  if (depth > 40) return;
  if (typeof value === 'string') {
    visit(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkStrings(item, `${path}.${i}`, visit, depth + 1));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      // Keys can be ids too — a record of attribute bonuses names them.
      visit(`${childPath}#key`, key);
      walkStrings(child, childPath, visit, depth + 1);
    }
  }
}

/**
 * Work out everything a rename would touch, without touching anything. Returns a plan rather than a
 * document, so the caller can show it first.
 */
export function planRename(
  document: unknown,
  collection: string,
  from: string,
  to: string,
): RenamePlan {
  const problems: string[] = [];
  const edits: RenameEdit[] = [];
  const mentions: RenameMention[] = [];

  const base = { collection, from, to, problems, edits, mentions };
  if (typeof document !== 'object' || document === null) {
    problems.push('there is no document to rename in');
    return base;
  }
  const doc = document as Record<string, unknown>;

  if (!(COLLECTION_PATHS as readonly string[]).includes(collection)) {
    problems.push(`${collection} is not a collection`);
    return base;
  }

  const entries = collectionEntries(doc, collection);
  const index = entries.findIndex((entry) => entry['id'] === from);
  if (index < 0) problems.push(`nothing in ${collection} is called ${JSON.stringify(from)}`);

  if (!idSchema.safeParse(to).success) {
    problems.push(`${JSON.stringify(to)} is not a valid id — lowercase letters, digits and underscores`);
  } else if (to === from) {
    problems.push('the new id is the same as the old one');
  } else if (entries.some((entry) => entry['id'] === to)) {
    problems.push(`${collection} already has an entry called ${JSON.stringify(to)}`);
  }

  if (problems.length > 0) return base;

  // The entry's own id first: a rename that updates every referrer and not the thing itself would
  // turn each of them into a dangling reference.
  edits.push({ path: `${collection}.${index}.id`, kind: 'value' });

  const refs: RefSite[] = [];
  collectRefs(gameModuleSchema, doc, '', refs);
  const declared = new Set<string>();
  for (const ref of refs) {
    if (ref.target !== collection || ref.id !== from) continue;
    const path = toDotted(ref.path);
    declared.add(ref.kind === 'key' ? `${path}#key` : path);
    edits.push({ path, kind: ref.kind });
  }

  // The entry's own id field counts as a declared site for the sweep below, or it would be reported
  // back as an unexplained mention of itself.
  declared.add(`${collection}.${index}.id`);

  walkStrings(doc, '', (path, text) => {
    if (declared.has(path)) return;
    if (text === from) {
      mentions.push({ path, value: text, how: 'exact' });
    } else if (text.includes(from)) {
      // Ids get embedded in flags (`given:iron_key`) and in DSL ref paths. Not rewritten, since a
      // substring match is a guess, but worth pointing at.
      mentions.push({ path, value: text, how: 'embedded' });
    }
  });

  return base;
}

/**
 * The paths a rename writes, as `(path, value)` pairs for a `value` edit. Key renames are not
 * expressible as a path assignment — the record has to be rebuilt — so `applyRename` handles the
 * whole plan instead.
 */
export function renameTargets(plan: RenamePlan): readonly string[] {
  return plan.edits.map((edit) => edit.path);
}

/** Apply a plan, returning a new document. The original is not touched. */
export function applyRename(document: unknown, plan: RenamePlan): unknown {
  if (plan.problems.length > 0) return document;

  // Deepest paths first, so rebuilding a record cannot invalidate a path still to be visited inside
  // it.
  const ordered = [...plan.edits].sort((a, b) => b.path.split('.').length - a.path.split('.').length);

  let out = document;
  for (const edit of ordered) {
    out =
      edit.kind === 'value'
        ? writeAt(out, edit.path.split('.'), plan.to)
        : renameKeyAt(out, edit.path.split('.'), plan.to);
  }
  return out;
}

/** Immutable set, matching the editor's `setAt` so identity is shared. */
function writeAt(node: unknown, path: readonly string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path as [string, ...string[]];

  if (Array.isArray(node)) {
    const list = [...node];
    const i = Number(head);
    list[i] = writeAt(list[i], rest, value);
    return list;
  }
  const object = { ...((node as Record<string, unknown> | undefined) ?? {}) };
  object[head] = writeAt(object[head], rest, value);
  return object;
}

/**
 * Rename the record key the path ends at, keeping the record's order, because a module is a file
 * people read.
 */
function renameKeyAt(node: unknown, path: readonly string[], to: string): unknown {
  const [head, ...rest] = path as [string, ...string[]];

  if (rest.length === 0) {
    const record = node as Record<string, unknown> | undefined;
    if (!record || typeof record !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      out[key === head ? to : key] = value;
    }
    return out;
  }

  if (Array.isArray(node)) {
    const list = [...node];
    const i = Number(head);
    list[i] = renameKeyAt(list[i], rest, to);
    return list;
  }
  const object = { ...((node as Record<string, unknown> | undefined) ?? {}) };
  object[head] = renameKeyAt(object[head], rest, to);
  return object;
}

export type { CollectionPath };
