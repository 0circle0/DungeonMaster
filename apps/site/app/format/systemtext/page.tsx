import { Page, Note, Code } from '../../../components/Page';
import { Filter } from '../../../components/Filter';
import { systemTextRows } from '../../../lib/fields';

export default function SystemTextPage() {
  const rows = systemTextRows();
  const fragments = rows.filter((row) => row.tier === 'fragment').length;
  return (
    <Page
      here="/format/systemtext"
      title="systemText"
      lede="Every sentence the engine produces. The engine holds no prose of its own."
    >
      <p>
        The engine emits a key and its facts. These decide the words, in any language.{' '}
        {rows.length} keys, {fragments} of them fragments.
      </p>

      <Note title="Two tiers, and why they differ">
        A <b>fragment</b> is a piece another message interpolates, such as the word that fills{' '}
        <code>{'{outcome}'}</code> in an attack line. Nothing sensible can stand in for a missing
        one and the sentence around it would render with a hole, so fragments are required in the
        document, and a world that omits one will not load. A <b>message</b> stands on its own
        and carries a default, so you write only what you want to change.
      </Note>

      <p>A value is a string, or a pool reference for weighted, condition gated variation.</p>
      <Code>{`"narrative": {
  "systemText": {
    "combat.died": "{name} falls.",
    "move.blocked": { "pool": "blocked_lines" }
  }
}`}</Code>
      <p>
        Placeholders below are the ones a message cannot lose. Dropping one stops the world
        loading. A new world already has every required fragment. Starting from an existing
        ruleset brings the rest across.
      </p>

      <Filter placeholder="Filter keys by name or description" />
      <section className="sec" data-section data-text="systemtext">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Key</th><th>Tier</th><th>Must keep</th><th>What it says</th><th>Default</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-row data-text={`${row.key} ${row.doc}`.toLowerCase()}>
                  <td><code className="f-key">{row.key}</code></td>
                  <td className="f-type">{row.tier}</td>
                  <td className="f-def">
                    <span className="chips">
                      {row.placeholders.map((name) => <code key={name}>{`{${name}}`}</code>)}
                    </span>
                  </td>
                  <td className="f-doc">{row.doc}</td>
                  <td className="f-def"><code>{row.text}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
}
