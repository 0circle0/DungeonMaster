# `modules/shared` — the module-authoring API

This directory holds `dmkit`, the Python package the world modules are written
against. It is **not a module**: it has no `module.json`, and `listModules()`
(`packages/module/src/load.ts`) enumerates only directories that have one — so
the validator, the Studio editor and the test suite never see it.

Aurendel is 27,000 lines of Python that emit a 2.9 MB `module.json`. About a
tenth of that is the engine's shape rather than Aurendel's content: how a quest
objective is spelled, why a dialogue node with no options strands the player,
what `world.areas[].connections` being one-directional means for a road. That
part lives here, so the next world starts from it instead of from a copy.

## Using it

A module's generators put this directory on `sys.path` and import by package:

```python
from dmkit.quests import quest, reach, kill
from dmkit.places import area, poi, inn, smithy
```

See `modules/aurendel/src/_bootstrap.py` for the lines that do it, and
`modules/aurendel/src/readme.md` for how the pieces fit together.

Because that path is built at runtime, editors cannot infer it. `pyrightconfig.json`
at the repo root declares the same search path statically, with one
`executionEnvironments` entry per module `src/` — **a new module needs an entry
added there**, or every `dmkit` import in it will read as unresolved.

## The rule: `dmkit` names nothing

**No ids and no prose.** It knows the *shape* of a terrain, a palette, a text
pool, a room and a refusal; it never names or writes one. Grep it for a terrain
id or a sentence a player could read and you should find neither — there is an
audit for exactly that in the session notes, and it comes back empty.

That is why so many constructors take a vocabulary rather than assuming one:

| the kit shapes | your module supplies |
| --- | --- |
| `places.area(size=…)` | what a city, town or village measures |
| `places.poi(desc_key=…, palette=…, footprint=…)` | which palette a smithy gets, which pool an unnamed shrine falls back on, what an interior measures |
| `dungeons.family(roles=…, role_names=…, texts=…)` | what rooms a dungeon is made of, their weights, and every sentence they say |
| `maps.Map` subclass | `TERRAIN`, `MARKER`, `IMPASSABLE` — your art characters and terrain ids |
| `lore.rumour/favour/talk(voice=…)` | the seven player-facing lines, including how somebody refuses |
| `bestiary.creature(faction=…, creature_type=…)` | which side a monster is on |
| `materials.terrains/palettes/biomes(rows)` | the whole vocabulary |
| `chains.chain(gate=…)` / `trials.tier(gate=…)` | which quest opens which act |
| `lint.run(checks, contract)` | the check list, and the contracts only you know |

Where a shared default would have been a silent wrong answer, the argument is
**required** rather than defaulted — `creature(faction=…)`, `poi(desc_key=…)`,
and `Map`'s three tables all raise rather than guess. A monster on the wrong
side or a place narrating as something else validates perfectly and is found by
nobody.

`modules/aurendel/src/` is the worked example of all of it: `place.py`,
`rooms.py`, `prose.py`, `lore.py`, `acts.py` and `postgame.py` are each a thin
binding of one kit to one world's vocabulary.

## What stays in a module

Anything that is a fact about *your world* rather than about the engine: the
act structure, the regions, the factions and what they remember, the monsters,
the level bands, the prose, and the contracts your linter asserts.
`dmkit.chains.chain()` takes the act gate as an argument for exactly this
reason — a shared kit may not import story content, and an earlier version of
this code did, which is what made the geography build depend on the third act's
ending predicate.

The one thing `dmkit` does encode is the **engine**: that `objective.target` is
not a ref, that a dialogue node with no options ends the conversation, that
`role === 'boss'` is read when placing a boss room, that `weaponOf` wants
`kind: "weapon"` *and* `damage`. Those are facts, not choices, and they are
what the docstrings are for.

## Known limitation: one module per process

`_bootstrap.py` puts a module's own `src/` on `sys.path` alongside this
directory. That is fine while each generator is its own process, which is how
they are run today. A future "build every module" driver running in one process
would find the first module's `prose`/`items`/`loot` already imported under
those bare names, and the second world would silently build against them. The
fix, if that day comes, is to make the content directories packages too and
their sibling imports relative. Do not assume it has been done.
