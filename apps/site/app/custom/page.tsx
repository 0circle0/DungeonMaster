import Link from 'next/link';
import { Page, Note, Code } from '../../components/Page';

export default function CustomPage() {
  return (
    <Page
      here="/custom"
      title="Your own JSON"
      lede="Six ways to put data and behaviour the format never anticipated into your world."
    >
      <p>Every object in the format rejects a property it does not recognise. Adding your own goes through one of these.</p>

      <h2>1. The extra bag</h2>
      <p>Most entities carry an <code>extra</code> object. The engine passes it through untouched.</p>
      <Code>{`{ "id": "bog_hound",
  "extra": { "morale": 6, "packLeader": true, "houseRule": "hates iron" } }`}</Code>
      <Note title="extra is not readable from a formula">
        It survives export, reaches mods, and shows in the editor. It is not in the scope a{' '}
        <code>ref</code> path walks, so a <Link href="/formulas">formula</Link> cannot read it.
        Use a flag for data a formula needs.
      </Note>
      <Note title="Not everything has one">
        No narrative entity does: not text pools, dialogues, nodes, options, quests, stages,
        objectives, arcs, lore, threads, or deed kinds. Nor do loot tables and their entries,
        traps, factions, NPCs, reactions, gates, encounter tables, or most simple rules
        collections. Use a flag or an id convention there.
      </Note>

      <h2>2. A custom predicate</h2>
      <p>
        Every <Link href="/format/requirements">requirement</Link> carries <code>custom</code>,
        which takes a raw predicate. It runs alongside the other clauses. All must hold.
      </p>
      <Code>{`"requires": {
  "minLevel": 3,
  "custom": { "any": [ { "gte": [ { "ref": "reputation.wardens" }, 20 ] },
                       { "test": { "ref": "flags.spoke_for_us" } } ] } }`}</Code>

      <h2>3. Your own events</h2>
      <p>
        The <code>emit</code> effect plus <code>on: &quot;custom&quot;</code> is an event bus.
        Quests, triggers, reactions, and opportunities all watch it.
      </p>
      <Code>{`// an effect emits
{ "emit": { "event": "bell_rung", "data": { "tower": "west" } } }

// a trigger listens
{ "id": "the_answer", "on": "custom", "event": "bell_rung",
  "mode": "once", "effects": [ ... ] }

// an objective completes on it
{ "id": "ring_it", "kind": "reach", "target": "bell_rung" }`}</Code>

      <h2>4. Flags</h2>
      <p>
        An arbitrary key holding a string, a number, or a boolean.{' '}
        <code>start.initialFlags</code> seeds them, <code>setFlag</code> writes them,{' '}
        <code>flags.&lt;name&gt;</code> reads them. Nothing checks the spelling. Keep a prefix
        convention. See <Link href="/linking">linking</Link> for the ones the engine writes.
      </p>

      <h2>5. Tags</h2>
      <p>Most entities carry a free <code>tags</code> list. Two places read them:</p>
      <table className="plain">
        <tbody>
          <tr><td><code>npc.shop.buysTags</code></td><td>What a merchant will buy.</td></tr>
          <tr><td><code>damageInteraction.unless</code></td><td>Damage tags that cancel an immunity. Immune to slashing except silvered.</td></tr>
        </tbody>
      </table>
      <p>Everywhere else they are yours, for filtering and for your own predicates.</p>

      <h2>6. Layering on another world</h2>
      <Code>{`{ "id": "more_husks", "extends": "aurendel@1.0.0",
  "content": { "monsters": [ { "id": "husk", "xp": 25 },
                             { "id": "old_husk", "$delete": true } ] } }`}</Code>
      <table className="plain">
        <tbody>
          <tr><td>Collections</td><td>Merge by id. An existing id is overridden field by field. A new one is added.</td></tr>
          <tr><td>Other objects</td><td>Merge key by key.</td></tr>
          <tr><td>Other arrays</td><td>Replaced whole.</td></tr>
          <tr><td><code>{'{ "$delete": true }'}</code></td><td>Removes an inherited entry.</td></tr>
          <tr><td>Cycles</td><td>Rejected.</td></tr>
        </tbody>
      </table>
      <Note title="Your document is checked before the merge">
        Something that only becomes valid once the base is folded in is reported as broken.
        <code>extends</code> overrides whole entries; it does not supply half of one.
      </Note>

      <h2>Beyond JSON: mods</h2>
      <p>
        A mod is code in a sandbox. Your world lists the ones it expects under <code>mods</code>,
        each pinned by id and by a fingerprint of its contents. A changed mod is reported, not run.
      </p>
      <p>Ten attachment points:</p>
      <p>
        before an action · after an action · an unrecognised operation · an occasion · after the
        world settles · after time passes · whether a trigger fires · passives · reactions · events
        being emitted
      </p>
      <ul>
        <li>No clock, no ambient randomness. A modded run still replays exactly.</li>
        <li>A mod cannot make a valid world invalid, so it cannot block an export.</li>
      </ul>

      <h2>While building: prefabs</h2>
      <ul>
        <li>A template for an entry, with named parameters and lookups against your own tables.</li>
        <li>Four strings become an eleven key entry.</li>
        <li>Instances stay linked. Editing a prefab shows the fan out first, and which fields you overrode by hand.</li>
        <li>Prefabs stay in the studio and never appear in the exported JSON.</li>
      </ul>
    </Page>
  );
}
