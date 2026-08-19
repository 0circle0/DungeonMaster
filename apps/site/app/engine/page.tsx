import Link from 'next/link';
import { Page, Note, Code } from '../../components/Page';

export default function EnginePage() {
  return (
    <Page
      here="/engine"
      title="The engine"
      lede="What runs your world. Read this when you want to know the order things happen in."
    >
      <p>
        The engine has no attributes, damage types, conditions, dice convention, or level curve of
        its own. It reads all of them from your world.
      </p>

      <h2>Actions and events</h2>
      <p>
        An <b>action</b> is a request: walk north, attack that, buy this. It says what you want,
        not what happens. Actions cover movement, combat, trade, items, talking, searching, the
        party, quests, and time.
      </p>
      <p>
        An <b>event</b> is a fact that has already happened. Events carry their numbers, so a roll
        arrives with its notation, every die, the natural result, the modifier, the total, the
        number it needed, and whether it landed. Interfaces show the arithmetic from this.
      </p>
      <p>
        The engine never produces a sentence. It names a message and hands over the facts. Your{' '}
        <Link href="/format/systemtext">systemText</Link> supplies the words.
      </p>

      <h2>A turn</h2>
      <ol>
        <li>Mods may block the action or replace it.</li>
        <li>The action resolves.</li>
        <li>The dice used are recorded into the save.</li>
        <li>The world settles.</li>
        <li>Anything your content emitted is handled, and anything that emits, four rounds deep.</li>
      </ol>
      <p>Settling always runs in this order:</p>
      <ol>
        <li>Everyone perceives.</li>
        <li>Anything noticed is acted on.</li>
        <li>Party passives run.</li>
        <li>A finished fight ends. A started fight begins. Anyone new joins it.</li>
        <li>Combat start and end triggers fire.</li>
        <li>Reactions fire.</li>
        <li>Creatures take their turns.</li>
        <li>Arc endings, then your <code>victoryWhen</code> and <code>defeatWhen</code>.</li>
      </ol>
      <p>
        Your effects do not write state. They produce a list of intents and the engine decides
        each one. The dead take no damage. Resources stop at their limits. An immune creature
        shrugs off a condition. An id that does not exist is refused, not crashed on.
      </p>

      <h2>What a save holds</h2>
      <p>
        Which world and version, the dice mid sequence, the time, every creature, the party, where
        you are, generated maps, the current fight, fired triggers, what each person remembers,
        the open conversation, flags, known lore, the purse, faction standing, quest progress,
        deeds, and whether you have won.
      </p>
      <p>
        Only base facts are stored. Attributes and current resource values are kept. Maxima,
        guard, and initiative are recalculated on every read.
      </p>
      <p>Characters, monsters, and townspeople are one kind of thing. Any of them can fight or talk.</p>

      <h2>Replay</h2>
      <p>A starting number plus the choices made reproduces a run move for move.</p>
      <ul>
        <li>The dice live in the save. Loading resumes mid sequence.</li>
        <li>
          Randomness is split by purpose: one stream for the dungeon, one per fight, one per loot
          roll. A longer fight cannot change the dungeon. Rerolling a map moves only the map.
        </li>
        <li>Nothing asks the computer for the time or for a random number.</li>
        <li>Initiative ties break by id. Quests are offered in a fixed order. Followers move in party order.</li>
        <li>Chance is rolled last. A trigger that fails its condition spends no randomness.</li>
      </ul>

      <h2>Checks</h2>
      <p>
        Every uncertain outcome is one check: roll, add a modifier, compare against a difficulty.
        Your world sets what a check rolls, what advantage and disadvantage roll instead, which
        results are critical, and how fractions round.
      </p>
      <p>
        The <b>natural</b> roll decides criticals. A rolled 1 with a bonus of nine is still a
        fumble.
      </p>

      <h2>Stats</h2>
      <p>Worked out in four steps. Each step sees the ones before it and nothing after.</p>
      <ol>
        <li><b>Attributes.</b> Stored.</li>
        <li><b>Modifiers.</b> Each sees only its own attribute value.</li>
        <li><b>Resource limits.</b> See attributes, modifiers, level.</li>
        <li><b>Derived stats.</b> See all of the above, plus resources, equipment, conditions.</li>
      </ol>
      <p>A resource limit cannot reference a derived stat.</p>

      <Note title="Death">
        Hitting a resource floor runs that resource&apos;s <code>onDepleted</code> effects. Death
        follows only if the creature is still at the floor afterwards and the resource is the one
        named <code>vitalResource</code>. Heal one and apply a downed condition means stabilised.
      </Note>

      <h2>Combat</h2>
      <ul>
        <li>A fight starts when something perceives you strongly enough to attack. Sharing a map is not enough.</li>
        <li>Anything joining partway through takes its turn at the end of the order.</li>
        <li>A fight ends when one side is gone, or when neither side perceives the other. Checked at the top of a round.</li>
        <li>Moving out of reach of an enemy provokes a free attack from it.</li>
      </ul>
      <p>Using an ability runs in this order:</p>
      <ol>
        <li>Whether it can be used at all: conditions, <code>requires</code>, <code>when</code>, cooldown.</li>
        <li>Spell slot.</li>
        <li>Other costs, calculated once and reused for both the check and the payment.</li>
        <li>Targets.</li>
        <li>Payment.</li>
        <li>Concentration and cooldown.</li>
        <li>Result against each target.</li>
      </ol>
      <p>The result is one of three:</p>
      <table className="plain">
        <tbody>
          <tr><td>Attack roll</td><td>Against a stat on the target, plus its cover.</td></tr>
          <tr><td>Saving throw</td><td>Target rolls. Success is worth nothing, half, all, or effects you name.</td></tr>
          <tr><td>Neither</td><td>The effects happen.</td></tr>
        </tbody>
      </table>

      <h2>The world</h2>
      <ul>
        <li>Maps are generated on first arrival and kept. A ransacked shrine stays ransacked.</li>
        <li>Movement is one tile at a time, including a long click. Anything interesting interrupts the journey.</li>
        <li>Travel between areas needs a declared connection.</li>
        <li>Fog of war is what has been seen, not where you have walked. The party shares it.</li>
        <li>Perception is a signal strength from 0 to 1 at the observer. Thresholds decide what it means, not distance.</li>
      </ul>
      <p>Each step of movement, in order:</p>
      <Code>{`is it your turn  ->  is the tile adjacent  ->  is the terrain passable
->  is anything standing there  ->  can you afford it
->  parting blows, and did you survive them  ->  you move
->  mark what you can now see  ->  leave scent and sound
->  terrain effects  ->  enter the room  ->  spring any trap
->  advance the clock, outside combat  ->  followers catch up`}</Code>

      <h2>Quests</h2>
      <ul>
        <li>Objectives watch events. Nothing about combat or travel knows quests exist.</li>
        <li>Counted progress lives in the flag <code>quest:&lt;quest&gt;:&lt;objective&gt;:count</code>.</li>
        <li>The current stage is the first one holding an unfinished objective that is not optional. It is calculated, not stored.</li>
        <li>Rewards pay experience to the whole party.</li>
      </ul>

      <h2>Prose</h2>
      <Note title="No language model">
        Nothing here uses one, and nothing calls a network. Variety comes from your weighted text
        pools and the conditions on them. A description that repeats needs another variant.
      </Note>
      <p>
        Every engine sentence comes from a <Link href="/format/systemtext">systemText</Link> key.
        There is no English fallback. A missing required fragment stops the world loading.
      </p>

      <h2>Saves across edits</h2>
      <p>A save records the world, the version, and a fingerprint of the contents.</p>
      <table className="plain">
        <tbody>
          <tr><td>Different world</td><td>Refused.</td></tr>
          <tr><td>Same world, contents changed</td><td>Refused unless you accept the drift.</td></tr>
          <tr><td>Different mods installed</td><td>Warning.</td></tr>
        </tbody>
      </table>
      <p>Every edit changes the fingerprint, so saves made while building will ask before loading.</p>

      <h2>Playing</h2>
      <ul>
        <li>The buttons under the map are the engine&apos;s own list of what is possible here.</li>
        <li>The command bar completes from the same list.</li>
        <li>A refusal names what was understood and what was missing.</li>
        <li>An ambiguous target opens a picker with positions.</li>
        <li>An unreachable tile still offers the walk, with the reason it will fail.</li>
      </ul>
    </Page>
  );
}
