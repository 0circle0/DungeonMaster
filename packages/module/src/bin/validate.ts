/**
 * `npm run validate -- modules/<name>`
 *
 * Validates a module: schema, reference integrity, duplicate ids, and content lints. The gate a
 * module passes before it can be played or shared.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { lintModule, formatDiagnostics } from '../diagnostics/lint.js';
import { runRules } from '../diagnostics/rules.js';
import type { Contract } from '../diagnostics/rules.js';
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

  // Assembly first: static map folders get inlined and their problems come back with per-file
  // positions, and the lint's reference-integrity pass needs the assembled document — the raw text
  // alone would call every folder-map reference dangling.
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

  // Resolve `extends` before linting, not after.
  //
  // Run below the lint, every pass sees the unresolved document: a module leaning on a parent for
  // its ruleset fails the schema with "attributes is required", and every reference into the parent
  // comes back dangling.
  //
  // Handing the resolved document down as `assembled` uses a channel that already carries this
  // meaning — a document containing things the raw text never mentions. Inherited paths have no
  // span, and `locate()` already reports those without a position.
  let subject: Record<string, unknown> | null = null;
  if (assembled) {
    const modulesRoot = dirname(assembled.dir);
    const resolved = resolveExtends(assembled.doc, siblingLoader(modulesRoot));
    if (!resolved.ok) {
      process.stderr.write(`✗ ${basename(path)}: ${resolved.error}\n`);
      return 1;
    }
    subject = sortWorldMaps(resolved.document);
  }

  // Lint the raw text: it is the only pass that can report line and column numbers, and it produces
  // far better messages than the schema alone.
  const lint = lintModule(rawText, subject ? { assembled: subject } : {});
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

  // The lint compiled the resolved document to prove its references resolve, so its result is
  // reused rather than the module being parsed a second time.
  const module = lint.compiled;
  if (!module) {
    process.stderr.write(`✗ ${arg}: passed the lint but did not compile\n`);
    return 1;
  }

  /**
   * The contracts the schema cannot see.
   *
   * Run after the module is known to be valid, because they read a document rather than check its
   * shape: asking whether a flag has a writer only means something once the document is known to
   * have flags where flags go.
   *
   * A module may ship its own `project/contract.json` — the few facts a shared checker cannot know,
   * like which quests gate an act.
   */
  const contractPath = join(assembled.dir, 'project', 'contract.json');
  let contract: Contract = {};
  if (existsSync(contractPath)) {
    try {
      contract = JSON.parse(readFileSync(contractPath, 'utf8')) as Contract;
    } catch (err) {
      process.stderr.write(`✗ ${contractPath}: ${(err as Error).message}\n`);
      return 1;
    }
  }
  const semantic = runRules(subject ?? {}, undefined, contract);

  const warnings = [...lintWarnings, ...semantic];
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
