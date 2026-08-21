/** `npm run schema` */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { gameModuleSchema } from '../schema/module.js';
import { refTarget, refHelp } from '../schema/common.js';

const DEFAULT_OUT = 'schema/module.schema.json';

/** Turn `ref:` markers into something a person and a machine each want. */
function unpackRefs(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) unpackRefs(item);
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  const record = node as Record<string, unknown>;
  const description = record['description'];
  if (typeof description === 'string' && description.startsWith('ref:')) {
    const target = refTarget(description);
    const help = refHelp(description);
    if (target) {
      record['x-dm-ref'] = target;
      record['description'] = help ?? `An id from ${target}.`;
    }
  }

  for (const value of Object.values(record)) unpackRefs(value);
}

function main(): number {
  const out = resolve(process.argv[2] ?? DEFAULT_OUT);

  const schema = zodToJsonSchema(gameModuleSchema, {
    name: 'GameModule',
    $refStrategy: 'root',
    definitionPath: '$defs',
  });
  unpackRefs(schema);

  const document = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'DungeonMaster game module',
    description:
      'An entire game as one document: rules, content, world, narrative, and starting conditions.',
    ...schema,
  };

  mkdirSync(dirname(out), { recursive: true });
  // Measured on what is written, not on a compact copy of it.
  const text = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(out, text, 'utf8');

  process.stdout.write(`✓ wrote ${out} (${(text.length / 1024).toFixed(1)} KB)\n`);
  return 0;
}

process.exit(main());
