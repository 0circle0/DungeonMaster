/**
 * `npm run play -- modules/greenmarch --seed 12345`
 *
 * The interactive shell. Thin by design: it reads a line, hands it to the
 * session, and draws the result. Everything that decides anything lives in the
 * engine, so a browser front end would replace this file and nothing else.
 *
 * Two ways of drawing, one game. On a real terminal it takes the screen and
 * keeps the map, the party and the transcript in fixed places; piped, redirected
 * or on a small window it prints a scrolling transcript instead. Both call the
 * same pure pane functions, so neither can show something the other cannot.
 */

import { createInterface } from 'node:readline';
import pc from 'picocolors';
import { loadModule, numberFlag, boolFlag } from '../loader.js';
import { startSession, runCommand, currentOptions } from '@dm/play';
import type { Session } from '@dm/play';
import {
  renderMap, renderStatus, renderLines, renderParty, exitLines, objectiveLine,
} from '../render.js';
import { hintLines } from '../render/hints.js';
import { runMeta } from '../screens/meta.js';
import { createParty } from '../screens/create.js';
import { Tui } from '../tui/app.js';
import type { CharacterChoices } from '@dm/engine';

async function main(): Promise<number> {
  const positional = process.argv[2];
  const modulePath = positional && !positional.startsWith('--') ? positional : 'modules/greenmarch';
  const seed = numberFlag('seed', 12345);
  const partySize = numberFlag('party', 0) || undefined;

  let module;
  try {
    module = loadModule(modulePath);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }

  const out = (text: string) => process.stdout.write(`${text}\n`);
  const blank = () => process.stdout.write('\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // End of input — a piped script running out, or Ctrl-D — resolves as an empty
  // line rather than hanging forever, and the loop below stops on it.
  let closed = false;
  rl.on('close', () => { closed = true; });
  const ask = (prompt: string): Promise<string> =>
    closed ? Promise.resolve('') : new Promise((resolve) => rl.question(prompt, resolve));

  // Without `--create` the party comes from the module's own defaults, so a
  // quick start stays one command away. Deliberately before the screen is taken
  // over: it is a linear question-and-answer, which readline already does well.
  let roster: CharacterChoices[] | undefined;
  if (boolFlag('create')) {
    blank();
    out(pc.bold(`  ${module.source.meta.title}`) + pc.dim('   character creation'));
    const size = Math.min(partySize ?? module.source.start.partySize, module.source.start.partySize);
    roster = await createParty(module, size, ask, out);
  }

  const session = startSession(module, seed, partySize, roster);

  const interactive = process.stdout.isTTY === true && !boolFlag('plain');
  const roomy = Tui.fits(process.stdout.columns ?? 0, process.stdout.rows ?? 0);

  if (interactive && roomy) {
    return playFullScreen(session, rl, ask, () => closed);
  }
  return playScrolling(session, rl, ask, () => closed, out, blank);
}

type Ask = (prompt: string) => Promise<string>;

/** The full-screen shell: fixed panes, repainted once per line. */
async function playFullScreen(
  session: Session,
  rl: ReturnType<typeof createInterface>,
  ask: Ask,
  closed: () => boolean,
): Promise<number> {
  const { module, seed } = session;
  const tui = new Tui();
  tui.start();

  // Ctrl-C has to give the terminal back before it goes, or it leaves the
  // player in the alternate buffer with no cursor.
  rl.on('SIGINT', () => { tui.stop(); process.exit(130); });

  let panel: { title: string; lines: readonly string[] } | null = null;
  let scroll = 0;
  let notice = '';

  const paint = (): void => {
    tui.draw({
      module,
      state: session.state,
      terrain: session.terrain,
      seed,
      transcript: notice ? [...session.transcript, { text: notice, kind: 'refusal' }] : session.transcript,
      scroll,
      panel,
      options: currentOptions(session).filter((option) => !option.locked).map((option) => option.text),
    });
    // The prompt is *not* drawn here — `paint` leaves the cursor on the prompt
    // row and the pending `question` draws it there. Drawing it in both places
    // is how you get two prompts on one line.
  };

  process.stdout.on('resize', () => {
    tui.resize();
    paint();
    rl.prompt(true);
  });

  // First in the transcript, not last: with the opening frame scrolled to the
  // top this is the first line read, which is where a "how do I play this"
  // note belongs.
  session.transcript.unshift({ text: openingHint(), kind: 'note' });

  // Start at the top rather than the bottom. On every other turn the newest
  // line is what matters, but on the first frame the oldest one is the premise
  // — who the party is and why they are standing here — and scrolling that off
  // screen is exactly how a player ends up not knowing what they are doing.
  scroll = Math.max(0, tui.transcriptHeight(session.transcript) - tui.logHeight() + 1);
  paint();

  for (;;) {
    if (session.state.outcome !== 'playing') {
      session.transcript.push({
        text: session.state.outcome === 'victory' ? 'You have won.' : 'Your party is dead.',
        kind: 'system',
      });
      panel = null;
      paint();
      await ask('');
      break;
    }

    const input = await ask('> ');
    if (closed()) break;

    notice = '';
    const result = runCommand(session, input);

    if (result.kind === 'error') {
      notice = result.message;
      paint();
      continue;
    }

    if (result.kind === 'meta') {
      const view = tui.layout;
      const outcome = runMeta(session, result.command, {
        // A panel gets the whole width, side pane included.
        width: view.columns,
        height: view.map.height,
        cellWidth: view.cellWidth,
      });

      switch (outcome.kind) {
        case 'quit':
          tui.stop();
          rl.close();
          return 0;
        case 'panel': {
          // A second press of the same command puts the map back, so a panel is
          // never something the player has to work out how to escape.
          const showing: boolean = panel !== null && panel.title === outcome.title;
          panel = showing ? null : { title: outcome.title, lines: outcome.lines };
          break;
        }
        case 'note':
          notice = outcome.text;
          break;
        case 'scroll':
          scroll = Math.max(0, scroll - outcome.by * tui.logHeight());
          break;
      }
      paint();
      continue;
    }

    // Any turn that produces narration returns the player to the map and to
    // the newest lines, which is almost always what they wanted.
    panel = null;
    scroll = 0;
    paint();
  }

  tui.stop();
  rl.close();
  return 0;
}

/** The scrolling shell: a transcript, as it has always been. */
async function playScrolling(
  session: Session,
  rl: ReturnType<typeof createInterface>,
  ask: Ask,
  closed: () => boolean,
  out: (text: string) => void,
  blank: () => void,
): Promise<number> {
  const { module, seed } = session;

  blank();
  out(pc.bold(`  ${module.source.meta.title}`) + pc.dim(`   ${module.identity}  seed ${seed}`));
  out(pc.dim(`  ${openingHint()}`));
  blank();
  out(renderMap({ module, state: session.state, terrain: session.terrain }));
  blank();
  out(renderLines(session.transcript));

  // What the party is here to do, and the ways out of the room. Between them
  // these are the answer to "I have no idea what I am supposed to be doing",
  // which is what the opening screen used to leave a player with.
  const opening = objectiveLine(module, session.state);
  if (opening) {
    blank();
    out(`  ${opening}`);
  }

  const ways = exitLines(module, session.state, session.terrain);
  if (ways.length > 0) {
    blank();
    out(ways.join('\n'));
  }

  blank();
  out(renderParty(module, session.state));
  out(renderStatus(module, session.state));

  for (;;) {
    if (session.state.outcome !== 'playing') {
      blank();
      out(session.state.outcome === 'victory' ? pc.green('  You have won.') : pc.red('  Your party is dead.'));
      break;
    }

    // While a conversation is open, show the replies rather than a bare prompt.
    const options = currentOptions(session).filter((option) => !option.locked);
    if (options.length > 0) {
      blank();
      options.forEach((option, i) => out(pc.cyan(`  ${i + 1}. `) + option.text));
    }

    blank();
    const input = await ask(pc.bold('> '));
    if (closed()) break;
    const result = runCommand(session, input);

    if (result.kind === 'error') {
      if (result.message) out(pc.yellow(`  ${result.message}`));
      continue;
    }

    if (result.kind === 'meta') {
      const outcome = runMeta(session, result.command, { width: 76, height: 32 });
      if (outcome.kind === 'quit') {
        rl.close();
        return 0;
      }

      blank();
      if (outcome.kind === 'panel') {
        if (outcome.title !== 'Commands') out(pc.bold(`  ${outcome.title}`));
        out(outcome.lines.join('\n'));
      } else if (outcome.kind === 'note') {
        out(outcome.text);
      }
      // Scrolling has no meaning here — the terminal already does it.

      blank();
      out(renderStatus(module, session.state));
      continue;
    }

    blank();
    out(renderMap({ module, state: session.state, terrain: session.terrain }));
    if (result.lines.length > 0) {
      blank();
      out(renderLines(result.lines));
    }
    blank();
    out(renderParty(module, session.state));
    out(renderStatus(module, session.state));

    // Kept on screen every turn: the thing a player most often loses track of
    // is not their hit points, it is what they were in the middle of doing.
    const doing = objectiveLine(module, session.state);
    if (doing) out(`  ${doing}`);
    for (const hint of hintLines(session)) out(hint);
  }

  rl.close();
  return 0;
}

const openingHint = (): string =>
  '"help" for commands, "exits" for where you can go, "quit" to stop.';

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
    process.exit(1);
  });
