/**
 * The view models both front ends draw from.
 *
 * These are the derivations extracted from the terminal renderers; the
 * renderers' own bytes are pinned in `packages/cli/src/render.test.ts`. Here
 * the data itself is what is under test — bands at their thresholds, the three
 * visibility states, gate reasons, palette precedence.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import type { GameState } from '@dm/engine';
import { key } from '@dm/engine';
import { startSession, runCommand } from '../session.js';
import { toneOf, toneOfEntity, glyphOfEntity } from './palette.js';
import { duration } from './format.js';
import { waysFromHere } from './exits.js';
import { mapView } from './map.js';
import { statusView } from './status.js';
import { partyView } from './party.js';
import { legend } from './legend.js';
import { inventoryView } from './inventory.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');

describe('the palette', () => {
  it('lets a declared color hint win over tags', () => {
    // greenmarch's deep_water declares color: blue and tags: [water].
    expect(toneOf(GREENMARCH, 'deep_water')).toBe('blue');
    expect(toneOf(GREENMARCH, 'shallow_water')).toBe('cyan');
  });

  it('falls back to tags, then to nothing', () => {
    // reeds has no color; nothing tags it either — but the name-tag ladder
    // catches tags like water. floor has neither.
    expect(toneOf(GREENMARCH, 'floor')).toBeNull();
    expect(toneOf(MINIMAL, 'bare_floor')).toBeNull();
    expect(toneOf(GREENMARCH, 'no_such_terrain')).toBeNull();
  });

  it('caches when given a cache', () => {
    const cache = new Map<string, ReturnType<typeof toneOf>>();
    toneOf(GREENMARCH, 'deep_water', cache);
    expect(cache.get('deep_water')).toBe('blue');
  });

  it('tones and glyphs creatures by who they are', () => {
    const session = startSession(GREENMARCH, 7);
    const you = session.state.entities[session.state.selected]!;
    expect(toneOfEntity(you)).toBe('cyan');
    expect(glyphOfEntity(you)).toBe('@');

    const vess = session.state.entities['vess']!;
    expect(toneOfEntity(vess)).toBe('yellow');
    expect(glyphOfEntity(vess)).toBe('&');
  });
});

describe('duration', () => {
  it('phrases travel time', () => {
    expect(duration(0)).toBe('');
    expect(duration(20)).toBe('20m');
    expect(duration(90)).toBe('1h 30m');
    expect(duration(120)).toBe('2h');
  });
});

describe('waysFromHere', () => {
  it('lists the mill and the road out, with the gate reason', () => {
    const session = startSession(GREENMARCH, 7);
    const ways = waysFromHere(GREENMARCH, session.state, session.terrain);

    const mill = ways.places.find((place) => place.poi === 'the_mill')!;
    expect(mill).toBeDefined();
    expect(mill.barred).toBe(true);
    // The reason, not just the fact: the brass key.
    expect(mill.requires.join(' ')).toMatch(/key/i);
    expect(mill.action).toEqual({ type: 'enter', target: 'the_mill' });
    // Placed on the map — the exact spot is the module's business, not this test's.
    expect(mill.position).not.toBeNull();

    const fens = ways.roads.find((road) => road.area === 'the_fens')!;
    expect(fens).toBeDefined();
    expect(fens.travelMinutes).toBe(90);
    expect(fens.action).toEqual({ type: 'travelToArea', area: 'the_fens' });
  });

  it('drops the bar once the gate is open', () => {
    const session = startSession(GREENMARCH, 7);
    const opened: GameState = {
      ...session.state,
      flags: { ...session.state.flags, 'gate:mill_door:open': true },
    };
    const mill = waysFromHere(GREENMARCH, opened, session.terrain)
      .places.find((place) => place.poi === 'the_mill')!;
    expect(mill.barred).toBe(false);
    expect(mill.requires).toEqual([]);
  });

  // The test above sets the flag by hand, which is how the bug survived: the
  // panel read a flag the engine never wrote, so a door the party had actually
  // opened went on reading as barred for the rest of the run. This one opens it
  // by playing.
  it('drops the bar after the gate is opened in play, not just in a fixture', () => {
    const session = startSession(GREENMARCH, 7);
    const hero = session.state.entities[session.state.selected]!;
    session.state = {
      ...session.state,
      entities: {
        ...session.state.entities,
        [hero.id]: { ...hero, inventory: [...hero.inventory, { item: 'brass_key', quantity: 1 }] },
      },
    };

    const before = waysFromHere(GREENMARCH, session.state, session.terrain)
      .places.find((place) => place.poi === 'the_mill')!;
    expect(before.barred).toBe(true);

    const opened = runCommand(session, 'open the mill door');
    expect(opened.kind).not.toBe('error');

    const after = waysFromHere(GREENMARCH, session.state, session.terrain)
      .places.find((place) => place.poi === 'the_mill')!;
    expect(after.barred).toBe(false);
  });

  it('offers nothing in a module with no declared ways', () => {
    const session = startSession(MINIMAL, 7);
    const ways = waysFromHere(MINIMAL, session.state, session.terrain);
    expect(ways.places).toEqual([]);
    expect(ways.roads).toEqual([]);
  });

  it('points at the frontier with a walkable tile, after some ground is known', () => {
    const session = startSession(GREENMARCH, 7);
    for (const input of ['e', 'e', 'n']) runCommand(session, input);

    const frontier = waysFromHere(GREENMARCH, session.state, session.terrain).frontier;
    expect(frontier).not.toBeNull();
    expect(frontier!.tiles).toBeGreaterThan(0);
    expect(frontier!.action).toEqual({ type: 'travelTo', to: frontier!.at });
    // The tile is real and walkable.
    const map = session.state.maps[session.state.currentMap]!;
    expect(session.terrain.isPassable(map.tiles, frontier!.at, ['walk'])).toBe(true);
  });
});

describe('mapView', () => {
  const view = () => {
    const session = startSession(GREENMARCH, 7);
    return {
      session,
      view: mapView(GREENMARCH, session.state, session.terrain, {
        viewport: { width: 21, height: 15 },
      })!,
    };
  };

  it('carries all three visibility states', () => {
    const { view: v } = view();
    const states = new Set(v.cells.map((cell) => cell.visibility));
    expect(states.has('visible')).toBe(true);
    expect(states.has('unknown')).toBe(true);
  });

  it('puts entities only on visible cells, and marks the one you control', () => {
    const { session, view: v } = view();
    const withEntity = v.cells.filter((cell) => cell.entity !== null);
    expect(withEntity.length).toBeGreaterThan(0);
    for (const cell of withEntity) expect(cell.visibility).toBe('visible');

    const you = withEntity.find((cell) => cell.entity!.selected)!;
    expect(you).toBeDefined();
    expect(you.entity!.id).toBe(session.state.selected);
    expect(you.x).toBe(v.at.x);
    expect(you.y).toBe(v.at.y);
  });

  it('clamps the viewport to the map edge', () => {
    const session = startSession(GREENMARCH, 7);
    const v = mapView(GREENMARCH, session.state, session.terrain, {
      viewport: { width: 200, height: 200 },
    })!;
    expect(v.origin).toEqual({ x: 0, y: 0 });
    expect(v.viewport.width).toBe(v.width);
    expect(v.viewport.height).toBe(v.height);
    expect(v.cells).toHaveLength(v.width * v.height);
  });

  it('is row-major and coordinates agree with indices', () => {
    const { view: v } = view();
    const index = 5 * v.viewport.width + 3;
    const cell = v.cells[index]!;
    expect(cell.x).toBe(v.origin.x + 3);
    expect(cell.y).toBe(v.origin.y + 5);
    void key;
  });
});

describe('statusView', () => {
  it('reads the pools with the terminal thresholds', () => {
    const session = startSession(GREENMARCH, 7);
    const status = statusView(GREENMARCH, session.state)!;

    const vital = status.resources.find((pool) => pool.vital)!;
    expect(vital.name).toBe('Hit Points');
    expect(vital.band).toBe('ok');
    expect(status.stance?.id).toBe('walk');
    expect(status.combat).toBeNull();
    // greenmarch declares four day phases; 08:00 is the start of `day`.
    expect(status.clock.text).toBe('day 1 08:00 (Day)');
  });

  it('bands at exactly the halves and quarters the terminal colours by', () => {
    const session = startSession(GREENMARCH, 7);
    const hero = session.state.entities[session.state.selected]!;
    const banded = (hp: number) => {
      const hurt: GameState = {
        ...session.state,
        entities: {
          ...session.state.entities,
          [hero.id]: { ...hero, resources: { ...hero.resources, hp } },
        },
      };
      return statusView(GREENMARCH, hurt)!.resources.find((pool) => pool.vital)!.band;
    };

    // Max is 8: 5/8 ok · 4/8 exactly half is hurt · 2/8 exactly a quarter is critical.
    expect(banded(5)).toBe('ok');
    expect(banded(4)).toBe('hurt');
    expect(banded(3)).toBe('hurt');
    expect(banded(2)).toBe('critical');
  });

  it('hides the stance when the module offers no choice', () => {
    const session = startSession(MINIMAL, 7);
    expect(statusView(MINIMAL, session.state)!.stance).toBeNull();
  });
});

describe('partyView', () => {
  it('reads the roster with selection and positions', () => {
    const session = startSession(GREENMARCH, 7);
    const party = partyView(GREENMARCH, session.state);

    expect(party).toHaveLength(4);
    expect(party.filter((member) => member.selected)).toHaveLength(1);
    expect(party[0]!.vital!.current).toBe(8);
    for (const member of party) {
      expect(member.following).toBeNull();
      expect(member.position.x).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('legend', () => {
  it('names what is actually on screen', () => {
    const session = startSession(GREENMARCH, 7);
    const v = mapView(GREENMARCH, session.state, session.terrain, {
      viewport: { width: 31, height: 21 },
    })!;
    const entries = legend(GREENMARCH, v);

    const names = entries.map((entry) => entry.name);
    expect(names).toContain('you');
    expect(names).toContain('party');
    expect(names).toContain('vess the miller');
    expect(names).toContain('floor');
    // And nothing from maps the party has never seen.
    expect(names).not.toContain('rubble');
  });
});

describe('inventoryView', () => {
  it('reads what is carried, with equipment facts', () => {
    const session = startSession(GREENMARCH, 7);
    const carried = inventoryView(GREENMARCH, session.state);

    const sword = carried.find((item) => item.item === 'iron_sword')!;
    expect(sword).toBeDefined();
    expect(sword.name).toBe('Iron Sword');
    expect(sword.equippable).toBe(true);
  });
});
