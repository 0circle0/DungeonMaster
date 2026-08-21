import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readAssembledModule } from '@dm/module/load';
import { compileForPreview, previewArea, previewDungeon, previewPoi, previewRoomTemplate, previewStart } from './preview';

function load(name: string) {
  const dir = fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url));
  const module = compileForPreview(readAssembledModule(dir).doc);
  if (!module) throw new Error(`${name} does not compile`);
  return module;
}

describe('map previews', () => {
  it('are deterministic: the same seed draws the same dungeon', () => {
    const minimal = load('minimal');
    const first = previewDungeon(minimal, 'first_descent', 12345);
    const second = previewDungeon(minimal, 'first_descent', 12345);
    if (!first.ok || !second.ok) throw new Error('preview failed');
    expect(second.preview.tiles).toEqual(first.preview.tiles);
    expect(second.preview.markers).toEqual(first.preview.markers);
  });

  it('change with the seed', () => {
    const minimal = load('minimal');
    const a = previewDungeon(minimal, 'first_descent', 1);
    const b = previewDungeon(minimal, 'first_descent', 2);
    if (!a.ok || !b.ok) throw new Error('preview failed');
    expect(b.preview.tiles).not.toEqual(a.preview.tiles);
  });

  it('preview areas from a full module', () => {
    const greenmarch = load('greenmarch');
    const areas = greenmarch.all<{ id: string }>('world.areas');
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) {
      const result = previewArea(greenmarch, area.id, 12345);
      expect(result.ok, `area ${area.id}`).toBe(true);
      if (result.ok) expect(result.preview.tiles.width).toBeGreaterThan(0);
    }
  });

  it('area previews show where each POI sits, marking the start POI', () => {
    const greenmarch = load('greenmarch');
    const result = previewArea(greenmarch, 'millford', 12345);
    if (!result.ok) throw new Error(result.message);
    const village = result.preview.markers.find((m) => m.label.includes('Millford Village'));
    expect(village).toBeDefined();
    expect(village!.glyph).toBe('▶'); // it is the start POI and its residents are named
    expect(village!.label).toContain('vess'); 
  });

  it('a POI without an interior shows its area map with the POI highlighted', () => {
    const greenmarch = load('greenmarch');
    const result = previewPoi(greenmarch, 'millford_village', 12345);
    if (!result.ok) throw new Error(result.message);
    // Same tiles as the area, the selected POI called out, and an explainer.
    const area = previewArea(greenmarch, 'millford', 12345);
    if (!area.ok) throw new Error(area.message);
    expect(result.preview.tiles).toEqual(area.preview.tiles);
    expect(result.preview.markers.some((m) => m.glyph === '◉')).toBe(true);
    expect(result.preview.explain[0]).toContain('has no interior map');
  });

  it('the start preview explains the placement chain', () => {
    const greenmarch = load('greenmarch');
    const result = previewStart(greenmarch, 12345);
    if (!result.ok) throw new Error(result.message);
    // Entry point and POI position markers, and a why-here explainer line.
    expect(result.preview.markers.some((m) => m.label.startsWith('Step 1'))).toBe(true);
    expect(result.preview.markers.some((m) => m.label.startsWith('Step 2'))).toBe(true);
    expect(result.preview.explain.some((line) => line.startsWith('Why everyone stands where they do'))).toBe(true);
  });

  it('previewStart runs the real arrival for both bundled modules', () => {
    for (const name of ['greenmarch', 'minimal']) {
      const module = load(name);
      const result = previewStart(module, 12345);
      expect(result.ok, `${name}: ${result.ok ? '' : result.message}`).toBe(true);
      if (result.ok) {
        // The party is standing on the opening map.
        expect(result.preview.markers.some((m) => m.glyph === '@')).toBe(true);
      }
    }
  });

  it('reports a missing start instead of throwing', () => {
    const module = load('greenmarch');
    const doc = readAssembledModule(
      fileURLToPath(new URL('../../../modules/greenmarch', import.meta.url)),
    ).doc;
    const start = doc['start'] as Record<string, unknown>;
    delete start['startingPoi'];
    delete start['startingArea'];
    delete start['startingDungeon'];
    const stripped = compileForPreview(doc);
    expect(module).not.toBeNull();
    expect(stripped).not.toBeNull();
    const result = previewStart(stripped!, 12345);
    expect(result.ok).toBe(false);
  });
});

describe('static map previews', () => {
  it('a static POI interior is the authored map on every seed', () => {
    const module = load('greenmarch');
    const a = previewPoi(module, 'the_mill', 1);
    const b = previewPoi(module, 'the_mill', 999);
    if (!a.ok || !b.ok) throw new Error('expected previews');
    expect(a.preview.authored).toBe(true);
    expect(a.preview.tiles).toEqual(b.preview.tiles);
    expect(a.preview.tiles.width).toBe(11);
    // The entry marker rides along as a decorated marker.
    expect(a.preview.markers.some((m) => m.label.toLowerCase().includes('entry'))).toBe(true);
  });

  it('a static room template previews its world.maps entry', () => {
    const result = previewRoomTemplate(load('greenmarch'), 'barrow_deep', 5);
    if (!result.ok) throw new Error('expected a preview');
    expect(result.preview.authored).toBe(true);
    expect(result.preview.tiles.width).toBe(9);
    expect(result.preview.tiles.height).toBe(9);
  });

  it('a generated room template still rolls from its dice', () => {
    const result = previewRoomTemplate(load('greenmarch'), 'barrow_hall', 5);
    if (!result.ok) throw new Error('expected a preview');
    expect(result.preview.authored).toBe(false);
    expect(result.preview.tiles.width).toBeGreaterThanOrEqual(3);
  });
});
