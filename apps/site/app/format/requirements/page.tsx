import Link from 'next/link';
import { Page, Note, Code } from '../../../components/Page';
import { Filter } from '../../../components/Filter';
import { FieldTables } from '../../../components/FieldTable';
import { requirementSections } from '../../../lib/fields';

const SITES = [
  'ability.requires', 'gate.requires', 'gate.bypass', 'dialogueOption.requires',
  'dialogueNode.redirectWhen.requires', 'quest.requires', 'objective.requires',
  'reaction.requires', 'behaviour.requires', 'trigger.requires', 'lootTable.requires',
  'lootEntry.requires', 'encounterGroup.requires', 'area.requires',
  'roomTemplate.requires', 'npc.shop.requires', 'textVariant.requires',
];

export default function RequirementsPage() {
  return (
    <Page
      here="/format/requirements"
      title="requirements"
      lede="One gating vocabulary, defined once and used everywhere."
    >
      <p>
        One object answering one question: does this actor, right now, meet these conditions. It
        appears in sixteen places and behaves identically in all of them.
      </p>

      <h2>Where it appears</h2>
      <div className="chips">{SITES.map((site) => <code key={site}>{site}</code>)}</div>

      <h2>The shape</h2>
      <p>Every clause is optional. Those present must all hold.</p>
      <Code>{`{
  "description": "Why this gate exists. Shown in the editor and in refusals.",

  "minLevel": 3, "maxLevel": 8,
  "classes":    ["warden", "stalker"],
  "attributes": [ { "attribute": "might", "min": 14 } ],
  "skills":     [ { "skill": "lore", "minRank": 2, "minTier": "adept" } ],
  "items":      [ { "item": "brass_key", "quantity": 1, "consume": true } ],
  "quests":     [ { "quest": "the_mill_door", "status": "complete" } ],
  "factions":   [ { "faction": "wardens", "minStanding": 10 } ],
  "memories":   [ { "deedKind": "theft", "who": "speaker", "known": false } ],
  "flags":      [ { "flag": "mill_clear", "equals": true } ],

  "without": { "items": ["cursed_idol"], "conditions": ["frightened"] },

  "anyOf": [ { "items": [ { "item": "brass_key" } ] },
             { "skills": [ { "skill": "lockpicking", "minRank": 5 } ] } ],

  "custom": { "gte": [ { "ref": "flags.morale" }, 5 ] }
}`}</Code>

      <Note title="without">
        A quest offered only before you have met someone. A shrine admitting only the unarmed. A
        merchant who deals with you only while you are not carrying stolen goods.
      </Note>

      <Note title="anyOf is one level deep">
        Branches do not nest. Use <code>custom</code> for anything deeper.
      </Note>

      <Note title="An empty requirement passes">
        It is skipped entirely and costs nothing.
      </Note>

      <h2>How it runs</h2>
      <p>
        A requirement becomes an ordinary <Link href="/format/dsl">predicate</Link>.{' '}
        <code>{'{ "minLevel": 3 }'}</code> becomes{' '}
        <code>{'{ "gte": [ { "ref": "actor.level" }, 3 ] }'}</code>.
      </p>

      <h2>Every field</h2>
      <Filter placeholder="Filter clauses by name or description" />
      <FieldTables sections={requirementSections()} />
    </Page>
  );
}
