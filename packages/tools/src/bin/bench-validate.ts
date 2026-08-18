/**
 * `npm run bench -- modules/<name>`
 *
 * What one keystroke in the editor costs.
 *
 * The studio revalidates the whole document on every change, so the number this
 * prints is the editor's frame budget rather than a CLI timing. It is here
 * because the cost is dominated by one line — `gameModuleSchema.safeParse` — in
 * a way that is invisible from the outside: on `modules/aurendel` the parse is
 * ~610 ms and *everything else the compiler does* is single-digit milliseconds.
 * Anyone optimising this file's other passes would be optimising noise.
 *
 * Deliberately not a test. A latency budget asserted in CI fails on a busy
 * machine and teaches people to skip the suite; this is a thing you run when
 * you have changed something and want to know which way it moved.
 */

import { readFileSync } from 'node:fs';
import { gameModuleSchema } from '@dm/module';
import { compileModule, compileParsed, hashModule, lintModule } from '@dm/module';
import { ValidationIndex, buildReferenceIndex } from '@dm/module';
import { readAssembledModule, resolveModulePath } from '@dm/module/load';

/** The editor's `setAt`, in miniature: copy the spine, share everything else. */
function setAt(doc: unknown, path: readonly (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  if (typeof head === 'number') {
    const list = Array.isArray(doc) ? [...(doc as unknown[])] : [];
    list[head] = setAt(list[head], rest, value);
    return list;
  }
  const object = { ...((doc as Record<string, unknown> | undefined) ?? {}) };
  object[head] = setAt(object[head], rest, value);
  return object;
}

/** Median of several runs: a single timing is mostly whatever else the CPU was doing. */
function time(label: string, runs: number, fn: () => void): void {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const started = performance.now();
    fn();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] ?? 0;
  process.stdout.write(`  ${label.padEnd(34)} ${median.toFixed(1).padStart(7)} ms\n`);
}

function main(): number {
  const arg = process.argv[2];
  if (!arg) {
    process.stderr.write('usage: npm run bench -- <module-dir-or-json>\n');
    return 2;
  }

  let doc: Record<string, unknown>;
  let text: string;
  try {
    const path = resolveModulePath(arg);
    text = readFileSync(path, 'utf8');
    doc = readAssembledModule(path).doc;
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

  const parsed = gameModuleSchema.safeParse(doc);
  if (!parsed.success) {
    process.stderr.write(`${arg} does not pass the schema; fix it before benchmarking\n`);
    return 1;
  }

  process.stdout.write(`\n${arg} — ${(JSON.stringify(doc).length / 1e6).toFixed(2)} MB\n\n`);

  process.stdout.write('  the parts\n');
  time('JSON.stringify', 5, () => void JSON.stringify(doc, null, 2));
  time('gameModuleSchema.safeParse', 5, () => void gameModuleSchema.safeParse(doc));
  time('compileParsed (no parse)', 5, () => void compileParsed(parsed.data));
  time('hashModule', 5, () => void hashModule(parsed.data));

  process.stdout.write('\n  the whole thing\n');
  time('compileModule (parse + compile)', 5, () => void compileModule(doc));
  time('lintModule (object)', 3, () => void lintModule(doc));
  time('lintModule (text, with spans)', 3, () => void lintModule(text));

  // What the editor actually pays once a session is warm: one field changed,
  // every other entry shared with the previous document.
  process.stdout.write('\n  one keystroke, warm\n');
  const index = new ValidationIndex();
  index.parse(doc);
  let edited: unknown = doc;
  let n = 0;
  time('ValidationIndex.parse', 20, () => {
    n += 1;
    edited = setAt(edited, ['meta', 'description'], `edit ${n}`);
    void index.parse(edited);
  });
  time('  + compileParsed', 10, () => {
    n += 1;
    edited = setAt(edited, ['meta', 'description'], `edit ${n}`);
    const parse = index.parse(edited);
    if (parse.ok) compileParsed(parse.data);
  });
  time('  + hash', 10, () => {
    n += 1;
    edited = setAt(edited, ['meta', 'description'], `edit ${n}`);
    const parse = index.parse(edited);
    if (parse.ok) {
      compileParsed(parse.data);
      hashModule(parse.data);
    }
  });
  time('lintModule(doc, { index })', 10, () => {
    n += 1;
    edited = setAt(edited, ['meta', 'description'], `edit ${n}`);
    void lintModule(edited, { index });
  });
  // What the store adds on top of the lint, for the raw JSON view and export.
  time('  + JSON.stringify for the view', 10, () => {
    n += 1;
    edited = setAt(edited, ['meta', 'description'], `edit ${n}`);
    void lintModule(edited, { index });
    void JSON.stringify(edited, null, 2);
  });

  // Other whole-document walks the editor does per edit, which the parse cache
  // does nothing for.
  process.stdout.write('\n  other per-edit walks\n');
  time('buildReferenceIndex (UsedBy)', 5, () => void buildReferenceIndex(doc));

  process.stdout.write('\n');
  return 0;
}

process.exit(main());
