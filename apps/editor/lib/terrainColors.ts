/**
 * Terrain id → display color for the map preview.
 *
 * Conventional names get hand-picked colors; anything else gets a stable
 * hashed hue, so custom terrains stay distinguishable without configuration.
 */

import { hashString } from '@dm/core';

const BY_KEYWORD: readonly [RegExp, string][] = [
  [/wall|cliff|rock|boulder/, '#3d4250'],
  [/door/, '#a87840'],
  [/water|river|lake|sea|pool|marsh|bog/, '#2e5f8a'],
  [/lava|fire|ember/, '#a3402e'],
  [/tree|forest|wood|thicket|bush|shrub/, '#2e6b3d'],
  [/grass|meadow|field|moor/, '#4a7042'],
  [/sand|dune|beach/, '#a08a55'],
  [/snow|ice|frost/, '#9db4c4'],
  [/mud|swamp|mire|fen/, '#5a5138'],
  [/road|path|track/, '#6e6555'],
  [/floor|ground|dirt/, '#7a7264'],
  [/rubble|gravel|scree/, '#5c5a52'],
  [/pit|chasm|void/, '#14151c'],
  [/bridge|plank/, '#8a6a42'],
];

const cache = new Map<string, string>();

export function terrainColor(id: string): string {
  const cached = cache.get(id);
  if (cached) return cached;

  let color: string | undefined;
  const lower = id.toLowerCase();
  for (const [pattern, hex] of BY_KEYWORD) {
    if (pattern.test(lower)) {
      color = hex;
      break;
    }
  }
  // Unknown terrain: a stable, muted hue from the id itself.
  color ??= `hsl(${hashString(id) % 360} 30% 38%)`;

  cache.set(id, color);
  return color;
}
