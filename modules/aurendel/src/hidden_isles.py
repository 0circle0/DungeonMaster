"""The Sundered Isles' hidden threads — three, in the five areas nothing uses.

Cormorant is a rock with a jetty, an inn called the Shag, a store, a chapel and
two houses on it. Halfmast is a fort with a gun forge and a casemate row.
Neither had a single person in it. Tern Bank has a cut through it, the Narrows
have a wreck used as a navigation marker, and Wreck Reef has a deep wreck.

Three threads, and the sea is the liar in all of them:

  * **The Marker That Does Not Move** — everything in the Narrows shifts every
    winter. The marker wreck has been on the same bearing for two hundred years.
  * **What the Terns Know** — forty thousand birds nest the Bank and none of
    them nest the cut, and terns nest anywhere.
  * **The Deep Wreck** — a ship on the reef with her guns run out, in a
    hundred feet of water, pointing at the island.
"""
from questkit import npc, shop, quest, reach, kill, flagged, arc
from lorekit import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "sundered_isles"
SALVORS = "the_salvors"

MARKER = [
    clue("isle_marker_still",
         "Everything in the Narrows moves. Banks shift a cable a winter and the "
         "pilots redraw every spring. One wreck has been on the same bearing "
         "for two hundred years.",
         "a Narrows pilot"),
    clue("isle_marker_iron",
         "She is iron-fastened, and nobody was iron-fastening hulls when she "
         "went down. She is either much younger than the wreck or much older "
         "than the practice.",
         "the gun forge"),
    clue("isle_marker_held",
         "She is not aground. Divers have been under her twice and she is held, "
         "and what she is held by is not rock.",
         "the pilot station"),
    clue("isle_marker_bearing",
         "The bearing she keeps is not the channel. Laid off properly it runs "
         "through the Bank and out the far side.",
         "cut into the pilot station's rail"),
]

TERNS = [
    clue("isle_terns_nest",
         "Forty thousand pairs nest the Bank and not one pair nests the cut. "
         "Terns will nest on a wreck, on a gun, on a corpse.",
         "the Bank hut"),
    clue("isle_terns_year",
         "They came off the cut in one year, within living memory, and they had "
         "nested it for as long as anybody kept count before that.",
         "an old bird-taker"),
    clue("isle_terns_quiet",
         "Nothing calls in the cut. Forty thousand birds a hundred yards off "
         "and the cut is silent, which is a thing you can hear.",
         "the Shag's landlord"),
    clue("isle_terns_warm",
         "The sand in the cut does not freeze. Nothing else on the Bank stays "
         "unfrozen and it does not.",
         "a bird-taker"),
]

WRECK = [
    clue("isle_wreck_guns",
         "She went down with her guns run out. A ship that founders does not "
         "have her guns run out; a ship that was fighting does.",
         "the Salvors' Camp"),
    clue("isle_wreck_nothing",
         "There is nothing on the reef for her to have been fighting. No "
         "second wreck, no shot in the rock, nothing.",
         "a salvor"),
    clue("isle_wreck_pointing",
         "Every gun that is still run out is run out to one side, and that "
         "side is the island.",
         "the Rock Chapel"),
    clue("isle_wreck_shut",
         "Her hatches are dogged from outside. Somebody shut the crew in and "
         "then the ship went down with her guns out.",
         "cut on the salvors' capstan"),
]

LORE = MARKER + TERNS + WRECK

THREADS = [
    thread("isle_marker", "The Marker That Does Not Move",
           "Two hundred years on one bearing in a channel that redraws every "
           "spring, held by something that is not rock.", MARKER),
    thread("isle_terns", "What the Terns Know",
           "Forty thousand pairs on the Bank, none in the cut, and sand in the "
           "cut that will not freeze.", TERNS),
    thread("isle_wreck", "The Deep Wreck",
           "Guns run out on one side with nothing to fire at, and hatches "
           "dogged from outside.", WRECK),
]

ITEMS = [
    keepsake("pilots_book", "The Pilot's Book",
             "Two hundred springs of the Narrows redrawn, and one bearing that "
             "has never been rubbed out.",
             holder="narrows_pilot_hesk"),
    keepsake("takers_count", "The Bird-Taker's Count",
             "Eggs off the Bank by the season, back four generations. There is "
             "a year in it where the cut's column stops.",
             holder="bird_taker_nella"),
    keepsake("capstan_plate", "The Plate off the Capstan",
             "Brass off the salvors' capstan with a line cut into it by "
             "somebody who came up and did not want to say it out loud.",
             holder="salvor_bren"),

    trophy("dogged_pin", "A Pin off a Dogged Hatch",
           "Driven from the outside, and bent by whatever was on the inside.",
           "isle_wreck_shut"),

    relic("pilots_glass_ring", "The Pilot's Ring", "ring",
          "Two hundred years of a bearing that should have moved, cast into a "
          "band. Worn, a road you have walked once does not go wrong.",
          value=880, rarity="rare", skills={"survival": 3, "perception": 2}),
    relic("tern_cloak", "The Cloak of Forty Thousand", "cloak",
          "Tern feather over oiled canvas, out of a cut where no tern will "
          "nest. Nothing calls when you are wearing it.",
          value=1000, rarity="very_rare", guard=1, skills={"stealth": 4},
          resist=(("cold", 0.75),)),
    relic("run_out_gun", "The Gun That Was Run Out", "hand",
          "A ship's swivel cut down to a haft. It came up loaded and it is "
          "still loaded, and nobody has been able to draw it.",
          value=1250, rarity="very_rare",
          damage=("1d10", "piercing", "agility"), properties=["heavy"]),
]

LOOT_TABLES = [
    carried("isle_book_carried", "What Hesk Kept", "pilots_book"),
    carried("isle_count_carried", "What Nella Kept", "takers_count"),
    carried("isle_plate_carried", "What Bren Kept", "capstan_plate"),
]

GATES = [
    sealed("isle_marker_hold", "What Holds Her",
           "She is not aground. Two hundred years on one bearing and she is "
           "held, and what she is held by is not rock.",
           blocked("isle_marker_blocked",
                   "Getting under her wants a slack that comes twice a year "
                   "and lasts an hour. The pilots have two hundred springs of "
                   "when — you do not have the book.",
                   "The tide runs through here at four knots and there is "
                   "nothing to hold on to. You would want to know exactly "
                   "when it stops, and only one book knows.",
                   "She has been on this bearing since before the fort. "
                   "Whatever is under her has been holding her there the "
                   "whole time."),
           items=["pilots_book"], opens_flag="isle_marker_open"),

    sealed("isle_cut_sand", "Under the Sand That Will Not Freeze",
           "A cut through a bank of forty thousand birds, and no bird in it.",
           blocked("isle_cut_blocked",
                   "The sand goes down further than sand does and it is warm "
                   "the whole way. There is a year the birds came off this and "
                   "somebody's count has that year in it.",
                   "Silent, a hundred yards from forty thousand birds. You "
                   "can hear how silent it is, which is not a thing silence "
                   "usually does.",
                   "It does not freeze. The Bank freezes, the hut freezes, "
                   "the water in the hut freezes. This does not."),
           items=["takers_count"], opens_flag="isle_terns_open"),

    sealed("isle_wreck_hatch", "The Dogged Hatch",
           "Every hatch on her is dogged, and every dog was driven from "
           "outside.",
           blocked("isle_wreck_blocked",
                   "The pins are bent from the inside and driven from the "
                   "outside, and getting one out wants the leverage the "
                   "salvors use — and a very clear head about what the guns "
                   "were run out at.",
                   "A hundred feet down and her guns run out at an island "
                   "with nothing on it. Whatever the crew were shut in with, "
                   "they were shut in with it on purpose.",
                   "Dogged from outside. Somebody stood on this deck and "
                   "hammered these home while the ship was going down."),
           items=["capstan_plate", "tern_cloak"], opens_flag="isle_wreck_open"),
]

POI_PATCHES = {
    "narrows_marker_wreck": {**rumoured("isle_marker", base=20, step=3, entries=4),
                             "gate": "isle_marker_hold"},
    "tern_bank_the_cut": {**rumoured("isle_terns", base=20, step=3, entries=4),
                          "gate": "isle_cut_sand"},
    "wreck_reef_the_deep_wreck": {**rumoured("isle_wreck", base=23, step=4, entries=4,
                                             skill="survival"),
                                  "gate": "isle_wreck_hatch"},
}

POI_TRIGGERS = {
    "narrows_the_passage": [finding("isle_found_passage",
                                    "One bearing on a chart that has been "
                                    "redrawn two hundred times.",
                                    "isle_marker_still")],
    "tern_bank_the_bank": [finding("isle_found_bank",
                                   "Where forty thousand birds stop.",
                                   "isle_terns_nest")],
    "wreck_reef_the_reef": [finding("isle_found_reef",
                                    "Guns run out, on one side, at nothing.",
                                    "isle_wreck_guns")],
    "halfmast_the_fort": [finding("isle_found_fort",
                                  "What the fort's own guns are laid on, and "
                                  "what they are not.", "isle_wreck_pointing")],
    "cormorant_the_jetty": [finding("isle_found_jetty",
                                    "Ice on everything but one strand of sand "
                                    "across the water.", "isle_terns_warm")],

    "narrows_marker_wreck": [{
        "id": "isle_marker_committed", "mode": "once", "on": "enter",
        "description": "Alongside her at slack water.",
        "requires": {"custom": {"gte": [{"ref": "threads.isle_marker.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "isle_the_marker"}}}],
    }],
    "tern_bank_the_cut": [{
        "id": "isle_terns_committed", "mode": "once", "on": "enter",
        "description": "In the quiet part of the Bank.",
        "requires": {"custom": {"gte": [{"ref": "threads.isle_terns.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "isle_what_the_terns_know"}}}],
    }],
    "wreck_reef_the_deep_wreck": [{
        "id": "isle_wreck_committed", "mode": "once", "on": "enter",
        "description": "On her deck, with the guns run out beside you.",
        "requires": {"custom": {"gte": [{"ref": "threads.isle_wreck.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "isle_the_deep_wreck"}}}],
    }],
}

BOSSES = {
    "isles_bank_cut": "isle_cut_boss",
    "isles_deep_wreck": "isle_wreck_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("isle_the_marker", "The Marker That Does Not Move",
            "Two hundred years on one bearing in a channel that redraws every "
            "spring, held by something that divers say is not rock.",
            [reach("alongside", "Get alongside her at slack water.",
                   "narrows_marker_wreck", hidden=True),
             flagged("get_under", "Get under her.", "isle_marker_open",
                     hidden=True),
             kill("what_holds", "Find what has been holding her.",
                  "marker_holder", hidden=True)],
            xp=180, items=[("pilots_glass_ring", 1)], thread_key="isle_marker"),

    _hidden("isle_what_the_terns_know", "What the Terns Know",
            "Forty thousand pairs on the Bank, not one in the cut, and sand in "
            "the cut that will not freeze.",
            [reach("in_the_cut", "Get into the cut.", "tern_bank_the_cut",
                   hidden=True),
             flagged("down_the_sand", "Get under the sand.", "isle_terns_open",
                     hidden=True),
             kill("what_silences", "Find what the birds are avoiding.",
                  "cut_silence", hidden=True)],
            xp=185, items=[("tern_cloak", 1)], thread_key="isle_terns"),

    _hidden("isle_the_deep_wreck", "The Deep Wreck",
            "Guns run out at an island with nothing on it, and every hatch "
            "dogged from the outside.",
            [reach("on_her_deck", "Get onto her deck.",
                   "wreck_reef_the_deep_wreck", hidden=True),
             flagged("open_a_hatch", "Get a hatch open.", "isle_wreck_open",
                     hidden=True),
             kill("what_was_shut_in_her", "Meet what they shut in.",
                  "hold_thing", hidden=True)],
            xp=230, items=[("run_out_gun", 1)], thread_key="isle_wreck"),
]

ARCS = [
    arc("isle_hidden", "The Isles, Off the Chart",
        "Three things the sea has been consistent about, in a place where the "
        "sea is consistent about nothing.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("narrows_pilot_hesk", "Hesk, Pilot of the Narrows",
        "Takes hulls through a channel that redraws itself every spring, and "
        "keeps the book that says how it redrew.",
        faction=SALVORS, dialogue_id="isle_hesk_talk",
        home="narrows_pilot_station", disposition=2, gullibility=0.25,
        memory_span=300, statblock="isle_pilot",
        shop=shop("salvors_stock", buys=("treasure",), multiplier=1.3)),

    npc("bird_taker_nella", "Nella, Bird-Taker",
        "Takes eggs off Tern Bank in season, as her mother did, and keeps four "
        "generations of the count.",
        faction=SALVORS, dialogue_id="isle_nella_talk",
        home="tern_bank_hut", disposition=6, gullibility=0.4,
        memory_span=200, statblock="isle_taker"),

    npc("salvor_bren", "Bren of the Reef Camp",
        "Dives the reef for the Salvors and came up off the deep wreck once "
        "with a line cut into a brass plate and nothing to say.",
        faction=SALVORS, dialogue_id="isle_bren_talk",
        home="wreck_reef_salvors_camp", disposition=0, gullibility=0.3,
        memory_span=200, statblock="isle_salvor"),

    npc("gunner_othe", "Othe, at the Gun Forge",
        "Keeps Halfmast's guns for a fort with no garrison, and knows what "
        "iron of what age looks like.",
        faction=SALVORS, dialogue_id="isle_othe_talk",
        home="halfmast_forge", disposition=4, gullibility=0.3,
        memory_span=180,
        shop=shop("salvors_stock", buys=("material",), multiplier=1.2)),

    npc("shag_landlord_dree", "Dree, at the Shag",
        "Keeps the only roof on Cormorant that will take a stranger, and "
        "listens to the water for a living without meaning to.",
        faction=SALVORS, dialogue_id="isle_dree_talk",
        home="cormorant_the_shag", disposition=8, gullibility=0.5,
        memory_span=150,
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.35)),

    npc("rock_chaplain_ilva", "Ilva, at the Rock Chapel",
        "Buries what the sea gives back, which on Cormorant is a full-time "
        "occupation, and has views about which way things are pointing.",
        faction="the_keepers", dialogue_id="isle_ilva_talk",
        home="cormorant_chapel", disposition=8, gullibility=0.4,
        memory_span=200, cares=["ward_restored", "ward_broken"]),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from loot import group, encounters  # noqa: E402

_SEA = dict(creature_type="humanoid", faction="the_salvors")

MONSTERS = [
    creature("isle_pilot", "Hesk, Pilot of the Narrows", 6, 0,
             A(13, 16, 14, 14, 16, 12), ["strike"],
             "Forty years of standing on a heeling deck reading water.",
             descriptors=["a salt-cured"], loot="isle_book_carried", hp=34,
             **_SEA),
    creature("isle_taker", "Nella, Bird-Taker", 5, 0,
             A(12, 17, 13, 10, 15, 11), ["strike", "quick_shot"],
             "Goes down a cliff on a rope for a living.",
             descriptors=["a wiry"], loot="isle_count_carried", hp=28, **_SEA),
    creature("isle_salvor", "Bren of the Reef Camp", 6, 0,
             A(16, 14, 17, 11, 14, 10), ["strike"],
             "Dives a hundred feet on one breath, repeatedly, by choice.",
             descriptors=["a barrel-chested"], loot="isle_plate_carried",
             hp=38, **_SEA),

    creature("marker_holder", "What Holds Her", 7, 740,
             A(17, 13, 17, 11, 15, 12), ["latch", "drag_under", "rend"],
             "Two hundred years of one bearing in a channel that redraws every "
             "spring. Something down there has been very patient.",
             behaviour=[{"priority": 20, "use": "latch", "when": {"chance": 0.4}},
                        {"priority": 10, "use": "drag_under"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a barnacled", "a rooted"], loot="isle_marker_hoard",
             immunities=["prone", "frightened"], hp=86),
    creature("cut_silence", "What the Birds Left", 7, 720,
             A(14, 16, 15, 13, 18, 16), ["wither", "grave_chill", "bleed_white"],
             "Forty thousand pairs will nest on a gun or a corpse. They will "
             "not nest here, and they have been right about it for a lifetime.",
             behaviour=[{"priority": 15, "use": "bleed_white"},
                        {"priority": 0, "use": "wither"}],
             descriptors=["a soundless", "a pale"], loot="isle_cut_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned"], hp=80),
    creature("hold_thing", "What They Shut In", 8, 950,
             A(19, 14, 18, 12, 16, 13), ["drag_under", "rend", "bleed_white",
                                          "latch"],
             "Her guns were run out at the island and her hatches were dogged "
             "from the deck. The crew made both of those decisions.",
             behaviour=[{"priority": 20, "use": "drag_under",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "latch"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a bloated", "a long-drowned"],
             loot="isle_wreck_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "prone"], hp=110),
]

ENCOUNTER_TABLES = [
    encounters("isle_cut_boss", [group("b", [("cut_silence", "1", False)])],
               chance=1, empty=0),
    encounters("isle_wreck_boss", [group("b", [("hold_thing", "1", False)])],
               chance=1, empty=0),
    encounters("isle_marker_boss", [group("b", [("marker_holder", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "isle_marker_hoard", "name": "Under the Marker", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "2d6"}},
                 {"weight": 2, "value": {"item": "wreck_brass", "quantity": "1d3"}},
                 {"weight": 1, "value": {"item": "amber_lump", "quantity": "1"}}]},
    {"id": "isle_cut_hoard", "name": "Under the Cut", "rolls": "2",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 3, "value": {"item": "old_coin", "quantity": "3d6"}},
                 {"weight": 2, "value": {"item": "ward_salt", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}}]},
    {"id": "isle_wreck_hoard", "name": "Below Her Hatches", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "5d6"}},
                 {"weight": 2, "value": {"item": "wreck_brass", "quantity": "2d3"}},
                 {"weight": 1, "value": {"item": "dogged_pin", "quantity": "1",
                                         "unique": True}},
                 {"weight": 2, "value": {"item": "warded_coat", "quantity": "1"}}]},
]

_hesk = [
    rumour("isle_hesk_still", "How much does the Narrows move in a year?",
           "“A cable, sometimes two.” He taps the chart, which has been rubbed "
           "out and redrawn until it is furry. “Everything on here has been "
           "moved in my lifetime except one bearing, and that bearing is a "
           "wreck, and a wreck is the last thing that ought to stay put.”",
           "isle_marker_still", faction=SALVORS, base=12),
    rumour("isle_hesk_held", "Has anybody been under her?",
           "“Twice.” He does not enjoy saying it. “Bren went the second time. "
           "She is not aground — she is *held*, and what she is held by is not "
           "rock, and Bren came up and would not put it in words.”",
           "isle_marker_held", faction=SALVORS, base=15, skill="persuasion"),
    rumour("isle_hesk_bearing", "Lay her bearing off properly. Where does it "
           "go?",
           "He does it, because a pilot cannot resist a chart. The rule stops. "
           "“Through the Bank,” he says, “and out the far side. Which is not "
           "the channel, and never has been, and I have taken hulls through "
           "here for forty years on a mark that points at nothing.”",
           "isle_marker_bearing", faction=SALVORS, base=16, skill="insight"),
]
_hesk.append(favour(
    "isle_hesk_book",
    "The book. Two hundred springs of it.",
    "He gets it out of the oilskin and does not hand it over so much as "
    "surrender it. “Slack is in there. Twice a year, an hour of it.” A hard "
    "look. “If you are going under her, go at the slack, and do not be the "
    "third person who will not put it in words.”",
    "pilots_book", faction=SALVORS, base=17, cost=3,
    refused="“It is the station's,” he says, “and there is one of it.”"))

DIALOGUES = [
    talk("isle_hesk_talk", "greet",
         ["A station on a rock with a chart table bolted to the floor and a "
          "chart on it that has been redrawn so often it is furry.",
          "“Pilotage is by the hull and I do not take passengers.”"],
         _hesk,
         redirects=[coldshoulder("isle_hesk", SALVORS, -30,
                                 "He rolls the chart up, which on a bolted "
                                 "table takes some doing and makes the point.",
                                 back="greet")[0]],
         extra_nodes=[coldshoulder("isle_hesk", SALVORS, -30,
                                   "He rolls the chart up, which on a bolted "
                                   "table takes some doing and makes the "
                                   "point.", back="greet")[1]]),

    talk("isle_othe_talk", "greet",
         ["A forge in a casemate, with a fort's worth of guns outside it and "
          "no garrison to fire them.",
          "“Iron work, and I will not do locks. Ask at Blackrigging for "
          "locks.”"],
         [rumour("isle_othe_iron",
                 "The marker wreck in the Narrows. What is she fastened with?",
                 "“Iron.” He puts down the hammer, because this is his "
                 "subject. “Nobody was iron-fastening hulls when she is "
                 "supposed to have gone down. Either she is a hundred years "
                 "younger than the story or somebody was iron-fastening a "
                 "hundred years before anybody else, and I would like to know "
                 "which.”",
                 "isle_marker_iron", faction=SALVORS, base=12, skill="insight"),
          rumour("isle_othe_guns",
                 "The deep wreck went down with her guns run out.",
                 "“Run out and *loaded*.” He is grim about it. “Bren brought a "
                 "swivel up and it is still charged. A ship that founders "
                 "houses her guns. A ship with her guns run out was fighting, "
                 "and there is nothing on that reef to fight.”",
                 "isle_wreck_guns", faction=SALVORS, base=13)]),

    talk("isle_dree_talk", "greet",
         ["A low room with the window shuttered against spray and a fire that "
          "smells of driftwood.",
          "“Bed, ale, or the boat times. The boat times are a lie, mind, "
          "they come when they come.”"],
         [rumour("isle_dree_quiet",
                 "You hear the Bank from here. What does the cut sound like?",
                 "“Nothing.” She says it and then makes sure you have got it. "
                 "“Forty thousand birds on the Bank, and you can hear them "
                 "here on a still night, and there is a strip in the middle of "
                 "it that is *silent*. You can hear the shape of the silence. "
                 "It has a hundred yards of edges.”",
                 "isle_terns_quiet", faction=SALVORS, base=11),
          rumour("isle_dree_warm",
                 "There is ice on everything here and none on the Bank sand.",
                 "“One strip of it.” She nods out at the water. “The jetty "
                 "ices, the hut ices, the water in the hut ices. That strip "
                 "does not, and it has not in my time or my father's.”",
                 "isle_terns_warm", faction=SALVORS, base=12)]),

    talk("isle_ilva_talk", "greet",
         ["A chapel cut into rock, with more graves outside it than Cormorant "
          "has ever had living people.",
          "“I bury what the sea gives back,” she says. “It gives back a great "
          "deal. Sit down.”"],
         [rumour("isle_ilva_pointing",
                 "The deep wreck's guns. Which way are they run out?",
                 "“One side. All of them.” She lets it sit. “At the island. "
                 "Not at the open water, not at the reef — at the island, "
                 "which has a chapel on it and eleven houses and nothing else "
                 "and never has had.” A pause. “I have thought about that a "
                 "great deal, at night.”",
                 "isle_wreck_pointing", faction="the_keepers", base=13),
          rumour("isle_ilva_year",
                 "When did the terns come off the cut?",
                 "“In my mother's time. One year, and never again.” She folds "
                 "her hands. “There are people alive who took eggs off that "
                 "strip as children. Nella's count has the column and the "
                 "column stops.”",
                 "isle_terns_year", faction="the_keepers", base=12)]),
]

_nella = [
    rumour("isle_nella_nest", "How much of the Bank do they nest?",
           "“All of it but the cut.” She is unbothered discussing it and "
           "bothered by the fact. “A tern will nest on a wreck. On a gun. On a "
           "dead seal. I have seen a pair raise two on a capstan.” She looks "
           "across at the strip. “Not there.”",
           "isle_terns_nest", faction=SALVORS, base=10),
    rumour("isle_nella_year", "When did they stop?",
           "“One season, in my grandmother's count.” She says it precisely, "
           "because it is a number and she keeps numbers. “Full column the "
           "year before. Nothing the year after. Nothing since.”",
           "isle_terns_year", faction=SALVORS, base=13),
]
_nella.append(favour(
    "isle_nella_count",
    "The count. All four generations.",
    "She fetches it wrapped in oilcloth, which tells you what it is worth to "
    "her. “The year it stops is marked. My grandmother put a line under it and "
    "did not write why, and I have wanted to know why since I could read.”",
    "takers_count", faction=SALVORS, base=13, cost=2,
    refused="“It is the family's,” she says. “Ask me anything out of it.”"))

DIALOGUES.append(
    talk("isle_nella_talk", "greet",
         ["A hut on a sandbank, with a ledger on the table and forty thousand "
          "birds outside making it impossible to think.",
          "“Eggs are in season or they are not. This week they are not.”"],
         _nella))

_bren = [
    rumour("isle_bren_nothing", "What was she fighting?",
           "“Nothing.” He is very short about it. “I have been over that reef "
           "for eleven years. No second wreck. No shot in the rock. Nothing "
           "down there that anybody ever fired at.”",
           "isle_wreck_nothing", faction=SALVORS, base=13),
    rumour("isle_bren_shut", "Her hatches.",
           "It takes him a while. “Dogged. From the outside.” He puts his cup "
           "down. “The pins are bent from the *inside*. Somebody stood on that "
           "deck and hammered them home, and something under the deck did its "
           "best about it, and she went down with her guns out.”",
           "isle_wreck_shut", faction=SALVORS, base=17, skill="persuasion"),
    rumour("isle_bren_held", "You went under the marker wreck.",
           "“Once.” Nothing else comes for a moment. “She is not aground.” He "
           "looks at the fire. “I am not going to describe what she is on. "
           "Hesk has asked me for eleven years and I have not described it to "
           "him either.”",
           "isle_marker_held", faction=SALVORS, base=18, skill="persuasion"),
]
_bren.append(favour(
    "isle_bren_plate",
    "The plate off the capstan. The one with the line on it.",
    "He gets it out without a word and puts it down face up, which is the "
    "first time anybody has seen it face up in eleven years. “I cut that "
    "coming up,” he says. “I did not want to say it and I did not want to "
    "forget it.”",
    "capstan_plate", faction=SALVORS, base=16, cost=3,
    refused="He turns it face down under his hand. “No.”"))

DIALOGUES.append(
    talk("isle_bren_talk", "greet",
         ["A salvors' camp on a shingle spit, gear drying on every line, and a "
          "big man sitting where he can see the reef.",
          "“Camp's the Salvors'. If you are here to dive, you are not.”"],
         _bren,
         redirects=[coldshoulder("isle_bren", SALVORS, -25,
                                 "He stands up, which is a considerable amount "
                                 "of standing up, and looks past you at the "
                                 "reef until you go.", back="greet")[0]],
         extra_nodes=[coldshoulder("isle_bren", SALVORS, -25,
                                   "He stands up, which is a considerable "
                                   "amount of standing up, and looks past you "
                                   "at the reef until you go.",
                                   back="greet")[1]]))
