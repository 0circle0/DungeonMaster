/** `npm run check:client` */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const APPS = ['apps/editor', 'apps/play', 'apps/site'];
const SKIP = new Set(['node_modules', '.next', 'out', 'dist']);

interface Rule {
  readonly pattern: RegExp;
  readonly why: string;
}

/** Server surfaces. */
const FORBIDDEN: readonly Rule[] = [
  { pattern: /from ['"]next\/headers['"]/, why: 'reads a request — worlds live in the browser now' },
  { pattern: /from ['"]next\/server['"]/, why: 'a server runtime the app no longer has' },
  { pattern: /\bcookies\s*\(/, why: 'which world is open is remembered in the library, not a cookie' },
  { pattern: /force-dynamic/, why: 'nothing is rendered per request' },
  { pattern: /['"]use server['"]/, why: 'a server action writes on the server' },
  { pattern: /from ['"]node:/, why: 'a browser has no filesystem' },
  { pattern: /from ['"](fs|path|os)['"]/, why: 'a browser has no filesystem' },
  { pattern: /fetch\(\s*[`'"]\/api/, why: 'there are no API routes; this would 404 in production' },
  { pattern: /sendBeacon\(/, why: 'a beacon posts to a server' },
];

function sources(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

function main(): number {
  const problems: string[] = [];

  for (const app of APPS) {
    // A route handler is the clearest possible statement that a server exists.
    const api = join(root, app, 'app', 'api');
    if (existsSync(api)) problems.push(`${app}/app/api/ — route handlers are a server`);

    for (const file of sources(join(root, app))) {
      // Tests run in Node by design; they are not shipped to anybody.
      if (/\.test\.tsx?$/.test(file)) continue;

      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, index) => {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
        for (const rule of FORBIDDEN) {
          if (rule.pattern.test(line)) {
            problems.push(`${relative(root, file)}:${index + 1} — ${rule.why}`);
          }
        }
      });
    }
  }

  // The one package the apps share that must never reach for a file.
  for (const file of sources(join(root, 'packages', 'library'))) {
    if (/\.test\.ts$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (/from ['"]node:/.test(text)) {
      problems.push(`${relative(root, file)} — the library runs in a browser`);
    }
  }

  if (problems.length > 0) {
    process.stderr.write(
      `✗ the apps must stay client-only:\n${problems.map((p) => `    ${p}\n`).join('')}` +
      '\nWorlds are stored on the machine that edits or plays them. A deployment\n' +
      'serves files and nothing else — see apps/*/next.config.ts.\n',
    );
    return 1;
  }

  process.stdout.write(`✓ all ${APPS.length} apps are client-only: no routes, no server APIs, no filesystem\n`);
  return 0;
}

process.exit(main());
