/**
 * Write the engine's vocabulary into a module.
 *
 * `narrative.systemText` is where every sentence the engine says now lives, and
 * nobody should have to type a hundred and sixty of them by hand. This seeds a
 * module with the canonical wording, which the author then edits like any other
 * content — that is the whole point of it being data.
 *
 * Existing values are kept: re-running this after the registry grows adds only
 * what is new, so it is safe on a module somebody has already rewritten.
 *
 *   npm run systemtext -- modules/greenmarch          write into the module
 *   npm run systemtext                                print the block
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SYSTEM_TEXT } from '../schema/systemText.js';

/** The block as JSON, in registry order so a diff reads as a list of messages. */
function block(existing: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of SYSTEM_TEXT) {
    out[item.key] = Object.hasOwn(existing, item.key) ? existing[item.key] : item.text;
  }
  // Anything the author added that the engine no longer knows about is kept
  // rather than deleted; the schema will tell them it is unknown.
  for (const [key, value] of Object.entries(existing)) {
    if (!Object.hasOwn(out, key)) out[key] = value;
  }
  return out;
}

const target = process.argv[2];

if (target === undefined) {
  process.stdout.write(`${JSON.stringify({ systemText: block() }, null, 2)}\n`);
} else {
  const file = join(resolve(target), 'module.json');
  const source = readFileSync(file, 'utf8');
  const document = JSON.parse(source) as Record<string, unknown>;

  const narrative = (document['narrative'] ?? {}) as Record<string, unknown>;
  const existing = (narrative['systemText'] ?? {}) as Record<string, unknown>;
  const added = SYSTEM_TEXT.filter((item) => !Object.hasOwn(existing, item.key)).length;

  narrative['systemText'] = block(existing);
  document['narrative'] = narrative;

  // Two-space JSON with a trailing newline, matching the modules on disk.
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(
    added === 0
      ? `${file}: already complete, ${SYSTEM_TEXT.length} messages\n`
      : `${file}: added ${added} message(s), ${SYSTEM_TEXT.length} total\n`,
  );
}
