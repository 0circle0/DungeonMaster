"""Tier one — the first three doors, and what has been living under the vale."""
from dmkit.quests import npc, shop, reach, kill, flagged, arc
from dmkit.prose import pool
from postgame import tier, link, warrant, proving, loosed

KEY = "trial_one"
KEEPERS = "the_keepers"

ITEMS = [
    warrant("first_warrant", "The Warrant of the First Three",
            "Hesper's own list, with the first three lines struck through and "
            "countersigned, which is a thing the Keepers have not had cause to "
            "do in nine hundred years."),

    # Trial gear sits in the same four slots every other optional payout uses.
    {"id": "eighth_list_cloak", "name": "The Cloak of the Eighth List",
     "description": "Keeper's oilcloth with eight lines stitched inside the "
                    "collar and three of them picked out again in red.",
     "kind": "armor", "slot": "cloak", "value": 1600, "weight": 2,
     "rarity": "very_rare", "tags": ["fabled", "trial"],
     "modifiers": {"guard": 2},
     "skillBonuses": {"resolve": 3, "lore": 3, "perception": 2},
     "damageInteractions": [{"damageType": "necrotic", "multiplier": 0.5}]},

    {"id": "cellar_belt", "name": "The Belt Out of the Ward Cellars",
     "description": "Strapping off something that had been holding a door "
                    "shut from the wrong side for a very long time.",
     "kind": "trinket", "slot": "belt", "value": 1450, "weight": 1,
     "rarity": "very_rare", "tags": ["fabled", "trial"],
     "modifiers": {"guard": 1, "carry": 4},
     "skillBonuses": {"athletics": 3, "intimidation": 3}},

    {"id": "underkeep_ring", "name": "The Ring Under the Keep",
     "description": "Found on the sixth finger of a hand that had five.",
     "kind": "trinket", "slot": "ring", "value": 1500, "weight": 0,
     "rarity": "very_rare", "tags": ["fabled", "trial"],
     "skillBonuses": {"arcana": 3, "insight": 3, "medicine": 2}},
]

GATES = [
    proving("trial_one_door", "The First of the Eight",
            "A cellar door under a ward-house, barred on the inside by "
            "something that was inside.",
            "trial_one_blocked", KEY, opens_flag="trial_one_open"),
]

pool("trial_one_blocked",
     "The bar is on this side of the door and it has been chewed rather than "
     "cut. Whatever is down there put it up itself, and has kept it up, and "
     "would rather you came dressed.",
     "Hesper's list has eight lines on it. Three are struck through in red "
     "and the red is not old. She did not strike them through herself.",
     "You have walked past this door before, in an act of your life that is "
     "over now, and it was a cellar door then.")

POI_PATCHES = {
    "highpass_ward_cellars": {"gate": "trial_one_door"},
}

BOSSES = {
    "highpass_cellars": "trial_one_first",
    "moor_under_keep": "trial_one_second",
    "duskwood_root_cellar": "trial_one_third",
}


QUESTS = tier(KEY, [
    link("trial_one_cellars", "The First Door",
         "Hesper's list says the first of the eight was opened under a "
         "ward-house in the Skarnspine, and that the bar on its cellar door is "
         "on the inside.",
         [reach("to_the_cellars", "Get down to the ward cellars.",
                "highpass_ward_cellars"),
          flagged("past_the_bar", "Get past a bar that was put up from "
                  "inside.", "trial_one_open"),
          kill("the_first", "Finish what came through the first door.",
               "first_through")],
         xp=1400, items=[("cellar_belt", 1)],
         reputation={"the_keepers": 20}),

    link("trial_one_underkeep", "The Second Door",
         "The moor took Barrowgate's keep back four hundred years ago. "
         "Something has been keeping the undercroft dry the whole time.",
         [reach("under_the_keep", "Get into the undercroft.",
                "barrowgate_under_keep"),
          kill("the_second", "Finish what came through the second door.",
               "second_through")],
         xp=1500, items=[("underkeep_ring", 1)],
         reputation={"the_keepers": 20}),

    link("trial_one_rootcellar", "The Third Door",
         "A root cellar in the Hollow Beeches with a floor under the floor, "
         "and the Keepers' third line struck through in red by a hand that was "
         "not Hesper's.",
         [reach("into_the_cellar", "Get into the root cellar.",
                "hollow_beeches_root_cellar"),
          kill("the_third", "Finish what came through the third door.",
               "third_through")],
         xp=1700, items=[("eighth_list_cloak", 1)],
         reputation={"the_keepers": 30}),
], giver="keeper_hesper", warrant_item="first_warrant", level=14)


ARCS = [
    arc("trial_one_arc", "The First Three",
        "Three of the eight doors nobody was watching, and what walked out of "
        "them while everybody was looking at the ninth.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("keeper_hesper", "Hesper, of the Eighth List",
        "Has spent a working life on the eight doors nobody cared about, and "
        "came down to Lantern Deep the week the ninth stopped being "
        "interesting.",
        faction=KEEPERS, dialogue_id="trial_hesper_talk",
        home="lantern_deep_fungus_market", disposition=3, gullibility=0.15,
        memory_span=365, cares=["lantern_lit", "hold_honoured"],
        # All three heads, not just this tier's.
        offers=["trial_one_cellars", "trial_two_galleries",
                "trial_three_listening"],
        shop=shop("keeper_stock", buys=("treasure",), multiplier=1.1)),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402

MONSTERS = [
    creature("first_through", "What Came Through the First", 13, 3400,
             A(20, 17, 21, 16, 18, 15), ["stone_fist", "rend", "shove",
                                         "grave_chill"],
             "A cellar bar chewed through and put back up from the inside, "
             "every year, for as long as there has been a ward-house over it.",
             behaviour=[{"priority": 25, "use": "stone_fist",
                         "when": {"chance": 0.4}},
                        {"priority": 15, "use": "grave_chill"},
                        {"priority": 5, "use": "shove"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a hunched", "a patient"], loot="trial_one_hoard_a",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone", "blinded", "poisoned"],
             hp=210),

    creature("second_through", "What Came Through the Second", 14, 4000,
             A(18, 19, 20, 19, 20, 18), ["wither", "unmaking_word",
                                         "bleed_white", "grave_chill"],
             "Four hundred years of a moor taking a keep back, and an "
             "undercroft under it that has stayed dry.",
             behaviour=[{"priority": 25, "use": "unmaking_word",
                         "when": {"chance": 0.3}},
                        {"priority": 15, "use": "wither"},
                        {"priority": 5, "use": "bleed_white"},
                        {"priority": 0, "use": "grave_chill"}],
             descriptors=["a dry", "an articulate"], loot="trial_one_hoard_b",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "silenced", "slowed"],
             hp=196),

    creature("third_through", "What Came Through the Third", 15, 4800,
             A(21, 18, 22, 17, 19, 17), ["rend", "drag_under", "spore_burst",
                                         "cut_and_run"],
             "A root cellar with a floor under the floor, and the third line "
             "on a Keeper's list struck through in red by somebody who was "
             "not the Keeper.",
             behaviour=[{"priority": 25, "use": "spore_burst",
                         "when": {"chance": 0.35}},
                        {"priority": 15, "use": "drag_under"},
                        {"priority": 5, "use": "cut_and_run"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a many-rooted", "a spreading"],
             loot="trial_one_hoard_c", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone", "poisoned", "bleeding"],
             hp=240),

    # What is loose in the places the party already cleared.
    creature("door_walker", "A Door-Walker", 11, 1800,
             A(17, 16, 17, 13, 16, 12), ["rend", "shove", "grave_chill"],
             "Eight doors were opened and only the ninth was watched. These "
             "are what has been walking between them since.",
             behaviour=[{"priority": 10, "use": "grave_chill",
                         "when": {"chance": 0.3}},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a lean", "a wrong-jointed"], loot="trial_loose_drop",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone"], hp=120),
]

from dmkit.loot import group, encounters  # noqa: E402

ENCOUNTER_TABLES = [
    encounters("trial_one_first", [group("b", [("first_through", "1", False)])],
               chance=1, empty=0),
    encounters("trial_one_second", [group("b", [("second_through", "1", False)])],
               chance=1, empty=0),
    encounters("trial_one_third", [group("b", [("third_through", "1", False)])],
               chance=1, empty=0),

    # Rule 5: the quiet half of the continent, after the ending.
    loosed("the_loosed", [
        ("walkers", [("door_walker", "1d2", True)], 5),
        ("a_pair", [("door_walker", "2", False)], 2),
    ], chance=0.4, empty=4),
]

# Places already walked and left safe.
AREA_ENCOUNTERS = {
    "skarnspine_highpass": ["the_loosed"],
    "moor_barrowgate": ["the_loosed"],
    "duskwood_hollow_beeches": ["the_loosed"],
    "kingsvale_hedge_country": ["the_loosed"],
    "coast_wreckers_strand": ["the_loosed"],
}

LOOT_TABLES = [
    {"id": "trial_one_hoard_a", "name": "Behind the Chewed Bar", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 2, "onCritical": 3},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "8d6"}},
                 {"weight": 3, "value": {"item": "hold_silver", "quantity": "2d4"}},
                 {"weight": 2, "value": {"item": "ward_salt", "quantity": "1d3"}},
                 {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}}]},
    {"id": "trial_one_hoard_b", "name": "The Dry Undercroft", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 2, "onCritical": 3},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "8d6"}},
                 {"weight": 3, "value": {"item": "healing_draught", "quantity": "1d3"}},
                 {"weight": 2, "value": {"item": "barrow_torc", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "warded_coat", "quantity": "1"}}]},
    {"id": "trial_one_hoard_c", "name": "Under the Floor Under the Floor",
     "rolls": "4", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 2, "onCritical": 3},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "9d6"}},
                 {"weight": 3, "value": {"item": "antidote", "quantity": "1d3"}},
                 {"weight": 3, "value": {"item": "ward_salt", "quantity": "1d3"}},
                 {"weight": 1, "value": {"item": "amber_lump", "quantity": "1d3"}}]},
    {"id": "trial_loose_drop", "name": "Off a Door-Walker", "rolls": "1",
     "emptyChance": 0.4,
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "2d6"}},
                 {"weight": 2, "value": {"item": "wight_ash", "quantity": "1"}},
                 {"weight": 1, "value": {"item": "ward_salt", "quantity": "1"}}]},
]

# --- conversation ---------------------------------------------------------

from dmkit.quests import dialogue, node, option, take_job, set_flag  # noqa: E402

DIALOGUES = [
    dialogue("trial_hesper_talk", "greet", [
        node("greet", [
            "A Keeper in a fungus market four miles under the world, with a "
            "board in front of her and one sheet pinned to it.",
            "\"You are the one who did the ninth,\" says Hesper. \"Sit down. "
            "I have a list.\"",
        ], redirects=[
            ({"quests": [{"quest": "trial_one_rootcellar", "status": "complete"}]},
             "three_down"),
        ], options=[
            option("what_list", "What list?", goto="the_list"),
            option("leave", "Not now."),
        ]),

        node("the_list", [
            "\"Nine doors. Opened in order, over eleven hundred years, and "
            "everybody in my order has spent their career on the ninth "
            "because the ninth was open.\" She turns the sheet round. Eight "
            "lines. \"These are the eight nobody watched. They were opened "
            "first. Whatever came out of them has had between four hundred "
            "and eleven hundred years to find somewhere quiet.\"",
        ], options=[
            option("where", "Where is somewhere quiet?", goto="the_quiet"),
            option("back", "Hm.", goto="greet"),
        ]),

        node("the_quiet", [
            "\"Under the places you made safe.\" She does not soften it. "
            "\"The ward cellars at Highpass. The undercroft at Barrowgate. A "
            "root cellar in the Hollow Beeches with a floor under the "
            "floor.\" A finger on the first three lines, each struck through "
            "in red. \"Those three are already struck out. In red. I did not "
            "strike them out and neither did any Keeper living.\"",
        ], options=[
            take_job("take", "Then we start at the first one.",
                     "trial_one_cellars", "the_terms"),
            option("back", "Give me a moment.", goto="greet"),
        ]),

        node("the_terms", [
            "\"Two conditions and they are not mine, they are the door's.\" "
            "Hesper counts them off. \"Come at it properly levelled, because "
            "the thing behind it has had four hundred years and you have had "
            "one. And wear something out of the quiet half of this "
            "continent — a cloak, a hood, whatever you brought up out of a "
            "thread nobody set you on.\"",
            "\"The bar on that cellar door is on the inside. Think about what "
            "that means before you pull on it.\"",
        ], options=[
            option("understood", "Understood.", goto="greet"),
        ]),

        node("three_down", [
            "Hesper has the sheet off the board and flat on the table. Three "
            "lines struck through in her own hand now, over the red.",
            "\"Three,\" she says. \"In one season. My order has managed nine "
            "in eleven hundred years and eight of those were the same door "
            "twice.\" She signs the bottom of it and pushes it across. "
            "\"That is a warrant. There are five lines left on it and the "
            "next two are worse.\"",
        ], options=[
            option("done", "Then there are five left."),
        ]),
    ]),
]
