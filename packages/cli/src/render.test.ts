/**
 * A characterization net over the renderers about to be split.
 *
 * The panes are being separated into a derivation half (`@dm/play` view models)
 * and a formatting half (these ANSI producers). Nothing about their *output*
 * should change in that split, and four of the seven had no test at all — so
 * this file pins what they print today, stripped of colour, on both shipped
 * modules and at two moments of play. If a refactor shifts a byte of it, the
 * diff shows up here and not in a bisect.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadModule } from './loader.js';
import { startSession, runCommand } from '@dm/play';
import type { Session } from '@dm/play';
import {
  stripAnsi,
  statusLines, partyLines, sheetLines, inventoryLines,
  journalLines, objectiveLine, exitLines,
} from './render.js';
import { mapLegend } from './render/map.js';

const path = (name: string) => fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url));
const GREENMARCH = loadModule(path('greenmarch'));
const MINIMAL = loadModule(path('minimal'));

const strip = (lines: readonly string[]): string[] => lines.map(stripAnsi);

/** The party a few minutes in, with a quest taken and ground walked. */
function played(): Session {
  const session = startSession(GREENMARCH, 7);
  for (const input of ['talk vess', '2', 'leave', 'e', 'e', 'n']) {
    runCommand(session, input);
  }
  return session;
}

describe('the pane output, pinned before the derivation split', () => {
  it('statusLines — fresh, both modules', () => {
    const green = startSession(GREENMARCH, 7);
    expect(strip(statusLines(green.module, green.state))).toMatchInlineSnapshot(`
      [
        "Ash  L1  Hit Points 8/8  Focus 2/2  25m  walk  day 1 08:00 (Day)",
      ]
    `);

    const bare = startSession(MINIMAL, 7);
    expect(strip(statusLines(bare.module, bare.state))).toMatchInlineSnapshot(`
      [
        "Ash  L1  Vitality 8/8  day 1 08:00",
      ]
    `);
  });

  it('statusLines — after play', () => {
    const session = played();
    expect(strip(statusLines(session.module, session.state))).toMatchInlineSnapshot(`
      [
        "Ash  L1  Hit Points 8/8  Focus 2/2  25m  walk  day 1 08:03 (Day)",
      ]
    `);
  });

  it('partyLines — fresh, both modules', () => {
    const green = startSession(GREENMARCH, 7);
    expect(strip(partyLines(green.module, green.state))).toMatchInlineSnapshot(`
      [
        "  ▸ Ash          L1  8/8",
        "    Korrin       L1  8/8",
        "    Mire         L1  8/8",
        "    Sable        L1  8/8",
      ]
    `);

    const bare = startSession(MINIMAL, 7);
    expect(strip(partyLines(bare.module, bare.state))).toMatchInlineSnapshot(`
      [
        "  ▸ Ash          L1  8/8",
      ]
    `);
  });

  it('exitLines — fresh, both modules', () => {
    const green = startSession(GREENMARCH, 7);
    expect(strip(exitLines(green.module, green.state, green.terrain))).toMatchInlineSnapshot(`
      [
        "  Here",
        "    enter The Old Mill  20m  (Vess's brass key.)",
        "",
        "  Roads",
        "    travel The Fens  1h 30m  (ten marks for the ferryman)",
      ]
    `);

    const bare = startSession(MINIMAL, 7);
    expect(strip(exitLines(bare.module, bare.state, bare.terrain))).toMatchInlineSnapshot(`
      [
        "  Nowhere from here but the way you came.",
      ]
    `);
  });

  it('exitLines — after play', () => {
    const session = played();
    expect(strip(exitLines(session.module, session.state, session.terrain))).toMatchInlineSnapshot(`
      [
        "  Here",
        "    enter The Old Mill  20m  (Vess's brass key.)",
        "",
        "  Roads",
        "    travel The Fens  1h 30m  (ten marks for the ferryman)",
        "",
        "  Unexplored",
        "    northeast  6 tiles off",
      ]
    `);
  });

  it('mapLegend — fresh greenmarch', () => {
    const session = startSession(GREENMARCH, 7);
    expect(strip(mapLegend({
      module: session.module, state: session.state, terrain: session.terrain,
    }))).toMatchInlineSnapshot(`
      [
        "  @ you   @ party   & people   " reeds   . floor   , shallow water",
        "  ~ deep water",
      ]
    `);
  });

  it('objectiveLine — fresh and after play', () => {
    const fresh = startSession(GREENMARCH, 7);
    expect(stripAnsi(objectiveLine(fresh.module, fresh.state))).toMatchInlineSnapshot(`"▸ Find Vess the miller and hear what she wants."`);

    const session = played();
    expect(stripAnsi(objectiveLine(session.module, session.state))).toMatchInlineSnapshot(`"▸ Get through the mill door."`);

    // A module with no quests must produce nothing, not a placeholder.
    const bare = startSession(MINIMAL, 7);
    expect(objectiveLine(bare.module, bare.state)).toBe('');
  });

  it('journalLines — after taking the mill job', () => {
    const session = played();
    expect(strip(journalLines(session.module, session.state, session.seed))).toMatchInlineSnapshot(`
      [
        "  The Mill Door — active",
        "    Vess wants her mill back.",
        "    Stage 1/3 — Get inside",
        "      ▸ Get through the mill door.",
        "      "Clear the mill. Simple enough, said in a warm room."",
        "",
        "  Wet Boots — done",
        "    The Wardens sent you down to Millford because someone here asked for",
        "    help and nobody else would come.",
      ]
    `);
  });

  it('sheetLines — fresh, both modules', () => {
    const green = startSession(GREENMARCH, 7);
    expect(strip(sheetLines(green.module, green.state))).toMatchInlineSnapshot(`
      [
        "  Ash — level 1, 0 xp",
        "  MIG 11 (+0)   AGI 10 (+0)   END 10 (+0)   INT 10 (+0)   INS 10 (+0)   PRE 11 (+0)",
        "  Guard 10   Initiative 0",
        "  Abilities: Strike",
        "  Skills: Perception 1, Resolve 1",
      ]
    `);

    const bare = startSession(MINIMAL, 7);
    expect(strip(sheetLines(bare.module, bare.state))).toMatchInlineSnapshot(`
      [
        "  Ash — level 1, 0 xp",
        "  VIG  7 (+0)   WIT  6 (+0)",
        "  Ward 8",
        "  Abilities: Cudgel Swing",
        "  Skills: Notice 1",
      ]
    `);
  });

  it('inventoryLines — fresh greenmarch, and after taking the key', () => {
    const fresh = startSession(GREENMARCH, 7);
    expect(strip(inventoryLines(fresh.module, fresh.state))).toMatchInlineSnapshot(`
      [
        "  Iron Sword",
        "  Rope",
      ]
    `);

    const session = played();
    expect(strip(inventoryLines(session.module, session.state))).toMatchInlineSnapshot(`
      [
        "  Iron Sword",
        "  Rope",
        "  Brass Key",
      ]
    `);
  });
});
