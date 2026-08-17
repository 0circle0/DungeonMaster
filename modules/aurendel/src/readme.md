# Building Aurendel

Four commands. The first three each rewrite their output wholesale; the fourth
only reads.

```
python3 modules/core_fantasy/gen_core.py      → core_fantasy/module.json
python3 modules/aurendel/src/staticmaps.py    → the 14 maps/*/ folders
python3 modules/aurendel/src/build.py         → aurendel/module.json
python3 modules/aurendel/src/check_quests.py    (reads the built module, reports)
npm run validate -- modules/aurendel
```

Order matters: `build.py` reads `core_fantasy/module.json` to copy the ruleset
in, so regenerate that one first if you have changed it.

**These overwrite, they do not merge.** Any hand-edit to `module.json` is
destroyed the next time `build.py` runs. The same goes for the map CSVs and
`staticmaps.py`, and that one bites harder than it looks, because the Studio
has a map-painter write path (`PUT /api/modules/[name]/maps/[mapId]`). Paint a
map in the Studio, then run `staticmaps.py`, and the painting is gone.

So pick one source of truth per file and stick to it. Either the world is
edited in Python and regenerated, or it is edited in JSON/Studio and the
generators become read-only reference. Mixing is what loses work.

## Layout

The shared authoring API is `modules/shared/dmkit` — see
[its README](../../shared/README.md) for what it provides and what a module
owes it in return. This directory holds Aurendel, and only Aurendel.

```
_bootstrap.py    sys.path. Imported FIRST by the three entry points; see below
build.py         assembles module.json
staticmaps.py    the 14 hand-drawn interiors
check_quests.py  Aurendel's contracts + the ordered check list

materials.py     77 terrains, 34 palettes (incl. the 9 interiors), 25 biomes
prose.py         the 9 interior + 10 generic place pools
ambience.py      the 17 biome ambience pools
place.py         SIZES/TRADE_PALETTE/ROOM_SIZES/KIND_POOL + the 17 shorthands
rooms.py         ROLES, the 8 room families, the 10 traps
lore.py          VOICE — the seven player-facing lines
items.py         SIDE_GEAR, ITEMS, CLASS_KIT, PARTY_KIT
bestiary.py      24 abilities, the monsters — and `creature`'s world defaults
loot.py          loot tables, encounter tables, what each biome and area draws
factions.py      the six continental powers, deeds, the memory model
sidefactions.py  the nine regional powers
roads.py         the 23 inter-region highways
hiddenspace.py   the frozen snapshot of the 61 empty areas

acts.py          ACT_GATES — which quest opens which act
postgame.py      TIER_GATES, PROOFS, AFTER_THE_ENDING

regions.py       the 12 region modules + start()
story.py         the acts, chains, threads and trials + the ending arc
r01..r12_*.py    one region each
act1/2/3.py      the spine
side_*.py        15 optional chains
hidden_*.py      12 lore threads
trial_*.py       3 post-game tiers
```

## The two rules for editing this directory

**`import _bootstrap` comes first in an entry point, and nowhere else.**
It puts `modules/shared` and this directory on `sys.path`, in that order.
Content files never import it — by the time one is loaded, an entry point has
already run. `regions.py` and `story.py` reach their region and act files by
`importlib` on a bare name, and `check_quests.py` reaches the trial modules the
same way, so all of them depend on this directory staying at `sys.path[0]`.

Editor support for both of those comes from `pyrightconfig.json` at the repo
root: it tells Pylance the search path `_bootstrap.py` builds at runtime, which
no static analyser can infer from a `sys.path.insert`. Type checking is off
there on purpose — this Python carries no annotations and is verified by
rebuilding and diffing its output — but missing imports and undefined names
stay hard errors. `npx pyright` and the editor read the same file, so they
agree.

**Do not run an autoformatter over this directory.** Thirty-nine imports in
`hidden_*.py` and `trial_*.py` sit *below* the data they follow, marked
`# noqa: E402`, and one in `trial_one.py` sits below data that uses it.
Hoisting them changes construction order or raises `NameError`. `isort`,
`black` and `ruff --fix` will all do it.

## What is Aurendel's, and what is shared

Aurendel's `bestiary.creature` is a **wrapper**, not a re-export: it supplies
`faction="the_unsealed"` and `creature_type="undead"`, which are facts about
this world. Both are *required* arguments in `dmkit.bestiary.creature`, so
importing that one by mistake is a `TypeError` at import rather than a monster
quietly fighting on the wrong side. The `loot` constructors have no such
defaults, which is why `hidden_*.py` imports those straight from `dmkit.loot`
and its bestiary imports from here.

The same shape recurs everywhere, because **`dmkit` names nothing** — no
terrain, no palette, no pool, no room, no sentence a player can read. Each of
`place.py`, `rooms.py`, `prose.py`, `lore.py`, `acts.py` and `postgame.py` is a
thin binding of one kit to Aurendel's vocabulary, and the region and thread
files import from those rather than from `dmkit` directly. Where guessing would
have been silently wrong the kit refuses instead: `poi()` requires `desc_key`,
`Map` requires its three terrain tables, `creature()` requires `faction`.

`acts.py` exists for the same kind of reason. `ACT_GATES["act3"]` is
`act3.TWO_KEYS` — "two of the three routes are done" is one fact about a run
and has one definition. A shared kit may not import story content, so
`dmkit.chains.chain()` takes the gate as an argument and this file supplies it.

## core_fantasy is the ruleset, and not a runtime layer

The engine has never heard of it. It holds how characters work with no world
attached: `rules` (6 attributes, HP/Focus, 10 damage types, 10 conditions, 3
saves, d20 resolution, 20 levels, senses, stances, spellcasting), `content` (16
skills, 13 abilities, 5 ancestries, 5 classes), all 198 `narrative.systemText`
sentences, and a token `nowhere` area so it validates on its own.

Aurendel's rules, character content and systemText are byte-identical copies of
it, made at **build** time. `aurendel/module.json` is entirely self-contained;
deleting `core_fantasy` would not affect play.

It is a copy rather than an inheritance because `extends: "core_fantasy@1.0.0"`
does not survive validation: the linter schema-checks the raw child before
resolving the merge (`bin/validate.ts:59` → `diagnostics/lint.ts:1023`), so a
module without its own `rules` block fails with "attributes is required". One
source of truth in the generator, two standalone modules on disk.

A second world reuses `core_fantasy` the same way and gets the ruleset free.

## Verifying a change

The generators are deterministic, and their output is committed — so the test
is that nothing moved:

```bash
python3 modules/core_fantasy/gen_core.py
python3 modules/aurendel/src/staticmaps.py
python3 modules/aurendel/src/build.py
git status --porcelain modules/          # empty unless you meant to change something
python3 modules/aurendel/src/check_quests.py
npm run validate -- modules/aurendel
```

`check_quests.py` reports zero problems and zero warnings today, so *identical
output does not prove a check still works*. If you change the linter, break the
built document on purpose — one mutation per check — and confirm each one still
produces the diagnostic it used to.

Note that `npm` commands here need a pty (`script -qc "npm run validate --
modules/aurendel" /dev/null`); the snap `node` sends stdout to `/dev/null` when
it is not attached to a terminal, which reads as a silent pass.
