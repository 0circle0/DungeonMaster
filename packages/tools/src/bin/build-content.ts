/** `npm run content` */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { compileModule, hashModule, formatIssues, unbundleModule } from '@dm/module';
import { readAssembledModule, formatMapIssues } from '@dm/module/load';
import type { WorldEnvelope, WorldAuthoring } from '@dm/library/envelope';

/** The repository root, from this file rather than from the shell. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** What each app is allowed to ship. */
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
  /** The project tree, gzipped. */
  readonly project: Buffer | null;
  readonly projectBytes: number;
}

/** The committed project tree, verbatim. */
function projectFilesOf(dir: string): Record<string, string> | null {
  if (!existsSync(join(dir, 'project'))) return null;

  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path).split('\\').join('/')] = readFileSync(path, 'utf8');
    }
  };
  walk(join(dir, 'project'));
  if (existsSync(join(dir, 'maps'))) walk(join(dir, 'maps'));
  return files;
}

/** The authoring sidecar, when the module is a project. */
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

/** Assemble one module and prove it works before anyone can download it. */
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

  // Proved against the same gate the bundle must rebuild through.
  const tree = projectFilesOf(dir);
  let project: Buffer | null = null;
  if (tree) {
    const rebuilt = unbundleModule(tree);
    if (!rebuilt.document) {
      throw new Error(`${name}: its project does not rebuild\n${rebuilt.issues.map((i) => `${i.file}: ${i.message}`).join('\n')}`);
    }
    if (JSON.stringify(rebuilt.document) !== JSON.stringify(doc)) {
      throw new Error(`${name}: its project rebuilds a different document than module.json`);
    }
    project = gzipSync(Buffer.from(JSON.stringify({ dmProject: 1, files: tree }), 'utf8'), { level: 9 });
  }

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
    project,
    projectBytes: project?.length ?? 0,
  };
}

/** Everything any app ships, built once and shared between destinations. */
export function buildAll(): Map<string, BuiltModule> {
  const wanted = new Set(Object.values(SHIP).flat());
  const out = new Map<string, BuiltModule>();
  for (const name of [...wanted].sort()) out.set(name, buildModule(name));
  return out;
}

/** The committed record of what the artifacts contain. */
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
      // What this app downloads: the studio a project, the player a compiled module.
      storedBytes: app === 'editor' ? m.projectBytes : m.storedBytes,
      rawBytes: m.rawBytes,
      hash: m.hash,
    };
  });
  return `${JSON.stringify({ format: 1, modules }, null, 2)}\n`;
}

function writeApp(app: string, built: Map<string, BuiltModule>): number {
  const dest = join(root, 'apps', app, 'public', 'content');
  // Rebuilt wholesale: a module dropped from `SHIP` must stop being served.
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  let bytes = 0;
  for (const name of SHIP[app] ?? []) {
    const m = built.get(name);
    if (!m) continue;

    if (app === 'editor') {
      // The studio edits project files, so a compiled module would be no use to it.
      if (!m.project) throw new Error(`${name}: the studio ships projects and this module has no project/`);
      writeFileSync(join(dest, `${m.id}.project.json.gz`), m.project);
      bytes += m.project.length;
      continue;
    }

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
