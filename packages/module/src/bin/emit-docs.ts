/**
 * `npm run docs`
 *
 * Generates the module format reference from the Zod schemas.
 *
 * Hand-written reference documentation for a format this size would be wrong
 * within a week. This walks the actual schemas, so every field, default, and
 * cross-reference in the reference is what the validator truly enforces. The
 * prose docs under `docs/` explain the ideas; this explains the fields.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { gameModuleSchema, COLLECTION_PATHS } from '../schema/module.js';
import { EXPR_OPS, PREDICATE_OPS, EFFECT_OPS } from '../dsl/eval.js';
import { SYSTEM_TEXT } from '../schema/systemText.js';

interface Unwrapped {
  schema: z.ZodTypeAny;
  optional: boolean;
  defaultValue: unknown;
  description: string | null;
}

function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let current = schema;
  let optional = false;
  let defaultValue: unknown;
  let description: string | null = current.description ?? null;

  for (let i = 0; i < 20; i += 1) {
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
        current = def['schema'] as z.ZodTypeAny;
        continue;
      default:
        return { schema: current, optional, defaultValue, description };
    }
  }
  return { schema: current, optional, defaultValue, description };
}

/** A short type name, with `ref:` markers rendered as links to the target. */
function typeName(schema: z.ZodTypeAny, depth = 0): string {
  if (depth > 6) return '…';
  const { schema: inner, description } = unwrap(schema);
  const def = inner._def as { typeName?: string; [k: string]: unknown };

  if (description?.startsWith('ref:')) {
    const target = description.slice(4);
    return `[→ ${target}](#${target.replace('.', '')})`;
  }

  switch (def.typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodEnum':
      return (def['values'] as string[]).map((v) => `\`${v}\``).join(' \\| ');
    case 'ZodLiteral':
      return `\`${String(def['value'])}\``;
    case 'ZodArray':
      return `${typeName(def['type'] as z.ZodTypeAny, depth + 1)}[]`;
    case 'ZodRecord':
      return `{ ${typeName(def['keyType'] as z.ZodTypeAny, depth + 1)}: ${typeName(def['valueType'] as z.ZodTypeAny, depth + 1)} }`;
    case 'ZodObject':
      return 'object';
    case 'ZodUnion':
    case 'ZodLazy':
      return '[DSL](#the-dsl)';
    case 'ZodTuple':
      return 'tuple';
    case 'ZodUnknown':
    case 'ZodAny':
      return 'any';
    default:
      return def.typeName?.replace('Zod', '').toLowerCase() ?? 'unknown';
  }
}

function formatDefault(value: unknown): string {
  if (value === undefined) return '';
  if (Array.isArray(value) && value.length === 0) return '`[]`';
  if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return '`{}`';
  return `\`${JSON.stringify(value)}\``;
}

/**
 * Shared object schemas are documented once and linked to thereafter.
 *
 * `requirement` alone appears on some thirty entities; without this the
 * reference recurses into it every time and runs to fifteen thousand lines of
 * duplicates. Identity is the schema object itself, which Zod shares between
 * every use site.
 */
const emitted = new Map<z.ZodTypeAny, string>();

/** A stable anchor for a shared type, derived from where it was first seen. */
function anchorFor(schema: z.ZodTypeAny, fallback: string): string {
  return emitted.get(schema) ?? fallback;
}

/**
 * What the engine says, key by key.
 *
 * Written from the registry rather than the schema shape, because the two
 * things an author needs — whether a key is mandatory and which placeholders
 * it must keep — live there and not in the Zod type.
 */
function systemTextSection(heading: string, anchor: string): string[] {
  const lines = [
    `### ${heading}`,
    '',
    `<a id="${anchor}"></a>`,
    '',
    'Every sentence the engine produces. The engine holds no prose of its own: it',
    'emits a key and its facts, and these decide the words. A value may be a string',
    'or `{ "pool": "<textGrammar id>" }` for weighted variation.',
    '',
    '**Fragments** are pieces other messages are built from — the word `{outcome}`',
    'in an attack line. A module must declare them, because nothing sensible can',
    'stand in for a missing one and the sentence around it would render with a hole.',
    '**Messages** stand alone and carry a default, so you write only what you want',
    'to change. `npm run systemtext -- <module>` writes the whole set into a module.',
    '',
    'Placeholders listed here are the ones a message cannot lose; `compileModule`',
    'rejects a module that drops one.',
    '',
    '| Key | Tier | Must keep | Default |',
    '| --- | --- | --- | --- |',
  ];

  for (const item of SYSTEM_TEXT) {
    const keeps = item.placeholders.map((name: string) => `\`{${name}}\``).join(' ') || '—';
    lines.push(
      `| \`${item.key}\` | ${item.tier} | ${keeps} | ${formatDefault(item.text)} |`,
    );
  }

  lines.push('');
  return lines;
}

function documentObject(
  schema: z.ZodTypeAny,
  heading: string,
  anchor: string,
  depth = 0,
): string[] {
  const { schema: inner } = unwrap(schema);
  if ((inner._def as { typeName?: string }).typeName !== 'ZodObject') return [];
  if (emitted.has(inner)) return [];
  if (depth > 4) return [];

  emitted.set(inner, anchor);

  // `systemText` is nearly two hundred message keys and gets a section of its
  // own, written from the registry so it can show tier and placeholders — a
  // generic field table would say much less at ten times the length.
  if (anchor.endsWith('-systemText')) return systemTextSection(heading, anchor);

  const shape = (inner as z.ZodObject<z.ZodRawShape>).shape;
  const lines = [
    `### ${heading}`,
    '',
    `<a id="${anchor}"></a>`,
    '',
    '| Field | Type | Required | Default |',
    '| --- | --- | --- | --- |',
  ];

  const children: { schema: z.ZodTypeAny; heading: string; anchor: string }[] = [];

  for (const [key, child] of Object.entries(shape)) {
    const meta = unwrap(child);
    const def = meta.schema._def as { typeName?: string; type?: z.ZodTypeAny };
    const isArray = def.typeName === 'ZodArray';
    const target = isArray ? unwrap(def.type!).schema : meta.schema;
    const isObject = (target._def as { typeName?: string }).typeName === 'ZodObject';

    let rendered = typeName(child);
    if (isObject && key !== 'extra') {
      const childAnchor = `${anchor}-${key}`;
      const link = anchorFor(target, childAnchor);
      rendered = `[object](#${link})${isArray ? '[]' : ''}`;
      if (!emitted.has(target)) {
        children.push({ schema: target, heading: `${heading} → \`${key}\``, anchor: childAnchor });
      }
    }

    const required = meta.optional ? '' : '**yes**';
    lines.push(`| \`${key}\` | ${rendered} | ${required} | ${formatDefault(meta.defaultValue)} |`);
  }

  lines.push('');
  for (const child of children) {
    lines.push(...documentObject(child.schema, child.heading, child.anchor, depth + 1));
  }
  return lines;
}

function main(): number {
  const out = resolve(process.argv[2] ?? 'docs/reference.md');
  const shape = gameModuleSchema.shape as Record<string, z.ZodTypeAny>;

  const lines: string[] = [
    '# Module format reference',
    '',
    '> Generated from the Zod schemas by `npm run docs`. Do not edit by hand —',
    '> this is the format the validator actually enforces.',
    '',
    'A module is one JSON document. Every field below is real; anything not listed',
    'is rejected, so a misspelled property is a load error rather than a field that',
    'silently does nothing.',
    '',
    '## Extending the format',
    '',
    'Every substantial entity carries an `extra` object: an open bag of your own',
    'data that the engine passes through untouched and content can read with',
    '`{ "ref": "…" }`. Put house rules, custom stats, and anything the format does',
    'not anticipate there. It is the supported way to exceed what ships.',
    '',
    '## Top level',
    '',
    ...documentObject(gameModuleSchema, 'Module', 'module').slice(1),
    '',
    '## The DSL',
    '',
    'Behaviour is written as JSON. One evaluator serves ability effects, item procs,',
    'trap triggers, dialogue gates, loot rules, and quest objectives.',
    '',
    `**Expression operators** — ${[...EXPR_OPS].map((o) => `\`${o}\``).join(', ')}`,
    '',
    `**Predicate operators** — ${[...PREDICATE_OPS].map((o) => `\`${o}\``).join(', ')}`,
    '',
    `**Effect operators** — ${[...EFFECT_OPS].map((o) => `\`${o}\``).join(', ')}`,
    '',
    'Reads go through one mechanism: `{ "ref": "actor.attr.might" }` walks the scope',
    'the engine supplies. There is deliberately no `hasFlag` or `hasItem` operator,',
    'because those are ordinary paths — `flags.met_vess`, `actor.inventory.rope`.',
    '',
    'One of each, shaped the way the editor expects them:',
    '',
    '```jsonc',
    '// expression — a number: the actor\'s level plus two',
    '{ "add": [ { "ref": "actor.level" }, 2 ] }',
    '',
    '// predicate — a yes or no: might of at least 14',
    '{ "gte": [ { "ref": "actor.attr.might" }, 14 ] }',
    '',
    '// effects — a list of things that happen: 1d6 damage to the target',
    '[ { "damage": { "target": { "ref": "target.id" }, "amount": { "roll": "1d6" } } } ]',
    '```',
    '',
    '## Collections',
    '',
    'Every addressable collection, each entry identified by its `id`:',
    '',
    ...COLLECTION_PATHS.map((path) => `- \`${path}\``),
    '',
  ];

  // One section per top-level area of the document.
  for (const [section, label] of [
    ['rules', 'Rules'],
    ['content', 'Content'],
    ['world', 'World'],
    ['narrative', 'Narrative'],
    ['start', 'Start'],
    ['meta', 'Meta'],
  ] as const) {
    const sectionSchema = shape[section];
    if (!sectionSchema) continue;
    lines.push(`## ${label}`, '');
    lines.push(...documentObject(sectionSchema, label, section));
    lines.push('');
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`✓ wrote ${out} (${lines.length} lines)\n`);
  return 0;
}

process.exit(main());
