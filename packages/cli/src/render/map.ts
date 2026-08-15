/**
 * Drawing the map.
 *
 * The map is the one place a text game has to be genuinely careful: a wall of
 * punctuation is unreadable, so the renderer leans on three states — lit and
 * visible, remembered but out of sight, and unknown — and dims the middle one.
 * That is what makes a corridor you walked five minutes ago read as memory
 * rather than as something you can currently see.
 *
 * Colour is a second channel over the glyphs, never a replacement for them. The
 * same map has to be legible piped to a file, in a terminal with no colour, and
 * to a reader who cannot distinguish blue from grey.
 */

import pc from 'picocolors';
import type { CompiledModule } from '@dm/module';
import type { GameState, Entity, Position } from '@dm/engine';
import { TerrainIndex, fieldOfView, key, placeNameOf } from '@dm/engine';
import { toneOf, toneOfEntity, glyphOfEntity } from '@dm/play';
import type { Tone } from '@dm/play';
import { clockOf } from './panes.js';

const GLYPH_PARTY = '@';

export interface RenderOptions {
  readonly module: CompiledModule;
  readonly state: GameState;
  readonly terrain: TerrainIndex;
  /** How far the party can see, in tiles. */
  readonly sightRadius?: number;
  /** Clip the drawing to this many tiles around the party. */
  readonly viewport?: { readonly width: number; readonly height: number };
  /**
   * Columns per tile. Two gives a roughly square aspect ratio, since a terminal
   * cell is about twice as tall as it is wide; one is the compact form the
   * scrolling shell and the tests use.
   */
  readonly cellWidth?: 1 | 2;
}

type Paint = (text: string) => string;

/**
 * Which tone a thing gets is decided once, in `@dm/play`'s palette, and shared
 * with the browser front end; only the *painting* — tone to escape code — is
 * the terminal's own business.
 */
const PAINTS: Readonly<Record<Tone, Paint>> = {
  red: pc.red, green: pc.green, yellow: pc.yellow, blue: pc.blue,
  magenta: pc.magenta, cyan: pc.cyan, white: pc.white, gray: pc.gray,
};

const PLAIN: Paint = (text) => text;

function paintFor(
  module: CompiledModule,
  id: string,
  cache: Map<string, Tone | null>,
): Paint {
  const tone = toneOf(module, id, cache);
  return tone ? PAINTS[tone] : PLAIN;
}

/**
 * Draw the current map, one string per row.
 *
 * Only what the party can see, plus what they remember. Everything else stays
 * blank, which is what makes exploring feel like exploring.
 */
export function mapLines(options: RenderOptions): string[] {
  const { module, state, terrain } = options;
  const map = state.maps[state.currentMap];
  if (!map) return [pc.dim('  (nowhere)')];

  const actor = state.entities[state.selected];
  const origin = actor?.position ?? { x: 0, y: 0 };
  const radius = options.sightRadius ?? 8;
  const cell = options.cellWidth ?? 1;

  const visible = fieldOfView({ map: map.tiles, terrain, origin, radius });
  const remembered = new Set(map.explored);
  const paints = new Map<string, Tone | null>();

  // Occupants, drawn over the terrain.
  const occupants = new Map<number, string>();
  for (const entity of Object.values(state.entities)) {
    if (!entity.alive || entity.map !== state.currentMap) continue;
    occupants.set(key(entity.position), paintEntity(entity, entity.id === state.selected));
  }

  const view = options.viewport ?? { width: 61, height: 21 };
  const halfWidth = Math.floor(view.width / 2);
  const halfHeight = Math.floor(view.height / 2);

  const left = Math.max(0, Math.min(origin.x - halfWidth, map.tiles.width - view.width));
  const top = Math.max(0, Math.min(origin.y - halfHeight, map.tiles.height - view.height));

  const pad = cell === 2 ? ' ' : '';
  const rows: string[] = [];

  for (let y = top; y < Math.min(map.tiles.height, top + view.height); y += 1) {
    let row = '';
    for (let x = left; x < Math.min(map.tiles.width, left + view.width); x += 1) {
      const packed = key({ x, y });
      const seen = visible.has(packed);
      const known = remembered.has(packed);

      if (!seen && !known) {
        row += ' ' + pad;
        continue;
      }

      const occupant = occupants.get(packed);
      if (occupant && seen) {
        // Creatures are only drawn where they can actually be seen; memory does
        // not track things that move.
        row += occupant + pad;
        continue;
      }

      // A trap the party has found, drawn over the ground it is buried in.
      // Never a hidden one — that would hand the player knowledge the
      // characters have no way of having, the same rule the fog of war follows.
      const trap = map.traps[packed];
      if (trap && trap.state !== 'hidden') {
        const glyph = trap.state === 'found' ? pc.red('^') : pc.dim('^');
        row += glyph + pad;
        continue;
      }

      const tile = terrain.at(map.tiles, { x, y });
      const painted = paintFor(module, tile.id, paints)(tile.glyph);
      row += (seen ? painted : pc.dim(tile.glyph)) + pad;
    }
    rows.push(`  ${row}`);
  }

  return rows;
}

/**
 * The party's own line above the map: where they are, and when.
 *
 * Standing somewhere unnamed and unclocked is most of why the map read as an
 * abstract grid rather than as a place.
 */
export function mapHeader(module: CompiledModule, state: GameState): string {
  const actor = state.entities[state.selected];
  const where = actor ? pc.dim(`(${actor.position.x},${actor.position.y})`) : '';
  return `  ${pc.bold(placeNameOf(module, state))}   ${where}  ${pc.dim(clockOf(module, state))}`;
}

/**
 * What the glyphs on screen mean, for the terrain actually on screen.
 *
 * Listing every terrain the module declares would be a wall of text about
 * places the party has never been.
 */
export function mapLegend(options: RenderOptions): string[] {
  const { module, state, terrain } = options;
  const map = state.maps[state.currentMap];
  if (!map) return [];

  const actor = state.entities[state.selected];
  const origin = actor?.position ?? { x: 0, y: 0 };
  const visible = fieldOfView({
    map: map.tiles, terrain, origin, radius: options.sightRadius ?? 8,
  });
  const remembered = new Set(map.explored);
  const paints = new Map<string, Tone | null>();

  const present = new Map<string, { glyph: string; name: string }>();
  for (let y = 0; y < map.tiles.height; y += 1) {
    for (let x = 0; x < map.tiles.width; x += 1) {
      const packed = key({ x, y });
      if (!visible.has(packed) && !remembered.has(packed)) continue;
      const tile = terrain.at(map.tiles, { x, y });
      if (!tile.id || present.has(tile.id)) continue;
      // `TerrainDef` carries only what the rules need; the display name lives
      // in the module beside it.
      const named = module.find<{ name?: string }>('world.terrains', tile.id);
      present.set(tile.id, { glyph: tile.glyph, name: named?.name || tile.id });
    }
  }

  const terrains = [...present].map(([id, tile]) =>
    `${paintFor(module, id, paints)(tile.glyph)} ${pc.dim(tile.name.toLowerCase())}`);

  // Who is who, but only the kinds actually standing here.
  const here = Object.values(state.entities)
    .filter((entity) => entity.alive && entity.map === state.currentMap);
  const creatures: string[] = [];
  if (here.some((entity) => entity.kind === 'character')) {
    creatures.push(`${pc.inverse(pc.cyan(GLYPH_PARTY))} ${pc.dim('you')}`);
    if (here.filter((entity) => entity.kind === 'character').length > 1) {
      creatures.push(`${pc.cyan(GLYPH_PARTY)} ${pc.dim('party')}`);
    }
  }
  if (here.some((entity) => entity.kind === 'npc')) {
    creatures.push(`${pc.yellow('&')} ${pc.dim('people')}`);
  }

  // Named, not lumped under a stand-in glyph: monsters are drawn as the first
  // letter of their name, so a legend saying `x hostile` describes something
  // that is nowhere on the map.
  const named = new Map<string, string>();
  for (const entity of here) {
    if (entity.kind === 'character' || entity.kind === 'npc') continue;
    named.set(paintEntity(entity, false), entity.name.toLowerCase());
  }
  for (const [glyph, name] of named) creatures.push(`${glyph} ${pc.dim(name)}`);

  // A `^` on screen means nothing without being told what it is.
  const traps = Object.values(map.traps).filter((placed) => placed.state !== 'hidden');
  if (traps.length > 0) {
    const armed = traps.some((placed) => placed.state === 'found');
    creatures.push(`${armed ? pc.red('^') : pc.dim('^')} ${pc.dim(armed ? 'trap' : 'spent trap')}`);
  }

  return [...chunk([...creatures, ...terrains], 6)].map((line) => `  ${line.join('   ')}`);
}

function* chunk<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

/**
 * The whole map at once, scaled to fit.
 *
 * The always-on viewport shows the ground under the party's feet; this shows
 * the shape of the place they are in. Typing `map` used to redraw the same
 * viewport that was already on screen, which is why it looked like it did
 * nothing at all.
 */
export function mapOverview(
  options: RenderOptions & { readonly width?: number; readonly height?: number },
): string[] {
  const { module, state, terrain } = options;
  const map = state.maps[state.currentMap];
  if (!map) return [pc.dim('  (nowhere)')];

  const cell = options.cellWidth ?? 1;
  const room = Math.max(20, Math.floor((options.width ?? 76) / cell) - 2);
  const rows = Math.max(8, (options.height ?? 24) - 2);

  const actor = state.entities[state.selected];
  const origin = actor?.position ?? { x: 0, y: 0 };
  const visible = fieldOfView({
    map: map.tiles, terrain, origin, radius: options.sightRadius ?? 8,
  });
  const remembered = new Set(map.explored);
  const paints = new Map<string, Tone | null>();

  // Only as much of the map as the party has any knowledge of. Drawing the
  // whole rectangle spends most of the screen on blank unknown space and then
  // scales what *is* known down to nothing.
  let minX = map.tiles.width;
  let minY = map.tiles.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < map.tiles.height; y += 1) {
    for (let x = 0; x < map.tiles.width; x += 1) {
      const packed = key({ x, y });
      if (!visible.has(packed) && !remembered.has(packed)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return [pc.dim('  (nothing known of this place yet)')];

  const known = { width: maxX - minX + 1, height: maxY - minY + 1 };

  // How many map tiles each drawn cell stands for. Never below one — a small
  // map is drawn at full size rather than blown up.
  const step = Math.max(1, Math.ceil(Math.max(known.width / room, known.height / rows)));

  const occupants = new Map<number, Entity>();
  for (const entity of Object.values(state.entities)) {
    if (!entity.alive || entity.map !== state.currentMap) continue;
    occupants.set(key(entity.position), entity);
  }

  const pad = cell === 2 ? ' ' : '';
  const drawn: string[] = [];

  for (let y = minY; y <= maxY; y += step) {
    let row = '';
    for (let x = minX; x <= maxX; x += step) {
      row += sample(
        { module, state, terrain },
        map.tiles.width, map.tiles.height,
        { x, y }, step,
        { visible, remembered, occupants, paints, selected: state.selected },
      ) + pad;
    }
    drawn.push(`  ${row}`);
  }

  // What the drawing leaves out, said plainly rather than left to be guessed.
  const scaled = step > 1 ? `  ${step} tiles per character.` : '';
  const partial = known.width < map.tiles.width || known.height < map.tiles.height
    ? `Showing what you know of ${map.tiles.width}×${map.tiles.height} tiles.`
    : `${map.tiles.width}×${map.tiles.height} tiles.`;
  drawn.push('', pc.dim(`  ${partial}${scaled}`));

  return drawn;
}

/**
 * One cell of the overview: whatever is most worth knowing in its block.
 *
 * A creature beats terrain, impassable beats passable, and anything beats
 * blank — so scaling a map down loses detail rather than losing landmarks.
 */
function sample(
  context: { module: CompiledModule; state: GameState; terrain: TerrainIndex },
  width: number,
  height: number,
  at: Position,
  step: number,
  layers: {
    visible: ReadonlySet<number>;
    remembered: ReadonlySet<number>;
    occupants: ReadonlyMap<number, Entity>;
    paints: Map<string, Tone | null>;
    selected: string;
  },
): string {
  const map = context.state.maps[context.state.currentMap]!;

  let best = 0;
  let glyph = ' ';
  let known = false;

  for (let dy = 0; dy < step; dy += 1) {
    for (let dx = 0; dx < step; dx += 1) {
      const x = at.x + dx;
      const y = at.y + dy;
      if (x >= width || y >= height) continue;

      const packed = key({ x, y });
      const seen = layers.visible.has(packed);
      if (!seen && !layers.remembered.has(packed)) continue;
      known = true;

      const occupant = layers.occupants.get(packed);
      if (occupant && seen) {
        const rank = occupant.id === layers.selected ? 5
          : occupant.kind === 'character' ? 4
            : occupant.disposition === 'hostile' ? 3 : 2;
        if (rank > best) {
          best = rank;
          glyph = paintEntity(occupant, occupant.id === layers.selected);
        }
        continue;
      }

      const tile = context.terrain.at(map.tiles, { x, y });
      // Impassable ground defines a place's shape, so it wins over floor.
      const rank = tile.passable ? 1 : 1.5;
      if (rank > best) {
        best = rank;
        const painted = paintFor(context.module, tile.id, layers.paints)(tile.glyph);
        glyph = seen ? painted : pc.dim(tile.glyph);
      }
    }
  }

  return known ? glyph : ' ';
}

/**
 * How a creature is drawn.
 *
 * Glyph and tone come from the shared palette; the terminal adds only the
 * inversion for the character being controlled, because every party member
 * being an identical cyan `@` made "which one am I" a question the map could
 * not answer.
 */
function paintEntity(entity: Entity, selected: boolean): string {
  const painted = PAINTS[toneOfEntity(entity)](glyphOfEntity(entity));
  return selected ? pc.inverse(painted) : painted;
}
