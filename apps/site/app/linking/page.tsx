import Link from 'next/link';
import { Page, Note, Code } from '../../components/Page';

export default function LinkingPage() {
  return (
    <Page
      here="/linking"
      title="Linking things together"
      lede="Which field joins what to what, and which joins are not checked for you."
    >
      <h2>The spatial spine</h2>
      <Code>{`biome  ->  area  ->  point of interest  ->  dungeon`}</Code>
      <table className="plain">
        <tbody>
          <tr><td>Biome</td><td>A theme. Supplies room templates, encounter tables, ambience, palette.</td></tr>
          <tr><td>Area</td><td>Belongs to one biome. Joined to other areas by <code>connections</code>.</td></tr>
          <tr><td>Point of interest</td><td>Belongs to one area. A place inside it you can go.</td></tr>
          <tr><td>Dungeon</td><td>Hangs off a place through <code>poi.dungeon</code>. Does not replace the place.</td></tr>
        </tbody>
      </table>
      <p>A place whose area does not exist never appears. Travel needs a declared connection.</p>
      <p>
        A road is two entries, one on each area. <code>oneWay</code> is read on the
        destination&apos;s entry, so listing a road both ways gives a two way road.
      </p>

      <h2>Placing a person</h2>
      <p>
        Two fields, both work. <code>npc.home</code> names a place.{' '}
        <code>poi.residents</code> lists people. Pick one and stay with it.
      </p>

      <h2>Offering a quest</h2>
      <Note title="quest.giver does not offer anything">
        It is a label. <code>npc.offersQuests</code> is what puts a job in front of a player.
      </Note>
      <p>A quest can begin in one of four ways. At least one must be true:</p>
      <ul>
        <li>An NPC lists it in <code>offersQuests</code>.</li>
        <li><code>autoStart</code> is set.</li>
        <li>Another quest <code>unlocks</code> it.</li>
        <li>An effect emits <code>startQuest</code> for it.</li>
      </ul>

      <h2>Chaining quests</h2>
      <p>Four pieces. All four are needed.</p>
      <ol>
        <li>Only the first link is in an NPC&apos;s <code>offersQuests</code>.</li>
        <li>Each later link <code>requires</code> the previous one complete.</li>
        <li>Each link but the last <code>unlocks</code> the next.</li>
        <li>The level floor sits on the first link only.</li>
      </ol>
      <Code>{`{ "id": "mill_1", "unlocks": ["mill_2"],
  "requires": { "minLevel": 3 } }

{ "id": "mill_2", "unlocks": ["mill_3"],
  "requires": { "quests": [ { "quest": "mill_1", "status": "complete" } ] } }`}</Code>

      <h2>Dialogue</h2>
      <Note title="Ownership points one way">
        <code>npc.dialogue</code> names a dialogue. The dialogue never names the NPC. A dialogue
        nothing points at can never be opened.
      </Note>
      <p>Inside a dialogue, five fields name a node, and only nodes in that same dialogue:</p>
      <p>
        <code>start</code> · <code>option.goto</code> · <code>check.onSuccess</code> ·{' '}
        <code>check.onFailure</code> · <code>redirectWhen[].goto</code>
      </p>
      <Note title="Effects on an option run before the check">
        <code>option.effects</code> run on choosing the option, whatever{' '}
        <code>option.check</code> then rolls. Put anything that depends on the roll on the success
        node&apos;s <code>onEnter</code>.
      </Note>
      <p>Options are tested against what the speaker knows, not what is true.</p>

      <h2>Objectives</h2>
      <table className="plain">
        <tbody>
          <tr><td><code>kill</code></td><td>A death whose statblock id is <code>target</code>.</td></tr>
          <tr><td><code>collect</code></td><td>Gaining the item named by <code>target</code>.</td></tr>
          <tr><td><code>reach</code></td><td>Entering a map, firing a trigger, opening a gate, or a custom event.</td></tr>
          <tr><td><code>talk</code></td><td>Starting a conversation with <code>target</code>.</td></tr>
          <tr><td><code>custom</code></td><td>Your own <code>when</code> predicate. Required for this kind.</td></tr>
        </tbody>
      </table>
      <p>On the first four kinds, <code>when</code> is an extra condition the event must also pass. It is never a second way to complete.</p>
      <Note title="Unchecked ids">
        <code>objective.target</code> is a bare id, not a checked reference. A typo passes
        validation and the objective never completes. The same applies to{' '}
        <code>condition.prevents</code>, <code>condition.implies</code>,{' '}
        <code>sense.ignores</code>, and <code>dungeon.guaranteedRoles</code>. The studio has a rule
        for the first of these.
      </Note>

      <h2>Flags</h2>
      <p>
        A flag is a free string. Nothing checks that the thing reading it and the thing writing it
        agree on the spelling. The studio does, with <code>flag_never_set</code> and{' '}
        <code>flag_writer_unreachable</code>.
      </p>
      <p>The engine writes these itself. You can read all of them:</p>
      <Code>{`found:<poi>                       a hidden place has been discovered
seen:<map>:<room>                 a room description has been shown
gate:<id>:open                    a gate stands open
gate:<id>:tried                   a bypass with no retry has been failed
said:<dialogue>:<node>:<option>   a once only option has been taken
quest:<quest>:<objective>:count   counted objective progress
ending:<arc>                      an ending arc has been reached`}</Code>

      <h2>Lore</h2>
      <ul>
        <li>A <code>learnLore</code> effect is the only thing that teaches lore.</li>
        <li>A <code>loreThread</code> groups entries. Read it as <code>threads.&lt;id&gt;.known</code>.</li>
        <li><code>requirement.lore</code> gates on it.</li>
      </ul>
      <p>Lore no effect teaches is reported as <code>unlearnable_lore</code>.</p>

      <h2>Deeds</h2>
      <p>Three things record a deed:</p>
      <ul>
        <li><code>quest.remembersAs</code> when a quest finishes.</li>
        <li><code>dialogueNode.remembers</code> when a line is reached.</li>
        <li>An <code>emit</code> effect anywhere.</li>
      </ul>
      <p>
        <code>npc.caresAbout</code> lists the kinds a person takes personally. Those fade slower in
        their memory. The <Link href="/format/narrative">memory model</Link> decides who saw it,
        who they told, and how the story changed on the way.
      </p>

      <h2>Arcs</h2>
      <p>
        An arc groups quests. Read it as <code>arcs.&lt;id&gt;</code>. Finishing an arc marked{' '}
        <code>isEnding</code> ends the run, unless <code>start.postVictory</code> is{' '}
        <code>continue</code>.
      </p>

      <h2>The whole graph</h2>
      <Code>{`npc ──dialogue──> dialogue ──(node ids only, never global)──> node
 │ │ │
 │ │ └──offersQuests──> quest ──unlocks──> quest ──> arc ──isEnding──> the end
 │ │                      │
 │ │                      ├──rewards.items──> item
 │ │                      ├──rewards.reputation──> faction
 │ │                      └──remembersAs──> deedKind
 │ │
 │ ├──statblock──> monster ──loot──> lootTable ──> item
 │ ├──faction──> faction ──relations──> faction
 │ ├──caresAbout──> deedKind
 │ └──home──> point of interest <──residents── point of interest
 │                    │
 │                    ├──area──> area ──biome──> biome
 │                    ├──gate──> gate
 │                    └──dungeon──> dungeon ──biome──> biome

effect learnLore ──> lore <──entries── loreThread`}</Code>
      <p>Every arrow is a checked reference except the ones named above.</p>
    </Page>
  );
}
