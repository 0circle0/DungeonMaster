/**
 * `npm run content`
 *
 * Emit the example worlds each app ships, pre-zipped.
 *
 * The repository keeps its modules pretty-printed, because that is what makes a
 * diff readable and a merge possible. Neither is worth anything over the wire:
 * Aurendel is 2.9 MB pretty, 1.5 MB minified and 296 KB gzipped. So the
 * readable form stays in git and this writes the small one — once, at build
 * time, rather than on every request, because the whole point of the exercise
 * is that there is no server left to do it on.
 *
 * What ships is an explicit list rather than "whatever is in `modules/`".
 * `greenmarch` is a test fixture and `minimal` is a smaller one; both exist to
 * be loaded by tests, and shipping them to a player would offer two worlds that
 * are not games. An allowlist makes that a decision somebody wrote down instead
 * of an accident of directory contents.
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { compileModule, hashModule, formatIssues } from '@dm/module';
import { readAssembledModule, formatMapIssues } from '@dm/module/load';
import type { WorldEnvelope, WorldAuthoring } from '@dm/library/envelope';

/**
 * The repository root, from this file rather than from the shell.
 *
 * `predev` and `prebuild` run with the cwd set to the app being built, so
 * `process.cwd()` would look for `apps/play/modules/` and find nothing. The
 * path from this file to the root is a fact about the repository layout and
 * does not move.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * What each app is allowed to ship.
 *
 * The player gets Aurendel, which is the example of what can be built. The
 * studio gets it too — to open and read — plus `core_fantasy`, which is not a
 * game at all but a ruleset: 6 attributes, 10 damage types, 16 skills, 5
 * classes and 20 levels that a new module can be composed from. Its own build
 * script has always done that copy; shipping it is what lets the studio do it
 * too, for anyone who does not have Python and a checkout.
 */
const SHIP: Readonly<Record<string, readonly string[]>> = {
  play: ['aurendel'],
  editor: ['aurendel', 'core_fantasy'],
};

/** Never shipped, whatever anyone adds to `SHIP` later. */
const FIXTURES = new Set(['greenmarch', 'minimal']);

export interface BuiltModule {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly extends: string | null;
  readonly hash: string;
  readonly rawBytes: number;
  readonly storedBytes: number;
  readonly minified: string;
  readonly gz: Buffer;
}

/** The authoring sidecar, when the module is a project. Empty when it is not. */
function readAuthoring(dir: string): WorldAuthoring | null {
  const projectDir = join(dir, 'project');
  if (!existsSync(projectDir)) return null;

  const read = (file: string): unknown => {
    const path = join(projectDir, file);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  };

  const prefabDir = join(projectDir, 'prefabs');
  const prefabs: WorldAuthoring['prefabs'][number][] = [];
  if (existsSync(prefabDir)) {
    for (const file of readdirSync(prefabDir).sort()) {
      if (!file.endsWith('.json') || file === 'instances.json') continue;
      const value = read(`prefabs/${file}`);
      if (value && typeof value === 'object') prefabs.push(value as WorldAuthoring['prefabs'][number]);
    }
  }

  return {
    prefabs,
    instances: (read('prefabs/instances.json') ?? {}) as WorldAuthoring['instances'],
    style: (read('style.json') ?? {}) as WorldAuthoring['style'],
    contract: (read('contract.json') ?? {}),
  };
}

/**
 * Assemble one module and prove it works before anyone can download it.
 *
 * The compile gate is the part that matters. An artifact is not reviewed by
 * anybody — it is generated and served — so the only chance to notice that a
 * world no longer loads is here, and a failure now is a build error rather than
 * a blank screen with a stack trace in it.
 */
export function buildModule(name: string): BuiltModule {
  if (FIXTURES.has(name)) {
    throw new Error(`${name} is a test fixture and is never shipped`);
  }

  const dir = join(root, 'modules', name);
  const assembled = readAssembledModule(dir);
  if (assembled.issues.length > 0) {
    throw new Error(`${name}: map folders are broken\n${formatMapIssues(assembled.issues)}`);
  }

  const doc = assembled.doc;
  const compiled = compileModule(doc);
  if (!compiled.ok) {
    throw new Error(`${name}: does not compile, so it will not ship\n${formatIssues(compiled.errors)}`);
  }

  const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
  const envelope: WorldEnvelope = {
    dmWorld: 1,
    format: 1,
    doc,
    authoring: readAuthoring(dir),
    title: String(meta['title'] ?? name),
    filename: `${String(doc['id'] ?? name)}.module.json`,
  };

  const minified = JSON.stringify(envelope);
  const gz = gzipSync(Buffer.from(minified, 'utf8'), { level: 9 });

  return {
    id: String(doc['id'] ?? name),
    version: String(doc['version'] ?? '0.0.0'),
    title: envelope.title,
    description: String(meta['description'] ?? ''),
    extends: typeof doc['extends'] === 'string' ? doc['extends'] : null,
    hash: hashModule(compiled.module.source),
    rawBytes: Buffer.byteLength(minified, 'utf8'),
    storedBytes: gz.length,
    minified,
    gz,
  };
}

/** Everything any app ships, built once and shared between destinations. */
export function buildAll(): Map<string, BuiltModule> {
  const wanted = new Set(Object.values(SHIP).flat());
  const out = new Map<string, BuiltModule>();
  for (const name of [...wanted].sort()) out.set(name, buildModule(name));
  return out;
}

/**
 * The committed record of what the artifacts contain.
 *
 * The `.gz` files themselves stay out of git — a 300 KB binary per content
 * change is an unreadable diff and a merge nobody can resolve. This is the part
 * that has to be committed instead, so that "somebody changed a world and
 * forgot to regenerate" is a one-line diff rather than a discovery made in
 * production.
 */
export function manifestOf(built: Map<string, BuiltModule>): string {
  const modules = [...built.values()].map((m) => ({
    id: m.id,
    version: m.version,
    hash: m.hash,
    rawBytes: m.rawBytes,
  }));
  return `${JSON.stringify({ format: 1, modules }, null, 2)}\n`;
}

export const MANIFEST_PATH = 'modules/content-manifest.json';

function catalogFor(app: string, built: Map<string, BuiltModule>): string {
  const ids = SHIP[app] ?? [];
  const modules = ids.map((name) => {
    const m = built.get(name);
    if (!m) throw new Error(`${app}: nothing built for "${name}"`);
    return {
      id: m.id,
      version: m.version,
      title: m.title,
      description: m.description,
      extends: m.extends,
      storedBytes: m.storedBytes,
      rawBytes: m.rawBytes,
      hash: m.hash,
    };
  });
  return `${JSON.stringify({ format: 1, modules }, null, 2)}\n`;
}

function writeApp(app: string, built: Map<string, BuiltModule>): number {
  const dest = join(root, 'apps', app, 'public', 'content');
  // Rebuilt wholesale: a module dropped from `SHIP` must stop being served,
  // and leaving it behind is how a deployment keeps shipping something the
  // repository no longer believes in.
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  let bytes = 0;
  for (const name of SHIP[app] ?? []) {
    const m = built.get(name);
    if (!m) continue;
    writeFileSync(join(dest, `${m.id}.json.gz`), m.gz);
    bytes += m.gz.length;
  }
  writeFileSync(join(dest, 'catalog.json'), catalogFor(app, built));
  return bytes;
}

function main(): number {
  const apps = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const targets = apps.length > 0 ? apps : Object.keys(SHIP);

  for (const app of targets) {
    if (!(app in SHIP)) {
      process.stderr.write(`✗ unknown app "${app}" — expected one of ${Object.keys(SHIP).join(', ')}\n`);
      return 1;
    }
  }

  let built: Map<string, BuiltModule>;
  try {
    built = buildAll();
  } catch (err) {
    process.stderr.write(`✗ ${(err as Error).message}\n`);
    return 1;
  }

  for (const m of built.values()) {
    const ratio = (m.rawBytes / m.storedBytes).toFixed(1);
    process.stdout.write(
      `  ${m.id.padEnd(14)} ${(m.rawBytes / 1024).toFixed(0).padStart(5)} KB → ` +
      `${(m.storedBytes / 1024).toFixed(0).padStart(4)} KB gz  (${ratio}×)\n`,
    );
  }

  for (const app of targets) {
    const bytes = writeApp(app, built);
    process.stdout.write(`✓ apps/${app}/public/content — ${(SHIP[app] ?? []).length} module(s), ${(bytes / 1024).toFixed(0)} KB\n`);
  }

  writeFileSync(join(root, MANIFEST_PATH), manifestOf(built));
  process.stdout.write(`✓ ${MANIFEST_PATH}\n`);
  return 0;
}

// Importable by `check-content.ts`; only the direct run writes anything.
if (process.argv[1]?.endsWith('build-content.ts')) process.exit(main());
