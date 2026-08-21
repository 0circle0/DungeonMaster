/** `npm run docs` */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { COLLECTION_PATHS } from '../schema/module.js';
import { EXPR_OPS, PREDICATE_OPS, EFFECT_OPS } from '../dsl/eval.js';
import { SYSTEM_TEXT } from '../schema/systemText.js';
import { FIELD_DOCS } from '../schema/fieldDocs.js';
import { walkModuleSchema, type SectionRow, type TypeNode } from '../schema/walk.js';

/** Stable anchor for a section path. */
function anchorFor(path: string): string {
  return path === '' ? 'module' : `module-${path.replace(/\./g, '-')}`;
}

/** `content.npcs` reads as ``Module → `content` → `npcs` ``. */
function headingFor(trail: string[]): string {
  return ['Module', ...trail.map((part) => `\`${part}\``)].join(' → ');
}

function renderType(node: TypeNode): string {
  switch (node.kind) {
    case 'scalar':
      return node.name;
    case 'id':
      return 'id';
    case 'dice':
      return '[dice](#dice-notation)';
    case 'ref':
      return `[→ ${node.target}](#${anchorFor(node.target)})`;
    case 'enum':
      return node.values.map((value) => `\`${value}\``).join(' \\| ');
    case 'literal':
      return `\`${node.value}\``;
    case 'object': {
      const label = node.variants ? `object, ${node.variants} variants` : 'object';
      return node.section ? `[${label}](#${anchorFor(node.section)})` : label;
    }
    case 'dsl':
      return `[${node.dsl}](#the-dsl)`;
    case 'array':
      return `${renderType(node.of)}[]`;
    case 'record':
      return `{ ${renderType(node.key)}: ${renderType(node.value)} }`;
    case 'union':
      return node.of.map(renderType).join(' \\| ');
  }
}

function formatDefault(value: unknown): string {
  if (value === undefined) return '';
  if (Array.isArray(value) && value.length === 0) return '`[]`';
  if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) return '`{}`';
  return `\`${JSON.stringify(value).replace(/\|/g, '\\|')}\``;
}

/** What the engine says, key by key. */
function systemTextSection(section: SectionRow): string[] {
  const lines = [
    `### ${headingFor(section.trail)}`,
    '',
    `<a id="${anchorFor(section.path)}"></a>`,
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
    '| Key | Tier | Must keep | What it says | Default |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const item of SYSTEM_TEXT) {
    const keeps = item.placeholders.map((name: string) => `\`{${name}}\``).join(' ') || '—';
    const doc = (item as { doc?: string }).doc ?? '';
    lines.push(
      `| \`${item.key}\` | ${item.tier} | ${keeps} | ${doc.replace(/\|/g, '\\|')} | ${formatDefault(item.text)} |`,
    );
  }

  lines.push('');
  return lines;
}

function fieldTable(section: SectionRow): string[] {
  const lines = [
    '| Field | Type | Required | Default | What it does |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const field of section.fields) {
    const doc = (FIELD_DOCS[field.path] ?? '').replace(/\|/g, '\\|');
    lines.push(
      `| \`${field.key}\` | ${renderType(field.type)} | ${field.required ? '**yes**' : ''}`
        + ` | ${formatDefault(field.defaultValue)} | ${doc} |`,
    );
  }
  lines.push('');
  return lines;
}

function renderSection(section: SectionRow, heading: boolean): string[] {
  if (section.fromRegistry) return systemTextSection(section);
  const lines: string[] = [];
  if (heading) lines.push(`### ${headingFor(section.trail)}`, '');
  lines.push(`<a id="${anchorFor(section.path)}"></a>`, '');
  lines.push(...fieldTable(section));
  return lines;
}

/** The document's own fields first, then one heading per top-level area. */
const AREAS: readonly (readonly [string, string])[] = [
  ['mods', 'Mods'],
  ['meta', 'Meta'],
  ['rules', 'Rules'],
  ['content', 'Content'],
  ['world', 'World'],
  ['narrative', 'Narrative'],
  ['start', 'Start'],
];

function main(): number {
  const out = resolve(process.argv[2] ?? 'docs/reference.md');
  const sections = walkModuleSchema();
  const root = sections.find((section) => section.path === '');
  if (!root) throw new Error('the walk produced no root section');

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
    ...renderSection(root, false),
  ];

  for (const [area, label] of AREAS) {
    const owned = sections.filter((section) => section.trail[0] === area);
    if (owned.length === 0) continue;
    lines.push(`## ${label}`, '');
    for (const section of owned) lines.push(...renderSection(section, true));
  }

  lines.push(
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
    '',
    '// rule — a predicate and the effects it gates, used by traits and procs',
    '{ "when": { "test": { "ref": "flags.moonlit" } },',
    '  "then": [ { "applyCondition": { "target": { "ref": "actor.id" },',
    '                                  "condition": "emboldened" } } ] }',
    '```',
    '',
    '### Dice notation',
    '',
    '<a id="dice-notation"></a>',
    '',
    '`1d20` · `2d6+3` · `4d6kh3` (keep highest 3) · `2d20kh1` (advantage) ·',
    '`2d20kl1` (disadvantage) · `1d8+1d4-1`. Notation is validated at load, so a typo',
    'is a load error rather than an exception thrown mid-combat.',
    '',
    '## Collections',
    '',
    'Every addressable collection, each entry identified by its `id`:',
    '',
    ...COLLECTION_PATHS.map((path) => `- [\`${path}\`](#${anchorFor(path)})`),
    '',
  );

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`✓ wrote ${out} (${lines.length} lines)\n`);
  return 0;
}

process.exit(main());
