/** Mod authoring tool. */

import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { hashMod } from '../hash.js';
import { loadModsFrom, readMod, formatModIssues } from '../load.js';

const [command, ...rest] = process.argv.slice(2);
const MODS_ROOT = resolve(process.cwd(), 'mods');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function hashCommand(dir: string): void {
  const target = resolve(dir);
  const result = readMod(target);
  if (!result) fail(`${dir} has no mod.json`);
  if (!result.ok) fail(`${dir} could not be read:\n${formatModIssues(result.failure.issues)}`);

  const { manifest, files } = result.mod;
  // Recompute from the file map with the old tag removed.
  const hash = hashMod(manifest, files);

  const stamped = { ...manifest, hash };
  writeFileSync(join(target, 'mod.json'), `${JSON.stringify(stamped, null, 2)}\n`);

  const wanted = `${manifest.id}-${hash}`;
  const current = basename(target);
  if (current !== wanted) {
    const moved = join(dirname(target), wanted);
    if (existsSync(moved)) fail(`${wanted} already exists — delete it first`);
    renameSync(target, moved);
    console.log(`${current} -> ${wanted}`);
  } else {
    console.log(`${wanted} (unchanged)`);
  }
}

function checkCommand(): void {
  const { mods, failures } = loadModsFrom(MODS_ROOT);
  let bad = 0;

  for (const failure of failures) {
    bad += 1;
    console.error(`${failure.dir}\n${formatModIssues(failure.issues)}`);
  }

  for (const mod of mods) {
    const errors = mod.issues.filter((i) => i.severity === 'error');
    const warnings = mod.issues.filter((i) => i.severity === 'warning');
    const label = `${mod.manifest.id}-${mod.hash} (${mod.manifest.target})`;
    if (errors.length === 0 && warnings.length === 0) {
      console.log(`ok    ${label}`);
      continue;
    }
    if (errors.length > 0) bad += 1;
    console.log(`${errors.length > 0 ? 'FAIL' : 'warn'}  ${label}\n${formatModIssues(mod.issues)}`);
  }

  if (mods.length === 0 && failures.length === 0) console.log('no mods installed');
  if (bad > 0) process.exit(1);
}

function packCommand(dir: string): void {
  const result = readMod(resolve(dir));
  if (!result) fail(`${dir} has no mod.json`);
  if (!result.ok) fail(`${dir} could not be read:\n${formatModIssues(result.failure.issues)}`);

  // The bundle hashes identically to the folder.
  const bundle = { manifest: result.mod.manifest, files: result.mod.files };
  const out = `${result.mod.manifest.id}-${result.mod.hash}.dmmod.json`;
  writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

switch (command) {
  case 'hash':
    if (!rest[0]) fail('usage: mod hash <dir>');
    hashCommand(rest[0]);
    break;
  case 'check':
    checkCommand();
    break;
  case 'pack':
    if (!rest[0]) fail('usage: mod pack <dir>');
    packCommand(rest[0]);
    break;
  default:
    fail('usage: mod <hash|check|pack> [dir]');
}
