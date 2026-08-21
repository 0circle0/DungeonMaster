"""Tier three — the last two, and the thing that had been counting them."""
from dmkit.quests import reach, kill, flagged, arc
from dmkit.prose import pool
from postgame import tier, link, warrant, proving, loosed

KEY = "trial_three"

ITEMS = [
    warrant("last_warrant", "The List, Struck Out",
            "Eight lines and a ninth written underneath in a different hand, "
            "and all nine of them struck through. Hesper has signed the "
            "bottom of it and then written the date twice, which she says is "
            "an order convention and is not."),

    {"id": "listening_hood", "name": "The Hood off the Listening Room",
     "description": "Taken off the wall of a room built to hear a corridor "
                    "four miles long. It hears rather more than that.",
     "kind": "armor", "slot": "head", "value": 3000, "weight": 2,
     "rarity": "artifact", "tags": ["fabled", "trial"],
     "modifiers": {"guard": 3, "initiative": 3},
     "skillBonuses": {"perception": 4, "insight": 4, "stealth": 2},
     "damageInteractions": [{"damageType": "necrotic", "multiplier": 0.5}]},

    {"id": "signal_deep_belt", "name": "The Belt out of the Signal Deep",
     "description": "Six hundred years of vent-readers signalling past this "
                    "and never to it, and it has been wearing this the whole "
                    "time.",
     "kind": "trinket", "slot": "belt", "value": 3000, "weight": 1,
     "rarity": "artifact", "tags": ["fabled", "trial"],
     "modifiers": {"guard": 3, "carry": 6},
     "skillBonuses": {"athletics": 4, "resolve": 4},
     "damageInteractions": [{"damageType": "fire", "multiplier": 0.5}]},

    {"id": "the_counters_ring", "name": "The Counter's Ring",
     "description": "Nine doors in eleven hundred years is not weather. This "
                    "was on the hand that kept the tally, and the tally goes "
                    "to more than nine.",
     "kind": "trinket", "slot": "ring", "value": 3600, "weight": 0,
     "rarity": "artifact", "tags": ["fabled", "trial"],
     "modifiers": {"guard": 2, "initiative": 3},
     "skillBonuses": {"arcana": 4, "lore": 4, "resolve": 3, "insight": 3}},
]

GATES = [
    proving("trial_three_door", "The Seventh of the Eight",
            "A room off the Long Hall with no furniture, dressed to the inch, "
            "and built so that a sound made in it comes back changed.",
            "trial_three_blocked", KEY, opens_flag="trial_three_open"),
]

pool("trial_three_blocked",
     "Say anything in the doorway and it comes back to you a beat late and a "
     "word short. This room was built to listen, and it is not finished "
     "listening.",
     "Seven of Hesper's eight lines are struck out. This is the seventh, and "
     "she has stopped writing dates beside them, which she has not explained.",
     "Four miles of Long Hall on the other side of that wall, and this room "
     "hears all of it, and has heard everything that has ever walked it "
     "including you, twice.")

POI_PATCHES = {
    "echo_halls_the_listening_room": {"gate": "trial_three_door"},
}

BOSSES = {
    "deeproads_listening_room": "trial_three_seventh",
    "ember_signal_deep": "trial_three_eighth",
    "duskwood_under_ring": "trial_three_counter",
}


QUESTS = tier(KEY, [
    link("trial_three_listening", "The Seventh Door",
         "A room four miles down the Long Hall, dressed to the inch, with no "
         "furniture and no purpose except to hear — and it has heard "
         "everything that ever walked past it, including you.",
         [reach("into_the_room", "Get into the listening room.",
                "echo_halls_the_listening_room"),
          flagged("stop_the_listening", "Stop it listening.",
                  "trial_three_open"),
          kill("the_seventh", "Finish what came through the seventh door.",
               "seventh_through")],
         xp=3000, items=[("listening_hood", 1)],
         reputation={"the_keepers": 30, "the_wayfinders": 25}),

    link("trial_three_signal", "The Eighth Door",
         "The vent-readers have signalled past the Signal Deep for six "
         "hundred years and never once signalled to it, and not one of them "
         "was ever told not to.",
         [reach("into_the_deep", "Get down into the Signal Deep.",
                "firewatch_ridge_signal_deep"),
          kill("the_eighth", "Finish what came through the eighth door.",
               "eighth_through")],
         xp=3400, items=[("signal_deep_belt", 1)],
         reputation={"the_keepers": 30, "the_vent_readers": 30}),

    link("trial_three_counter", "The Ninth Line",
         "Nine doors opened in order over eleven hundred years is not weather "
         "and it is not luck. Somebody has been keeping the count, and the "
         "count does not stop at nine.",
         [reach("under_the_ring", "Get under the ring in the Witchwood.",
                "witchwood_under_the_ring"),
          kill("the_counter", "Finish whatever has been keeping the count.",
               "the_counter")],
         xp=4500, items=[("the_counters_ring", 1)],
         reputation={"the_keepers": 50, "the_library": 30,
                     "the_crown": 25}),
], giver="keeper_hesper", warrant_item="last_warrant", level=18)


ARCS = [
    arc("trial_three_arc", "The Ninth Line",
        "The last two doors, and the thing that had been opening them in "
        "order and writing down how many were left.",
        [q["id"] for q in QUESTS]),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402

MONSTERS = [
    creature("seventh_through", "What Came Through the Seventh", 18, 8000,
             A(20, 22, 22, 23, 23, 21), ["unmaking_word", "call_the_shut",
                                         "grave_chill", "wither"],
             "A room built to hear four miles of corridor, and something in "
             "it that has heard every footfall on that floor since there was "
             "a floor.",
             behaviour=[{"priority": 30, "use": "call_the_shut",
                         "when": {"chance": 0.3}},
                        {"priority": 20, "use": "unmaking_word"},
                        {"priority": 10, "use": "wither"},
                        {"priority": 0, "use": "grave_chill"}],
             descriptors=["an attentive", "a listening"],
             loot="trial_three_hoard_a", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "silenced", "blinded", "poisoned",
                         "slowed"], hp=300),

    creature("eighth_through", "What Came Through the Eighth", 19, 9000,
             A(24, 20, 25, 19, 21, 19), ["vent_breath", "cinder_lash",
                                         "salt_burn", "rend"],
             "Six hundred years of vent-readers signalling past a deep and "
             "never to it, and not one of them ever told why.",
             behaviour=[{"priority": 30, "use": "vent_breath",
                         "when": {"chance": 0.35}},
                        {"priority": 20, "use": "cinder_lash"},
                        {"priority": 10, "use": "salt_burn"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a furnace-hearted", "a vast"],
             loot="trial_three_hoard_b", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "burning", "prone", "blinded"],
             hp=360),

    creature("the_counter", "Whatever Kept the Count", 20, 12000,
             A(24, 23, 25, 24, 24, 23), ["unmaking_word", "call_the_shut",
                                         "wither", "drag_under", "rend"],
             "Nine doors in eleven hundred years, opened in order, by "
             "somebody. The tally is cut into the underside of a ring of "
             "stones in a wood nobody goes into, and it does not stop at "
             "nine.",
             behaviour=[{"priority": 35, "use": "call_the_shut",
                         "when": {"chance": 0.3}},
                        {"priority": 25, "use": "unmaking_word",
                         "when": {"chance": 0.4}},
                        {"priority": 15, "use": "drag_under"},
                        {"priority": 5, "use": "wither"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a patient", "an unhurried", "a counting"],
             loot="trial_three_hoard_c", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone", "blinded", "silenced",
                         "poisoned", "slowed", "stunned"], hp=440),

    creature("tally_keeper", "A Tally-Keeper", 16, 4800,
             A(20, 19, 20, 19, 20, 18), ["wither", "grave_chill",
                                         "cut_and_run"],
             "Somebody had to walk between nine doors over eleven hundred "
             "years and know which were still shut. These are what did the "
             "walking.",
             behaviour=[{"priority": 15, "use": "wither",
                         "when": {"chance": 0.35}},
                        {"priority": 5, "use": "cut_and_run"},
                        {"priority": 0, "use": "grave_chill"}],
             descriptors=["a soundless", "a tallying"],
             loot="trial_loose_drop", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone", "poisoned", "silenced"],
             hp=200),
]

from dmkit.loot import group, encounters  # noqa: E402

ENCOUNTER_TABLES = [
    encounters("trial_three_seventh",
               [group("b", [("seventh_through", "1", False)])],
               chance=1, empty=0),
    encounters("trial_three_eighth",
               [group("b", [("eighth_through", "1", False)])],
               chance=1, empty=0),
    encounters("trial_three_counter",
               [group("b", [("the_counter", "1", False)])],
               chance=1, empty=0),

    loosed("the_tallied", [
        ("keeper", [("tally_keeper", "1", False)], 5),
        ("two", [("tally_keeper", "1d2", True)], 3),
    ], chance=0.4, empty=4),
]

AREA_ENCOUNTERS = {
    "duskwood_witchwood": ["the_tallied"],
    "deeproads_echo_halls": ["the_tallied"],
    "deeproads_the_long_hall": ["the_tallied"],
    "frostmere_the_white_reach": ["the_tallied"],
    "glasslands_the_crater": ["the_tallied"],
}

LOOT_TABLES = [
    {"id": "trial_three_hoard_a", "name": "What the Room Had Kept",
     "rolls": "5", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 2, "onCritical": 4},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "12d6"}},
                 {"weight": 3, "value": {"item": "hold_silver", "quantity": "3d4"}},
                 {"weight": 3, "value": {"item": "ward_salt", "quantity": "2d3"}},
                 {"weight": 2, "value": {"item": "healing_draught", "quantity": "2d3"}},
                 {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}}]},
    {"id": "trial_three_hoard_b", "name": "The Bottom of the Signal Deep",
     "rolls": "5", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 2, "onCritical": 4},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "14d6"}},
                 {"weight": 3, "value": {"item": "amber_lump", "quantity": "2d4"}},
                 {"weight": 3, "value": {"item": "antidote", "quantity": "2d3"}},
                 {"weight": 2, "value": {"item": "warded_coat", "quantity": "1"}},
                 {"weight": 1, "value": {"item": "wreck_brass", "quantity": "2d4"}}]},
    {"id": "trial_three_hoard_c", "name": "Under the Ring, Where the Tally Is",
     "rolls": "6", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 3, "onCritical": 4},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "20d6"}},
                 {"weight": 3, "value": {"item": "hold_silver", "quantity": "4d4"}},
                 {"weight": 3, "value": {"item": "barrow_torc", "quantity": "1d3"}},
                 {"weight": 3, "value": {"item": "healing_draught", "quantity": "2d3"}},
                 {"weight": 2, "value": {"item": "ward_salt", "quantity": "2d4"}},
                 {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}}]},
]
