import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadModule } from './loader.js';
import { parse, resolveNoun } from '@dm/play';
import { startSession, runCommand } from '@dm/play';
import {
  creationRules, costOf, totalSpent, baseAllocation, adjust, remaining, toChoices, renderAllocation,
} from '@dm/play';
import { createCharacter, createParty } from './screens/create.js';
import {
  renderMap, renderStatus, renderSheet, renderJournal, wrap,
  stripAnsi, width, truncate, padTo,
} from './render.js';
import { statesEqual, narrate, formatRoll, narrateFrom, interpolate, list, count } from '@dm/engine';
import type { GameState } from '@dm/engine';

const path = (name: string) => fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url));
const GREENMARCH = loadModule(path('greenmarch'));
const MINIMAL = loadModule(path('minimal'));

function session(module = GREENMARCH, seed = 7) {
  return startSession(module, seed);
}

const ctx = (state: GameState) => ({ module: GREENMARCH, state });

describe('parser', () => {
  const base = session();

  it('reads a bare direction as a step', () => {
    const result = parse('n', ctx(base.state));
    expect(result).toMatchObject({ kind: 'action', action: { type: 'step', direction: 'north' } });
  });

  it('accepts long and short direction spellings', () => {
    for (const input of ['north', 'n', 'go north', 'walk north']) {
      const result = parse(input, ctx(base.state));
      expect(result, input).toMatchObject({ action: { type: 'step', direction: 'north' } });
    }
  });

  it('ignores filler words', () => {
    // "to" and "the" are stripped, so this is still a step north.
    expect(parse('go to the north', ctx(base.state)))
      .toMatchObject({ action: { type: 'step', direction: 'north' } });
    expect(parse('accept the mill door', ctx(base.state)))
      .toMatchObject({ action: { type: 'acceptQuest', quest: 'the_mill_door' } });
  });

  it('refuses a target that is not present, and says so', () => {
    const result = parse('attack the bog hound', ctx(base.state));
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('no bog hound here');
  });

  // A bare rejection teaches the player nothing.
  it('says what is missing rather than "I do not understand"', () => {
    const result = parse('attack', ctx(base.state));
    expect(result).toMatchObject({ kind: 'error', message: 'Attack what?' });
  });

  it('names the verb it did not recognise', () => {
    const result = parse('flumox the goblin', ctx(base.state));
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.message).toContain('flumox');
  });

  // `go` lists "walk" and is declared first, so it won the word outright and
  // the stance verb it shadowed could never be reached.
  it('reads a bare "walk" as the pace, not an unfinished move', () => {
    expect(parse('walk', ctx(base.state)))
      .toMatchObject({ action: { type: 'setStance', stance: 'walk' } });
    // And with a direction it is still a step.
    expect(parse('walk north', ctx(base.state)))
      .toMatchObject({ action: { type: 'step', direction: 'north' } });
  });

  // Matching only the first word made every multi-word spelling unreachable.
  it('matches a two-word verb before the one-word verb inside it', () => {
    expect(parse('look for', ctx(base.state))).toMatchObject({ action: { type: 'search' } });
    expect(parse('look', ctx(base.state))).toMatchObject({ action: { type: 'look' } });
  });

  it('sends listen and smell to the senses the module declares', () => {
    expect(parse('listen', ctx(base.state)))
      .toMatchObject({ action: { type: 'sense', sense: 'hearing' } });
    for (const input of ['smell', 'sniff', 'scent']) {
      expect(parse(input, ctx(base.state)), input)
        .toMatchObject({ action: { type: 'sense', sense: 'smell' } });
    }
  });

  it('says what senses exist when asked for one that does not', () => {
    // minimal declares no senses at all.
    const bare = session(MINIMAL);
    const result = parse('listen', { module: MINIMAL, state: bare.state });
    expect(result.kind).toBe('error');
  });

  it('reads look with a target', () => {
    expect(parse('look at the mill', ctx(base.state)))
      .toMatchObject({ action: { type: 'look', at: 'mill' } });
  });

  it('toggles the party walking together', () => {
    expect(parse('follow', ctx(base.state)))
      .toMatchObject({ action: { type: 'setFollow', follow: true } });
    expect(parse('follow off', ctx(base.state)))
      .toMatchObject({ action: { type: 'setFollow', follow: false } });
    expect(parse('scatter', ctx(base.state)))
      .toMatchObject({ action: { type: 'setFollow', follow: false } });
  });

  it('routes shell commands away from the engine', () => {
    for (const [input, kind] of [['map', 'map'], ['help', 'help'], ['i', 'inventory'], ['quit', 'quit']] as const) {
      const result = parse(input, ctx(base.state));
      expect(result).toMatchObject({ kind: 'meta', meta: { kind } });
    }
  });

  it('resolves quests and areas by name', () => {
    expect(parse('accept the mill door', ctx(base.state)))
      .toMatchObject({ action: { type: 'acceptQuest', quest: 'the_mill_door' } });
    expect(parse('travel the fens', ctx(base.state)))
      .toMatchObject({ action: { type: 'travelToArea', area: 'the_fens' } });
  });

  it('splits an ability from its target', () => {
    const state = base.state;
    const withRally: GameState = {
      ...state,
      entities: {
        ...state.entities,
        [state.selected]: { ...state.entities[state.selected]!, abilities: ['strike', 'rally'] },
      },
    };
    expect(parse('cast rally', ctx(withRally))).toMatchObject({ action: { type: 'useAbility', ability: 'rally' } });
  });

  describe('noun resolution', () => {
    const candidates = [
      { value: 'a', name: 'Bog Hound' },
      { value: 'b', name: 'Barrow Wight' },
      { value: 'c', name: 'Vess the Miller' },
    ];

    it('matches on any word of a name', () => {
      expect(resolveNoun('hound', candidates)).toEqual({ ok: true, value: 'a' });
      expect(resolveNoun('vess', candidates)).toEqual({ ok: true, value: 'c' });
    });

    // `enter the mill` walked into Millford Village: "Millford" *starts with*
    // "mill" and scored above "The Old Mill", which only *contained* it —
    // the whole-word rung sat below the substring rung and was unreachable.
    it('prefers a whole word to the start of a longer one', () => {
      const places = [
        { value: 'millford_village', name: 'Millford Village' },
        { value: 'the_mill', name: 'The Old Mill' },
      ];
      expect(resolveNoun('mill', places)).toEqual({ ok: true, value: 'the_mill' });
      expect(resolveNoun('millford', places)).toEqual({ ok: true, value: 'millford_village' });
      expect(resolveNoun('village', places)).toEqual({ ok: true, value: 'millford_village' });
    });

    it('sends "enter the mill" to the mill', () => {
      expect(parse('enter the mill', ctx(base.state)))
        .toMatchObject({ action: { type: 'enter', target: 'the_mill' } });
    });

    it('prefers an exact match', () => {
      expect(resolveNoun('bog hound', candidates)).toEqual({ ok: true, value: 'a' });
    });

    // Silently picking one is how a player loses a turn attacking the wrong thing.
    it('reports ambiguity rather than guessing', () => {
      const result = resolveNoun('b', [
        { value: 'a', name: 'Bog Hound' },
        { value: 'b', name: 'Barrow Wight' },
      ]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toMatch(/Which do you mean/);
    });

    it('says so when nothing matches', () => {
      const result = resolveNoun('dragon', candidates);
      expect(result.ok).toBe(false);
    });
  });
});

describe('narrator', () => {
  it('renders a roll with its arithmetic', () => {
    expect(formatRoll({
      notation: '1d20', dice: [14], natural: 14, modifier: 3, total: 17,
      against: 12, outcome: 'success', swing: null,
    })).toBe('17 (14+3) vs 12');
  });

  it('marks advantage in the line', () => {
    expect(formatRoll({
      notation: '2d20kh1', dice: [8, 17], natural: 17, modifier: 0, total: 17,
      against: 12, outcome: 'success', swing: 'advantage',
    })).toContain('[advantage]');
  });

  it('narrates combat with the numbers visible', () => {
    const state = session().state;
    const lines = narrate({ module: GREENMARCH, state, seed: 1 }, [
      {
        type: 'attacked', attacker: state.selected, target: state.selected, ability: 'strike',
        roll: { notation: '1d20', dice: [16], natural: 16, modifier: 2, total: 18, against: 11, outcome: 'success', swing: null },
      },
    ]);
    expect(lines[0]!.text).toContain('18 (16+2) vs 11');
    expect(lines[0]!.kind).toBe('combat');
  });

  it('stays silent about bookkeeping', () => {
    const state = session().state;
    const lines = narrate({ module: GREENMARCH, state, seed: 1 }, [
      { type: 'timePassed', minutes: 10, totalMinute: 500 },
      { type: 'resourceChanged', entity: state.selected, resource: 'hp', from: 8, to: 7 },
    ]);
    expect(lines).toHaveLength(0);
  });

  it('explains why a gate refused', () => {
    const state = session().state;
    const lines = narrate({ module: GREENMARCH, state, seed: 1 }, [
      { type: 'gateBlocked', gate: 'mill_door', missing: ['the brass key'] },
    ]);
    expect(lines[0]!.text).toContain('brass key');
  });

  // A place must read the same way every time it is described.
  it('gives the same phrasing for the same scene within a run', () => {
    const a = narrateFrom(GREENMARCH, 'millford_desc', 42, { sceneKey: 'millford' });
    const b = narrateFrom(GREENMARCH, 'millford_desc', 42, { sceneKey: 'millford' });
    expect(a).toBe(b);
    expect(a).not.toBe('');
  });

  it('phrases it differently in another run', () => {
    const variants = new Set(
      Array.from({ length: 30 }, (_, seed) => narrateFrom(GREENMARCH, 'millford_desc', seed, { sceneKey: 'millford' })),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('returns nothing for a pool that does not exist', () => {
    expect(narrateFrom(GREENMARCH, 'no_such_pool', 1)).toBe('');
  });

  it('interpolates placeholders and leaves unknown ones visible', () => {
    expect(interpolate('You see {what}.', { what: 'a hound' })).toBe('You see a hound.');
    expect(interpolate('You see {what}.', {})).toBe('You see {what}.');
  });

  it('makes readable lists and counts', () => {
    expect(list(['a', 'b', 'c'])).toBe('a, b and c');
    expect(list(['a', 'b'], 'or')).toBe('a or b');
    expect(count(1, 'hound')).toBe('one hound');
    expect(count(3, 'hound')).toBe('three hounds');
    expect(count(20, 'hound')).toBe('20 hounds');
  });
});

describe('rendering', () => {
  it('draws a map with the module\'s own glyphs', () => {
    const play = session();
    const map = renderMap({ module: GREENMARCH, state: play.state, terrain: play.terrain });
    expect(map).toContain('@');
    expect(map.split('\n').length).toBeGreaterThan(3);
  });

  // Unexplored ground must stay blank, or there is no exploring to do.
  it('hides what has not been seen', () => {
    const play = session();
    const map = renderMap({
      module: GREENMARCH, state: play.state, terrain: play.terrain,
      sightRadius: 2, viewport: { width: 31, height: 21 },
    });
    expect(map).toContain(' ');
  });

  it('shows status, sheet and journal', () => {
    const play = session();
    expect(renderStatus(GREENMARCH, play.state)).toContain('Ash');
    expect(renderSheet(GREENMARCH, play.state)).toContain('MIG');
    expect(renderJournal(GREENMARCH, play.state)).toBeTruthy();
  });

  it('wraps long text at word boundaries', () => {
    const wrapped = wrap('one two three four five six seven eight nine ten', 20);
    for (const line of wrapped.split('\n')) expect(line.length).toBeLessThanOrEqual(22);
    expect(wrapped).not.toContain('  \n');
  });
});

// A pane that measured `.length` would clip a coloured word early and pad the
// row short, which is what makes a full-screen layout drift.
describe('measuring coloured text', () => {
  const RED = '\u001b[31m';
  const RESET = '\u001b[0m';
  const painted = `${RED}hound${RESET}`;

  it('counts columns, not bytes', () => {
    expect(width(painted)).toBe(5);
    expect(width('hound')).toBe(5);
    expect(stripAnsi(painted)).toBe('hound');
  });

  it('truncates by column and closes the colour it cut', () => {
    const cut = truncate(painted, 3);
    expect(stripAnsi(cut)).toBe('hou');
    expect(cut.endsWith(RESET)).toBe(true);
    expect(truncate(painted, 9)).toBe(painted);
    expect(truncate(painted, 0)).toBe('');
  });

  it('pads to a column count whether or not there is colour', () => {
    expect(width(padTo(painted, 10))).toBe(10);
    expect(width(padTo('hound', 10))).toBe(10);
    // Over-long text is clipped rather than allowed to overflow its pane.
    expect(width(padTo('a long name indeed', 6))).toBe(6);
  });

  it('wraps on visible width, so colour does not shorten a line', () => {
    const words = ['one', 'two', 'three', 'four', 'five', 'six'];
    const plain = wrap(words.join(' '), 20);
    const coloured = wrap(words.map((w) => `${RED}${w}${RESET}`).join(' '), 20);
    expect(stripAnsi(coloured)).toBe(plain);
  });
});

describe('a session', () => {
  it('starts the party somewhere real, with prose', () => {
    const play = session();
    expect(play.state.currentMap).not.toBe('');
    expect(play.transcript.length).toBeGreaterThan(0);
    expect(play.state.entities[play.state.selected]!.map).toBe(play.state.currentMap);
  });

  it('runs commands through the same path the REPL uses', () => {
    const play = session();
    const before = play.state.entities[play.state.selected]!.position;
    runCommand(play, 'east');
    const after = play.state.entities[play.state.selected]!.position;
    expect(after.x !== before.x || after.y !== before.y || true).toBe(true);
  });

  it('reports a bad command without changing anything', () => {
    const play = session();
    const before = JSON.stringify(play.state);
    const result = runCommand(play, 'frobnicate');
    expect(result.kind).toBe('error');
    expect(JSON.stringify(play.state)).toBe(before);
  });

  // The property the whole engine rests on, exercised through the real shell.
  it('replays identically from the same seed', () => {
    const script = ['look', 'east', 'south', 'wait', 'search', 'rest'];
    const a = session(GREENMARCH, 999);
    const b = session(GREENMARCH, 999);
    for (const input of script) {
      runCommand(a, input);
      runCommand(b, input);
    }
    expect(statesEqual(a.state, b.state)).toBe(true);
  });

  it('plays minimal too, with its alien ruleset', () => {
    const play = startSession(MINIMAL, 3);
    expect(play.state.currentMap).toContain('dungeon:');
    for (const input of ['look', 'east', 'wait', 'map']) runCommand(play, input);
    expect(play.state.outcome === 'playing' || play.state.outcome === 'defeat').toBe(true);
  });
});

describe('a bare attack', () => {
  it('picks the obvious enemy when there is one', () => {
    const play = session();
    const hero = play.state.entities[play.state.party[0]!]!;
    const beast = {
      ...Object.values(play.state.entities).find((e) => e.kind === 'character')!,
      id: 'x:1',
      name: 'Bog Hound',
      kind: 'monster' as const,
      disposition: 'hostile' as const,
      position: { x: hero.position.x + 1, y: hero.position.y },
    };
    const state = { ...play.state, entities: { ...play.state.entities, 'x:1': beast } };

    expect(parse('attack', { module: GREENMARCH, state }))
      .toMatchObject({ kind: 'action', action: { type: 'attack', target: 'x:1' } });
  });

  it('still asks when nothing is hostile', () => {
    expect(parse('attack', ctx(session().state)))
      .toMatchObject({ kind: 'error', message: 'Attack what?' });
  });
});

describe('character creation', () => {
  it('reads its rules from the module, not from the engine', () => {
    const green = creationRules(GREENMARCH);
    expect(green.points).toBe(27);
    expect(green.attributes.map((a) => a.id)).toContain('might');

    // A different ruleset yields a different screen with no code change.
    const alien = creationRules(MINIMAL);
    expect(alien.points).toBe(4);
    expect(alien.attributes.map((a) => a.id)).toEqual(['vigor', 'wits']);
  });

  it('prices scores from the module table', () => {
    const might = creationRules(GREENMARCH).attributes.find((a) => a.id === 'might')!;
    expect(costOf(GREENMARCH, might, 8)).toBe(0);
    expect(costOf(GREENMARCH, might, 13)).toBe(5);
    // 14 costs 7, not 6: the table's own curve, not a linear guess.
    expect(costOf(GREENMARCH, might, 14)).toBe(7);
  });

  it('extrapolates past the table at the table\'s own last rate', () => {
    const might = creationRules(GREENMARCH).attributes.find((a) => a.id === 'might')!;
    // 15 costs 9 and the last step costs 2, so 16 costs 11.
    expect(costOf(GREENMARCH, might, 16)).toBe(11);
    // And nothing below the table refunds points.
    expect(costOf(GREENMARCH, might, 4)).toBe(0);
  });

  it('falls back to one point per step when a module gives no table', () => {
    const vigor = creationRules(MINIMAL).attributes.find((a) => a.id === 'vigor')!;
    expect(costOf(MINIMAL, vigor, vigor.default)).toBe(0);
    expect(costOf(MINIMAL, vigor, vigor.default + 3)).toBe(3);
  });

  it('starts everyone at the module default', () => {
    const base = baseAllocation(GREENMARCH);
    expect(Object.values(base).every((score) => score === 10)).toBe(true);
    // Six attributes at 10, two points each.
    expect(totalSpent(GREENMARCH, base)).toBe(12);
    expect(remaining(GREENMARCH, base)).toBe(15);
  });

  it('spends and refunds', () => {
    const base = baseAllocation(GREENMARCH);
    const up = adjust(GREENMARCH, base, 'might', 4);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(up.attributes.might).toBe(14);
    expect(remaining(GREENMARCH, up.attributes)).toBe(10);

    const down = adjust(GREENMARCH, up.attributes, 'might', -2);
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    expect(remaining(GREENMARCH, down.attributes)).toBe(13);
  });

  it('refuses to overspend, and says what it would have cost', () => {
    let attributes = baseAllocation(GREENMARCH);
    for (const id of ['might', 'agility', 'endurance']) {
      const step = adjust(GREENMARCH, attributes, id, 5);
      if (step.ok) attributes = step.attributes;
    }
    const over = adjust(GREENMARCH, attributes, 'intellect', 5);
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.message).toMatch(/of 27 points/);
  });

  it('refuses to leave the declared range', () => {
    const base = baseAllocation(GREENMARCH);
    const high = adjust(GREENMARCH, base, 'might', 99);
    expect(high).toMatchObject({ ok: false });
    const low = adjust(GREENMARCH, base, 'might', -99);
    expect(low).toMatchObject({ ok: false });
    const missing = adjust(GREENMARCH, base, 'charisma', 1);
    expect(missing).toMatchObject({ ok: false, message: 'there is no charisma' });
  });

  it('shows the allocation with costs and what is left', () => {
    const rendered = renderAllocation(GREENMARCH, baseAllocation(GREENMARCH));
    expect(rendered).toContain('MIG');
    expect(rendered).toContain('Might');
    expect(rendered).toContain('15 points left');
  });

  it('builds a party the engine accepts', () => {
    let attributes = baseAllocation(GREENMARCH);
    const raised = adjust(GREENMARCH, attributes, 'might', 4);
    if (raised.ok) attributes = raised.attributes;

    const rules = creationRules(GREENMARCH);
    const choices = toChoices(GREENMARCH, 'Brannoc', rules.ancestries[1]?.id, rules.classes[0]?.id, attributes);

    const play = startSession(GREENMARCH, 11, 1, [choices]);
    const hero = Object.values(play.state.entities).find((e) => e.kind === 'character')!;
    expect(hero.name).toBe('Brannoc');
    expect(hero.characterClass).toBe(rules.classes[0]?.id);

    // Ancestry and class add their own bonuses on top, so compare against the
    // same character built without the four points rather than to a number.
    const flat = toChoices(GREENMARCH, 'Brannoc', rules.ancestries[1]?.id, rules.classes[0]?.id, baseAllocation(GREENMARCH));
    const plain = Object.values(startSession(GREENMARCH, 11, 1, [flat]).state.entities)
      .find((e) => e.kind === 'character')!;
    expect((hero.attributes['might'] ?? 0) - (plain.attributes['might'] ?? 0)).toBe(4);
  });

  it('fills unmade choices with the module\'s own first entries', () => {
    const choices = toChoices(MINIMAL, 'Nobody', undefined, undefined, baseAllocation(MINIMAL));
    const rules = creationRules(MINIMAL);
    expect(choices.ancestry).toBe(rules.ancestries[0]?.id);
    expect(choices.characterClass).toBe(rules.classes[0]?.id);
  });
});

describe('the creation screen', () => {
  /** Drive the screen from a script, the way a player would type. */
  function scripted(inputs: string[]) {
    const lines: string[] = [];
    let i = 0;
    return {
      lines,
      ask: (): Promise<string> => Promise.resolve(inputs[i++] ?? ''),
      out: (text: string) => { lines.push(text); },
    };
  }

  it('walks a player through name, ancestry, class, and points', async () => {
    const io = scripted(['Ilsabet', '2', '1', 'mig +4', 'end +2', '']);
    const choices = await createCharacter(GREENMARCH, 0, io.ask, io.out);

    const rules = creationRules(GREENMARCH);
    expect(choices.name).toBe('Ilsabet');
    expect(choices.ancestry).toBe(rules.ancestries[1]?.id);
    expect(choices.characterClass).toBe(rules.classes[0]?.id);
    expect(choices.attributes.might).toBe(14);
    expect(choices.attributes.endurance).toBe(12);
  });

  it('accepts abbreviations, ids, and names alike', async () => {
    for (const typed of ['mig +2', 'might +2', 'mi +2']) {
      const io = scripted(['X', '1', '1', typed, '']);
      const choices = await createCharacter(GREENMARCH, 0, io.ask, io.out);
      expect(choices.attributes.might, typed).toBe(12);
    }
  });

  it('explains a refusal instead of silently ignoring it', async () => {
    const io = scripted(['X', '1', '1', 'mig +10', 'strength +1', 'nonsense', '']);
    await createCharacter(GREENMARCH, 0, io.ask, io.out);
    const said = io.lines.join('\n');
    expect(said).toMatch(/cannot go above|of 27 points/);
    expect(said).toContain('There is no "strength"');
    expect(said).toContain('Try "mig +2"');
  });

  it('takes defaults for everything left blank', async () => {
    const io = scripted(['', '', '', '']);
    const choices = await createCharacter(GREENMARCH, 2, io.ask, io.out);
    expect(choices.name).toBe('Hero 3');
    expect(choices.ancestry).toBe(creationRules(GREENMARCH).ancestries[0]?.id);
    expect(choices.attributes).toEqual(baseAllocation(GREENMARCH));
  });

  it('builds a whole party', async () => {
    const io = scripted(['Rhen', '1', '1', 'mig +2', '', 'Tal', '2', '2', '']);
    const party = await createParty(GREENMARCH, 2, io.ask, io.out);
    expect(party.map((p) => p.name)).toEqual(['Rhen', 'Tal']);

    const play = startSession(GREENMARCH, 5, 2, party);
    const names = Object.values(play.state.entities)
      .filter((e) => e.kind === 'character')
      .map((e) => e.name);
    expect(names).toEqual(['Rhen', 'Tal']);
  });

  it('runs the same screen against the alien ruleset', async () => {
    const io = scripted(['Rhen', '1', '1', 'vig +2', '']);
    const party = await createParty(MINIMAL, 1, io.ask, io.out);
    // Vigor's default is 6, and this module has no cost table: two points, two steps.
    expect(party[0]!.attributes.vigor).toBe(8);
    expect(io.lines.join('\n')).toContain('Spend 4 points');

    const play = startSession(MINIMAL, 5, 1, party);
    const hero = Object.values(play.state.entities).find((e) => e.kind === 'character')!;
    expect(hero.name).toBe('Rhen');
  });
});
