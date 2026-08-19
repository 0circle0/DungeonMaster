import Link from 'next/link';
import { Page, Note } from '../../components/Page';

export default function EditorPage() {
  return (
    <Page
      here="/editor"
      title="The studio"
      lede="The editor. What it shows you, what it checks, and what it will build for you."
    >
      <p>
        Runs in your browser. No account, no upload, no server. Your worlds are stored on the
        machine you edit on. The only copy that leaves it is the one you export.
      </p>

      <h2>Layout</h2>
      <table className="plain">
        <tbody>
          <tr><td>Toolbar</td><td>World switcher, new, load, export, undo and redo, where play begins, mods, rules, and a valid or invalid light.</td></tr>
          <tr><td>Dock</td><td>Five tabs: World, Content, Rules, Story, Module. Each collection shows a count and a problem count.</td></tr>
          <tr><td>World tree</td><td>Biome, area, and place nesting. Start pinned on top. Marks hand drawn maps against generated ones, and who lives where.</td></tr>
          <tr><td>Viewport</td><td>Map, the current table, then eight analysis views.</td></tr>
          <tr><td>Inspector</td><td>A form for the selection, plus any generators that apply to it.</td></tr>
          <tr><td>Problems</td><td>Errors, warnings, notes. Each row jumps to the field.</td></tr>
          <tr><td>Command palette</td><td>Every entry, collection, view, and action. Around 2,300 items in a large world.</td></tr>
        </tbody>
      </table>

      <h2>Forms</h2>
      <ul>
        <li>Built from the same definition your world is checked against. Forms and <Link href="/format">the reference</Link> cannot disagree.</li>
        <li>A reference field is a dropdown of ids that exist.</li>
        <li>Field order: identity, then the ones that matter most, then format order, then your <code>extra</code> data.</li>
        <li>The <Link href="/format/dsl">DSL</Link> is edited as raw JSON.</li>
        <li>Every entry has Rename, Duplicate, Delete, Save as prefab, Move, and its own raw JSON.</li>
        <li>Used by shows what points at the selected entry.</li>
      </ul>
      <Note title="Fields the engine does not read">
        A handful are accepted, checked, and exported, then never read during play. The studio
        says so under the form, and this reference says so in the field description.
      </Note>

      <h2>What it checks</h2>
      <p>Every problem gives a location, what is wrong, and a code you can filter on.</p>
      <p><b>As you type.</b></p>
      <ul>
        <li>Whether it is valid JSON, with a line, a column, and a caret. Missing brackets, trailing commas, single quotes, missing commas, unquoted values, bad escapes, and comments.</li>
        <li>Whether every field exists and holds the right type.</li>
        <li>Whether every DSL operator is real.</li>
        <li>Whether every id you reference resolves, and whether any id is used twice.</li>
        <li>Whether your dungeon and map settings can be satisfied.</li>
      </ul>
      <p>Around thirty codes. Typos get a suggestion, or a list of valid options when nothing is close.</p>
      <p><b>When you pause.</b> Ten rules about whether the world makes sense:</p>
      <table className="plain">
        <tbody>
          <tr><td>An objective points at something that is not there.</td></tr>
          <tr><td>A flag nothing ever sets.</td></tr>
          <tr><td>A flag set only by something unreachable.</td></tr>
          <tr><td>A road that goes one way by accident.</td></tr>
          <tr><td>A reward handed over before the roll that decides it.</td></tr>
          <tr><td>A hidden place with no way of being found.</td></tr>
          <tr><td>A discovery formula naming a lore thread that does not exist.</td></tr>
          <tr><td>A quest nothing can offer.</td></tr>
          <tr><td>A monster an objective wants killed that never appears.</td></tr>
          <tr><td>A conversation nobody can open.</td></tr>
        </tbody>
      </table>
      <p>
        Notes are hidden behind a checkbox. Rules can be turned off, and the setting stays with
        you rather than travelling with the file. You can also record decisions you have already
        made, such as which quests gate an act, and a rule will stop reporting them.
      </p>
      <p><b>Also when you pause.</b> Anything your installed mods report. A mod cannot make a valid world invalid.</p>

      <h2>Analysis views</h2>
      <table className="plain">
        <tbody>
          <tr><td>Map</td><td>The dungeon this starting number produces, with a reroll.</td></tr>
          <tr><td>Balance</td><td>Rolls your loot and encounter tables thousands of times.</td></tr>
          <tr><td>Dialogue graph</td><td>Every node and edge in a conversation.</td></tr>
          <tr><td>Timeline</td><td>Runs your memory settings forward day by day.</td></tr>
          <tr><td>Perception</td><td>What can see, hear, or smell what, and from how far.</td></tr>
          <tr><td>Events</td><td>Every gate in the world, with its condition in plain language.</td></tr>
          <tr><td>Orphans</td><td>Entries nothing references.</td></tr>
          <tr><td>Prefabs</td><td>Templates, their instances, and your overrides.</td></tr>
          <tr><td>Raw JSON</td><td>The document as it will export.</td></tr>
        </tbody>
      </table>
      <p>Each runs the real generators, tables, and senses, at the same starting number the game uses.</p>

      <h2>Generators</h2>
      <p>All show you the result before applying it.</p>
      <table className="plain">
        <tbody>
          <tr><td>Dungeon fit</td><td>Builds the dungeon several times, reports what it really produces, and offers a size that matches. Fifteen rooms often comes out as two.</td></tr>
          <tr><td>Lay out</td><td>Ring positions for places that have none. Skips anything already placed.</td></tr>
          <tr><td>Roads</td><td>Edits both directions of a connection together. One way is a checkbox.</td></tr>
          <tr><td>Quest chain</td><td>Reads the chain shape from what you wrote, names the missing piece, and wires the next link.</td></tr>
          <tr><td>Dialogue pieces</td><td>Adds a rumour, a favour, or small talk, with the payoff on the success node.</td></tr>
          <tr><td>Description</td><td>Creates, names, and links a text pool in one edit. Refuses to edit a shared pool.</td></tr>
          <tr><td>Hidden</td><td>Five values become a discovery formula. Reads existing ones back.</td></tr>
          <tr><td>Noticing</td><td>An arrival trigger that teaches a clue.</td></tr>
          <tr><td>Thread</td><td>A lore thread and everywhere its clues are anchored.</td></tr>
          <tr><td>Map painter</td><td>Paint, erase, rectangle, and eyedropper across map layers. One undo step per stroke.</td></tr>
          <tr><td>Prefabs</td><td>Four strings become a full entry. Editing a prefab tells you it will update thirty six inns before it does.</td></tr>
          <tr><td>Rename</td><td>Changes an id everywhere, and names the places it could not, such as an objective target or a flag.</td></tr>
        </tbody>
      </table>

      <h2>Starting a world</h2>
      <p>
        A new world is the smallest valid one, with no starting location and no areas. The
        problems panel opens as a to do list.
      </p>
      <p>
        The composer copies a ruleset from any world you have. Tick from thirteen sections. Ticking
        classes pulls in attributes. Unticking something drops whatever depended on it. Wording is
        one checkbox.
      </p>
      <p>Examples ship with the studio and are yours to edit once loaded.</p>

      <h2>Storage</h2>
      <ul>
        <li>Worlds live in your browser. Two worlds may share a name and an id.</li>
        <li>Saving happens on its own while you pause.</li>
        <li>An invalid document is kept as a draft and offered back next time you open the world.</li>
        <li>Export writes exactly what you wrote, with no defaults filled in.</li>
        <li>Opening accepts an exported file, a hand written world, or either compressed.</li>
      </ul>
      <Note title="Nothing is backed up">
        Export the worlds you care about.
      </Note>

      <h2>Playing your world</h2>
      <p>
        Export, then open the file in the player. The studio has no play button. What the player
        loads is the file anyone else would receive.
      </p>
    </Page>
  );
}
