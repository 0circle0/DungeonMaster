/**
 * `npm run check:generated`
 *
 * Regenerate every module that has a generator, and prove nothing moved.
 *
 * Two representations of one world drift unless something checks. The project
 * format is gated in `project.test.ts`; this is the other half, and it was the
 * one with nothing watching it: `modules/aurendel` and `modules/core_fantasy`
 * are written by 24k lines of Python, and until now the only thing standing
 * between a change in `dmkit` and a silently different world was somebody
 * remembering to run the build and read the diff.
 *
 * It matters most while both paths are alive. The Python is being deprecated
 * in favour of the studio, and a deprecation with no test is how a fork
 * happens instead — the generators quietly stop reproducing what is committed,
 * and by the time anyone runs them the committed file is the only truth and
 * the source that made it is fiction.
 *
 * Not part of `npm run check`: it shells out to Python, takes a minute, and
 * writes to the working tree. It restores anything it changed, and says what
 * changed rather than leaving it changed.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());

/**
 * Generators in the order they have to run: `build.py` reads
 * `core_fantasy/module.json` to compose the ruleset in, and `staticmaps.py`
 * writes the map folders that `build.py`'s output refers to.
 */
const GENERATORS = [
  'modules/core_fantasy/gen_core.py',
  'modules/aurendel/src/staticmaps.py',
  'modules/aurendel/src/build.py',
] as const;

/** Everything the generators are allowed to write. */
const OUTPUTS = [
  'modules/core_fantasy/module.json',
  'modules/aurendel/module.json',
  'modules/aurendel/maps',
] as const;

function snapshot(): Map<string, string> {
  const out = new Map<string, string>();
  const take = (path: string): void => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) take(join(path, entry));
      return;
    }
    out.set(relative(root, path), readFileSync(path, 'utf8'));
  };
  for (const target of OUTPUTS) take(join(root, target));
  return out;
}

function main(): number {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
  } catch {
    process.stderr.write('python3 is not available — skipping the generated-module check.\n');
    return 0;
  }

  const before = snapshot();
  process.stdout.write(`${before.size} generated files\n`);

  for (const script of GENERATORS) {
    if (!existsSync(join(root, script))) {
      process.stderr.write(`missing generator: ${script}\n`);
      return 1;
    }
    try {
      execFileSync('python3', [script], { cwd: root, stdio: 'pipe' });
    } catch (err) {
      const detail = err instanceof Error && 'stderr' in err ? String((err as { stderr: Buffer }).stderr) : '';
      process.stderr.write(`✗ ${script} failed\n${detail}\n`);
      restore(before);
      return 1;
    }
    process.stdout.write(`  ran ${script}\n`);
  }

  const after = snapshot();
  const changed: string[] = [];
  for (const [path, text] of after) {
    if (before.get(path) !== text) changed.push(path);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changed.push(`${path} (removed)`);
  }

  if (changed.length === 0) {
    process.stdout.write('✓ every generated module reproduces exactly what is committed\n');
    return 0;
  }

  // Put the tree back. A check that leaves a hundred modified files behind is
  // one people stop running, and the diff is recoverable by rerunning the
  // generators deliberately.
  restore(before);
  process.stderr.write(
    `✗ ${changed.length} generated file(s) no longer match what is committed:\n` +
      changed.slice(0, 20).map((path) => `    ${path}\n`).join('') +
      (changed.length > 20 ? `    …and ${changed.length - 20} more\n` : '') +
      '\nThe working tree has been restored. Either the generators changed and the\n' +
      'modules need regenerating, or the modules were edited by hand and the\n' +
      'generators no longer describe them.\n',
  );
  return 1;
}

function restore(before: ReadonlyMap<string, string>): void {
  for (const [path, text] of before) writeFileSync(join(root, path), text);
}

process.exit(main());
