import Link from 'next/link';
import { Page, Note } from '../../../components/Page';
import { Filter } from '../../../components/Filter';
import { FieldTables } from '../../../components/FieldTable';
import { areaSections } from '../../../lib/fields';

export default function ContentPage() {
  return (
    <Page
      here="/format/content"
      title="content"
      lede="The things. Abilities, skills, ancestries, classes, items, loot, monsters, traps, factions, and people."
    >
      <p>
        Nothing here is required. A world can be a ruleset and nothing else, or content with nowhere
        to put it yet. Most of the surface below is rarely used: the reference campaign touches perhaps a
        third of what an item, a monster, or a person can carry.
      </p>

      <Note title="Requirements">
        Every <code>requires</code> field here is the same object, documented under{' '}
        <Link href="/format/requirements">requirements</Link>. It appears in sixteen places and
        behaves identically in all of them.
      </Note>

      <Note title="Reactions">
        <code>reactions</code> on a monster or a person are things they do off their own turn,
        gated on what <em>they</em> remember, their faction standing, and their own condition. A
        hound goes berserk when its packmate dies. A miller stops trading having heard about a
        theft. Aurendel uses this on two monsters out of 127 and no people.
      </Note>

      <Note title="Two ways to place a person">
        <code>npc.home</code> or <code>poi.residents</code>. Both work. See{' '}
        <Link href="/linking">linking</Link>.
      </Note>

      <Filter placeholder="Filter fields by name or description" />
      <FieldTables sections={areaSections('content')} />
    </Page>
  );
}
