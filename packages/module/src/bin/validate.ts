/**
 * `npm run validate -- modules/<name>`
 *
 * Validates a module: schema, reference integrity, duplicate ids, and content
 * lints. This is the gate a module passes before it can be played or shared.
 */

import { readFileSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { compileModule } from '../compile.js';
import { lintModule, formatDiagnostics } from '../diagnostics/lint.js';
import { resolveExtends } from '../merge.js';
import {
  readAssembledModule,
  resolveModulePath,
  siblingLoader,
  formatMapIssues,
} from '../load.js';
import { sortWorldMaps } from '../staticmaps.js';

function main(): number {
  const arg = process.argv[2];
  if (!arg) {
    process.stderr.write('usage: npm run validate -- <module-dir-or-json>\n');
    return 2;
  }

  let path: string;
  let rawText: string;
  try {
    path = resolveModulePath(arg);
    rawText = readFileSync(path, 'utf8');
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    return 2;
  }

  // Assembly first: static map folders get inlined and their problems come
  // back with per-file positions, and the lint's reference-integrity pass
  // needs the assembled document — the raw text alone would call every
  // folder-map reference dangling.
  const colour = process.stdout.isTTY === true;
  let assembled: ReturnType<typeof readAssembledModule> | null;
  try {
    assembled = readAssembledModule(path);
  } catch {
    // Malformed JSON: the lint below reports the syntax error with its line.
    assembled = null;
  }
  if (assembled && assembled.issues.length > 0) {
    process.stderr.write(
      `✗ ${arg} — ${assembled.issues.length} map error${assembled.issues.length === 1 ? '' : 's'}\n\n`,
    );
    process.stderr.write(`${formatMapIssues(assembled.issues)}\n`);
    return 1;
  }

  // Lint the raw text: it is the only pass that can report line and column
  // numbers, and it produces far better messages than the schema alone.
  const lint = lintModule(rawText, assembled ? { assembled: assembled.doc } : {});
  const errors = lint.diagnostics.filter((d) => d.severity === 'error');
  const lintWarnings = lint.diagnostics.filter((d) => d.severity === 'warning');

  if (errors.length > 0) {
    process.stderr.write(`✗ ${arg} — ${errors.length} error${errors.length === 1 ? '' : 's'}\n\n`);
    process.stderr.write(`${formatDiagnostics(errors, colour)}\n\n`);
    if (lintWarnings.length > 0) {
      process.stderr.write(`${formatDiagnostics(lintWarnings, colour)}\n\n`);
    }
    return 1;
  }

  if (!assembled) {
    // Unreachable in practice: a document the lint passed also assembles.
    process.stderr.write(`✗ ${arg}: could not read the module directory\n`);
    return 1;
  }

  const modulesRoot = dirname(assembled.dir);
  const resolved = resolveExtends(assembled.doc, siblingLoader(modulesRoot));
  if (!resolved.ok) {
    process.stderr.write(`✗ ${basename(path)}: ${resolved.error}\n`);
    return 1;
  }

  const result = compileModule(sortWorldMaps(resolved.document));

  if (!result.ok) {
    process.stderr.write(`✗ ${arg} — ${result.errors.length} error(s) after resolving extends\n`);
    for (const issue of result.errors) {
      process.stderr.write(`  ${issue.path}: ${issue.message} [${issue.code}]\n`);
    }
    return 1;
  }

  const { module } = result;
  const warnings = lintWarnings;
  process.stdout.write(`✓ ${module.identity}  (hash ${module.hash})\n`);

  const counts = [
    ['attributes', module.ids('rules.attributes').length],
    ['resources', module.ids('rules.resources').length],
    ['conditions', module.ids('rules.conditions').length],
    ['abilities', module.ids('content.abilities').length],
    ['items', module.ids('content.items').length],
    ['monsters', module.ids('content.monsters').length],
    ['rooms', module.ids('world.roomTemplates').length],
    ['maps', module.ids('world.maps').length],
    ['quests', module.ids('narrative.quests').length],
  ] as const;
  process.stdout.write(
    `  ${counts.map(([name, n]) => `${n} ${name}`).join(', ')}\n`,
  );

  if (warnings.length > 0) {
    process.stdout.write(
      `\n${warnings.length} warning${warnings.length === 1 ? '' : 's'}\n\n${formatDiagnostics(warnings, colour)}\n`,
    );
  }
  return 0;
}

process.exit(main());
