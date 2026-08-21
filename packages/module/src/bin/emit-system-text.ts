/** Write the engine's vocabulary into a module. */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SYSTEM_TEXT } from '../schema/systemText.js';

/** The block as JSON, in registry order so a diff reads as a list of messages. */
function block(existing: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of SYSTEM_TEXT) {
    out[item.key] = Object.hasOwn(existing, item.key) ? existing[item.key] : item.text;
  }
  // Keys the engine no longer knows about are kept rather than deleted.
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
