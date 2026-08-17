"""Aurendel — the twelve regions, assembled.

Each `r??_*.py` module owns one region and exports whatever it has so far:

    AREAS      list of area dicts (no `connections` — see EDGES)
    EDGES      (a, b, minutes) or (a, b, minutes, {...opts}) — written BOTH ways
    POIS       list of point-of-interest dicts
    GATES      list of gate dicts
    DUNGEONS   list of dungeon dicts
    ROOM_TEMPLATES  list of room-template dicts
    TRAPS      list of trap dicts
    BIOME_ROOMS  {biome_id: [room_template_id, ...]}

Roads are declared once here and emitted on both sides, because
`world.areas[].connections` is one-directional in the engine (reduce.ts:300)
and a road you can only walk one way is almost never what was meant. Pass
`{"oneWay": True}` when it is.
"""
from dmkit import regions as _kit

import rooms

REGION_MODULES = [
    "r01_kingsvale", "r02_coast", "r03_duskwood", "r04_skarnspine",
    "r05_frostmere", "r06_moor", "r07_ember", "r08_thornmere",
    "r09_steppe", "r10_glasslands", "r11_isles", "r12_deeproads",
    "roads",
]

# `rooms` goes first, where "dungeonkit" used to sit at the head of
# `REGION_MODULES`. Position is not cosmetic: `gather` concatenates in this
# order, so this is the emitted order of `world.roomTemplates` and of the traps.
_LOADED = [rooms] + _kit.load(REGION_MODULES)


def areas():
    return _kit.areas(_LOADED)


def pois():
    return _kit.pois(_LOADED)


def gates():
    return _kit.gather(_LOADED, "GATES")


def dungeons():
    return _kit.gather(_LOADED, "DUNGEONS")


def room_templates():
    return _kit.gather(_LOADED, "ROOM_TEMPLATES")


def traps():
    return _kit.gather(_LOADED, "TRAPS")


def attach_room_templates(biome_list):
    _kit.attach_room_templates(_LOADED, biome_list)


def start():
    # Imported here rather than at module level: `items` is content, and the
    # geography has no business importing it to be assembled.
    from items import PARTY_KIT

    return {
        "partySize": 4,
        "creation": {
            "attributePoints": 27,
            "attributeCosts": {"8": 0, "9": 1, "10": 2, "11": 3,
                               "12": 4, "13": 5, "14": 7, "15": 9},
            "startingLevel": 1,
            "skillRanks": 4,
            "startingItems": [{"item": i, "quantity": q}
                              for i, q in PARTY_KIT],
            "startingCurrency": 40,
        },
        "startingArea": "kingsvale_hollowdene",
        "startingPoi": "hollowdene_green",
        "openingTextKey": "aurendel_opening",
        "initialFlags": {},
        "partyFollow": {"catchUpDistance": 3, "catchUpSteps": 2},
    }
