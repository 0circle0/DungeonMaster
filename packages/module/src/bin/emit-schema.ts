/**
 * `npm run schema`
 *
 * Emits JSON Schema from the Zod definitions.
 *
 * This is what makes the authoring UI schema-driven rather than hand-built: the
 * editor gets autocomplete, inline validation, and generated forms from this
 * file, so a new field added to a Zod schema appears in the editor without any
 * UI work. It also gives VS Code full support for hand-editing a module.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { gameModuleSchema } from '../schema/module.js';

const DEFAULT_OUT = 'schema/module.schema.json';

function main(): number {
  const out = resolve(process.argv[2] ?? DEFAULT_OUT);

  const schema = zodToJsonSchema(gameModuleSchema, {
    name: 'GameModule',
    $refStrategy: 'root',
    definitionPath: '$defs',
  });

  const document = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'DungeonMaster game module',
    description:
      'An entire game as one document: rules, content, world, narrative, and starting conditions.',
    ...schema,
  };

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const bytes = JSON.stringify(document).length;
  process.stdout.write(`✓ wrote ${out} (${(bytes / 1024).toFixed(1)} KB)\n`);
  return 0;
}

process.exit(main());
