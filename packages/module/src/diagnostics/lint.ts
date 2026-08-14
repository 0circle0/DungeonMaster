/**
 * Module diagnostics.
 *
 * The authoring loop is hand-edited JSON, so validation is the main tool an
 * author uses. Every diagnostic tries to answer three questions:
 *
 *   - **where** — a dotted path, and a line and column when source text is
 *     available, with the offending line printed and a caret under it;
 *   - **what** — the specific rule that was broken, not a generic union error;
 *   - **why**, and what to do — a "did you mean" for typos, and an explanation
 *     of the consequence for semantic problems.
 *
 * The passes run in order and stop where continuing would be noise: a document
 * that does not parse cannot be schema-checked, and a document that fails the
 * schema will produce meaningless semantic results.
 */

import { z } from 'zod';
import { gameModuleSchema, COLLECTION_PATHS } from '../schema/module.js';
import { compileModule } from '../compile.js';
import { EXPR_OPS, PREDICATE_OPS, EFFECT_OPS } from '../dsl/eval.js';
import { parseJsonWithSource, JsonSyntaxError, excerpt } from './source.js';
import type { Position, Span } from './source.js';
import { closest, suggestionFor } from './suggest.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly severity: Severity;
  /** Machine-readable kind, for filtering and for tests. */
  readonly code: string;
  /** Dotted path into the document. */
  readonly path: string;
  readonly message: string;
  /** Why it matters, or how to fix it. */
  readonly hint: string | null;
  readonly position: Position | null;
  /** The offending line with a caret, when source text was supplied. */
  readonly excerpt: string | null;
}

export interface LintResult {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  /** Present when the document parsed and passed the schema. */
  readonly value: unknown;
}

const ALL_DSL_OPS = [...EXPR_OPS, ...PREDICATE_OPS, ...EFFECT_OPS];

/** Keys inside DSL nodes that are legitimate companions to an operator. */
const DSL_COMPANION_KEYS = new Set(['else', 'then', 'when', 'do', 'in', 'as', 'name', 'value', 'times']);

interface Context {
  readonly text: string | null;
  readonly spans: ReadonlyMap<string, Span> | null;
  readonly out: Diagnostic[];
}

function locate(ctx: Context, rawPath: string): { position: Position | null; excerpt: string | null } {
  if (!ctx.text || !ctx.spans) return { position: null, excerpt: null };

  // The compiler reports array indices as `monsters[0]`; spans are keyed with
  // dot notation. Normalise so both resolve to the same place.
  const path = rawPath.replace(/\[(\d+)\]/g, '.$1');

  // Try the exact path, then the property name, then walk up to the nearest
  // ancestor that does have a position, so an error always lands somewhere.
  const candidates = [`${path}#key`, path];
  let span = candidates.map((c) => ctx.spans!.get(c)).find(Boolean);

  if (!span) {
    const segments = path.split('.');
    while (segments.length > 0 && !span) {
      segments.pop();
      span = ctx.spans.get(segments.join('.'));
    }
  }
  if (!span) return { position: null, excerpt: null };

  return { position: span.start, excerpt: excerpt(ctx.text, span.start) };
}

function report(
  ctx: Context,
  severity: Severity,
  code: string,
  path: string,
  message: string,
  hint: string | null = null,
): void {
  const { position, excerpt: snippet } = locate(ctx, path);
  ctx.out.push({ severity, code, path, message, hint, position, excerpt: snippet });
}

// ---------------------------------------------------------------------------
// DSL operator checking
// ---------------------------------------------------------------------------

/**
 * Walk anything that might be a DSL node and check its operator.
 *
 * Zod validates DSL nodes as a large union, and a union failure reports every
 * branch that did not match — which for `fgte` means a wall of irrelevant text.
 * This pass runs first and reports the single useful thing: the operator is not
 * one we know, and here is the one you probably meant.
 */
type DslKind = 'effect' | 'predicate' | 'expression';

const OPS_BY_KIND: Record<DslKind, readonly string[]> = {
  effect: [...EFFECT_OPS],
  predicate: [...PREDICATE_OPS],
  expression: [...EXPR_OPS],
};

/**
 * What kind each operator's children are.
 *
 * A `damage` payload holds *expressions*, not effects, so descending into it
 * as if it were another effect would report every `target` and `amount` as an
 * unknown operator. Anything not listed defaults to expressions, which is the
 * common case for operands and payload values.
 */
const CHILD_KINDS: Record<string, Record<string, DslKind>> = {
  // Effects that contain other effects.
  if: { when: 'predicate', then: 'effect', else: 'effect' },
  repeat: { times: 'expression', do: 'effect' },
  forEach: { in: 'expression', do: 'effect' },
  let: { value: 'expression', in: 'effect' },
  // Predicates that contain other predicates.
  all: { '*': 'predicate' },
  any: { '*': 'predicate' },
  not: { '*': 'predicate' },
  // Expression conditional.
  cond: { '*': 'predicate' },
};

/** Operators whose value is a plain string, not a node to descend into. */
const OPAQUE_OPS = new Set(['exists', 'ref']);

/**
 * Payload fields that are a *map* of author-chosen keys to expressions, rather
 * than a node. `emit.data` names its own fields, so its keys must never be
 * checked against the operator list.
 */
const RECORD_PAYLOAD_FIELDS: Record<string, ReadonlySet<string>> = {
  emit: new Set(['data']),
};

/**
 * Walk a DSL node and check its operator.
 *
 * Zod validates DSL nodes as a large union, and a union failure reports every
 * branch that did not match — which for `fgte` means a wall of irrelevant text.
 * This pass runs first and reports the single useful thing: the operator is not
 * one we know, and here is the one you probably meant.
 */
function lintDslNode(ctx: Context, node: unknown, path: string, kind: DslKind, depth = 0): void {
  if (depth > 24) return;

  if (Array.isArray(node)) {
    node.forEach((item, i) => lintDslNode(ctx, item, `${path}.${i}`, kind, depth + 1));
    return;
  }
  // Literals are valid expressions and valid predicates; nothing to check.
  if (typeof node !== 'object' || node === null) return;

  const allowed = OPS_BY_KIND[kind];
  const keys = Object.keys(node);

  if (keys.length === 0) {
    report(ctx, 'error', 'dsl_empty', path, 'empty object is not a valid ' + kind, null);
    return;
  }

  const operators = keys.filter((key) => allowed.includes(key));

  if (operators.length === 0) {
    const candidates = keys.filter((key) => !DSL_COMPANION_KEYS.has(key));
    const culprit = candidates[0] ?? keys[0]!;
    const guess = closest(culprit, allowed);

    report(
      ctx,
      'error',
      'dsl_unknown_operator',
      `${path}.${culprit}`,
      `"${culprit}" is not a valid ${kind} operator`,
      guess
        ? `did you mean "${guess}"?`
        : `valid ${kind} operators: ${allowed.slice(0, 12).join(', ')}${allowed.length > 12 ? ', …' : ''}`,
    );
    return;
  }

  if (operators.length > 1) {
    report(
      ctx,
      'error',
      'dsl_ambiguous',
      path,
      `this node has more than one operator: ${operators.join(', ')}`,
      'split it into separate nodes — one operator each',
    );
    return;
  }

  const operator = operators[0]!;
  if (OPAQUE_OPS.has(operator)) return;

  const payload = (node as Record<string, unknown>)[operator];
  const childKinds = CHILD_KINDS[operator];

  if (childKinds) {
    const uniform = childKinds['*'];
    if (uniform) {
      // `all`/`any`/`not`/`cond`: the payload is directly the child.
      lintDslNode(ctx, payload, `${path}.${operator}`, uniform, depth + 1);
      // `cond` carries `then`/`else` as siblings, and both are expressions.
      for (const companion of ['then', 'else']) {
        if (companion in (node as Record<string, unknown>)) {
          lintDslNode(ctx, (node as Record<string, unknown>)[companion], `${path}.${companion}`, 'expression', depth + 1);
        }
      }
      return;
    }
    // `if`/`repeat`/`forEach`/`let`: a payload object with named children.
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      for (const [key, child] of Object.entries(payload as Record<string, unknown>)) {
        const childKind = childKinds[key];
        if (childKind) lintDslNode(ctx, child, `${path}.${operator}.${key}`, childKind, depth + 1);
      }
    }
    return;
  }

  if (kind === 'effect') {
    // An effect payload is an object whose *values* are expressions — the
    // payload itself is not a node, so descend one level further.
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      const recordFields = RECORD_PAYLOAD_FIELDS[operator];
      for (const [key, child] of Object.entries(payload as Record<string, unknown>)) {
        if (typeof child !== 'object' || child === null) continue;

        if (recordFields?.has(key)) {
          // A map of author-named keys: only the values are expressions.
          for (const [dataKey, dataValue] of Object.entries(child as Record<string, unknown>)) {
            if (typeof dataValue === 'object' && dataValue !== null) {
              lintDslNode(ctx, dataValue, `${path}.${operator}.${key}.${dataKey}`, 'expression', depth + 1);
            }
          }
          continue;
        }

        lintDslNode(ctx, child, `${path}.${operator}.${key}`, 'expression', depth + 1);
      }
    }
    return;
  }

  // Predicate and expression operands are themselves expressions.
  lintDslNode(ctx, payload, `${path}.${operator}`, 'expression', depth + 1);
}

/**
 * Find DSL-bearing fields by name and check them.
 *
 * Matching on field name rather than walking the Zod schema keeps this pass
 * independent of the union structure, which is what lets it produce a good
 * message where Zod cannot.
 */
const DSL_FIELDS: readonly { key: string; kind: DslKind }[] = [
  { key: 'onUse', kind: 'effect' },
  { key: 'onMiss', kind: 'effect' },
  { key: 'onCritical', kind: 'effect' },
  { key: 'onApply', kind: 'effect' },
  { key: 'onTick', kind: 'effect' },
  { key: 'onExpire', kind: 'effect' },
  { key: 'onDepleted', kind: 'effect' },
  { key: 'onEnter', kind: 'effect' },
  { key: 'onStart', kind: 'effect' },
  { key: 'onComplete', kind: 'effect' },
  { key: 'onFail', kind: 'effect' },
  { key: 'onOpen', kind: 'effect' },
  { key: 'onBlocked', kind: 'effect' },
  { key: 'onTrigger', kind: 'effect' },
  { key: 'onDisarm', kind: 'effect' },
  { key: 'onSuccess', kind: 'effect' },
  { key: 'onFailure', kind: 'effect' },
  { key: 'onEncounter', kind: 'effect' },
  { key: 'effects', kind: 'effect' },
  { key: 'grants', kind: 'effect' },
  { key: 'when', kind: 'predicate' },
  { key: 'available', kind: 'predicate' },
  { key: 'completeWhen', kind: 'predicate' },
  { key: 'failWhen', kind: 'predicate' },
  { key: 'victoryWhen', kind: 'predicate' },
  { key: 'defeatWhen', kind: 'predicate' },
  { key: 'custom', kind: 'predicate' },
  { key: 'requires', kind: 'predicate' },
  { key: 'modifier', kind: 'expression' },
  { key: 'formula', kind: 'expression' },
  { key: 'max', kind: 'expression' },
  { key: 'amount', kind: 'expression' },
  { key: 'xp', kind: 'expression' },
];

const DSL_FIELD_MAP = new Map(DSL_FIELDS.map((field) => [field.key, field]));

function walkForDsl(ctx: Context, node: unknown, path: string, depth = 0): void {
  if (depth > 24 || typeof node !== 'object' || node === null) return;

  if (Array.isArray(node)) {
    node.forEach((item, i) => walkForDsl(ctx, item, `${path}.${i}`, depth + 1));
    return;
  }

  for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    const field = DSL_FIELD_MAP.get(key);

    // `requires` is a structured requirement object, not a predicate — only its
    // `custom` member is DSL, and that is matched on its own.
    if (field && key !== 'requires' && typeof child === 'object' && child !== null) {
      lintDslNode(ctx, child, childPath, field.kind);
    }
    walkForDsl(ctx, child, childPath, depth + 1);
  }
}

// ---------------------------------------------------------------------------
// Schema issues, with suggestions
// ---------------------------------------------------------------------------

function lintSchema(ctx: Context, document: unknown): boolean {
  const parsed = gameModuleSchema.safeParse(document);
  if (parsed.success) return true;

  for (const issue of parsed.error.issues) {
    const path = issue.path.join('.');

    if (issue.code === z.ZodIssueCode.unrecognized_keys) {
      // The single highest-value suggestion: a misspelled property name.
      for (const key of issue.keys) {
        const siblings = validKeysAt(issue.path);
        const guess = siblings ? closest(key, siblings) : null;
        report(
          ctx,
          'error',
          'unknown_property',
          path ? `${path}.${key}` : key,
          `"${key}" is not a recognised property here`,
          guess
            ? `did you mean "${guess}"?`
            : siblings
              ? suggestionFor(key, siblings)
              : 'remove it, or check the spelling',
        );
      }
      continue;
    }

    if (issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined') {
      report(ctx, 'error', 'missing_property', path, `"${path.split('.').pop()}" is required`, `expected ${issue.expected}`);
      continue;
    }

    if (issue.code === z.ZodIssueCode.invalid_type) {
      report(ctx, 'error', 'wrong_type', path, `expected ${issue.expected}, found ${issue.received}`, null);
      continue;
    }

    if (issue.code === z.ZodIssueCode.invalid_enum_value) {
      const guess = closest(String(issue.received), issue.options.map(String));
      report(
        ctx,
        'error',
        'invalid_value',
        path,
        `"${String(issue.received)}" is not allowed here`,
        guess ? `did you mean "${guess}"?` : `valid values: ${issue.options.join(', ')}`,
      );
      continue;
    }

    report(ctx, 'error', 'schema', path, issue.message, null);
  }

  return false;
}

/** The property names allowed at a path, for suggesting a correction. */
function validKeysAt(path: readonly (string | number)[]): string[] | null {
  let schema: z.ZodTypeAny = gameModuleSchema;

  for (const segment of path) {
    const unwrapped = unwrapSchema(schema);
    const def = unwrapped._def as { typeName?: string; type?: z.ZodTypeAny };

    if (def.typeName === 'ZodArray' && def.type) {
      schema = def.type;
      continue;
    }
    if (def.typeName === 'ZodObject') {
      const shape = (unwrapped as z.ZodObject<z.ZodRawShape>).shape;
      const next = shape[String(segment)];
      if (!next) return null;
      schema = next;
      continue;
    }
    return null;
  }

  const final = unwrapSchema(schema);
  const def = final._def as { typeName?: string; type?: z.ZodTypeAny };
  if (def.typeName === 'ZodArray' && def.type) {
    const element = unwrapSchema(def.type);
    if ((element._def as { typeName?: string }).typeName === 'ZodObject') {
      return Object.keys((element as z.ZodObject<z.ZodRawShape>).shape);
    }
    return null;
  }
  if (def.typeName !== 'ZodObject') return null;
  return Object.keys((final as z.ZodObject<z.ZodRawShape>).shape);
}

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (let i = 0; i < 20; i += 1) {
    const def = current._def as { typeName?: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny };
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault' || def.typeName === 'ZodNullable') {
      current = def.innerType!;
      continue;
    }
    if (def.typeName === 'ZodEffects') {
      current = def.schema!;
      continue;
    }
    return current;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Semantic checks
// ---------------------------------------------------------------------------

/**
 * Problems a schema cannot catch: content that exists but can never be
 * reached. These are warnings rather than errors — an author mid-build has
 * half-connected content constantly — but they are exactly the bugs that
 * otherwise surface only hours into playtesting.
 */
function lintSemantics(ctx: Context, document: Record<string, unknown>): void {
  const world = (document['world'] ?? {}) as Record<string, unknown>;
  const narrative = (document['narrative'] ?? {}) as Record<string, unknown>;
  const start = (document['start'] ?? {}) as Record<string, unknown>;

  const areas = asList(world['areas']);
  const pois = asList(world['pointsOfInterest']);
  const quests = asList(narrative['quests']);

  // Reachability: walk the connection graph from wherever play begins.
  if (areas.length > 0) {
    const startArea =
      (start['startingArea'] as string | undefined) ??
      (pois.find((p) => p['id'] === start['startingPoi'])?.['area'] as string | undefined) ??
      (areas[0]!['id'] as string);

    const reachable = new Set<string>();
    const queue = [startArea];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const area = areas.find((a) => a['id'] === id);
      for (const connection of asList(area?.['connections'])) {
        const to = connection['to'];
        if (typeof to === 'string') queue.push(to);
      }
    }

    for (const [i, area] of areas.entries()) {
      if (!reachable.has(String(area['id']))) {
        report(
          ctx,
          'warning',
          'unreachable_area',
          `world.areas.${i}`,
          `"${String(area['id'])}" cannot be reached from the starting area`,
          'add a connection from a reachable area, or players will never see it',
        );
      }
    }
  }

  // A gate with no way through is a dead end the author probably did not mean.
  for (const [i, gate] of asList(world['gates']).entries()) {
    const hasRequirement = gate['requires'] !== undefined;
    const hasBypass = gate['bypass'] !== undefined;
    const hasKey = asList(gate['opensWith']).length > 0;
    if (!hasRequirement && !hasBypass && !hasKey) {
      report(
        ctx,
        'warning',
        'impassable_gate',
        `world.gates.${i}`,
        `"${String(gate['id'])}" has no requirement, bypass, or opening ability`,
        'nothing can open it, so anything behind it is unreachable',
      );
    }
  }

  // A quest nothing offers and nothing unlocks can never start.
  const unlocked = new Set<string>();
  for (const quest of quests) for (const id of asList(quest['unlocks'])) unlocked.add(String(id));
  const offered = new Set<string>();
  for (const npc of asList((document['content'] as Record<string, unknown>)?.['npcs'])) {
    for (const id of asList(npc['offersQuests'])) offered.add(String(id));
  }

  for (const [i, quest] of quests.entries()) {
    const id = String(quest['id']);
    if (quest['autoStart'] === true || unlocked.has(id) || offered.has(id)) continue;
    if (quest['giver'] !== undefined) continue;
    report(
      ctx,
      'warning',
      'unobtainable_quest',
      `narrative.quests.${i}`,
      `"${id}" has no giver, is not offered by an NPC, and is not unlocked by another quest`,
      'set autoStart, give it a giver, or unlock it from another quest',
    );
  }

  // Points of interest whose parent area does not exist never appear anywhere.
  const areaIds = new Set(areas.map((a) => String(a['id'])));
  for (const [i, poi] of pois.entries()) {
    if (!areaIds.has(String(poi['area']))) {
      report(
        ctx,
        'error',
        'orphan_poi',
        `world.pointsOfInterest.${i}.area`,
        `"${String(poi['id'])}" belongs to area "${String(poi['area'])}", which does not exist`,
        'it would never appear in the world',
      );
    }
  }
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Lint a module.
 *
 * Pass `text` to get line and column numbers; pass an already-parsed object to
 * check a document held in memory, as the editor does.
 */
export function lintModule(input: string | unknown): LintResult {
  const out: Diagnostic[] = [];

  let document: unknown;
  let ctx: Context;

  if (typeof input === 'string') {
    try {
      const parsed = parseJsonWithSource(input);
      document = parsed.value;
      ctx = { text: input, spans: parsed.spans, out };
    } catch (err) {
      if (err instanceof JsonSyntaxError) {
        // Nothing else can run: report the syntax error alone, with the line.
        return {
          ok: false,
          value: undefined,
          diagnostics: [
            {
              severity: 'error',
              code: 'json_syntax',
              path: '',
              message: err.message,
              hint: err.hint,
              position: err.position,
              excerpt: excerpt(input, err.position),
            },
          ],
        };
      }
      throw err;
    }
  } else {
    document = input;
    ctx = { text: null, spans: null, out };
  }

  // DSL operators first: their messages are far better than the union errors
  // the schema pass would otherwise produce for the same mistake.
  walkForDsl(ctx, document, '');

  const schemaOk = lintSchema(ctx, document);

  if (schemaOk && typeof document === 'object' && document !== null) {
    lintSemantics(ctx, document as Record<string, unknown>);

    // Reference integrity and duplicate ids come from the compiler, so the
    // editor and the engine agree on what counts as valid.
    const compiled = compileModule(document);
    if (!compiled.ok) {
      for (const issue of compiled.errors) {
        const hint =
          issue.code === 'dangling_ref'
            ? refHint(document as Record<string, unknown>, issue.message)
            : null;
        report(ctx, 'error', issue.code, issue.path, issue.message, hint);
      }
    } else {
      for (const warning of compiled.warnings) {
        report(ctx, 'warning', warning.code, warning.path, warning.message, null);
      }
    }
  }

  // A DSL typo also fails the schema, as an unhelpful "Invalid input" on the
  // enclosing field. Drop those: the precise message is already there, and two
  // diagnostics for one mistake sends the author looking for a second bug.
  const dslPaths = out
    .filter((d) => d.code === 'dsl_unknown_operator' || d.code === 'dsl_ambiguous')
    .map((d) => d.path);
  const deduped = out.filter((d) => {
    if (d.code !== 'schema' && d.code !== 'wrong_type') return true;
    return !dslPaths.some((dslPath) => dslPath === d.path || dslPath.startsWith(`${d.path}.`));
  });

  const ordered = [...deduped].sort((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 } as const;
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return (a.position?.line ?? 0) - (b.position?.line ?? 0);
  });

  return {
    ok: !ordered.some((d) => d.severity === 'error'),
    diagnostics: ordered,
    value: document,
  };
}

/** For a dangling reference, suggest the nearest id that does exist. */
function refHint(document: Record<string, unknown>, message: string): string | null {
  const match = /^"(.+)" does not exist in (.+)$/.exec(message);
  if (!match) return null;
  const [, wanted, collection] = match as unknown as [string, string, string];

  const [section, name] = collection.split('.') as [string, string];
  const entries = asList((document[section] as Record<string, unknown> | undefined)?.[name]);
  const ids = entries.map((entry) => String(entry['id']));

  const guess = closest(wanted, ids);
  if (guess) return `did you mean "${guess}"?`;
  if (ids.length === 0) return `${collection} is empty — nothing can reference it yet`;
  return null;
}

/** Render diagnostics for a terminal. */
export function formatDiagnostics(diagnostics: readonly Diagnostic[], useColour = false): string {
  const paint = (code: string, text: string) => (useColour ? `[${code}m${text}[0m` : text);

  return diagnostics
    .map((d) => {
      const label =
        d.severity === 'error' ? paint('31', 'error') : d.severity === 'warning' ? paint('33', 'warning') : 'info';
      const where = d.position ? `${d.position.line}:${d.position.column}` : d.path || '<root>';
      const lines = [`${label} ${paint('2', where)}  ${d.message}`];
      if (d.path && d.position) lines.push(`      ${paint('2', d.path)}`);
      if (d.excerpt) lines.push(d.excerpt.split('\n').map((l) => `   ${paint('2', l)}`).join('\n'));
      if (d.hint) lines.push(`   ${paint('36', '→')} ${d.hint}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

export { COLLECTION_PATHS, ALL_DSL_OPS };
