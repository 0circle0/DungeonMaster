/**
 * Turning Zod schemas into form descriptions.
 *
 * The editor renders forms from the schema rather than from hand-written UI per content type, so a
 * field added to `packages/module` appears here automatically, correctly typed and validated, and
 * the editor cannot drift out of sync with what the engine accepts.
 *
 * The one exception is the DSL: effects and predicates are recursive unions that a generic form
 * renders badly, so they are edited as JSON with schema validation — see `kind: 'dsl'`.
 */

import { z } from 'zod';
import { gameModuleSchema, COLLECTION_PATHS, refTarget, refHelp } from '@dm/module';

export type FieldSpec =
  | { kind: 'string'; ref: string | null; refHelp: string | null; long: boolean; pattern: string | null }
  | { kind: 'number'; int: boolean; min: number | null; max: number | null }
  | { kind: 'boolean' }
  | { kind: 'enum'; options: readonly string[] }
  | { kind: 'array'; element: FieldSpec }
  | { kind: 'object'; fields: readonly FieldEntry[] }
  | { kind: 'record'; keyRef: string | null; value: FieldSpec }
  | { kind: 'dsl'; flavour: 'expr' | 'predicate' | 'effect' | 'rule' | 'unknown' }
  | { kind: 'unknown' };

export interface FieldEntry {
  readonly key: string;
  readonly spec: FieldSpec;
  readonly optional: boolean;
  readonly description: string | null;
  readonly defaultValue: unknown;
}

interface Unwrapped {
  schema: z.ZodTypeAny;
  optional: boolean;
  defaultValue: unknown;
  description: string | null;
}

/** Strip the wrapper types Zod uses for optionality and defaults. */
function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let current = schema;
  let optional = false;
  let defaultValue: unknown = undefined;
  let description: string | null = current.description ?? null;

  // Wrappers nest arbitrarily: `.optional().default(x).describe(y)`.
  for (let guard = 0; guard < 20; guard += 1) {
    const def = current._def as { typeName?: string; [k: string]: unknown };
    description ??= current.description ?? null;

    switch (def.typeName) {
      case 'ZodOptional':
      case 'ZodNullable':
        optional = true;
        current = def['innerType'] as z.ZodTypeAny;
        continue;
      case 'ZodDefault':
        optional = true;
        defaultValue = (def['defaultValue'] as () => unknown)();
        current = def['innerType'] as z.ZodTypeAny;
        continue;
      case 'ZodEffects':
        // `.refine()` wraps the schema it guards.
        current = def['schema'] as z.ZodTypeAny;
        continue;
      case 'ZodReadonly':
      case 'ZodCatch':
        current = def['innerType'] as z.ZodTypeAny;
        continue;
      default:
        return { schema: current, optional, defaultValue, description };
    }
  }
  return { schema: current, optional, defaultValue, description };
}

/**
 * `ref:` markers become dropdowns bound to that collection. Read through `@dm/module` rather than
 * parsed here, since the marker can carry help text after a `|` and a second parser is a second
 * place to be wrong.
 */

/** Which recursive DSL schema this is, so the JSON editor can label it. */
function dslFlavour(schema: z.ZodTypeAny): 'expr' | 'predicate' | 'effect' | 'rule' | 'unknown' {
  // Probing is more robust than name matching, since the schemas are anonymous once wrapped in
  // `z.lazy`.
  if (schema.safeParse({ damage: { target: 'x', amount: 1 } }).success) return 'effect';
  if (schema.safeParse({ gte: [1, 1] }).success) return 'predicate';
  if (schema.safeParse({ add: [1, 2] }).success) return 'expr';
  if (schema.safeParse({ then: [] }).success) return 'rule';
  return 'unknown';
}

export function describeSchema(schema: z.ZodTypeAny, depth = 0): FieldSpec {
  if (depth > 12) return { kind: 'unknown' };

  const { schema: inner, description } = unwrap(schema);
  const def = inner._def as { typeName?: string; [k: string]: unknown };

  switch (def.typeName) {
    case 'ZodString': {
      const checks = (def['checks'] ?? []) as { kind: string; regex?: RegExp; value?: number }[];
      const max = checks.find((c) => c.kind === 'max')?.value ?? 0;
      const regex = checks.find((c) => c.kind === 'regex')?.regex;
      return {
        kind: 'string',
        ref: refTarget(description ?? undefined),
        refHelp: refHelp(description ?? undefined),
        long: max > 500,
        pattern: regex ? String(regex) : null,
      };
    }

    case 'ZodNumber': {
      const checks = (def['checks'] ?? []) as { kind: string; value?: number }[];
      return {
        kind: 'number',
        int: checks.some((c) => c.kind === 'int'),
        min: checks.find((c) => c.kind === 'min')?.value ?? null,
        max: checks.find((c) => c.kind === 'max')?.value ?? null,
      };
    }

    case 'ZodBoolean':
      return { kind: 'boolean' };

    case 'ZodEnum':
      return { kind: 'enum', options: def['values'] as readonly string[] };

    case 'ZodNativeEnum':
      return { kind: 'enum', options: Object.values(def['values'] as object) as string[] };

    case 'ZodLiteral':
      return { kind: 'enum', options: [String(def['value'])] };

    case 'ZodArray':
      return { kind: 'array', element: describeSchema(def['type'] as z.ZodTypeAny, depth + 1) };

    case 'ZodObject': {
      const shape = (inner as z.ZodObject<z.ZodRawShape>).shape;
      const fields: FieldEntry[] = Object.entries(shape).map(([key, child]) => {
        const meta = unwrap(child);
        return {
          key,
          spec: describeSchema(child, depth + 1),
          optional: meta.optional,
          description: meta.description,
          defaultValue: meta.defaultValue,
        };
      });
      return { kind: 'object', fields };
    }

    case 'ZodRecord':
      return {
        kind: 'record',
        keyRef: refTarget(unwrap(def['keyType'] as z.ZodTypeAny).description ?? undefined),
        value: describeSchema(def['valueType'] as z.ZodTypeAny, depth + 1),
      };

    // The DSL: recursive unions that a generic form cannot render well.
    case 'ZodLazy':
    case 'ZodUnion':
      return { kind: 'dsl', flavour: dslFlavour(inner) };

    case 'ZodTuple':
      return { kind: 'dsl', flavour: 'unknown' };

    default:
      return { kind: 'unknown' };
  }
}

/** Human label for a camelCase key. */
export function labelFor(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * How much one press of a number input's arrows should move it.
 *
 * Read off the bounds the schema declares, because `step="any"` makes the arrows move by 1 and a
 * scatter frequency lives entirely between 0 and 1.
 *
 * A schema that writes `z.number()` rather than `.int()` is stating that fractions are meaningful,
 * so the arrows never move a float by a whole unit. A narrow declared range means every hundredth
 * counts; anything wider or unbounded is a quantity rather than a ratio.
 */
export function stepFor(spec: Extract<FieldSpec, { kind: 'number' }>): number {
  if (spec.int) return 1;
  const bounded = spec.min !== null && spec.max !== null;
  return bounded && spec.max! - spec.min! <= 2 ? 0.01 : 0.1;
}

export interface CollectionInfo {
  readonly path: string;
  readonly section: string;
  readonly name: string;
  readonly label: string;
  readonly entrySchema: z.ZodTypeAny;
  readonly spec: FieldSpec;
}

/**
 * Every editable collection, discovered from the module schema. Driving navigation from
 * `COLLECTION_PATHS` rather than a hand-kept list means a new collection shows up in the sidebar as
 * soon as it exists.
 */
function buildCollections(): CollectionInfo[] {
  const out: CollectionInfo[] = [];
  const rootShape = gameModuleSchema.shape as Record<string, z.ZodTypeAny>;

  for (const path of COLLECTION_PATHS) {
    const [section, name] = path.split('.') as [string, string];
    const sectionSchema = rootShape[section];
    if (!sectionSchema) continue;

    const sectionObject = unwrap(sectionSchema).schema;
    const sectionDef = sectionObject._def as { typeName?: string };
    if (sectionDef.typeName !== 'ZodObject') continue;

    const collectionSchema = (sectionObject as z.ZodObject<z.ZodRawShape>).shape[name];
    if (!collectionSchema) continue;

    const arraySchema = unwrap(collectionSchema).schema;
    const arrayDef = arraySchema._def as { typeName?: string; type?: z.ZodTypeAny };
    if (arrayDef.typeName !== 'ZodArray' || !arrayDef.type) continue;

    const entrySchema = arrayDef.type;
    out.push({
      path,
      section,
      name,
      label: labelFor(name),
      entrySchema,
      spec: describeSchema(entrySchema),
    });
  }
  return out;
}

export const COLLECTIONS: readonly CollectionInfo[] = buildCollections();

export const SECTIONS: readonly { id: string; label: string; collections: readonly CollectionInfo[] }[] = [
  { id: 'rules', label: 'Rules' },
  { id: 'content', label: 'Content' },
  { id: 'world', label: 'World' },
  { id: 'narrative', label: 'Narrative' },
].map((section) => ({
  ...section,
  collections: COLLECTIONS.filter((c) => c.section === section.id),
}));

export function collectionAt(path: string): CollectionInfo | undefined {
  return COLLECTIONS.find((c) => c.path === path);
}

/**
 * Singleton sections that are objects rather than lists — `start`, the world clock, and the
 * resolution rules. They get the same generated form treatment.
 */
export const SINGLETONS: readonly { path: string; label: string; spec: FieldSpec }[] = (() => {
  const rootShape = gameModuleSchema.shape as Record<string, z.ZodTypeAny>;
  const out: { path: string; label: string; spec: FieldSpec }[] = [];

  const add = (path: string, label: string, schema: z.ZodTypeAny | undefined) => {
    if (schema) out.push({ path, label, spec: describeSchema(schema) });
  };

  add('meta', 'Module info', rootShape['meta']);
  add('start', 'Start & creation', rootShape['start']);

  const rules = unwrap(rootShape['rules']).schema as z.ZodObject<z.ZodRawShape>;
  add('rules.resolution', 'Resolution', rules.shape['resolution']);
  add('rules.progression', 'Progression', rules.shape['progression']);
  add('rules.perception', 'Perception', rules.shape['perception']);

  const world = unwrap(rootShape['world']).schema as z.ZodObject<z.ZodRawShape>;
  add('world.time', 'World clock', world.shape['time']);

  const narrative = unwrap(rootShape['narrative']).schema as z.ZodObject<z.ZodRawShape>;
  add('narrative.memory', 'Memory & gossip', narrative.shape['memory']);

  add('rules.spellcasting', 'Spellcasting', rules.shape['spellcasting']);

  return out;
})();
