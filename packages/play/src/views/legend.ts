/**
 * What the glyphs on screen mean.
 *
 * Built from an already-computed {@link MapView} rather than rescanning the
 * whole map — the terminal version walked width × height on every call, which
 * a browser would repeat on every render.
 */

import type { CompiledModule } from '@dm/module';
import type { MapView } from './map.js';
import type { Tone } from './palette.js';

export interface LegendEntry {
  readonly glyph: string;
  readonly name: string;
  readonly tone: Tone | null;
  /** Inverted marker — the one you are controlling. */
  readonly selected: boolean;
}

/**
 * The glyphs present in this view, creatures first, terrain after.
 *
 * Only what is actually on screen: listing every terrain the module declares
 * would be a wall of text about places the party has never been.
 */
export function legend(module: CompiledModule, view: MapView): readonly LegendEntry[] {
  const out: LegendEntry[] = [];
  const seenTerrain = new Set<string>();
  const seenCreature = new Set<string>();

  let anyParty = false;
  let selfShown = false;

  for (const cell of view.cells) {
    if (cell.visibility === 'unknown') continue;

    const entity = cell.entity;
    if (entity) {
      if (entity.party) {
        if (entity.selected && !selfShown) {
          selfShown = true;
          out.push({ glyph: entity.glyph, name: 'you', tone: entity.tone, selected: true });
        } else {
          anyParty = true;
        }
      } else {
        const label = entity.name.toLowerCase();
        if (!seenCreature.has(label)) {
          seenCreature.add(label);
          out.push({ glyph: entity.glyph, name: label, tone: entity.tone, selected: false });
        }
      }
    }
  }

  if (anyParty) {
    out.splice(selfShown ? 1 : 0, 0, { glyph: '@', name: 'party', tone: 'cyan', selected: false });
  }

  for (const cell of view.cells) {
    if (cell.visibility === 'unknown' || !cell.terrain) continue;
    if (seenTerrain.has(cell.terrain)) continue;
    seenTerrain.add(cell.terrain);

    // `TerrainDef` carries only what the rules need; the display name lives in
    // the module beside it.
    const named = module.find<{ name?: string }>('world.terrains', cell.terrain);
    out.push({
      glyph: cell.glyph,
      name: (named?.name ?? cell.terrain).toLowerCase(),
      tone: cell.tone,
      selected: false,
    });
  }

  return out;
}
