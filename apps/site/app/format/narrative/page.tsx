import Link from 'next/link';
import { Page, Note } from '../../../components/Page';
import { Filter } from '../../../components/Filter';
import { FieldTables } from '../../../components/FieldTable';
import { areaSections } from '../../../lib/fields';

export default function NarrativePage() {
  return (
    <Page
      here="/format/narrative"
      title="narrative"
      lede="The story. Text pools, dialogue, quests, arcs, lore, deeds, and the memory model."
    >
      <p>
        Prose lives in weighted pools, not single strings. A place described twice reads
        differently. Every sentence the engine produces lives in{' '}
        <Link href="/format/systemtext">systemText</Link>.
      </p>

      <Note title="A dialogue does not know who owns it">
        <code>npc.dialogue</code> names a dialogue. The dialogue never names the NPC. A dialogue
        nothing points at can never be opened. The studio has a rule for it.
      </Note>

      <Note title="Option effects run before the check">
        <code>option.effects</code> run on choosing the option, whatever{' '}
        <code>option.check</code> rolls. A reward that depends on the roll belongs on the success
        node&apos;s <code>onEnter</code>.
      </Note>

      <Note title="The current quest stage is calculated">
        Nothing records it. It is the first stage still holding an unfinished objective that is
        not optional.
      </Note>

      <Note title="Lore is only taught by an effect">
        A <code>learnLore</code> effect is the only thing that grants it. Lore no effect names can
        never be known, and is reported.
      </Note>

      <Filter placeholder="Filter fields by name or description" />
      <FieldTables sections={areaSections('narrative')} />
    </Page>
  );
}
