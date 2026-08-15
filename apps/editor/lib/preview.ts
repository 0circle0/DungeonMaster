/**
 * Seed-faithful map previews.
 *
 * Everything here calls the real engine generators with the same rng
 * derivations the engine uses at game start — never a reimplementation — so
 * what the studio draws for seed N is what a player starting with seed N
 * walks into. The derivation chain mirrored is the one `startSession` uses:
 * `Rng.fromSeed(seed).derive('arrival')`, then the per-place stream
 * (`area:<id>`, `poi:<id>`, `dungeon:<id>`) exactly as `sim/enter.ts` derives
 * it. Maps entered later in a session come from a stream that has advanced,
 * which is why the viewport calls this a *seed preview*, not a save preview.
 */

import { compileModule } from '@dm/module';
import type { CompiledModule } from '@dm/module';
import { Rng } from '@dm/core';
import {
  buildMap,
  buildStaticMap,
  generateDungeon,
  populateDungeon,
  singleScope,
  TerrainIndex,
  Transaction,
  enterArea,
  enterPoi,
  enterDungeon,
  newGame,
  defaultChoices,
  unkey,
} from '@dm/engine';
import type { TileMap, Position, GeneratedDungeon, MapSpec, BuiltStaticMap } from '@dm/engine';
import type { ModuleDoc } from './store';

export interface Marker {
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
  readonly label: string;
}

export interface RoomOutline {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly role: string;
}

export interface MapPreview {
  readonly tiles: TileMap;
  /** Hand-authored layout (seed has no effect) vs generated from the seed. */
  readonly authored: boolean;
  readonly markers: readonly Marker[];
  readonly rooms: readonly RoomOutline[];
  /** How this map came to be, one sentence per line. */
  readonly explain: readonly string[];
}

export type PreviewResult =
  | { readonly ok: true; readonly preview: MapPreview }
  | { readonly ok: false; readonly message: string };

/** Compile for previewing; null when the document does not compile. */
export function compileForPreview(doc: ModuleDoc): CompiledModule | null {
  try {
    const result = compileModule(doc);
    return result.ok ? result.module : null;
  } catch {
    return null;
  }
}

/** The rng stream a brand-new game hands to arrival, per startSession. */
function arrivalRng(seed: number): Rng {
  return Rng.fromSeed(seed).derive('arrival');
}

interface PoiDef {
  id: string;
  name?: string;
  area: string;
  position?: Position;
  residents?: string[];
}

function poisIn(module: CompiledModule, areaId: string): PoiDef[] {
  return module.all<PoiDef>('world.pointsOfInterest').filter((poi) => poi.area === areaId);
}

function fail(message: string): PreviewResult {
  return { ok: false, message };
}

/** Build a `world.maps` entry, reporting a broken reference instead of throwing. */
function tryBuildStatic(module: CompiledModule, mapId: string): BuiltStaticMap | PreviewResult {
  try {
    return buildStaticMap(module, mapId);
  } catch (error) {
    return fail(`Static map "${mapId}" cannot be built: ${(error as Error).message}`);
  }
}

function isFail(value: BuiltStaticMap | PreviewResult): value is PreviewResult {
  return 'ok' in value;
}

/**
 * Everything a static map's own layers place, as decorated markers: the entry,
 * the named marks, and the gates, traps, items and creatures the engine will
 * put there on every seed.
 */
function staticMarkers(built: BuiltStaticMap): Marker[] {
  const markers: Marker[] = [
    {
      ...built.entry,
      glyph: '⚑',
      label: `Entry (${built.entry.x},${built.entry.y}) — the map's entry marker; the party arrives here on every seed.`,
    },
  ];
  for (const [id, positions] of Object.entries(built.marks)) {
    for (const at of positions) {
      // The entry tile already carries its flag.
      if (at.x === built.entry.x && at.y === built.entry.y) continue;
      markers.push({ ...at, glyph: '◈', label: `Marker "${id}" — from the map's markers layer` });
    }
  }
  for (const [packed, gate] of Object.entries(built.gates)) {
    markers.push({ ...unkey(Number(packed)), glyph: '🔒', label: `Gate "${gate.gate}" — gates layer` });
  }
  for (const [packed, trap] of Object.entries(built.traps)) {
    markers.push({ ...unkey(Number(packed)), glyph: '^', label: `Trap "${trap.trap}" — traps layer` });
  }
  for (const [packed, stacks] of Object.entries(built.items)) {
    const what = stacks.map((stack) => stack.item).join(', ');
    markers.push({ ...unkey(Number(packed)), glyph: '◆', label: `Items: ${what} — items layer` });
  }
  for (const spawn of built.spawns) {
    markers.push({
      ...spawn.at,
      glyph: spawn.kind === 'monster' ? '☠' : '☺',
      label: `${spawn.kind === 'monster' ? 'Monster' : 'NPC'}: ${spawn.id} — spawned here on arrival, every seed`,
    });
  }
  return markers;
}

export function previewArea(
  module: CompiledModule,
  areaId: string,
  seed: number,
  options: { readonly highlightPoi?: string } = {},
): PreviewResult {
  const area = module.find<{
    id: string;
    biome: string;
    map?: MapSpec;
    entryPoint?: Position;
  }>('world.areas', areaId);
  if (!area) return fail(`No area "${areaId}" in world.areas.`);

  // A static map wins over everything: the engine draws it verbatim and takes
  // its entry from the map's own marker, ignoring entryPoint and palette.
  const staticId = area.map?.static;
  let tiles: TileMap;
  let authored: boolean;
  const markers: Marker[] = [];
  if (staticId) {
    const built = tryBuildStatic(module, staticId);
    if (isFail(built)) return built;
    tiles = built.tiles;
    authored = true;
    markers.push(...staticMarkers(built));
  } else {
    const biome = module.find<{ palette?: string }>('world.biomes', area.biome);
    const entry = area.entryPoint ?? { x: 1, y: 1 };
    const built = buildMap(module, area.map, arrivalRng(seed).derive(`area:${areaId}`), biome?.palette, {
      entry,
    });
    tiles = built.tiles;
    authored = Boolean(area.map?.layout && area.map.layout.length > 0);
    markers.push({
      ...entry,
      glyph: '⚑',
      label: `Entry point (${entry.x},${entry.y}) — area.entryPoint. Travelling into this area places the party here.`,
    });
    for (const [glyph, positions] of Object.entries(built.marks)) {
      for (const at of positions) {
        markers.push({ ...at, glyph, label: `Mark "${glyph}" from the authored layout` });
      }
    }
  }

  // Every POI sits somewhere on this map. Showing them here is what answers
  // "what is on this map, and where is everyone" without opening each POI.
  const startPoiId = module.source.start.startingPoi;
  for (const poi of poisIn(module, areaId)) {
    if (!poi.position) continue;
    const residents = poi.residents ?? [];
    const who = residents.length > 0 ? ` Residents (${residents.join(', ')}) spawn around this tile.` : '';
    const isStart = poi.id === startPoiId;
    const isHighlighted = poi.id === options.highlightPoi;
    markers.push({
      ...poi.position,
      glyph: isHighlighted ? '◉' : isStart ? '▶' : '⌂',
      label:
        (isHighlighted ? 'The POI you selected. ' : '') +
        `${poi.name ?? poi.id} (${poi.position.x},${poi.position.y}) — pointsOfInterest.position.` +
        ` Entering it places the party at the nearest free tiles to here.${who}` +
        (isStart ? ' This is the start POI: a new game walks the party here from the entry point.' : ''),
    });
  }

  return {
    ok: true,
    preview: {
      tiles,
      authored,
      markers,
      rooms: [],
      explain: staticId
        ? [
            `Static map "${staticId}" (world.maps) is drawn verbatim — every layer placed by hand, identical on every seed. Edit its tiles in World → Maps.`,
            'Its layers also place the gates, traps, items and creatures shown; the generator and palette are never consulted.',
          ]
        : authored
          ? [
              'Hand-authored layout: world.areas → map.layout is drawn verbatim; the seed has no effect.',
              'Glyphs outside the legend (beyond . # +) become marks — spawn points and treasure spots.',
            ]
          : [
              `Generated: size rolled from width "${area.map?.width ?? 'default'}" × height "${area.map?.height ?? 'default'}" (dice notation), then the palette's scatter is sprinkled and connectivity from the entry point is enforced.`,
              'The same seed always produces this exact map; re-roll to see other worlds this area could be.',
            ],
    },
  };
}

export function previewPoi(module: CompiledModule, poiId: string, seed: number): PreviewResult {
  const poi = module.find<{
    id: string;
    area: string;
    map?: MapSpec;
    residents?: string[];
    dungeon?: string;
    position?: Position;
  }>('world.pointsOfInterest', poiId);
  if (!poi) return fail(`No point of interest "${poiId}".`);

  if (poi.dungeon) return previewDungeon(module, poi.dungeon, seed);
  if (!poi.map) {
    // No interior means the place *is* a spot on its area map — so show that
    // map with the spot highlighted, instead of apologizing in text.
    const areaResult = previewArea(module, poi.area, seed, { highlightPoi: poiId });
    if (!areaResult.ok) return areaResult;
    const at = poi.position ? `at its position (${poi.position.x},${poi.position.y}), marked ◉` : 'wherever it happens to stand (no position set)';
    return {
      ok: true,
      preview: {
        ...areaResult.preview,
        explain: [
          `"${poi.id}" has no interior map of its own — this is its area, "${poi.area}". Entering the POI stands the party ${at}. Add a \`map\` for a walkable interior, or a \`dungeon\` to descend into one.`,
          ...areaResult.preview.explain,
        ],
      },
    };
  }

  const residents = poi.residents ?? [];
  const residentsLine =
    residents.length > 0
      ? `Residents (${residents.join(', ')}) are spawned on first arrival near the POI position, and persist — the same people, with the same memory, are here when you return.`
      : 'No residents: nobody is spawned when the party arrives. Add npc ids to `residents` to people this place.';

  // A static interior: the world.maps entry drawn verbatim, entry marker and all.
  const staticId = poi.map.static;
  if (staticId) {
    const built = tryBuildStatic(module, staticId);
    if (isFail(built)) return built;
    return {
      ok: true,
      preview: {
        tiles: built.tiles,
        authored: true,
        markers: staticMarkers(built),
        rooms: [],
        explain: [
          `Static map "${staticId}" (world.maps) is drawn verbatim — identical on every seed. Edit its tiles in World → Maps.`,
          residentsLine,
        ],
      },
    };
  }

  const built = buildMap(module, poi.map, arrivalRng(seed).derive(`poi:${poiId}`));
  const authored = Boolean(poi.map.layout && poi.map.layout.length > 0);

  const markers: Marker[] = [{ x: 1, y: 1, glyph: '⚑', label: 'Entry — the party arrives at 1,1' }];
  for (const [glyph, positions] of Object.entries(built.marks)) {
    for (const at of positions) {
      markers.push({ ...at, glyph, label: `Mark "${glyph}" from the authored layout` });
    }
  }
  residents.forEach((npcId, i) => {
    markers.push({
      x: 1 + ((i + 1) % Math.max(2, built.tiles.width - 2)),
      y: 1,
      glyph: '☺',
      label: `Resident: ${npcId} (placed near the party on arrival — exact tile comes from the live game)`,
    });
  });

  return {
    ok: true,
    preview: {
      tiles: built.tiles,
      authored,
      markers,
      rooms: [],
      explain: [
        authored
          ? 'Hand-authored layout: map.layout is drawn verbatim; the seed has no effect on the tiles.'
          : 'Generated from the seed: size is rolled from dice notation, scatter applied, connectivity enforced.',
        residentsLine,
      ],
    },
  };
}

export function previewDungeon(module: CompiledModule, dungeonId: string, seed: number): PreviewResult {
  const definition = module.find<{ id: string; roomCount?: string; biome?: string; staticMap?: string }>(
    'world.dungeons',
    dungeonId,
  );
  if (!definition) return fail(`No dungeon "${dungeonId}" in world.dungeons.`);

  // A hand-built dungeon: the same castle on every seed, straight from world.maps.
  if (definition.staticMap) {
    const built = tryBuildStatic(module, definition.staticMap);
    if (isFail(built)) return built;
    return {
      ok: true,
      preview: {
        tiles: built.tiles,
        authored: true,
        markers: staticMarkers(built),
        rooms: [],
        explain: [
          `Static map "${definition.staticMap}" (world.maps) replaces generation entirely — the same dungeon on every seed. Edit its tiles in World → Maps.`,
          'Its layers place the gates, traps, items and creatures shown; with `rollEncounters` set, the biome\'s tables are also rolled once per `spawn` marker at play time.',
        ],
      },
    };
  }

  const dungeonRng = arrivalRng(seed).derive(`dungeon:${dungeonId}`);
  const generated = generateDungeon(module, dungeonId, dungeonRng);
  const terrain = new TerrainIndex(module);
  const population = populateDungeon({
    module,
    dungeon: generated,
    terrain,
    scopes: singleScope({}),
    depth: 1,
    rng: dungeonRng.derive('populate'),
  });

  const markers = dungeonMarkers(generated, population);
  const degraded = generated.rooms.length === 0;

  return {
    ok: true,
    preview: {
      tiles: generated.tiles,
      authored: false,
      markers,
      rooms: generated.rooms.map((room) => ({
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
        role: room.role,
      })),
      explain: degraded
        ? [
            'The generator degraded to an empty chamber: the dungeon\'s biome has no usable room templates, or no rooms could be placed. Add roomTemplates to the biome.',
          ]
        : [
            `Generated from the seed: ${generated.rooms.length} rooms from the biome's templates, corridors from a minimum spanning tree, then extra loops.`,
            'Locks (🔒) only ever sit on tree corridors, and every key (🗝) is placed in a room reachable before its lock — guaranteed by construction.',
            'Monsters, loot and traps are drawn from the biome\'s tables with their requirements checked before the roll, so the odds shown are the odds experienced.',
          ],
    },
  };
}

/**
 * What one room from a template looks like. Room templates have no place of
 * their own in the world — the dungeon generator stamps them — so the preview
 * builds a single room exactly as the generator would: a static template is
 * its `world.maps` entry verbatim; anything else rolls the template's map spec.
 */
export function previewRoomTemplate(
  module: CompiledModule,
  templateId: string,
  seed: number,
): PreviewResult {
  const template = module.find<{ id: string; name?: string; map?: MapSpec }>(
    'world.roomTemplates',
    templateId,
  );
  if (!template) return fail(`No room template "${templateId}" in world.roomTemplates.`);

  const staticId = template.map?.static;
  if (staticId) {
    const built = tryBuildStatic(module, staticId);
    if (isFail(built)) return built;
    return {
      ok: true,
      preview: {
        tiles: built.tiles,
        authored: true,
        markers: staticMarkers(built),
        rooms: [],
        explain: [
          `Static map "${staticId}" (world.maps) — this room is stamped into dungeons verbatim, identical on every seed. Edit its tiles in World → Maps.`,
          'Its `door` markers are where corridors may attach when the generator places it.',
        ],
      },
    };
  }

  const built = buildMap(module, template.map, arrivalRng(seed).derive(`roomTemplate:${templateId}`));
  const authored = Boolean(template.map?.layout && template.map.layout.length > 0);
  const markers: Marker[] = [];
  for (const [glyph, positions] of Object.entries(built.marks)) {
    for (const at of positions) {
      markers.push({ ...at, glyph, label: `Mark "${glyph}" from the authored layout` });
    }
  }

  return {
    ok: true,
    preview: {
      tiles: built.tiles,
      authored,
      markers,
      rooms: [],
      explain: [
        authored
          ? 'Hand-authored layout: map.layout is drawn verbatim; the seed has no effect on the tiles.'
          : `One room this template can produce: size rolled from width "${template.map?.width ?? 'default'}" × height "${template.map?.height ?? 'default'}" (dice notation). The generator rerolls the size for every room it stamps into a dungeon.`,
        'Room templates never appear on their own — dungeons whose biome lists this template stamp copies of it.',
      ],
    },
  };
}

interface PopulationLike {
  readonly monsters: readonly { readonly monster: string; readonly at: Position }[];
  readonly loot: readonly { readonly item?: string; readonly table?: string; readonly at: Position }[];
  readonly traps: readonly { readonly trap: string; readonly at: Position }[];
}

function dungeonMarkers(generated: GeneratedDungeon, population: PopulationLike): Marker[] {
  const markers: Marker[] = [
    { ...generated.entrance, glyph: '⚑', label: 'Entrance — the party arrives here' },
  ];

  for (const door of generated.doors) {
    if (door.gate) {
      markers.push({ ...door.at, glyph: '🔒', label: `Locked door — gate "${door.gate}"` });
    }
  }
  for (const placement of generated.keyPlacements) {
    const room = generated.rooms.find((r) => r.id === placement.room);
    if (room) {
      markers.push({
        ...room.centre,
        glyph: '🗝',
        label: `Key "${placement.item}" (room ${placement.room}, opens ${placement.gate})`,
      });
    }
  }
  for (const placed of population.monsters) {
    markers.push({ ...placed.at, glyph: '☠', label: `Monster: ${placed.monster}` });
  }
  for (const placed of population.loot) {
    markers.push({ ...placed.at, glyph: '◆', label: `Loot: ${placed.item ?? placed.table ?? 'roll'}` });
  }
  for (const placed of population.traps) {
    markers.push({ ...placed.at, glyph: '^', label: `Trap: ${placed.trap}` });
  }
  return markers;
}

/**
 * Ground truth for "what does a new game with this seed open onto": run the
 * real newGame + arrival sequence (the same calls startSession makes) and
 * read the resulting state — residents spawned, encounters rolled, party
 * placed. Throws are reported, which doubles as a will-this-module-boot check.
 */
export function previewStart(module: CompiledModule, seed: number): PreviewResult {
  const start = module.source.start;
  if (!start.startingPoi && !start.startingArea && !start.startingDungeon) {
    return fail('No start location is set. Pick one in Start & creation — or press “▶ start here” on a place in the World tree.');
  }

  try {
    const state = newGame(module, { seed, party: [defaultChoices(module, 'Preview')] });
    const terrain = new TerrainIndex(module);
    const txn = new Transaction(state, module);
    const rng = arrivalRng(seed);

    if (start.startingPoi) {
      const poi = module.get<{ area: string }>('world.pointsOfInterest', start.startingPoi);
      enterArea(txn, terrain, poi.area, rng);
      const actor = txn.entity(txn.state.selected);
      if (actor) enterPoi(txn, terrain, start.startingPoi, actor, rng, true);
    } else if (start.startingArea) {
      enterArea(txn, terrain, start.startingArea, rng);
    } else if (start.startingDungeon) {
      enterDungeon(txn, terrain, start.startingDungeon, rng);
    }

    const arrived = txn.finish().state;
    const mapId = arrived.currentMap;
    const instance = arrived.maps[mapId];
    if (!instance) return fail('Arrival produced no map — the start location may be broken.');

    const markers: Marker[] = [];
    const explain: string[] = [
      `This is the real thing: newGame(seed ${seed}) plus the arrival a session performs — the party placed, residents spawned, encounters rolled.`,
      `Opening map: ${mapId}. Everyone standing on it is shown at their true position.`,
    ];

    // The placement chain, so "why is everyone standing there" has an answer
    // on the map itself rather than in the engine source.
    if (start.startingPoi) {
      const poi = module.get<PoiDef>('world.pointsOfInterest', start.startingPoi);
      const area = module.find<{ entryPoint?: Position }>('world.areas', poi.area);
      const entry = area?.entryPoint ?? { x: 1, y: 1 };
      markers.push({
        ...entry,
        glyph: '⚑',
        label: `Step 1 — the party arrives at the area entry point (${entry.x},${entry.y}): world.areas.entryPoint.`,
      });
      if (poi.position) {
        markers.push({
          ...poi.position,
          glyph: '▶',
          label:
            `Step 2 — they enter the start POI "${poi.name ?? poi.id}" and are walked to its position ` +
            `(${poi.position.x},${poi.position.y}): world.pointsOfInterest.position.`,
        });
        explain.push(
          `Why everyone stands where they do: the party arrives at the entry point (${entry.x},${entry.y}), enters ${poi.name ?? poi.id}, and is placed at the nearest free tiles to its position (${poi.position.x},${poi.position.y}) — a spiral search outward from that tile. Residents spawn around the same anchor, which is why they cluster beside the party.`,
        );
      }
    } else if (start.startingArea) {
      const area = module.find<{ entryPoint?: Position }>('world.areas', start.startingArea);
      const entry = area?.entryPoint ?? { x: 1, y: 1 };
      markers.push({
        ...entry,
        glyph: '⚑',
        label: `The party arrives at the area entry point (${entry.x},${entry.y}): world.areas.entryPoint.`,
      });
      explain.push(
        `The party is placed at the nearest free tiles to the entry point (${entry.x},${entry.y}) — set world.areas.entryPoint to move it.`,
      );
    }

    for (const entity of Object.values(arrived.entities)) {
      if (entity.map !== mapId) continue;
      const glyph = entity.kind === 'character' ? '@' : entity.kind === 'npc' ? '☺' : '☠';
      const role =
        entity.kind === 'character'
          ? 'party — placed at the nearest free tile to the arrival anchor'
          : entity.kind === 'npc'
            ? 'resident — spawned at the nearest free tile to the POI position'
            : 'monster';
      markers.push({ ...entity.position, glyph, label: `${entity.name} (${role})` });
    }
    for (const [packed, gate] of Object.entries(instance.gates)) {
      const at = unkey(Number(packed));
      markers.push({ ...at, glyph: gate.open ? '🔓' : '🔒', label: `Gate "${gate.gate}"` });
    }

    return {
      ok: true,
      preview: { tiles: instance.tiles, authored: false, markers, rooms: [], explain },
    };
  } catch (error) {
    return fail(`A new game with this module throws: ${(error as Error).message}`);
  }
}
