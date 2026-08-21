#!/usr/bin/env python3
"""Assemble modules/aurendel/module.json from the stage files in this directory."""
import _bootstrap  # noqa: F401  sys.path; must come first
import os  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "modules/aurendel")

from dmkit.retired import refuse_if_handed_over  # noqa: E402

# Handed over to `aurendel/project/`.
refuse_if_handed_over(OUT)
BASE = os.path.join(ROOT, "modules/core_fantasy/module.json")

from dmkit import assemble  # noqa: E402
import materials  # noqa: E402
from dmkit import items as dmkit_items  # noqa: E402
from dmkit import prose  # noqa: E402
import factions  # noqa: E402
import items  # noqa: E402
import bestiary  # noqa: E402
import loot  # noqa: E402
import story  # noqa: E402
import regions  # noqa: E402


def main():
    base = assemble.load_base(BASE)

    areas = regions.areas()
    pois = regions.pois()
    gates = regions.gates()
    dungeons = regions.dungeons()
    room_templates = regions.room_templates()
    biome_list = materials.biomes()

    regions.attach_room_templates(biome_list)
    # The questline turns its own route live and leaves the rest of the continent alone.
    story.attach_content(biome_list, dungeons, room_templates, areas)
    story.attach_triggers(pois)
    # Hidden threads build no geography; they patch places that were already there.
    story.attach_patches(pois)

    world = {
        "terrains": materials.terrains(),
        "palettes": materials.palettes(),
        "biomes": biome_list,
        "areas": areas,
        "pointsOfInterest": pois,
        "gates": gates + story.gates(),
        "roomTemplates": room_templates,
        "dungeons": dungeons,
        "encounterTables": loot.ENCOUNTER_TABLES + story.encounter_tables(),
        "time": materials.TIME,
        # No encounters yet; rooms still want loot spots and traps marked out.
        "generationDefaults": {"encounterChance": 0, "lootChance": 0.2,
                               "trapChance": 0.12},
    }

    # The ruleset, lifted wholesale from the base module, then armed.
    content = {k: list(base["content"][k])
               for k in ("skills", "abilities", "ancestries", "classes")}
    content["classes"] = dmkit_items.outfit(content["classes"], items.CLASS_KIT)
    content["abilities"] = content["abilities"] + bestiary.ABILITIES
    content["items"] = items.ITEMS + story.items()
    content["lootTables"] = loot.LOOT_TABLES + story.loot_tables()
    content["monsters"] = bestiary.MONSTERS + story.monsters()
    content["factions"] = factions.FACTIONS
    content["npcs"] = story.npcs()
    content["traps"] = regions.traps()

    # The base module's sense-impression pools come along with `rules.senses`, which points at them by name.
    merged = assemble.text_grammar(base["narrative"]["textGrammar"],
                                   prose.registered())

    meta = {
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
    narrative = {
        "textGrammar": merged,
        "systemText": base["narrative"]["systemText"],
        "deedKinds": factions.DEED_KINDS,
        "memory": factions.MEMORY,
        "dialogues": story.dialogues(),
        "quests": story.quests(),
        "arcs": story.arcs(),
        "lore": story.lore(),
        "loreThreads": story.lore_threads(),
    }
    start = regions.start()

    # Winning the Unsealing does not end the run.
    start["postVictory"] = "continue"

    doc = assemble.document(
        module_id="aurendel", version="1.0.0", engine="^1.0.0", meta=meta,
        rules=base["rules"], content=content, world=world,
        narrative=narrative, start=start)
    path = assemble.write(doc, OUT)

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
    print(f"  {len(doc['narrative']['lore'])} clues in "
          f"{len(doc['narrative']['loreThreads'])} threads")


if __name__ == "__main__":
    main()
