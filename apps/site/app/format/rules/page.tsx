import { Page, Note, Code } from '../../../components/Page';
import { Filter } from '../../../components/Filter';
import { FieldTables } from '../../../components/FieldTable';
import { areaSections } from '../../../lib/fields';

export default function RulesPage() {
  return (
    <Page
      here="/format/rules"
      title="rules"
      lede="The system. What a character is made of, what dice decide, and how levels work."
    >
      <p>
        Everything a character is made of is declared here. Required:{' '}
        <code>attributes</code>, <code>resources</code>, <code>progression</code>, and{' '}
        <code>vitalResource</code>. Everything else is optional.
      </p>

      <Note title="Death">
        Reaching a resource floor runs its <code>onDepleted</code> effects. Death follows only if
        the creature is still at the floor afterwards and the resource is <code>vitalResource</code>.
        <Code>{`"onDepleted": [ { "heal": { "target": { "ref": "actor.id" }, "amount": 1 } },
                 { "applyCondition": { "target": { "ref": "actor.id" },
                                       "condition": "downed" } } ]`}</Code>
        means stabilised, not killed.
      </Note>

      <Note title="The order stats are worked out in">
        Attributes, then modifiers, then resource limits, then derived stats. Each step sees the
        ones before it. Modifiers see only their own attribute value. Derived stats also see
        equipment and active conditions. A resource limit cannot reference a derived stat.
      </Note>

      <Note title="Getting allies">
        <code>dispositionBands</code> maps a disposition number onto a stance, highest matching
        band first. The default has only neutral and hostile. Add a band above zero for an NPC to
        fight on your side.
      </Note>

      <Filter placeholder="Filter fields by name or description" />
      <FieldTables sections={areaSections('rules')} />
    </Page>
  );
}
