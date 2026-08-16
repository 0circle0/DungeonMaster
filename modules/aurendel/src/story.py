"""The Unsealing — the acts, assembled.

Each `act*.py` owns a stretch of the questline and exports whatever it has:

    NPCS  QUESTS  ARCS  DIALOGUES

and registers its own prose by importing `prose.pool` at module level. This
file is only the gathering, plus the two things that belong to the questline as
a whole rather than to any act: the ending arc, and the wiring that turns the
continent's biomes and dungeons live along the route.
"""
import importlib

from questkit import arc

ACT_MODULES = ["act1", "act2", "act3"]

_LOADED = []
for _name in ACT_MODULES:
    try:
        _LOADED.append(importlib.import_module(_name))
    except ImportError:
        pass


def _gather(attr):
    out = []
    for module in _LOADED:
        out.extend(getattr(module, attr, []))
    return out


def npcs():
    return _gather("NPCS")


def quests():
    return _gather("QUESTS")


def dialogues():
    return _gather("DIALOGUES")


def arcs():
    out = _gather("ARCS")
    # The ending arc is assembled here rather than in Act III, because whether
    # a run is over is a fact about the whole questline. `isEnding` plus every
    # quest in it complete is what `endingReached` wins on.
    finale = [q for q in ACT_THREE_SPINE if any(x["id"] == q for x in quests())]
    if finale:
        out.append(arc(
            "the_unsealing", "The Unsealing",
            "Nine doors were shut on purpose. Somebody has been opening them "
            "in order, and the ninth is the last.",
            finale, ending=True))
    return out


# The quests that must all be complete for the game to be won. Deliberately
# only the spine: no branch quest is in here, so no choice can lock the ending.
ACT_THREE_SPINE = [
    "the_way_below", "lantern_deep", "the_eleventh_chamber",
    "behind_the_ninth_door", "the_unsealing",
]


# Arriving somewhere *is* the event, for the three ways into the Deeproads.
# A trigger on the point of interest is how the questline says so without the
# geography files having to know a questline exists.
POI_TRIGGERS = {
    "black_tarn_shaft": [{
        "id": "found_the_tarn_shaft", "mode": "once", "on": "enter",
        "description": "The moor's way down.",
        "effects": [{"setFlag": {"flag": "down_by_the_tarn", "value": True}}],
    }],
    "crater_the_shaft": [{
        "id": "found_the_crater_shaft", "mode": "once", "on": "enter",
        "description": "The Glasslands' way down.",
        "effects": [{"setFlag": {"flag": "down_by_the_crater", "value": True}}],
    }],
    "forgetiers_deep_door": [{
        "id": "found_the_deep_gate", "mode": "once", "on": "enter",
        "description": "Karn Dolur's way down — reaching it counts, whether "
                       "or not you ever spoke to Dath about it.",
        "effects": [{"setFlag": {"flag": "down_by_karn_dolur", "value": True}}],
    }],
}


def attach_triggers(poi_list):
    for poi in poi_list:
        extra = POI_TRIGGERS.get(poi["id"])
        if extra:
            poi["triggers"] = list(poi.get("triggers", [])) + extra


def attach_content(biome_list, dungeon_list, room_templates, area_list):
    """Turn the route live: encounters, loot, and rooms that are not empty.

    Everything here is scoped to the questline. Aurendel has 25 biomes, 108
    areas and 68 dungeons, and the great majority of them stay exactly as
    quiet as they were — which is what "questline-scoped bestiary" means when
    it comes time to write it down.
    """
    import loot

    for biome in biome_list:
        tables = loot.BIOME_ENCOUNTERS.get(biome["id"])
        if tables:
            biome["encounterTables"] = list(tables)
        drops = loot.BIOME_LOOT.get(biome["id"])
        if drops:
            biome["lootTables"] = list(drops)

    for area in area_list:
        tables = loot.AREA_ENCOUNTERS.get(area["id"])
        if tables:
            area["encounterTables"] = list(tables)

    for dungeon in dungeon_list:
        boss = loot.DUNGEON_BOSSES.get(dungeon["id"])
        if boss:
            dungeon["bossTable"] = boss

    # Every room template in Aurendel ships `encounterChance: 0`, and
    # `world.generationDefaults.encounterChance` is 0 as well — so a dungeon
    # full of monsters generates empty. This is the switch.
    for template in room_templates:
        biome_id = template["id"].rsplit("_", 1)[0]
        if biome_id not in loot.LIVE_ROOM_BIOMES:
            continue
        role = template.get("role", "chamber")
        if role == "boss":
            # The boss room draws from the dungeon's `bossTable`, once.
            template["alwaysEncounter"] = True
        elif role in ("entrance", "corridor"):
            template["encounterChance"] = 0.15
        else:
            template["encounterChance"] = 0.4
