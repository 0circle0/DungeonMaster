import { Page, Note, Code } from '../../../components/Page';
import { Filter } from '../../../components/Filter';
import { FieldTables } from '../../../components/FieldTable';
import { areaSections } from '../../../lib/fields';

export default function WorldPage() {
  return (
    <Page
      here="/format/world"
      title="world"
      lede="The places. Terrain, palettes, biomes, areas, points of interest, gates, rooms, encounters, dungeons, maps, and the clock."
    >
      <p>
        Biome, then area, then point of interest. A biome is a theme: room templates, encounter
        tables, ambience, palette. An area belongs to one biome and joins others by declared
        connections. A point of interest is a place inside an area. A generated dungeon hangs off
        a point of interest and does not replace it.
      </p>

      <Note title="How a map gets built">
        Three sources, highest first. <code>map.static</code> names a hand drawn grid.{' '}
        <code>map.layout</code> plus <code>map.legend</code> draws one inline with glyphs.
        Otherwise the size, palette, and starting number generate one. Maps are built on arrival
        and kept.
      </Note>

      <Note title="roomCount is a request">
        Spacing between rooms comes from the average of <code>corridorLength</code>, not from{' '}
        <code>roomCount</code>. Fifteen rooms with long corridors on a small floor can come out as
        two. The studio measures what a dungeon really generates and offers a size that matches.
      </Note>

      <Note title="Two guarantees">
        Every room is reachable. Every key lies before its lock. Both hold for any settings.
      </Note>

      <p>Three algorithms carve a floor:</p>
      <Code>{`"algorithm": "rooms"     places rectangles and joins them with corridors
"algorithm": "bsp"       splits the bounds recursively; the splits are the tree
"algorithm": "caverns"   noise and smoothing; keeps the largest connected floor`}</Code>

      <Filter placeholder="Filter fields by name or description" />
      <FieldTables sections={areaSections('world')} />
    </Page>
  );
}
