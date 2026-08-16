Three commands, each rewriting its output wholesale:


python3 modules/core_fantasy/gen_core.py      → core_fantasy/module.json
python3 modules/aurendel/src/staticmaps.py    → the 14 maps/*/ folders
python3 modules/aurendel/src/build.py         → aurendel/module.json  (29,583 lines)
Order matters: build.py reads core_fantasy/module.json to copy the ruleset in, so regenerate that one first if you've changed it.

The warning: these overwrite, they don't merge. Any hand-edit to module.json is destroyed the next time build.py runs. Same for the map CSVs and staticmaps.py — and that one bites harder than it looks, because your Studio has a map-painter write path (PUT /api/modules/[name]/maps/[mapId]). Paint a map in the Studio, then run staticmaps.py, and your painting is gone.

So pick one source of truth per file and stick to it. Either the world is edited in Python and regenerated, or it's edited in JSON/Studio and the generators become read-only reference. Mixing is what loses work.

2) core_fantasy is the ruleset — but not a runtime layer
Your instinct is close; the one correction is that the engine has never heard of it.

It holds how characters work, with no world attached:

rules — 6 attributes, HP/Focus, 10 damage types, 10 conditions, 3 saves, d20 resolution, 20 levels, senses, stances, spellcasting
content — 16 skills, 13 abilities, 5 ancestries, 5 classes
narrative.systemText — all 198 sentences the engine says ("You are 5 the poorer", "The King's Gate opens")
a token nowhere area, purely so it validates on its own
Aurendel's rules, character content, and systemText are byte-identical copies of it. Verified just now. That copy happens at build time, not at runtime — aurendel/module.json is entirely self-contained, and deleting core_fantasy wouldn't affect play at all.

The reason it's a copy rather than an inheritance: I tried extends: "core_fantasy@1.0.0" first, and npm run validate rejects it — the linter schema-checks the raw child before resolving the merge, so a module without its own rules block fails. Hence: one source of truth in the generator, two standalone modules on disk.

What Aurendel adds on top: 108 areas, 597 POIs, 68 dungeons, 77 terrains, 10 traps, 347 text pools.

The practical upshot — a second world can reuse core_fantasy the same way and get an identical ruleset for free.

