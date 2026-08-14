/**
 * `npm run smoke -- modules/greenmarch --seed 12345`
 *
 * A scripted playthrough. Drives the same session code the REPL does, so it
 * proves the whole stack end to end — module, engine, narrator, parser — and
 * fails loudly if any of it stops working.
 *
 * Non-interactive, so it belongs in CI.
 */

import pc from 'picocolors';
import { loadModule, numberFlag } from '../loader.js';
import { startSession, runCommand } from '@dm/play';
import { hintLines } from '../render/hints.js';
import { renderMap, renderStatus, renderLines } from '../render.js';
import { statesEqual } from '@dm/engine';

/** The script every module should survive, whatever its content. */
const SCRIPT = [
  'look',
  'search',
  'east', 'east', 'south',
  'wait',
  'journal',
  'sheet',
  'rest',
  'map',
];

function main(): number {
  const positional = process.argv[2];
  const modulePath = positional && !positional.startsWith('--') ? positional : 'modules/greenmarch';
  const seed = numberFlag('seed', 12345);
  const quiet = process.argv.includes('--quiet');

  let module;
  try {
    module = loadModule(modulePath);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }

  const out = (text: string) => { if (!quiet) process.stdout.write(`${text}\n`); };

  const session = startSession(module, seed);
  out('');
  out(pc.bold(`  ${module.source.meta.title}`) + pc.dim(`  seed ${seed}`));
  out('');
  out(renderMap({ module, state: session.state, terrain: session.terrain, viewport: { width: 51, height: 15 } }));
  out('');
  out(renderLines(session.transcript));
  // The affordance list runs against both modules here, which is the cheapest
  // regression net the shared click-first layer has.
  for (const hint of hintLines(session)) out(hint);

  let refusals = 0;
  for (const input of SCRIPT) {
    out('');
    out(pc.bold(`  > ${input}`));

    const result = runCommand(session, input);
    if (result.kind === 'error') {
      refusals += 1;
      out(pc.yellow(`  ${result.message}`));
    } else if (result.kind === 'lines' && result.lines.length > 0) {
      out(renderLines(result.lines));
    }
  }

  out('');
  out(renderStatus(module, session.state));

  // The whole point: the same seed and the same script must land identically.
  const replay = startSession(module, seed);
  for (const input of SCRIPT) runCommand(replay, input);

  const reproducible = statesEqual(session.state, replay.state);
  out('');
  out(reproducible
    ? pc.green(`  ✓ reproducible from seed ${seed}`)
    : pc.red(`  ✗ NOT reproducible from seed ${seed}`));

  if (!reproducible) return 1;
  if (session.state.outcome === 'defeat') {
    out(pc.dim('  (the party died — that is a valid outcome, not a failure)'));
  }
  void refusals;
  return 0;
}

process.exit(main());
