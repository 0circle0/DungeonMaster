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

# The side chains: one file per chain, each owning one region and one act, each
# exporting the same four names the acts do. They are gathered alongside rather
# than inside the acts because the difference between them is load-bearing —
# `ACT_THREE_SPINE` below decides what winning means, and nothing from this list
# is allowed anywhere near it.
SIDE_MODULES = [
    # Act I — the Kingsvale, the capital, and the coast.
    "side_kingsvale", "side_aurenhal", "side_coast", "side_sarnport",
    # Act II — the three ward regions and the three the roads pass through.
    "side_duskwood", "side_moor", "side_steppe", "side_skarnspine",
    "side_ember", "side_thornmere",
    # Act III — the deep, the far north, the far south, and the sea.
    "side_karn_dolur", "side_deeproads", "side_glasslands", "side_frostmere",
    "side_isles",
]

# The hidden threads: things nobody hands you, in the sixty-one areas neither
# the spine nor a side chain touches. A third list rather than more entries in
# the second, because the contract is different again — a side chain has a giver
# and an arc you can see coming, and one of these has neither. `check_quests.py`
# holds them to `hiddenspace.EMPTY` and to the rule that no clue may name the
# place it points at.
HIDDEN_MODULES = [
    "hidden_frostmere",
    "hidden_glasslands",
    "hidden_ember",
    "hidden_thornmere",
    "hidden_isles",
]

_LOADED = []
for _name in ACT_MODULES + SIDE_MODULES + HIDDEN_MODULES:
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


def lore():
    return _gather("LORE")


def lore_threads():
    return _gather("THREADS")


def items():
    return _gather("ITEMS")


def gates():
    return _gather("GATES")


def loot_tables():
    return _gather("LOOT_TABLES")


def monsters():
    return _gather("MONSTERS")


def encounter_tables():
    return _gather("ENCOUNTER_TABLES")


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
    """Arrival triggers, from the questline and from whichever chains want one.

    A side chain reaches places the spine never named, and "you have found it"
    is the only event some of them produce — a sunken barge does not talk. Each
    module may export its own `POI_TRIGGERS` in the same shape, gathered here so
    the geography files still do not have to know a quest exists.
    """
    wanted = dict(POI_TRIGGERS)
    for module in _LOADED:
        for poi_id, triggers in getattr(module, "POI_TRIGGERS", {}).items():
            wanted.setdefault(poi_id, []).extend(triggers)

    for poi in poi_list:
        extra = wanted.get(poi["id"])
        if extra:
            poi["triggers"] = list(poi.get("triggers", [])) + extra


def attach_patches(poi_list):
    """Turn an existing place into a hidden one, or hang a door on it.

    A hidden thread builds no geography — the anchors are points of interest
    that have been standing there unmentioned since the continent was drawn. So
    the only thing a thread does to the map is patch a place that already
    exists: `hidden` plus a `discover` difficulty that falls as its thread
    fills, and a `gate` that says in words what it wants.

    Merged rather than replaced, so a patch cannot silently drop a place's
    triggers or its residents.
    """
    wanted = {}
    for module in _LOADED:
        for poi_id, patch in getattr(module, "POI_PATCHES", {}).items():
            wanted.setdefault(poi_id, {}).update(patch)

    seen = set()
    for poi in poi_list:
        patch = wanted.get(poi["id"])
        if patch:
            poi.update(patch)
            seen.add(poi["id"])

    missing = sorted(set(wanted) - seen)
    if missing:
        # Loud, because a patch that lands on nothing is a thread whose anchor
        # is not hidden, not gated, and reachable by walking in.
        raise ValueError(f"POI_PATCHES names points of interest that do not exist: {missing}")


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

    # Bosses the questline named, then the ones a hidden thread claims. Forty
    # of Aurendel's sixty-eight dungeons had a boss room carrying
    # `alwaysEncounter` and no table for it to draw from; a thread that anchors
    # on one fixes that as a side effect of using it.
    bosses = dict(loot.DUNGEON_BOSSES)
    for module in _LOADED:
        bosses.update(getattr(module, "BOSSES", {}))

    for dungeon in dungeon_list:
        boss = bosses.get(dungeon["id"])
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
