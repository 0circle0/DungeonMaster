import Link from 'next/link';
import { Nav, NAV } from '../components/Nav';
import { Code } from '../components/Page';
import { formatSize } from '../lib/fields';

export default function Home() {
  const size = formatSize();
  return (
    <div className="shell">
      <aside className="side"><Nav here="/" /></aside>
      <main className="main">
        <div className="hero">
          <p className="tag">A text RPG runtime</p>
          <h1>An entire game is one JSON document.</h1>
          <p className="lede">
            Rules, skills, classes, monsters, places, and quests are written as JSON. The game is
            derived from it. Write a world, export a file, play it. Aurendel, the world that comes
            with it, is the first one written for it.
          </p>

          <div className="stats">
            <div className="stat"><b>{size.fields}</b><span>fields in the format</span></div>
            <div className="stat"><b>{size.collections}</b><span>addressable collections</span></div>
            <div className="stat"><b>{size.messages}</b><span>engine messages you can rewrite</span></div>
            <div className="stat"><b>0</b><span>things hardcoded in the engine</span></div>
          </div>
        </div>

        <h2>Three things to know</h2>
        <ol>
          <li>
            <b>Nothing is hardcoded.</b> No attributes, damage types, conditions, or level curve
            come with the engine. You declare them. Strength, hit points, and twenty levels are
            not assumed. Vigor, Wits, and a resource called Vitality work the same.
          </li>
          <li>
            <b>Runs replay exactly.</b> A save carries the dice with it. The same starting number
            and the same choices reproduce a run move for move.
          </li>
          <li>
            <b>The engine states facts, never sentences.</b> It reports a hit for seven. Your
            world supplies the words, in any language.
          </li>
        </ol>

        <h2>The five parts of a world</h2>
        <Code>{`{
  "id": "my_game", "version": "1.0.0",
  "meta":      { "title": "My Game" },

  "rules":     { /* attributes, resources, conditions, dice, the level curve */ },
  "content":   { /* abilities, items, monsters, NPCs, factions */ },
  "world":     { /* biomes, areas, points of interest, dungeons, maps */ },
  "narrative": { /* text, dialogue, quests, lore, memory */ },
  "start":     { /* party size, character creation, where play begins */ }
}`}</Code>
        <p>
          An unrecognised property is refused when the world loads, with a line number and usually
          a suggestion. Adding data of your own goes{' '}
          <Link href="/custom">through one of six mechanisms</Link>.
        </p>

        <h2>One vocabulary for gating</h2>
        <p>
          Loot limited by mastery, a door needing a key, dialogue that appears once a faction
          trusts you, a monster reacting to what it remembers. One{' '}
          <Link href="/format/requirements">requirement object</Link>, used in sixteen places.
        </p>

        <h2>Where to go</h2>
        <div className="cards">
          {NAV.filter((item) => item.href !== '/').map((item) => (
            <Link key={item.href} href={item.href} className="card">
              <b>{item.label}</b>
              <span>{item.blurb}</span>
            </Link>
          ))}
        </div>

        <h2>Getting started</h2>
        <ol>
          <li>Open the studio. Pick <b>New world</b>, <b>Examples</b>, or <b>Open a file</b>.</li>
          <li>Build. Worlds save in your browser as you work. Nothing is uploaded.</li>
          <li><b>Export</b> to get a world file.</li>
          <li>Open that file in the player.</li>
        </ol>
        <p>
          <Link href="/editor">The studio</Link> covers the editor.{' '}
          <Link href="/format">The document</Link> covers writing the JSON directly.
        </p>
      </main>
    </div>
  );
}
