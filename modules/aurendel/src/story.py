"""The Unsealing — the acts, assembled."""
from dmkit import story as _kit

ACT_MODULES = ["act1", "act2", "act3"]

# The side chains: one file per chain, each owning one region and one act.
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

# The hidden threads, in the areas neither the spine nor a side chain touches.
HIDDEN_MODULES = [
    "hidden_frostmere",
    "hidden_glasslands",
    "hidden_ember",
    "hidden_thornmere",
    "hidden_isles",
    "hidden_kingsvale",
    "hidden_deeproads",
    "hidden_coast",
    "hidden_duskwood",
    "hidden_steppe",
    "hidden_skarnspine",
    "hidden_moor",
]

# The trials: post-game content, behind `aurendel_finished`.
TRIAL_MODULES = [
    "trial_one",
    "trial_two",
    "trial_three",
]

_LOADED = _kit.load(ACT_MODULES + SIDE_MODULES + HIDDEN_MODULES + TRIAL_MODULES)


def npcs():
    return _kit.gather(_LOADED, "NPCS")


def quests():
    return _kit.gather(_LOADED, "QUESTS")


def dialogues():
    return _kit.gather(_LOADED, "DIALOGUES")


def lore():
    return _kit.gather(_LOADED, "LORE")


def lore_threads():
    return _kit.gather(_LOADED, "THREADS")


def items():
    return _kit.gather(_LOADED, "ITEMS")


def gates():
    return _kit.gather(_LOADED, "GATES")


def loot_tables():
    return _kit.gather(_LOADED, "LOOT_TABLES")


def monsters():
    return _kit.gather(_LOADED, "MONSTERS")


def encounter_tables():
    return _kit.gather(_LOADED, "ENCOUNTER_TABLES")


def arcs():
    return _kit.arcs(_LOADED, ending=(
        "the_unsealing", "The Unsealing",
        "Nine doors were shut on purpose. Somebody has been opening them "
        "in order, and the ninth is the last.",
        ACT_THREE_SPINE))


# The quests that must all be complete for the game to be won.
ACT_THREE_SPINE = [
    "the_way_below", "lantern_deep", "the_eleventh_chamber",
    "behind_the_ninth_door", "the_unsealing",
]


# Arriving somewhere is the event, for the three ways into the Deeproads.
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
    _kit.attach_triggers(_LOADED, poi_list, base=POI_TRIGGERS)


def attach_patches(poi_list):
    _kit.attach_patches(_LOADED, poi_list)


def attach_content(biome_list, dungeon_list, room_templates, area_list):
    """What the questline turns live, and nothing else on the continent."""
    # Function-scoped: `story` is imported by `build.py` before `loot` is needed.
    import loot
    _kit.attach_content(
        _LOADED, biome_list, dungeon_list, room_templates, area_list,
        population=_kit.Population(
            biome_encounters=loot.BIOME_ENCOUNTERS,
            biome_loot=loot.BIOME_LOOT,
            area_encounters=loot.AREA_ENCOUNTERS,
            dungeon_bosses=loot.DUNGEON_BOSSES,
            live_room_biomes=loot.LIVE_ROOM_BIOMES))
