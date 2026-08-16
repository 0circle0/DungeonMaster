/**
 * Which tone a thing on the map gets.
 *
 * The *decision* is shared knowledge — terrain declaring `color: "blue"` or
 * `tags: ["water"]` means the same thing to every front end. The *paint* is
 * not: the browser turns a tone into a CSS variable, and another front end
 * would turn it into something else. Splitting it here is what stops two
 * surfaces drawing water in different colours without anybody noticing.
 */

import type { CompiledModule } from '@dm/module';
import type { Entity } from '@dm/engine';

/** The eight tones a text map can carry. Front ends map these to real colour. */
export type Tone = 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';

const NAMED = new Set<Tone>(['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray']);

/** Tag fallbacks, for modules that never thought about colour. Order matters. */
const BY_TAG: readonly (readonly [string, Tone])[] = [
  ['water', 'blue'],
  ['vegetation', 'green'],
  ['reeds', 'green'],
  ['fire', 'yellow'],
  ['light', 'yellow'],
  ['stone', 'gray'],
  ['wall', 'gray'],
];

/**
 * The tone for a terrain: its declared `color` hint first, then its tags,
 * then none. Pass a cache when calling per tile — the lookup walks the module.
 */
export function toneOf(
  module: CompiledModule,
  terrainId: string,
  cache?: Map<string, Tone | null>,
): Tone | null {
  const held = cache?.get(terrainId);
  if (held !== undefined) return held;

  const definition = module.find<{ color?: string; tags?: string[] }>('world.terrains', terrainId);
  let tone: Tone | null = null;

  if (definition?.color && NAMED.has(definition.color as Tone)) {
    tone = definition.color as Tone;
  } else {
    for (const [tag, candidate] of BY_TAG) {
      if (definition?.tags?.includes(tag)) { tone = candidate; break; }
    }
  }

  cache?.set(terrainId, tone);
  return tone;
}

/** The tone for a creature: party cyan, people yellow, hostiles red. */
export function toneOfEntity(entity: Entity): Tone {
  if (entity.kind === 'character') return 'cyan';
  if (entity.kind === 'npc') return 'yellow';
  return entity.disposition === 'hostile' ? 'red' : 'yellow';
}

/**
 * The glyph for a creature.
 *
 * A monster is its name's first letter, which is legible without a
 * per-creature glyph in the schema; characters and people are fixed.
 */
export function glyphOfEntity(entity: Entity): string {
  if (entity.kind === 'character') return '@';
  if (entity.kind === 'npc') return '&';
  return entity.name.charAt(0).toLowerCase() || 'x';
}
