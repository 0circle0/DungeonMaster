/** Reverse references: what points at this? */

import { z } from 'zod';
import { gameModuleSchema, COLLECTION_PATHS } from '../schema/module.js';
import { refTarget } from '../schema/common.js';

export interface Reference {
  /** Where the reference lives, e.g. `content.monsters.0.loot`. */
  readonly path: string;
  /** The collection holding the referring entry. */
  readonly fromCollection: string;
  /** Index of the referring entry within that collection. */
  readonly fromIndex: number;
  /** Id of the referring entry, for display. */
  readonly fromId: string;
  /** Name of the referring entry, for display. */
  readonly fromLabel: string;
  /** The field that holds the reference, e.g. `loot`. */
  readonly field: string;
}

/** `collection` → `id` → everything pointing at it. */
export type ReferenceIndex = ReadonlyMap<string, ReadonlyMap<string, readonly Reference[]>>;

interface RawRef {
  path: string;
  target: string;
  id: string;
}

/** Walk the schema alongside the document, collecting `ref:` markers. */
function collectRefs(schema: z.ZodTypeAny, value: unknown, path: string, out: RawRef[]): void {
  if (value === undefined || value === null) return;
  const def = schema._def as { typeName?: string; [k: string]: unknown };

  switch (def.typeName) {
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'ZodReadonly':
      collectRefs(def['innerType'] as z.ZodTypeAny, value, path, out);
      return;

    case 'ZodEffects':
      collectRefs(def['schema'] as z.ZodTypeAny, value, path, out);
      return;

    // DSL nodes carry no static references; their ids are computed at runtime.
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
      value.forEach((item, i) => collectRefs(element, item, `${path}.${i}`, out));
      return;
    }

    case 'ZodTuple': {
      if (!Array.isArray(value)) return;
      const items = def['items'] as z.ZodTypeAny[];
      value.forEach((item, i) => {
        const itemSchema = items[i];
        if (itemSchema) collectRefs(itemSchema, item, `${path}.${i}`, out);
      });
      return;
    }

    case 'ZodRecord': {
      if (typeof value !== 'object' || Array.isArray(value)) return;
      const keyType = def['keyType'] as z.ZodTypeAny;
      const valueType = def['valueType'] as z.ZodTypeAny;
      const keyTarget = refTarget(keyType.description);
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (keyTarget) out.push({ path: `${path}.${key}`, target: keyTarget, id: key });
        collectRefs(valueType, child, `${path}.${key}`, out);
      }
      return;
    }

    case 'ZodUnion': {
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
      if (target && typeof value === 'string') out.push({ path, target, id: value });
      return;
    }

    default:
  }
}

const COLLECTION_SET = new Set<string>(COLLECTION_PATHS);

/** Identify which entry a reference path lives inside. */
function ownerOf(document: Record<string, unknown>, path: string): {
  collection: string;
  index: number;
  id: string;
  label: string;
  field: string;
} | null {
  const segments = path.split('.');
  if (segments.length < 3) return null;

  const collection = `${segments[0]}.${segments[1]}`;
  if (!COLLECTION_SET.has(collection)) return null;

  const index = Number(segments[2]);
  if (!Number.isInteger(index)) return null;

  const section = document[segments[0]!] as Record<string, unknown> | undefined;
  const entries = section?.[segments[1]!];
  const entry = Array.isArray(entries) ? (entries[index] as Record<string, unknown> | undefined) : undefined;
  if (!entry) return null;

  return {
    collection,
    index,
    id: String(entry['id'] ?? index),
    label: String(entry['name'] ?? entry['id'] ?? `#${index}`),
    // The remaining segments describe where inside the entry it sits.
    field: segments.slice(3).filter((s) => !/^\d+$/.test(s)).join('.') || '—',
  };
}

/** Build the reverse index for a document. */
export function buildReferenceIndex(document: unknown): ReferenceIndex {
  const out = new Map<string, Map<string, Reference[]>>();
  if (typeof document !== 'object' || document === null) return out;

  const raw: RawRef[] = [];
  collectRefs(gameModuleSchema, document, '', raw);

  for (const reference of raw) {
    const owner = ownerOf(document as Record<string, unknown>, reference.path);
    if (!owner) continue;

    let byId = out.get(reference.target);
    if (!byId) {
      byId = new Map();
      out.set(reference.target, byId);
    }
    const list = byId.get(reference.id) ?? [];
    list.push({
      path: reference.path,
      fromCollection: owner.collection,
      fromIndex: owner.index,
      fromId: owner.id,
      fromLabel: owner.label,
      field: owner.field,
    });
    byId.set(reference.id, list);
  }

  return out;
}

/** Everything pointing at one entry. */
export function referencesTo(
  index: ReferenceIndex,
  collection: string,
  id: string,
): readonly Reference[] {
  return index.get(collection)?.get(id) ?? [];
}

export interface OrphanEntry {
  readonly collection: string;
  readonly index: number;
  readonly id: string;
  readonly label: string;
}

/** Entries nothing references. */
export function findOrphans(
  document: unknown,
  index: ReferenceIndex,
  ignore: readonly string[] = [],
): OrphanEntry[] {
  if (typeof document !== 'object' || document === null) return [];
  const doc = document as Record<string, unknown>;
  const out: OrphanEntry[] = [];
  const ignored = new Set(ignore);

  for (const collection of COLLECTION_PATHS) {
    if (ignored.has(collection)) continue;
    const [section, name] = collection.split('.') as [string, string];
    const entries = (doc[section] as Record<string, unknown> | undefined)?.[name];
    if (!Array.isArray(entries)) continue;

    entries.forEach((entry, i) => {
      const row = entry as Record<string, unknown>;
      const id = String(row['id'] ?? '');
      if (!id) return;
      if (referencesTo(index, collection, id).length > 0) return;
      out.push({
        collection,
        index: i,
        id,
        label: String(row['name'] ?? id),
      });
    });
  }

  return out;
}
