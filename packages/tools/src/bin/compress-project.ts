/**
 * `npm run compress -- <module-dir> [--write]`
 *
 * Turn a project's entry files into recipes: a prefab id, a handful of
 * parameters, and whatever the prefab did not reproduce.
 *
 * Aurendel's 597 points of interest are thirteen shapes filled in over and over
 * — the Python that made them says so, and the data agrees: group them by their
 * description pool and 107 are houses, 61 are stores, 45 are inns. Storing each
 * one whole writes the same eleven keys 597 times.
 *
 * ## How a prefab is found rather than guessed
 *
 * Per group, every field is sorted into one of three kinds:
 *
 *   - **constant** — one value across the whole group, so it belongs in the
 *     template and is written once instead of N times;
 *   - **co-varying** — several fields that move together over a small set of
 *     combinations, which becomes a style table and a single `variant`
 *     parameter. This is where the compression actually is: an inn's map,
 *     services and travel time are one fact about what kind of inn it is, and
 *     `place.py` spelled that as `TRADE_PALETTE` and `ROOM_SIZES`;
 *   - **free** — genuinely per-entry, so a parameter.
 *
 * Nothing is inferred about *meaning*; this is arithmetic over the values that
 * are there.
 *
 * ## Why it cannot produce a wrong module
 *
 * Every recipe is expanded again and compared to the entry it replaced, as
 * serialized text so key order counts. An entry that does not round-trip keeps
 * its literal file. The worst outcome is a project that did not get smaller.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readAssembledModule } from '@dm/module/load';
import { asRecipe, expandRecipe } from '@dm/module';
import type { Prefab, PrefabParam, StyleTables } from '@dm/module';

/** Fields that are what an entry *is*, never a variant of something else. */
const IDENTITY = ['id', 'name', 'description'];

/** Above this many combinations a "variant" stops being a vocabulary. */
const MAX_VARIANTS = 16;

const json = (value: unknown): string => JSON.stringify(value ?? null);

interface Group {
  readonly key: string;
  readonly entries: readonly Record<string, unknown>[];
  readonly indexes: readonly number[];
}

/**
 * Entries that plainly came from one shape: the prose pool they share, **and**
 * the order their keys are written in.
 *
 * The order half is not fussiness. A template emits keys in its own order and a
 * rebuilt module has to match `module.json` byte for byte, so two entries that
 * differ only in where `position` sits cannot come from one template. It costs
 * little: Aurendel's forty-five inns are written two ways, its hundred and
 * seven houses five, so the split makes more prefabs rather than fewer recipes.
 */
function groupsOf(entries: readonly Record<string, unknown>[], collection: string): Group[] {
  const by = new Map<string, { entries: Record<string, unknown>[]; indexes: number[] }>();
  entries.forEach((entry, index) => {
    // The pool when there is one, because it is the most legible name a
    // generated prefab can have; the key order always, because a template emits
    // one order and byte-identity depends on it.
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
      // Qualified by collection because prefabs share one flat folder and
      // `expandRecipe` resolves by id alone — every collection was producing
      // its own `entry`, and a monster was being rebuilt from an attribute.
      // Lower-cased *before* stripping, or every capital is simply deleted and
      // `world.pointsOfInterest` comes out as `world_points_f_nterest`.
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
    // A field absent from some entries cannot be a template constant: the
    // template would give it to everyone.
    const everywhere = group.entries.every((entry) => field in entry);
    if (values.size === 1 && everywhere) constant.push(field);
    else varying.push(field);
  }

  const candidates = varying.filter((field) => !IDENTITY.includes(field));

  // A field can only belong to a vocabulary if it has one: `position` is
  // different for every entry and `area` takes fifty-five values, so neither is
  // a variant of anything and including them would poison every combination
  // they appear in. Filtering on each field's own spread before looking at
  // combinations is the whole difference between finding `TRADE_PALETTE` and
  // finding nothing.
  const vocabulary = candidates.filter((field) => {
    const distinct = new Set(group.entries.map((entry) => json(entry[field]))).size;
    return distinct <= MAX_VARIANTS && distinct * 3 <= group.entries.length;
  });

  // Then the largest subset of those that still moves together over few enough
  // combinations. Dropping the widest field first is what makes this converge.
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

  // Template key order follows the entries' own, because a rebuilt module has
  // to match `module.json` byte for byte and key order is part of that.
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

          const recipe = asRecipe(entry, made.prefab, params, made.style);
          const { entry: rebuilt } = expandRecipe(recipe, [made.prefab], made.style);
          // Serialized, so key order counts. Anything that does not survive
          // keeps the literal file it already had.
          if (JSON.stringify(rebuilt) !== JSON.stringify(entry)) return;

          const file = `${section}/${name}/${files[index]!}`;
          written.set(file, `${JSON.stringify(recipe, null, 2)}\n`);
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
    // Only the prefabs that earned a recipe, and only the style rows they use:
    // a prefab nothing points at is a file somebody has to wonder about later.
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
