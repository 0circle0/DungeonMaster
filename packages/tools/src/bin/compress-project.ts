/** `npm run compress -- <module-dir> [--write]` */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readAssembledModule } from '@dm/module/load';
import { asRecipe, expandRecipe, serializeProjectValue } from '@dm/module';
import type { Prefab, PrefabParam, PrefabRecipe, StyleTables } from '@dm/module';

/** Fields that are what an entry is, never a variant of something else. */
const IDENTITY = ['id', 'name', 'description'];

/** Above this many combinations a "variant" stops being a vocabulary. */
const MAX_VARIANTS = 16;

const json = (value: unknown): string => JSON.stringify(value ?? null);

interface Group {
  readonly key: string;
  readonly entries: readonly Record<string, unknown>[];
  readonly indexes: readonly number[];
}

/** Entries grouped by the prose pool they share and the order their keys are written in. */
function groupsOf(entries: readonly Record<string, unknown>[], collection: string): Group[] {
  const by = new Map<string, { entries: Record<string, unknown>[]; indexes: number[] }>();
  entries.forEach((entry, index) => {
    // The pool when there is one; the key order always, since byte-identity depends on it.
    const pool = typeof entry['descriptionKey'] === 'string' ? entry['descriptionKey'] : 'entry';
    const key = `${pool}|${Object.keys(entry).join(',')}`;
    const held = by.get(key) ?? { entries: [], indexes: [] };
    held.entries.push(entry);
    held.indexes.push(index);
    by.set(key, held);
  });
  // Named for the pool, numbered only when one pool is written several ways.
  const seen = new Map<string, number>();
  return [...by.entries()]
    .filter(([, held]) => held.entries.length >= 4)
    .map(([key, held]) => {
      const pool = key.split('|')[0]!;
      const n = (seen.get(pool) ?? 0) + 1;
      seen.set(pool, n);
      // Qualified by collection, and lower-cased before stripping so capitals survive.
      const base = `${collection.replace(/\./g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}_${pool}`;
      return { key: n === 1 ? base : `${base}_${n}`, entries: held.entries, indexes: held.indexes };
    });
}

interface Design {
  readonly prefab: Prefab;
  readonly style: StyleTables;
  readonly variantOf: (entry: Record<string, unknown>) => string | null;
  readonly free: readonly string[];
}

function design(group: Group, collection: string): Design | null {
  const fields = [...new Set(group.entries.flatMap((entry) => Object.keys(entry)))];

  const constant: string[] = [];
  const varying: string[] = [];
  for (const field of fields) {
    const values = new Set(group.entries.map((entry) => json(entry[field])));
    // A field absent from some entries cannot be a template constant.
    const everywhere = group.entries.every((entry) => field in entry);
    if (values.size === 1 && everywhere) constant.push(field);
    else varying.push(field);
  }

  const candidates = varying.filter((field) => !IDENTITY.includes(field));

  // A field only joins a vocabulary if its own spread is narrow enough.
  const vocabulary = candidates.filter((field) => {
    const distinct = new Set(group.entries.map((entry) => json(entry[field]))).size;
    return distinct <= MAX_VARIANTS && distinct * 3 <= group.entries.length;
  });

  // Then the largest subset of those that still moves together over few enough combinations.
  let variantFields = [...vocabulary].sort(
    (a, b) =>
      new Set(group.entries.map((entry) => json(entry[a]))).size
      - new Set(group.entries.map((entry) => json(entry[b]))).size,
  );
  while (variantFields.length > 0) {
    const combos = new Set(group.entries.map((entry) => json(variantFields.map((f) => entry[f]))));
    if (combos.size <= MAX_VARIANTS && combos.size * 2 <= group.entries.length) break;
    variantFields.pop();
  }
  if (variantFields.length < 2) variantFields = [];

  const free = candidates.filter((field) => !variantFields.includes(field));
  // Nothing to save: every field is either unique or already spelled out.
  if (constant.length === 0 && variantFields.length === 0) return null;

  const id = `${group.key}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const table = `${id}_variant`;
  const style: Record<string, Record<string, unknown>> = {};
  const names = new Map<string, string>();

  for (const entry of group.entries) {
    const combo = json(variantFields.map((field) => entry[field]));
    if (names.has(combo)) continue;
    const name = `v${names.size + 1}`;
    names.set(combo, name);
    const row: Record<string, unknown> = {};
    for (const field of variantFields) row[field] = entry[field];
    style[name] = row;
  }

  const params: PrefabParam[] = [];
  for (const field of IDENTITY) {
    if (fields.includes(field)) params.push({ key: field, kind: field === 'description' ? 'text' : 'string' });
  }
  for (const field of free) params.push({ key: field, kind: 'string' });
  if (variantFields.length > 0) {
    params.push({ key: 'variant', kind: 'enum', options: [...names.values()] });
  }

  // Template key order follows the entries' own, for byte-identity.
  const order = Object.keys(group.entries[0]!);
  const template: Record<string, unknown> = {};
  for (const field of order) {
    if (constant.includes(field)) template[field] = group.entries[0]![field];
    else if (variantFields.includes(field)) template[field] = { '@lookup': [table, '{{variant}}', field] };
    else if (params.some((param) => param.key === field)) template[field] = `{{${field}}}`;
  }

  return {
    prefab: { id, label: id, collection, params, template },
    style: variantFields.length > 0 ? { [table]: style } : {},
    variantOf: (entry) => names.get(json(variantFields.map((field) => entry[field]))) ?? null,
    free,
  };
}

function main(): number {
  const [arg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!arg) {
    process.stderr.write('usage: npm run compress -- <module-dir> [--write]\n');
    return 2;
  }
  const write = process.argv.includes('--write');
  const moduleDir = resolve(arg);
  const projectDir = join(moduleDir, 'project');
  if (!existsSync(projectDir)) {
    process.stderr.write(`x ${projectDir} does not exist\n`);
    return 1;
  }

  const manifest = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8')) as {
    sections: Record<string, { collections: Record<string, string[]> }>;
  };
  const doc = readAssembledModule(moduleDir).doc as Record<string, Record<string, unknown[]>>;

  const prefabs: Prefab[] = [];
  let style: StyleTables = {};
  const written = new Map<string, string>();
  let before = 0;
  let after = 0;
  let recipes = 0;
  let literal = 0;
  const perCollection = new Map<string, { before: number; after: number }>();

  for (const [section, plan] of Object.entries(manifest.sections)) {
    for (const [name, files] of Object.entries(plan.collections)) {
      const entries = (doc[section]?.[name] ?? []) as Record<string, unknown>[];
      const collection = `${section}.${name}`;

      for (const group of groupsOf(entries, collection)) {
        const made = design(group, collection);
        if (!made) continue;

        prefabs.push(made.prefab);
        style = { ...style, ...made.style };

        group.indexes.forEach((index, n) => {
          const entry = group.entries[n]!;
          const params: Record<string, unknown> = {};
          for (const param of made.prefab.params) {
            params[param.key] = param.key === 'variant' ? made.variantOf(entry) : entry[param.key];
          }

          const text = serializeProjectValue(asRecipe(entry, made.prefab, params, made.style));
          // Expanded from the text, so the check sees the bytes that will be on disk.
          const { entry: rebuilt } = expandRecipe(JSON.parse(text) as PrefabRecipe, [made.prefab], made.style);
          // Serialized, so key order counts.
          if (JSON.stringify(rebuilt) !== JSON.stringify(entry)) return;

          written.set(`${section}/${name}/${files[index]!}`, text);
        });
      }
    }
  }

  for (const [section, plan] of Object.entries(manifest.sections)) {
    for (const [name, files] of Object.entries(plan.collections)) {
      for (const file of files) {
        const path = `${section}/${name}/${file}`;
        const original = readFileSync(join(projectDir, path), 'utf8');
        before += original.length;
        const size = perCollection.get(`${section}/${name}`) ?? { before: 0, after: 0 };
        size.before += original.length;

        const next = written.get(path);
        if (next && next.length < original.length) {
          after += next.length;
          size.after += next.length;
          recipes += 1;
          if (write) writeFileSync(join(projectDir, path), next);
        } else {
          after += original.length;
          size.after += original.length;
          literal += 1;
          written.delete(path);
        }
        perCollection.set(`${section}/${name}`, size);
      }
    }
  }

  if (write) {
    // Only the prefabs that earned a recipe, and only the style rows they use.
    const used = new Set([...written.values()].map((text) => (JSON.parse(text) as { '@prefab': string })['@prefab']));
    const prefabDir = join(projectDir, 'prefabs');
    mkdirSync(prefabDir, { recursive: true });

    const keptStyle: Record<string, unknown> = {};
    for (const prefab of prefabs) {
      if (!used.has(prefab.id)) continue;
      writeFileSync(join(prefabDir, `${prefab.id}.json`), `${JSON.stringify(prefab, null, 2)}\n`);
      const table = `${prefab.id}_variant`;
      if (style[table]) keptStyle[table] = style[table];
    }
    writeFileSync(join(projectDir, 'style.json'), `${JSON.stringify(keptStyle, null, 2)}\n`);
  }

  const pct = before > 0 ? Math.round((1 - after / before) * 100) : 0;
  const rows = [...perCollection.entries()]
    .sort((a, b) => b[1].before - a[1].before)
    .slice(0, 10)
    .map(([name, size]) => {
      const saved = size.before > 0 ? Math.round((1 - size.after / size.before) * 100) : 0;
      return `  ${String(Math.round(size.before / 1024)).padStart(5)} KB  ${String(saved).padStart(3)}%  ${name}`;
    });

  process.stdout.write(
    `${prefabs.length} prefabs, ${recipes} entries as recipes, ${literal} left literal\n` +
      `entry bytes ${before} -> ${after}  (${pct}% smaller)${write ? '' : '   [dry run, pass --write]'}\n` +
      `\nlargest collections, and what came off each:\n${rows.join('\n')}\n`,
  );
  return 0;
}

process.exit(main());
