/**
 * One walk of the module schemas, shared by everything that describes them.
 *
 * The format is large enough that a hand-maintained description of it is wrong
 * within a week, so the reference docs, the field-gloss coverage test, and the
 * documentation site all read the same walk of the real Zod schemas. Whatever
 * the validator enforces is what they show.
 *
 * Two things here are easy to get wrong and are handled once:
 *
 * - **Shared schemas are documented once.** `requirement` appears on some thirty
 *   entities; recursing into it every time runs the reference to fifteen
 *   thousand lines of duplicates. Identity is the schema object itself, which
 *   Zod shares between every use site, and the first path that reaches one wins.
 *   A path is claimed as the child is *scanned*, not as it is visited, so two
 *   sibling fields sharing a schema both link to the same section.
 * - **Types are returned as a small tree, not as text.** The reference renders
 *   Markdown and the site renders elements; formatting either into the walk
 *   would leave the other reimplementing it.
 */

import { z } from 'zod';
import { gameModuleSchema } from './module.js';
import { idSchema, refTarget, refHelp } from './common.js';
import {
  ExprSchema,
  PredicateSchema,
  EffectSchema,
  RuleSchema,
  diceNotation,
} from '../dsl/schema.js';

/**
 * Deepest section the walk emits, counting the document itself as 0.
 *
 * `content` is 1, `content.abilities` is 2, `content.abilities.requires` is 3,
 * and `content.abilities.requires.attributes` is 4. Nothing in the format nests
 * an object further than that, and the bound keeps a cyclic schema from
 * becoming an infinite document. A field below the bound still gets a row; it
 * just renders as a plain object with no section to link to.
 */
export const MAX_SECTION_DEPTH = 4;

/** The section rendered from the `SYSTEM_TEXT` registry rather than the shape. */
export const SYSTEM_TEXT_PATH = 'narrative.systemText';

/** The four shapes the behaviour language takes, named rather than lumped. */
export type DslKind = 'expression' | 'predicate' | 'effect' | 'rule';

/** A field's type, shaped so Markdown and JSX can each render it their own way. */
export type TypeNode =
  | { kind: 'scalar'; name: 'string' | 'number' | 'boolean' | 'any' | 'tuple' | 'unknown' }
  | { kind: 'id' }
  | { kind: 'dice' }
  | { kind: 'ref'; target: string }
  | { kind: 'enum'; values: string[] }
  | { kind: 'literal'; value: string }
  | { kind: 'object'; section: string | null; variants?: number }
  | { kind: 'dsl'; dsl: DslKind }
  | { kind: 'array'; of: TypeNode }
  | { kind: 'record'; key: TypeNode; value: TypeNode }
  | { kind: 'union'; of: TypeNode[] };

/**
 * Schemas that mean something specific and would otherwise read as `string` or
 * as one undifferentiated union.
 *
 * Matched by object identity, checked at every step of the optional/default
 * unwrap, because `EffectSchema` reached through `z.array(...).default([])` is
 * still the same object. `ref()` calls clone `idSchema` through `.describe()`,
 * so a reference field never matches the bare id entry here and is reported as
 * the reference it is.
 */
const NAMED: readonly (readonly [z.ZodTypeAny, TypeNode])[] = [
  [ExprSchema, { kind: 'dsl', dsl: 'expression' }],
  [PredicateSchema, { kind: 'dsl', dsl: 'predicate' }],
  [EffectSchema, { kind: 'dsl', dsl: 'effect' }],
  [RuleSchema, { kind: 'dsl', dsl: 'rule' }],
  [diceNotation, { kind: 'dice' }],
  [idSchema, { kind: 'id' }],
];

function named(schema: z.ZodTypeAny): TypeNode | null {
  for (const [candidate, node] of NAMED) if (candidate === schema) return node;
  return null;
}

export interface FieldRow {
  /** Canonical dotted path, e.g. `content.npcs.gullibility`. Unique. */
  path: string;
  key: string;
  type: TypeNode;
  required: boolean;
  /** The schema default, or `undefined` when the field has none. */
  defaultValue: unknown;
  /** Collection this field points at, when it is a reference. */
  refTarget: string | null;
  /** The sentence a reference field carries after its collection, if any. */
  refHelp: string | null;
  /** Section path this field's own fields live under, when it is an object. */
  section: string | null;
}

export interface SectionRow {
  /** Dotted path, `''` for the document itself. */
  path: string;
  /** Owning section path, `null` for the document itself. */
  parent: string | null;
  /** `content.npcs.shop` reads as `['content', 'npcs', 'shop']`. */
  trail: string[];
  fields: FieldRow[];
  /**
   * True for `narrative.systemText`, whose two hundred keys come from the
   * `SYSTEM_TEXT` registry. The registry carries the tier, the placeholders a
   * message may not drop, and a description per key, none of which live in the
   * Zod type, so a generic field table would say much less at ten times the
   * length.
   */
  fromRegistry: boolean;
}

interface Unwrapped {
  schema: z.ZodTypeAny;
  optional: boolean;
  defaultValue: unknown;
  description: string | null;
  /** Set when the chain passed through a schema in `NAMED`. */
  namedType: TypeNode | null;
}

/** Strip `optional`/`nullable`/`default`/`effects` down to the real type. */
function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let current = schema;
  let optional = false;
  let defaultValue: unknown;
  let description: string | null = current.description ?? null;
  let namedType: TypeNode | null = null;

  for (let i = 0; i < 20; i += 1) {
    const def = current._def as { typeName?: string; [k: string]: unknown };
    description ??= current.description ?? null;
    namedType ??= named(current);

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
        current = def['schema'] as z.ZodTypeAny;
        continue;
      default:
        return { schema: current, optional, defaultValue, description, namedType };
    }
  }
  return { schema: current, optional, defaultValue, description, namedType };
}

/** The object branches of a union, in declaration order. */
function unionBranches(schema: z.ZodTypeAny): z.ZodTypeAny[] {
  const def = schema._def as { typeName?: string; options?: z.ZodTypeAny[] };
  return def.typeName === 'ZodUnion' ? (def.options ?? []) : [];
}

function typeNameOf(def: { typeName?: string }): string {
  return def.typeName ?? '';
}

/**
 * The object a field is built from, looking through arrays and unions.
 *
 * A union contributes its first object branch only. That covers both unions the
 * format has: static map layers, whose seven branches differ only in the `kind`
 * literal and which collection the cells resolve against, and a class's skill
 * proficiencies, where one branch is a bare reference and the other an object.
 */
function objectOf(schema: z.ZodTypeAny): z.ZodTypeAny | null {
  const { schema: inner, namedType } = unwrap(schema);
  if (namedType) return null;
  const def = inner._def as { typeName?: string; type?: z.ZodTypeAny };
  if (typeNameOf(def) === 'ZodObject') return inner;
  if (typeNameOf(def) === 'ZodArray' && def.type) return objectOf(def.type);
  for (const branch of unionBranches(inner)) {
    const found = objectOf(branch);
    if (found) return found;
  }
  return null;
}

export function walkModuleSchema(): SectionRow[] {
  const sections: SectionRow[] = [];
  /** Object schema to the first path that reached it. */
  const claimed = new Map<z.ZodTypeAny, string>();

  function describeType(schema: z.ZodTypeAny, sectionOf: (o: z.ZodTypeAny) => string | null, depth = 0): TypeNode {
    if (depth > 6) return { kind: 'scalar', name: 'unknown' };
    const { schema: inner, description, namedType } = unwrap(schema);
    const target = refTarget(description ?? undefined);
    if (target) return { kind: 'ref', target };
    if (namedType) return namedType;

    const def = inner._def as { typeName?: string; [k: string]: unknown };
    switch (typeNameOf(def)) {
      case 'ZodString':
        return { kind: 'scalar', name: 'string' };
      case 'ZodNumber':
        return { kind: 'scalar', name: 'number' };
      case 'ZodBoolean':
        return { kind: 'scalar', name: 'boolean' };
      case 'ZodEnum':
        return { kind: 'enum', values: def['values'] as string[] };
      case 'ZodLiteral':
        return { kind: 'literal', value: String(def['value']) };
      case 'ZodArray':
        return { kind: 'array', of: describeType(def['type'] as z.ZodTypeAny, sectionOf, depth + 1) };
      case 'ZodRecord':
        return {
          kind: 'record',
          key: describeType(def['keyType'] as z.ZodTypeAny, sectionOf, depth + 1),
          value: describeType(def['valueType'] as z.ZodTypeAny, sectionOf, depth + 1),
        };
      case 'ZodObject':
        return { kind: 'object', section: sectionOf(inner) };
      case 'ZodUnion': {
        const branches = unionBranches(inner);
        const objects = branches.filter((branch) => objectOf(branch));
        // Every branch an object, all the same shape bar a discriminating
        // literal: one section says it, and the variant count says the rest.
        if (objects.length === branches.length && branches.length > 0) {
          const first = objectOf(branches[0]!)!;
          return { kind: 'object', section: sectionOf(first), variants: branches.length };
        }
        return {
          kind: 'union',
          of: branches.map((branch) => describeType(branch, sectionOf, depth + 1)),
        };
      }
      case 'ZodLazy':
        // A lazy schema that is not one of the four named DSL shapes.
        return { kind: 'dsl', dsl: 'expression' };
      case 'ZodTuple':
        return { kind: 'scalar', name: 'tuple' };
      case 'ZodUnknown':
      case 'ZodAny':
        return { kind: 'scalar', name: 'any' };
      default:
        return { kind: 'scalar', name: 'unknown' };
    }
  }

  function visit(objSchema: z.ZodTypeAny, path: string, depth: number): void {
    const trail = path === '' ? [] : path.split('.');
    if (path === SYSTEM_TEXT_PATH) {
      sections.push({ path, parent: trail.slice(0, -1).join('.') || null, trail, fields: [], fromRegistry: true });
      return;
    }

    const shape = (objSchema as z.ZodObject<z.ZodRawShape>).shape;
    const fields: FieldRow[] = [];
    const children: { schema: z.ZodTypeAny; path: string }[] = [];

    for (const [key, child] of Object.entries(shape)) {
      const meta = unwrap(child);
      const childPath = path === '' ? key : `${path}.${key}`;

      /**
       * Claim a section for an object field as it is scanned. Two siblings
       * sharing one schema then resolve to the same section instead of the
       * second one linking at a heading that is never written.
       *
       * `extra` is an open bag with no shape worth tabulating, so it stays a
       * plain record row.
       */
      const sectionOf = (candidate: z.ZodTypeAny): string | null => {
        const existing = claimed.get(candidate);
        if (existing !== undefined) return existing;
        if (key === 'extra') return null;
        if (depth + 1 > MAX_SECTION_DEPTH) return null;
        claimed.set(candidate, childPath);
        children.push({ schema: candidate, path: childPath });
        return childPath;
      };

      const type = describeType(child, sectionOf);
      const nested = objectOf(child);
      fields.push({
        path: childPath,
        key,
        type,
        required: !meta.optional,
        defaultValue: meta.defaultValue,
        refTarget: refTarget(meta.description ?? undefined),
        refHelp: refHelp(meta.description ?? undefined),
        section: nested ? (claimed.get(nested) ?? null) : null,
      });
    }

    sections.push({ path, parent: trail.slice(0, -1).join('.') || null, trail, fields, fromRegistry: false });
    for (const child of children) visit(child.schema, child.path, depth + 1);
  }

  claimed.set(gameModuleSchema, '');
  visit(gameModuleSchema, '', 0);
  return sections;
}

/** Every field path the walk produces, in document order. The coverage set. */
export function fieldPaths(): string[] {
  return walkModuleSchema().flatMap((section) => section.fields.map((field) => field.path));
}

/** Sections grouped by their top-level part; the document itself keys as `''`. */
export function sectionsByArea(): Map<string, SectionRow[]> {
  const areas = new Map<string, SectionRow[]>();
  for (const section of walkModuleSchema()) {
    const area = section.trail[0] ?? '';
    const list = areas.get(area);
    if (list) list.push(section);
    else areas.set(area, [section]);
  }
  return areas;
}
