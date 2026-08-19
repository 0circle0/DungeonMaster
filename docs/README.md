# DungeonMaster documentation

A text RPG where **an entire game is a JSON document**.

You are the Dungeon Master. You write the rules; the engine follows them exactly. Where you want the world to surprise you, you hand it a dial and let it run.

## Start here

| Guide | What it covers |
| --- | --- |
| [Concepts](concepts.md) | How a module is put together, and why it is shaped this way |
| [Requirements](requirements.md) | The one gating vocabulary — used by loot, doors, dialogue, quests, reactions |
| [The DSL](dsl.md) | Writing behaviour as JSON |
| [Memory & gossip](memory.md) | Emergence: witnessing, forgetting, rumour, and simulated learning |
| [Validation](validation.md) | What the validator catches, and how to read what it tells you |
| [Reference](reference.md) | Every field in the format — generated from the schemas |

All of this, plus a writeup of the engine and of the studio, is also a site:
`npm run site` serves it on http://localhost:4600. Its field tables are generated
from the same schemas as [reference.md](reference.md), with a one-line
description per field from `packages/module/src/schema/fieldDocs.ts`.

## The five-minute version

A module has five parts:

```jsonc
{
  "rules":     { /* attributes, resources, conditions, dice — the system */ },
  "content":   { /* abilities, items, monsters, NPCs, factions — the things */ },
  "world":     { /* biomes → areas → points of interest — the places */ },
  "narrative": { /* text, dialogue, quests, memory — the story */ },
  "start":     { /* party size, character creation, where play begins */ }
}
```

Try it:

```bash
npm run editor                        # author it
npm run validate -- modules/greenmarch  # check it
npm run play                            # play it in the browser
```

`modules/greenmarch` is a complete worked example. `modules/minimal` is the smallest module that runs.

## Three ideas worth knowing up front

**Nothing is hardcoded.** The engine ships with no attributes, no hit points, no damage types, no level curve. It reads all of it from your module. `modules/minimal` proves it: its attributes are Vigor and Wits, its vital resource is Vitality, and it plays.

**Gating is one vocabulary.** Loot limited by mastery, a door needing a key, a line of dialogue that appears only once a faction trusts you, a monster that reacts to what it remembers — all the same [requirement](requirements.md) object. Learn it once.

**Everyone acts.** Player characters are not the only ones who roll dice. Monsters and NPCs have reactions gated on *their* memory, *their* faction, *their* state. A hound goes berserk when its packmate dies; a miller stops trading with you because she heard what you did.

## Expanding past what ships

Every substantial entity carries an `extra` object — an open bag of your own data. The engine passes it through untouched and your content reads it with `{ "ref": "…" }`:

```jsonc
{
  "id": "bog_hound",
  "extra": { "morale": 6, "packLeader": true, "houseRule": "hates iron" }
}
```

Nothing in the format needs to anticipate your idea. If you need a stat the schema has never heard of, put it in `extra` and reference it from a predicate. This is supported, not a workaround.
