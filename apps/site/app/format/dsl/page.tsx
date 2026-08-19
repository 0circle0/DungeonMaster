import { EXPR_OPS, PREDICATE_OPS, EFFECT_OPS } from '@dm/module';
import Link from 'next/link';
import { Page, Note, Code } from '../../../components/Page';
import { Formula as FormulaBlock } from '../../../components/Formula';
import { CONTROL } from '../../../lib/formulas';

function Ops({ ops }: { ops: Iterable<string> }) {
  return (
    <div className="chips">
      {[...ops].map((op) => <code key={op}>{op}</code>)}
    </div>
  );
}

export default function DslPage() {
  return (
    <Page
      here="/format/dsl"
      title="The DSL"
      lede="Data cannot express behaviour, so one small JSON language covers everything that needs logic."
    >
      <p>
        One language for ability effects, item procs, trap triggers, dialogue gates, loot rules,
        and quest objectives. It is sandboxed: a world you downloaded cannot run code. Chance goes
        through the seeded dice, so it replays. It is plain JSON, so the editor can render and
        check it without executing it.
      </p>

      <h2 id="reading">Reading values</h2>
      <p>Everything readable goes through one mechanism.</p>
      <Code>{`{ "ref": "actor.attr.might" }
{ "ref": "actor.inventory.rope", "else": 0 }`}</Code>
      <p>
        There is no <code>hasFlag</code>, <code>hasItem</code>, or <code>hasCondition</code>{' '}
        operator. Those are ordinary paths.
      </p>
      <table className="plain">
        <tbody>
          <tr><td>Is a flag set?</td><td><code>flags.met_vess</code></td></tr>
          <tr><td>How many ropes?</td><td><code>actor.inventory.rope</code></td></tr>
          <tr><td>Is it burning?</td><td><code>actor.conditions.burning</code></td></tr>
          <tr><td>Faction standing?</td><td><code>reputation.wardens</code></td></tr>
          <tr><td>Quest status?</td><td><code>quests.the_mill_door.status</code></td></tr>
          <tr><td>Known lore?</td><td><code>lore.the_drowned_bell</code></td></tr>
          <tr><td>What day is it?</td><td><code>world.day</code></td></tr>
          <tr><td>Your own data?</td><td><code>flags.morale</code>. An entry&apos;s <code>extra</code> bag is not in scope.</td></tr>
        </tbody>
      </table>

      <Note title="A missing path is an error">
        It does not read as zero. Add <code>else</code> where a path is genuinely optional. Five
        namespaces are open and read as null instead: <code>flags</code>, <code>quests</code>,{' '}
        <code>memory</code>, <code>reputation</code>, <code>lore</code>.
      </Note>

      <h2 id="expression">Expressions</h2>
      <p>An expression produces a value.</p>
      <Ops ops={EXPR_OPS} />
      <Code>{`// floor((might - 10) / 2), the attribute modifier as content defines it
{ "floor": { "div": [ { "sub": [ { "ref": "actor.attr.might" }, 10 ] }, 2 ] } }

{ "roll": "2d6+3" }

{ "cond": { "gte": [ { "ref": "actor.res.hp" }, 10 ] },
  "then": "steady", "else": "failing" }`}</Code>

      <h2 id="predicate">Predicates</h2>
      <p>A predicate produces a yes or a no.</p>
      <Ops ops={PREDICATE_OPS} />
      <Code>{`{ "all": [
    { "gte": [ { "ref": "actor.attr.might" }, 14 ] },
    { "test": { "ref": "flags.met_vess" } },
    { "not": { "exists": "actor.conditions.frightened" } }
] }`}</Code>
      <p><code>all</code> on an empty list is true. <code>any</code> is false.</p>

      <h2 id="effect">Effects</h2>
      <p>An effect is a thing that happens. Nineteen of them, including control flow.</p>
      <Ops ops={EFFECT_OPS} />
      <p>
        Effects do not write state. They produce a list of intents and the engine applies each
        one. The dead take no damage, resources stop at their limits, immune creatures shrug off
        conditions, and an unknown id is refused.
      </p>
      <Code>{`[
  { "damage": { "target": { "ref": "target.id" },
                "amount": { "add": [ { "roll": "2d6" }, { "ref": "actor.mod.might" } ] },
                "damageType": "fire" } },
  { "applyCondition": { "target": { "ref": "target.id" },
                        "condition": "burning", "duration": 3 } }
]`}</Code>

      <h3>Control flow</h3>
      {CONTROL.map((f) => <FormulaBlock key={f.title} formula={f} />)}
      <p>
        <code>repeat</code> and <code>forEach</code> expose <code>index</code>. Bindings stay
        inside the loop. <code>repeat</code> stops at ten thousand iterations. Worked examples of
        all of this are on <Link href="/formulas">writing formulas</Link>.
      </p>

      <h2 id="rule">Rules</h2>
      <p>A predicate and the effects it gates. Used by ancestry traits and item procs.</p>
      <Code>{`{ "when": { "test": { "ref": "flags.moonlit" } },
  "then": [ { "applyCondition": { "target": { "ref": "actor.id" },
                                  "condition": "emboldened" } } ] }`}</Code>

      <h2 id="dice">Dice notation</h2>
      <table className="plain">
        <tbody>
          <tr><td><code>1d20</code></td><td>One twenty sided die.</td></tr>
          <tr><td><code>2d6+3</code></td><td>Two six sided dice plus three.</td></tr>
          <tr><td><code>4d6kh3</code></td><td>Roll four, keep the highest three.</td></tr>
          <tr><td><code>2d20kh1</code></td><td>Advantage. Not an engine special case, just notation.</td></tr>
          <tr><td><code>2d20kl1</code></td><td>Disadvantage.</td></tr>
          <tr><td><code>1d8+1d4-1</code></td><td>Several terms.</td></tr>
        </tbody>
      </table>
      <p>Notation is checked at load.</p>

      <h2>Errors</h2>
      <p>Every failure carries a path and, where it can, a suggestion.</p>
      <Code>{`"fgte" is not a valid predicate operator (at content.abilities.2.when.fgte)
  did you mean "gte"?`}</Code>
    </Page>
  );
}
