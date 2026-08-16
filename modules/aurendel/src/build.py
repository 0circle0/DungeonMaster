#!/usr/bin/env python3
"""Assemble modules/aurendel/module.json from the stage files in this directory.

    python3 build.py && npm run validate -- modules/aurendel

`extends: "core_fantasy@1.0.0"` was the obvious way to get the ruleset in, and
it does not survive validation: `npm run validate` lints the **raw** document
before resolving extends (bin/validate.ts:59 → diagnostics/lint.ts:1023), so a
child that leans on its parent for `rules` fails the schema pass with
"attributes is required", and `$delete` markers fail it too. Only `mods` may
carry `$delete` in a raw document.

So the ruleset is *composed in* here instead. `modules/core_fantasy` stays the
canonical base module and this script copies its rules, its character content,
and its 198 system-text messages into the world. One source of truth, two
standalone modules on disk — which is what the tooling wants.
"""
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "modules/aurendel")
BASE = os.path.join(ROOT, "modules/core_fantasy/module.json")

import materials  # noqa: E402
import prose  # noqa: E402
import factions  # noqa: E402
import items  # noqa: E402
import bestiary  # noqa: E402
import loot  # noqa: E402
import story  # noqa: E402

try:
    import regions  # noqa: E402
except ImportError:
    regions = None


def load_base():
    with open(BASE) as f:
        return json.load(f)


def main():
    base = load_base()

    areas = regions.areas() if regions else []
    pois = regions.pois() if regions else []
    gates = regions.gates() if regions else []
    dungeons = regions.dungeons() if regions else []
    room_templates = regions.room_templates() if regions else []
    biome_list = materials.biomes()

    if regions:
        regions.attach_room_templates(biome_list)
    # The questline turns its own route live — encounters, loot, and rooms
    # that are not empty — and leaves the rest of the continent alone.
    story.attach_content(biome_list, dungeons, room_templates, areas)
    story.attach_triggers(pois)

    world = {
        "terrains": materials.terrains(),
        "palettes": materials.palettes(),
        "biomes": biome_list,
        "areas": areas,
        "pointsOfInterest": pois,
        "gates": gates,
        "roomTemplates": room_templates,
        "dungeons": dungeons,
        "encounterTables": loot.ENCOUNTER_TABLES,
        "time": materials.TIME,
        # Nothing rolls encounters — this world has no monsters yet — but rooms
        # still want loot spots and traps marked out for whoever fills them.
        "generationDefaults": {"encounterChance": 0, "lootChance": 0.2,
                               "trapChance": 0.12},
    }

    # The ruleset, lifted wholesale from the base module — then armed. Without
    # `classes[].startingItems` every non-caster in Aurendel swings for zero:
    # `strike` declares no damage of its own, so damage comes entirely from an
    # equipped weapon (rules/combat/attack.ts) and there were no weapons.
    content = {k: list(base["content"][k])
               for k in ("skills", "abilities", "ancestries", "classes")}
    content["classes"] = items.outfit(content["classes"])
    content["abilities"] = content["abilities"] + bestiary.ABILITIES
    content["items"] = items.ITEMS
    content["lootTables"] = loot.LOOT_TABLES
    content["monsters"] = bestiary.MONSTERS
    content["factions"] = factions.FACTIONS
    content["npcs"] = story.npcs()
    content["traps"] = regions.traps() if regions else []

    # The base module's sense-impression pools come along with `rules.senses`,
    # which points at them by name.
    text_grammar = list(base["narrative"]["textGrammar"]) + prose.registered()
    seen, merged = set(), []
    for entry in text_grammar:
        if entry["id"] in seen:
            continue
        seen.add(entry["id"])
        merged.append(entry)
    merged.sort(key=lambda e: e["id"])

    doc = collections.OrderedDict()
    doc["format"] = 1
    doc["id"] = "aurendel"
    doc["version"] = "1.0.0"
    doc["engine"] = "^1.0.0"
    doc["extends"] = None
    doc["meta"] = {
        "title": "Aurendel",
        "author": "DungeonMaster",
        "description": (
            "A continent, and nothing else. Twelve regions from the Frostmere ice "
            "to the Glasslands, four cities, twelve towns, twenty villages, and "
            "the roads between them — with every shop, house, shrine, barrow, "
            "cave and castle you can walk into. No quests, no people, no loot: "
            "the geography is the whole of it, waiting for somebody to put a "
            "story in. Built on the Core Fantasy ruleset."
        ),
        "tags": ["world", "fantasy", "sandbox", "aurendel"],
        "license": "",
    }
    doc["rules"] = base["rules"]
    doc["content"] = content
    doc["world"] = world
    doc["narrative"] = {
        "textGrammar": merged,
        "systemText": base["narrative"]["systemText"],
        "deedKinds": factions.DEED_KINDS,
        "memory": factions.MEMORY,
        "dialogues": story.dialogues(),
        "quests": story.quests(),
        "arcs": story.arcs(),
    }
    doc["start"] = regions.start() if regions else {}

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "module.json")
    with open(path, "w") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")

    print(f"wrote {path}")
    print(f"  {len(areas)} areas, {len(pois)} points of interest, "
          f"{len(dungeons)} dungeons, {len(gates)} gates, "
          f"{len(room_templates)} room templates")
    print(f"  {len(world['terrains'])} terrains, {len(world['palettes'])} palettes, "
          f"{len(biome_list)} biomes, {len(merged)} text pools")
    print(f"  {len(content['items'])} items, {len(content['monsters'])} monsters, "
          f"{len(content['npcs'])} npcs, {len(content['factions'])} factions")
    print(f"  {len(doc['narrative']['quests'])} quests, "
          f"{len(doc['narrative']['dialogues'])} dialogues, "
          f"{len(doc['narrative']['arcs'])} arcs")


if __name__ == "__main__":
    main()
