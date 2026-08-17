"""Tier two — the middle three, and the places that were dug afterwards.

The first three had gone to ground under buildings. The middle three did not go
to ground at all: they were built around. The Cut's quarry galleries follow a
seam that does not run that way. The Sunken Hall in the Black Water was a hall
before the water. The Milepost Vault on the Sunken Road is a milepost with four
hundred feet of vault under it, on a road that measures nothing.

Somebody knew where these three had settled and put stone over them, carefully,
without ever writing down what it was for.

Level 16 at the door, and the door wants a relic worn.
"""
from questkit import reach, kill, flagged, arc
from prose import pool
from trialkit import tier, link, warrant, proving, loosed

KEY = "trial_two"

ITEMS = [
    warrant("second_warrant", "The Warrant of the Middle Three",
            "Six lines struck through now. Hesper has stopped countersigning "
            "and started writing the date beside each one, which is what the "
            "order does when it expects to be read a long time from now."),

    {"id": "gallery_head", "name": "The Helm Out of the Cut", "slot": "head",
     "description": "Quarry iron beaten over something that was already the "
                    "right shape, by a mason who never said what for.",
     "kind": "armor", "value": 2100, "weight": 3,
     "rarity": "very_rare", "tags": ["fabled", "trial"],
     "modifiers": {"guard": 3},
     "skillBonuses": {"craft": 3, "perception": 3, "resolve": 2},
     "damageInteractions": [{"damageType": "bludgeoning", "multiplier": 0.5}]},

    {"id": "sunken_hall_ring", "name": "The Ring of the Sunken Hall",
     "description": "Off a hand still resting on the arm of a chair, in a "
                    "hall that was a hall before the water was water.",
     "kind": "trinket", "slot": "ring", "value": 2000, "weight": 0,
     "rarity": "very_rare", "tags": ["fabled", "trial"],
     "modifiers": {"initiative": 2},
     "skillBonuses": {"insight": 3, "persuasion": 3, "resolve": 3},
     "damageInteractions": [{"damageType": "cold", "multiplier": 0.5}]},

    {"id": "milepost_belt", "name": "The Belt off the Milepost", "slot": "belt",
     "description": "A surveyor's belt with four hundred feet of vault under "
                    "the stone it was left leaning against.",
     "kind": "trinket", "value": 2200, "weight": 1,
     "rarity": "very_rare", "tags": ["fabled", "trial"],
     "modifiers": {"guard": 2, "carry": 5},
     "skillBonuses": {"athletics": 3, "lore": 3, "arcana": 2}},
]

GATES = [
    proving("trial_two_door", "The Fourth of the Eight",
            "A quarry gallery following a seam that is not there, ending in "
            "dressed stone the quarry did not dress.",
            "trial_two_blocked", KEY, opens_flag="trial_two_open"),
]

pool("trial_two_blocked",
     "The gallery runs eight hundred feet along a seam the geology says stops "
     "at forty. It was not cut to get stone out. It was cut to get to this.",
     "Hesper's fourth line has a date beside it now instead of a "
     "countersignature. She has started writing for whoever reads this after "
     "her.",
     "The face at the end is dressed, and the dressing is older than the "
     "quarry, and the quarrymen worked around it for nine generations without "
     "once putting a pick in it.")

POI_PATCHES = {
    "the_cut_quarry_galleries": {"gate": "trial_two_door"},
}

BOSSES = {
    "skarn_cut_galleries": "trial_two_fourth",
    "thornmere_sunken_hall": "trial_two_fifth",
    "glasslands_milepost": "trial_two_sixth",
}


QUESTS = tier(KEY, [
    link("trial_two_galleries", "The Fourth Door",
         "Eight hundred feet of quarry gallery along a seam that stops at "
         "forty, ending at a face nine generations of quarrymen worked around "
         "and never into.",
         [reach("into_the_galleries", "Get into the quarry galleries.",
                "the_cut_quarry_galleries"),
          flagged("through_the_face", "Open the face the quarry never cut.",
                  "trial_two_open"),
          kill("the_fourth", "Finish what came through the fourth door.",
               "fourth_through")],
         xp=2000, items=[("gallery_head", 1)],
         reputation={"the_keepers": 25, "karn_dolur": 20}),

    link("trial_two_sunken_hall", "The Fifth Door",
         "The Black Water covered a hall. The hall is still furnished, still "
         "arranged, and still occupied by one thing that was sitting down when "
         "the water came.",
         [reach("into_the_hall", "Get into the sunken hall.",
                "black_water_sunken_hall"),
          kill("the_fifth", "Finish what came through the fifth door.",
               "fifth_through")],
         xp=2200, items=[("sunken_hall_ring", 1)],
         reputation={"the_keepers": 25, "the_ferrymen": 20}),

    link("trial_two_milepost", "The Sixth Door",
         "A milepost on a road that measures nothing, with four hundred feet "
         "of dressed vault under it and one way down.",
         [reach("under_the_milepost", "Get into the vault under the milepost.",
                "sunken_road_milepost_vault"),
          kill("the_sixth", "Finish what came through the sixth door.",
               "sixth_through")],
         xp=2500, items=[("milepost_belt", 1)],
         reputation={"the_keepers": 35, "the_library": 25}),
], giver="keeper_hesper", warrant_item="second_warrant", level=16)


ARCS = [
    arc("trial_two_arc", "The Middle Three",
        "Three doors somebody found before the Keepers did, and put four "
        "hundred feet of careful stone over without ever saying why.",
        [q["id"] for q in QUESTS]),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402

MONSTERS = [
    creature("fourth_through", "What Came Through the Fourth", 16, 5600,
             A(22, 18, 23, 17, 19, 16), ["stone_fist", "rend", "shove",
                                         "digging_claw"],
             "Eight hundred feet of gallery cut along a seam that does not "
             "exist, to a face nobody ever put a pick into.",
             behaviour=[{"priority": 25, "use": "stone_fist",
                         "when": {"chance": 0.4}},
                        {"priority": 15, "use": "digging_claw"},
                        {"priority": 5, "use": "shove"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a quarry-grey", "an enormous"],
             loot="trial_two_hoard_a", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone", "blinded", "slowed"], hp=280),

    creature("fifth_through", "What Came Through the Fifth", 17, 6400,
             A(19, 20, 21, 21, 21, 20), ["unmaking_word", "grave_chill",
                                         "drag_under", "wither"],
             "A hall the marsh covered, still arranged, and one chair in it "
             "that has been occupied the whole time.",
             behaviour=[{"priority": 25, "use": "unmaking_word",
                         "when": {"chance": 0.35}},
                        {"priority": 15, "use": "drag_under"},
                        {"priority": 5, "use": "wither"},
                        {"priority": 0, "use": "grave_chill"}],
             descriptors=["a seated", "a courteous"],
             loot="trial_two_hoard_b", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "silenced", "prone",
                         "slowed"], hp=252),

    creature("sixth_through", "What Came Through the Sixth", 18, 7400,
             A(23, 19, 24, 18, 20, 18), ["salt_burn", "scouring_wind", "rend",
                                         "cinder_lash"],
             "Four hundred feet of dressed vault under a milepost on a road "
             "that measures nothing, and one way down into it.",
             behaviour=[{"priority": 25, "use": "scouring_wind",
                         "when": {"chance": 0.35}},
                        {"priority": 15, "use": "salt_burn"},
                        {"priority": 5, "use": "cinder_lash"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a glass-scoured", "a towering"],
             loot="trial_two_hoard_c", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone", "blinded", "burning"], hp=310),

    creature("door_keeper_loosed", "A Keeper of the Middle", 14, 3200,
             A(19, 18, 19, 16, 18, 15), ["rend", "wither", "cut_and_run"],
             "Stone was put over three doors carefully. Something has been "
             "checking on the stone.",
             behaviour=[{"priority": 15, "use": "wither",
                         "when": {"chance": 0.3}},
                        {"priority": 5, "use": "cut_and_run"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a stone-dusted", "a checking"],
             loot="trial_loose_drop", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone", "poisoned"], hp=170),
]

from loot import group, encounters  # noqa: E402

ENCOUNTER_TABLES = [
    encounters("trial_two_fourth", [group("b", [("fourth_through", "1", False)])],
               chance=1, empty=0),
    encounters("trial_two_fifth", [group("b", [("fifth_through", "1", False)])],
               chance=1, empty=0),
    encounters("trial_two_sixth", [group("b", [("sixth_through", "1", False)])],
               chance=1, empty=0),

    loosed("the_checked", [
        ("keepers", [("door_keeper_loosed", "1", False)], 5),
        ("a_pair", [("door_keeper_loosed", "1d2", True)], 2),
    ], chance=0.35, empty=5),
]

AREA_ENCOUNTERS = {
    "skarnspine_the_cut": ["the_checked"],
    "thornmere_black_water": ["the_checked"],
    "glasslands_sunken_road": ["the_checked"],
    "ember_firewatch_ridge": ["the_checked"],
}

LOOT_TABLES = [
    {"id": "trial_two_hoard_a", "name": "Past the Face the Quarry Left",
     "rolls": "4", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 2, "onCritical": 3},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "10d6"}},
                 {"weight": 3, "value": {"item": "hold_silver", "quantity": "3d4"}},
                 {"weight": 2, "value": {"item": "ward_salt", "quantity": "2d3"}},
                 {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}}]},
    {"id": "trial_two_hoard_b", "name": "The Hall Under the Black Water",
     "rolls": "4", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 2, "onCritical": 3},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "10d6"}},
                 {"weight": 3, "value": {"item": "barrow_torc", "quantity": "1d3"}},
                 {"weight": 3, "value": {"item": "healing_draught", "quantity": "1d3"}},
                 {"weight": 1, "value": {"item": "warded_coat", "quantity": "1"}}]},
    {"id": "trial_two_hoard_c", "name": "Four Hundred Feet Under a Milepost",
     "rolls": "5", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 2, "onCritical": 3},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "12d6"}},
                 {"weight": 3, "value": {"item": "glass_bead", "quantity": "2d4"}},
                 {"weight": 3, "value": {"item": "antidote", "quantity": "1d3"}},
                 {"weight": 2, "value": {"item": "ward_salt", "quantity": "2d3"}},
                 {"weight": 1, "value": {"item": "amber_lump", "quantity": "1d4"}}]},
]
