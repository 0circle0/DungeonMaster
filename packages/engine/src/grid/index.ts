export {
  MapBuilder,
  TerrainIndex,
  createMap,
  withTile,
  terrainAt,
  inBounds,
  samePosition,
  neighbours,
  key,
  unkey,
  DIRECTIONS,
  ORTHOGONAL,
} from './tiles.js';
export type { Position, TileMap, TerrainDef } from './tiles.js';

export {
  distance,
  euclidean,
  manhattan,
  isAdjacent,
  line,
  within,
  ring,
  area,
  bearing,
  stepToward,
} from './geometry.js';
export type { AreaShape, AreaSpec } from './geometry.js';

export { fieldOfView, hasLineOfSight, litTiles } from './fov.js';
export type { Visible, FovOptions } from './fov.js';

export { findPath, reachable, floodFill } from './path.js';
export type { Path, PathOptions } from './path.js';
