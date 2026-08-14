/**
 * `npm run validate -- modules/<name>`
 *
 * Validates a module: schema, reference integrity, duplicate ids, and content
 * lints. This is the gate a module passes before it can be played or shared.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { compileModule } from '../compile.js';
import { lintModule, formatDiagnostics } from '../diagnostics/lint.js';
import { resolveExtends } from '../merge.js';

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`cannot read ${path}: ${(err as Error).message}`);
  }
}

/** Accept either a module directory or a direct path to its JSON. */
function resolveModulePath(input: string): string {
  const target = resolve(input);
  if (existsSync(target) && !target.endsWith('.json')) {
    const candidate = join(target, 'module.json');
    if (existsSync(candidate)) return candidate;
  }
  if (!existsSync(target)) throw new Error(`no such module: ${input}`);
  return target;
}

/**
 * Look for `extends` bases among sibling module directories, which is how a
 * pack finds the game it layers onto during local development.
 */
function makeLoader(modulesRoot: string) {
  return (identity: string): Record<string, unknown> | undefined => {
    if (!existsSync(modulesRoot)) return undefined;
    for (const entry of readdirSync(modulesRoot)) {
      const candidate = join(modulesRoot, entry, 'module.json');
      if (!existsSync(candidate)) continue;
      const doc = readJson(candidate);
      if (`${String(doc['id'])}@${String(doc['version'])}` === identity) return doc;
    }
    return undefined;
  };
}

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

  // Lint the raw text first: it is the only pass that can report line and
  // column numbers, and it produces far better messages than the schema alone.
  const colour = process.stdout.isTTY === true;
  const lint = lintModule(rawText);
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

  // Safe now that linting has proven the document parses.
  const document = readJson(path);
  const modulesRoot = dirname(dirname(path));
  const resolved = resolveExtends(document, makeLoader(modulesRoot));
  if (!resolved.ok) {
    process.stderr.write(`✗ ${basename(path)}: ${resolved.error}\n`);
    return 1;
  }

  const result = compileModule(resolved.document);

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
