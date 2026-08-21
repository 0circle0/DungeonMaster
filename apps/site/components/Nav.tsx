/** The site's one navigation list, so a new page is added in one place. */

import Link from 'next/link';

/** The two apps this site documents. */
export const APPS: readonly { href: string; label: string; blurb: string }[] = [
  {
    href: 'https://studio.dnddungeon.com',
    label: 'Studio',
    blurb: 'Build and edit worlds in the browser. Nothing is uploaded.',
  },
  {
    href: 'https://play.dnddungeon.com',
    label: 'Player',
    blurb: 'Open a world file and play it. Examples included.',
  },
];

export const NAV: readonly { href: string; label: string; blurb: string; group: string }[] = [
  { group: 'Start', href: '/', label: 'Overview', blurb: 'What a world is, in five minutes.' },
  { group: 'Start', href: '/linking', label: 'Linking things together', blurb: 'How quests, people, places, and lore join up.' },
  { group: 'Start', href: '/formulas', label: 'Writing formulas', blurb: 'The JSON language behind every condition and effect.' },
  { group: 'Start', href: '/custom', label: 'Your own JSON', blurb: 'extra, custom predicates, flags, layering, mods.' },

  { group: 'Format', href: '/format', label: 'The document', blurb: 'How to read the reference, and the rules ids follow.' },
  { group: 'Format', href: '/format/module', label: 'Top level and start', blurb: 'meta, mods, start, character creation.' },
  { group: 'Format', href: '/format/rules', label: 'rules', blurb: 'Attributes, resources, conditions, dice, progression.' },
  { group: 'Format', href: '/format/content', label: 'content', blurb: 'Abilities, items, monsters, NPCs, factions.' },
  { group: 'Format', href: '/format/world', label: 'world', blurb: 'Biomes, areas, places, dungeons, maps, time.' },
  { group: 'Format', href: '/format/narrative', label: 'narrative', blurb: 'Text, dialogue, quests, lore, memory.' },
  { group: 'Format', href: '/format/requirements', label: 'requirements', blurb: 'The one gating vocabulary, used everywhere.' },
  { group: 'Format', href: '/format/dsl', label: 'The DSL', blurb: 'Expressions, predicates, effects, dice.' },
  { group: 'Format', href: '/format/systemtext', label: 'systemText', blurb: 'Every sentence the engine says.' },

  { group: 'Internals', href: '/engine', label: 'The engine', blurb: 'How a turn runs, and why it replays exactly.' },
  { group: 'Internals', href: '/editor', label: 'The studio', blurb: 'What the editor gives you.' },
];

const GROUPS = ['Start', 'Format', 'Internals'] as const;

export function Nav({ here }: { here: string }) {
  return (
    <nav className="nav">
      <Link href="/" className="brand">DungeonMaster</Link>

      {/*
        Above the documentation, not among it. These are the two applications; everything below
        is writing about them. A reader three pages into the format reference should be one click
        from the studio, without going back to the landing page to find it.
      */}
      <div className="nav-apps">
        {APPS.map((app) => (
          <a key={app.href} href={app.href} className="nav-app">{app.label}</a>
        ))}
      </div>

      {GROUPS.map((group) => (
        <div key={group} className="nav-group">
          <div className="nav-head">{group}</div>
          {NAV.filter((item) => item.group === group).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.href === here ? 'nav-item on' : 'nav-item'}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
