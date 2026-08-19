import Link from 'next/link';
import { Page, Note, Code } from '../../../components/Page';
import { Filter } from '../../../components/Filter';
import { FieldTable, FieldTables } from '../../../components/FieldTable';
import { areaSections, rootSection } from '../../../lib/fields';

export default function ModulePage() {
  return (
    <Page
      here="/format/module"
      title="Top level, meta, mods, and start"
      lede="The outside of the document: what identifies it, what it layers on, and where play begins."
    >
      <Note title="Play has to begin somewhere">
        <code>start.startingDungeon</code> beats <code>start.startingPoi</code>, which beats{' '}
        <code>start.startingArea</code>. Set none of them and the world is valid and unplayable, so this is one of the few things reported as an error rather than a warning.
      </Note>

      <Note title="Six fields have no default">
        <code>mods</code>, <code>start.postVictory</code>, <code>narrative.lore</code>,{' '}
        <code>narrative.loreThreads</code>, <code>items[].skillBonuses</code>, and the lore
        clauses on a requirement are absent when unused, never written in as empty. Adding a
        default would change every world&apos;s fingerprint and stop every existing save loading.
      </Note>

      <h2>The document</h2>
      <Filter placeholder="Filter fields by name or description" />
      <FieldTable section={rootSection()} />

      <h2>meta, mods, start</h2>
      <FieldTables sections={areaSections('meta', 'mods', 'start')} />

      <h2>Layering one world on another</h2>
      <p>
        <code>extends</code> names a base world as <code>id@version</code>. The base loads first
        and your document merges over it. An add on can be twelve monsters instead of a copy of
        somebody else&apos;s game.
      </p>
      <Code>{`{ "id": "more_husks", "extends": "aurendel@1.0.0",
  "content": { "monsters": [ { "id": "husk", "xp": 25 },
                             { "id": "old_husk", "$delete": true } ] } }`}</Code>
      <p>
        Collections merge by id, not by position. Other objects merge key by key. Other arrays are
        replaced whole. <code>{'{ "$delete": true }'}</code> removes an inherited entry. Cycles are
        rejected. Full detail on <Link href="/custom">your own JSON</Link>.
      </p>
    </Page>
  );
}
