/**
 * The character creation screen.
 *
 * Prompts only; every rule it enforces comes from `creation.ts`, which reads
 * the module. Split from the REPL so the same flow can be driven by a script —
 * `ask` is any function that returns the next line of input.
 */

import pc from 'picocolors';
import type { CompiledModule } from '@dm/module';
import type { CharacterChoices } from '@dm/engine';
import {
  creationRules, baseAllocation, adjust, remaining, toChoices, renderAllocation,
} from '@dm/play';

export type Ask = (prompt: string) => Promise<string>;
export type Out = (text: string) => void;

/** Pick from a numbered list, defaulting to the first entry on anything unclear. */
async function choose<T extends { id: string; name: string; description: string }>(
  entries: readonly T[],
  label: string,
  ask: Ask,
  out: Out,
): Promise<T | undefined> {
  if (entries.length === 0) return undefined;

  out('');
  entries.forEach((entry, i) => {
    out(pc.cyan(`  ${String(i + 1).padStart(2)}. `) + entry.name
      + (entry.description ? pc.dim(` — ${entry.description.split('. ')[0]}`) : ''));
  });

  const picked = Number((await ask(`  ${label} [1]: `)).trim());
  return entries[(Number.isFinite(picked) ? picked : 1) - 1] ?? entries[0];
}

/** Spend the attribute budget. Returns when the player is done or out of points. */
async function allocate(
  module: CompiledModule,
  ask: Ask,
  out: Out,
): Promise<Record<string, number>> {
  const rules = creationRules(module);
  let attributes = baseAllocation(module);

  const example = rules.attributes[0];
  out('');
  out(pc.dim(`  Spend ${rules.points} points. `
    + `"${example ? example.abbrev.toLowerCase() : 'att'} +2" raises, "-1" lowers, blank when done.`));

  for (;;) {
    out('');
    out(renderAllocation(module, attributes));
    const input = (await ask('  > ')).trim().toLowerCase();
    if (input === '' || input === 'done') break;

    const match = /^([a-z_]+)\s*([+-]?\d+)$/.exec(input);
    if (!match) {
      out(pc.yellow('  Try "mig +2", or blank to finish.'));
      continue;
    }

    // Abbreviation, id prefix, or name prefix — whichever the player typed.
    const needle = match[1]!;
    const attribute = rules.attributes.find(
      (entry) => entry.abbrev.toLowerCase() === needle
        || entry.id.startsWith(needle)
        || entry.name.toLowerCase().startsWith(needle),
    );
    if (!attribute) {
      out(pc.yellow(`  There is no "${needle}".`));
      continue;
    }

    const result = adjust(module, attributes, attribute.id, Number(match[2]));
    if (result.ok) attributes = result.attributes;
    else out(pc.yellow(`  ${result.message}`));
  }

  const left = remaining(module, attributes);
  if (left > 0) out(pc.dim(`  (${left} point${left === 1 ? '' : 's'} left unspent)`));
  return attributes;
}

/** Build one character. */
export async function createCharacter(
  module: CompiledModule,
  index: number,
  ask: Ask,
  out: Out,
): Promise<CharacterChoices> {
  const rules = creationRules(module);

  out('');
  out(pc.bold(`  — Character ${index + 1} —`));

  const fallback = `Hero ${index + 1}`;
  const name = (await ask(`  Name [${fallback}]: `)).trim() || fallback;

  const ancestry = await choose(rules.ancestries, 'Ancestry', ask, out);
  const characterClass = await choose(rules.classes, 'Class', ask, out);
  const attributes = await allocate(module, ask, out);

  return toChoices(module, name, ancestry?.id, characterClass?.id, attributes);
}

/** Build the whole party. */
export async function createParty(
  module: CompiledModule,
  size: number,
  ask: Ask,
  out: Out,
): Promise<CharacterChoices[]> {
  const roster: CharacterChoices[] = [];
  for (let i = 0; i < size; i += 1) roster.push(await createCharacter(module, i, ask, out));
  return roster;
}
