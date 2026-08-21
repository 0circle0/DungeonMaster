/** Where the party can go from here, as data. */

import type { CompiledModule, Requirement } from '@dm/module';
import type { GameState, Action, Position } from '@dm/engine';
import {
  TerrainIndex, key, neighbours, roughBearing, describeRequirement, render, text,
} from '@dm/engine';

interface AreaDef {
  id: string;
  name: string;
  connections: { to: string; travelMinutes: number; gate?: string; oneWay: boolean }[];
}

interface PoiDef {
  id: string;
  name: string;
  area: string;
  hidden: boolean;
  gate?: string;
  travelMinutes: number;
  position?: Position;
}

export interface PlaceExit {
  readonly poi: string;
  readonly name: string;
  readonly travelMinutes: number;
  readonly gate: string | null;
  readonly barred: boolean;
  /** What opening it would take, when barred and the gate says. */
  readonly requires: readonly string[];
  /** Where it sits on the current map, when the module placed it. */
  readonly position: Position | null;
  readonly action: Action;
}

export interface RoadExit {
  readonly area: string;
  readonly name: string;
  readonly travelMinutes: number;
  readonly gate: string | null;
  readonly barred: boolean;
  readonly requires: readonly string[];
  readonly oneWay: boolean;
  readonly action: Action;
}

export interface Frontier {
  /** Which way it lies, in words. */
  readonly direction: string;
  readonly tiles: number;
  /** The frontier tile itself, so a front end can walk there on click. */
  readonly at: Position;
  readonly action: Action;
}

export interface WaysFromHere {
  readonly places: readonly PlaceExit[];
  readonly roads: readonly RoadExit[];
  readonly frontier: Frontier | null;
}

/** Whether a gate is standing in the way, and what it would take. */
function gateState(
  module: CompiledModule,
  state: GameState,
  gate: string | undefined,
): { gate: string | null; barred: boolean; requires: readonly string[] } {
  if (!gate) return { gate: null, barred: false, requires: [] };
  const barred = state.flags[`gate:${gate}:open`] !== true;
  if (!barred) return { gate, barred: false, requires: [] };

  const definition = module.find<{ requires?: Requirement }>('world.gates', gate);
  const described = describeRequirement(definition?.requires);
  // The item list is the fallback for gates with no authored description.
  const chosen = definition?.requires?.description ? described.slice(0, 1) : described;
  return { gate, barred: true, requires: chosen.map((need) => render(module, need)) };
}

/** Roads, places, and — in a maze — which way is still unwalked. */
export function waysFromHere(
  module: CompiledModule,
  state: GameState,
  terrain: TerrainIndex,
): WaysFromHere {
  const here = state.location;
  const areaId = here.kind === 'area' || here.kind === 'poi' ? here.area : null;

  const places: PlaceExit[] = [];
  const roads: RoadExit[] = [];

  if (areaId) {
    const area = module.find<AreaDef>('world.areas', areaId);

    // Places within this area — the mill, the shrine, the barrow you found.
    for (const poi of module.all<PoiDef>('world.pointsOfInterest')) {
      if (poi.area !== areaId) continue;
      if (poi.hidden && state.flags[`found:${poi.id}`] !== true) continue;
      if (here.kind === 'poi' && poi.id === here.poi) continue;

      places.push({
        poi: poi.id,
        name: poi.name,
        travelMinutes: poi.travelMinutes,
        ...gateState(module, state, poi.gate),
        position: poi.position ?? null,
        action: { type: 'enter', target: poi.id },
      });
    }

    // And the roads out.
    for (const road of area?.connections ?? []) {
      const target = module.find<{ name: string }>('world.areas', road.to);
      roads.push({
        area: road.to,
        name: target?.name ?? road.to,
        travelMinutes: road.travelMinutes,
        ...gateState(module, state, road.gate),
        oneWay: road.oneWay,
        action: { type: 'travelToArea', area: road.to },
      });
    }
  }

  return { places, roads, frontier: frontierOf(module, state, terrain) };
}

/** The nearest unwalked ground the party can reach. */
function frontierOf(
  module: CompiledModule,
  state: GameState,
  terrain: TerrainIndex,
): Frontier | null {
  const map = state.maps[state.currentMap];
  const actor = state.entities[state.selected];
  if (!map || !actor) return null;

  const known = new Set(map.explored);
  if (known.size === 0) return null;

  const seen = new Set<number>([key(actor.position)]);
  let edge = [actor.position];
  let steps = 0;

  while (edge.length > 0 && steps < 200) {
    const next: typeof edge = [];
    steps += 1;

    for (const at of edge) {
      for (const neighbour of neighbours(at)) {
        const packed = key(neighbour);
        if (seen.has(packed)) continue;
        seen.add(packed);

        if (!terrain.isPassable(map.tiles, neighbour, actor.movementModes)) continue;

        // Unwalked ground the party can reach: this is the frontier.
        if (!known.has(packed)) {
          return {
            direction: text(module, roughBearing(actor.position, neighbour)),
            tiles: steps,
            at: neighbour,
            action: { type: 'travelTo', to: neighbour },
          };
        }
        next.push(neighbour);
      }
    }
    edge = next;
  }

  return null;
}
