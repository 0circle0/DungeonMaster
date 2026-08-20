/**
 * `npm run check:content`
 *
 * Prove the shipped examples still are what the repository says they are.
 *
 * The artifacts are generated, gitignored binaries, so nothing about them shows
 * up in a diff — which makes "edit a world, forget to run `npm run content`" a
 * mistake with no symptom until a deployment serves the old one. The committed
 * `modules/content-manifest.json` is the fix: it carries the id, version, hash
 * and size of every module that ships, so a content change *is* a readable
 * one-line diff and forgetting to regenerate is a failed check rather than a
 * discovery made later.
 *
 * This belongs inside `npm run check`: it shells out to nothing, takes under a
 * second, and — importantly — never writes to the working tree. A check that
 * leaves files behind is one people stop running. That is what retired
 * `check:generated`, which re-ran the Python and diffed its output: once the
 * `project/` trees became the source, re-running a generator was the one thing
 * nobody should do.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { buildAll, manifestOf, MANIFEST_PATH } from './build-content.js';
import type { BuiltModule } from './build-content.js';

/**
 * The repository root, from this file rather than from the shell.
 *
 * `predev` and `prebuild` run with the cwd set to the app being built, so
 * `process.cwd()` would look for `apps/play/modules/` and find nothing. The
 * path from this file to the root is a fact about the repository layout and
 * does not move.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** Never shipped, whatever anyone adds to the allowlist later. */
const FIXTURES = ['greenmarch', 'minimal'];

function checkNoFixtures(built: Map<string, BuiltModule>): string[] {
  const problems: string[] = [];
  for (const name of FIXTURES) {
    if (built.has(name)) {
      problems.push(`${name} is a test fixture and must never ship, but the build produced it`);
    }
  }
  for (const app of ['editor', 'play']) {
    const dir = join(root, 'apps', app, 'public', 'content');
    if (!existsSync(dir)) continue;
    for (const name of FIXTURES) {
      if (existsSync(join(dir, `${name}.json.gz`))) {
        problems.push(`apps/${app}/public/content/${name}.json.gz — a test fixture is being served`);
      }
    }
  }
  return problems;
}

/**
 * Compare what is on disk against what was just built.
 *
 * Decompressed bytes, never compressed ones: `gzipSync` at a fixed level is
 * deterministic for a given zlib, but the gzip header carries an OS byte, so
 * pinning the check to the zlib of whoever last ran it is a check that fails for
 * the wrong reason on somebody else's machine.
 */
function checkArtifacts(built: Map<string, BuiltModule>): string[] {
  const problems: string[] = [];

  for (const app of ['editor', 'play']) {
    const dir = join(root, 'apps', app, 'public', 'content');
    if (!existsSync(dir)) continue;

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json.gz')) continue;

      // Two artifacts per world, and each app carries the one it can use: the
      // studio a project tree, the player a compiled module.
      const project = file.endsWith('.project.json.gz');
      const id = file.slice(0, -(project ? '.project.json.gz' : '.json.gz').length);
      const expected = [...built.values()].find((m) => m.id === id);
      if (!expected) {
        problems.push(`apps/${app}/public/content/${file} — nothing in the build produces this`);
        continue;
      }

      const want = project
        ? (expected.project ? gunzipSync(expected.project).toString('utf8') : null)
        : expected.minified;
      if (want === null) {
        problems.push(`apps/${app}/public/content/${file} — the build produces no project for ${id}`);
        continue;
      }

      const actual = gunzipSync(readFileSync(join(dir, file))).toString('utf8');
      if (actual !== want) {
        problems.push(
          `apps/${app}/public/content/${file} is stale ` +
          `(${actual.length} bytes on disk, ${want.length} rebuilt)`,
        );
      }
    }
  }
  return problems;
}

function main(): number {
  let built: Map<string, BuiltModule>;
  try {
    built = buildAll();
  } catch (err) {
    process.stderr.write(`✗ ${(err as Error).message}\n`);
    return 1;
  }

  const fixtures = checkNoFixtures(built);
  if (fixtures.length > 0) {
    process.stderr.write(`✗ ${fixtures.map((p) => `${p}\n`).join('')}`);
    return 1;
  }

  const manifestPath = join(root, MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    process.stderr.write(`✗ ${MANIFEST_PATH} is missing — run \`npm run content\` and commit it\n`);
    return 1;
  }

  const rebuilt = manifestOf(built);
  const committed = readFileSync(manifestPath, 'utf8');
  if (rebuilt !== committed) {
    process.stderr.write(
      `✗ modules/ no longer matches ${MANIFEST_PATH}.\n\n` +
      '  A world changed and the shipped artifacts were not regenerated. Run:\n\n' +
      '      npm run content\n\n' +
      `  then commit ${MANIFEST_PATH}.\n`,
    );
    return 1;
  }

  // Only worth comparing when they exist. A fresh checkout has not generated
  // them yet, and failing there would make the first `npm run check` a puzzle.
  const anyGenerated = ['editor', 'play'].some((app) =>
    existsSync(join(root, 'apps', app, 'public', 'content')));

  if (!anyGenerated) {
    process.stdout.write(
      `✓ ${built.size} module(s) match ${MANIFEST_PATH} — artifacts not generated yet, skipping\n`,
    );
    return 0;
  }

  const stale = checkArtifacts(built);
  if (stale.length > 0) {
    process.stderr.write(
      `✗ ${stale.map((p) => `${p}\n`).join('')}\nRun \`npm run content\`.\n`,
    );
    return 1;
  }

  process.stdout.write(`✓ ${built.size} module(s) match ${MANIFEST_PATH} and the generated artifacts\n`);
  return 0;
}

process.exit(main());
