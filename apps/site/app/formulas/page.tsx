import Link from 'next/link';
import { Page, Note, Code } from '../../components/Page';
import { Formula, Big } from '../../components/Formula';
import { READING, ARITHMETIC, TESTS, ACTIONS, BIG } from '../../lib/formulas';
import { dslFields } from '../../lib/fields';

export default function FormulasPage() {
  const fields = dslFields();
  return (
    <Page
      here="/formulas"
      title="Writing formulas"
      lede="The small JSON language that runs everything conditional in your world."
    >
      <p>
        Data says what a thing is. A formula says what it does, and when. The same language covers
        ability effects, item procs, trap triggers, dialogue gates, loot rules, quest objectives,
        difficulty numbers, and stat curves.
      </p>

      <h2>Four kinds</h2>
      <table className="plain">
        <tbody>
          <tr><td><b>Expression</b></td><td>Produces a value. A number, a string, a list.</td><td>{fields['expression']?.length} fields take one</td></tr>
          <tr><td><b>Predicate</b></td><td>Produces yes or no.</td><td>{fields['predicate']?.length} fields</td></tr>
          <tr><td><b>Effect</b></td><td>Something that happens.</td><td>{fields['effect']?.length} fields take a list</td></tr>
          <tr><td><b>Rule</b></td><td>A predicate and the effects it gates.</td><td>{fields['rule']?.length} fields</td></tr>
        </tbody>
      </table>
      <p>
        A field&apos;s type in <Link href="/format">the reference</Link> tells you which one it
        wants. Every operator is listed on <Link href="/format/dsl">the DSL page</Link>.
      </p>

      <h2>Reading values</h2>
      <p>One mechanism reads everything. A dotted path into the world.</p>
      {READING.map((f) => <Formula key={f.title} formula={f} />)}
      <p>What you can read:</p>
      <table className="plain">
        <tbody>
          <tr><td><code>actor.level</code></td><td>Also <code>id</code>, <code>name</code>, <code>xp</code>, <code>alive</code>, <code>ancestry</code>, <code>class</code>, <code>proficiency</code>, <code>carried</code>.</td></tr>
          <tr><td><code>actor.attr.might</code></td><td>The raw attribute score.</td></tr>
          <tr><td><code>actor.mod.might</code></td><td>The modifier your curve produced from it.</td></tr>
          <tr><td><code>actor.res.hp</code> · <code>actor.max.hp</code></td><td>Current and maximum of a resource.</td></tr>
          <tr><td><code>actor.derived.guard</code></td><td>Any derived stat you declared.</td></tr>
          <tr><td><code>actor.skills.lore</code></td><td>Trained rank plus equipment.</td></tr>
          <tr><td><code>actor.inventory.rope</code></td><td>How many carried. <code>actor.equippedItems.blade</code> for worn or wielded.</td></tr>
          <tr><td><code>actor.conditions.burning</code></td><td>Rounds remaining, or true.</td></tr>
          <tr><td><code>actor.primaryMod</code></td><td>The modifier of the class&apos;s primary attribute.</td></tr>
          <tr><td><code>target.*</code></td><td>Same shape, where there is a target. <code>id</code>, <code>name</code>, <code>level</code>, <code>alive</code>, <code>attr</code>, <code>mod</code>, <code>res</code>, <code>max</code>, <code>derived</code>, <code>conditions</code>.</td></tr>
          <tr><td><code>flags.met_vess</code></td><td>Anything you set.</td></tr>
          <tr><td><code>quests.the_mill.status</code></td><td>And <code>quests.the_mill.objectives.burn_it</code>.</td></tr>
          <tr><td><code>reputation.wardens</code></td><td>Standing. <code>ranks.wardens.trusted</code> is the number a rank sits at.</td></tr>
          <tr><td><code>lore.the_bell</code> · <code>threads.the_bell.known</code></td><td>Known lore, and how many entries of a thread.</td></tr>
          <tr><td><code>memory.speaker.theft</code></td><td>What someone remembers. Also <code>party</code>, <code>anyone</code>, <code>faction</code>.</td></tr>
          <tr><td><code>tiers.adept</code></td><td>The rank a mastery tier begins at.</td></tr>
          <tr><td><code>arcs.the_fen</code></td><td>Arc progress.</td></tr>
          <tr><td><code>world.day</code></td><td>Also <code>hour</code>, <code>phase</code>, <code>month</code>, <code>monthName</code>, <code>year</code>, <code>minute</code>.</td></tr>
          <tr><td><code>purse</code></td><td>Money carried.</td></tr>
          <tr><td><code>party</code></td><td>A list. <code>party.0.name</code>, or walk it with <code>forEach</code>.</td></tr>
        </tbody>
      </table>

      <Note title="A missing path is an error, not a zero">
        Add <code>else</code> where something may genuinely be absent. Five namespaces read as null
        instead of failing, since not yet is a normal answer for them:{' '}
        <code>flags</code>, <code>quests</code>, <code>memory</code>, <code>reputation</code>,{' '}
        <code>lore</code>. Everything else is strict, so a typo is caught.
      </Note>

      <Note title="extra is not readable from a formula">
        The <code>extra</code> bag on an entry is carried through, exported, and available to
        mods, but it is not in the scope a <code>ref</code> path walks. Use a flag for author data
        a formula needs to read.
      </Note>

      <h2>Doing arithmetic</h2>
      {ARITHMETIC.map((f) => <Formula key={f.title} formula={f} />)}

      <h2>Asking questions</h2>
      {TESTS.map((f) => <Formula key={f.title} formula={f} />)}

      <h2>Making things happen</h2>
      {ACTIONS.map((f) => <Formula key={f.title} formula={f} />)}

      <h2>Putting it together</h2>
      <p>
        Six real ones. Every example on this page is parsed and validated against the format
        before the page is built.
      </p>
      {BIG.map((f) => <Big key={f.title} formula={f} />)}

      <h2>Things that catch people out</h2>
      <table className="plain">
        <tbody>
          <tr><td>A bare array is not an expression.</td><td><code>{'{ "list": [ "a", "b" ] }'}</code>, not <code>{'[ "a", "b" ]'}</code>.</td></tr>
          <tr><td>Effects always come as a list.</td><td>Even one. Wrap it in <code>[ ]</code>.</td></tr>
          <tr><td>Most effects need a <code>target</code>.</td><td>Usually <code>{'{ "ref": "actor.id" }'}</code> or <code>{'{ "ref": "target.id" }'}</code>.</td></tr>
          <tr><td>The same roll twice is two rolls.</td><td>Use <code>let</code> to roll once and reuse it.</td></tr>
          <tr><td><code>all</code> of nothing is true.</td><td><code>any</code> of nothing is false.</td></tr>
          <tr><td><code>target</code> only exists where there is one.</td><td>Not in a quest condition or a gate.</td></tr>
          <tr><td>A modifier formula sees only <code>value</code>.</td><td>Not the rest of the character.</td></tr>
          <tr><td><code>repeat</code> stops at ten thousand.</td><td>Loop bindings do not leak out of the loop.</td></tr>
        </tbody>
      </table>

      <h2>Every field that takes one</h2>
      <p>Generated from the format.</p>
      {(['expression', 'predicate', 'effect', 'rule'] as const).map((kind) => (
        <div key={kind}>
          <h3>{kind}</h3>
          <div className="chips">
            {(fields[kind] ?? []).map((path) => <code key={path}>{path}</code>)}
          </div>
        </div>
      ))}

      <h2>Where to go next</h2>
      <p>
        <Link href="/format/dsl">The DSL page</Link> lists every operator.{' '}
        <Link href="/format/requirements">Requirements</Link> is the structured alternative for
        gating, and takes a formula through <code>custom</code> where its clauses run out.
      </p>
      <Code>{`"requires": { "minLevel": 3,
              "custom": { "test": { "ref": "flags.spoke_for_us" } } }`}</Code>
    </Page>
  );
}
