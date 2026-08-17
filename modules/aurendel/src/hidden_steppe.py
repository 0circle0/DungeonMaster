"""The Sunward Steppe's hidden threads — three, in the five areas nothing uses.

Tallgrass is six buildings in the one place the grass goes over head height —
a store, a shrine, a hayward's, and nobody in any of them. The Horse Road is
not a road: it is forty yards of grass ridden flat for nine hundred years, with
a relay post on it and a stone horse beside it. The Dry River is a bed a quarter
of a mile wide with no water in it for eleven months. The Windbreak is a line of
trees eleven miles long, planted, and no record of anybody planting it. The
South Reach is where the grass thins and the Glasslands start making themselves
felt.

Three threads, and they share a shape: **the grass is lying over somebody's
work, and the work is still doing what it was built to do.**

  * **The Planting** — eleven miles of one species set within a season of each
    other, running the wrong way to break any wind that blows here.
  * **What the Bank Shows** — a quarter-mile bed for a river that runs one
    month, and forty feet down in the face of it, courses that were laid.
  * **The Last Water** — a spring at the edge of the pale ground that has never
    failed, running warm, with a shored shaft beside it in a country that has
    never had a mine.
"""
from questkit import npc, shop, quest, reach, kill, flagged, arc
from lorekit import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "sunward_steppe"
LINES = "the_horse_lords"

PLANTING = [
    clue("step_line_season",
         "Eleven miles of it, one species the whole way, and every tree in it "
         "was set within a season of every other. That is a season's work for "
         "four hundred people.",
         "a shade herder"),
    clue("step_line_wrong",
         "The wind here comes off the south-west and has for as long as "
         "anybody has grazed here. The line runs south-west to north-east. It "
         "breaks nothing at all.",
         "the hayward"),
    clue("step_line_norecord",
         "The Lines have kept a record of every foaling, every crossing and "
         "every death for nine hundred years, and there is no entry anywhere "
         "for eleven miles of trees.",
         "the relay post"),
    clue("step_line_count",
         "Count them going north and count them coming back and you will not "
         "get the same number, and you will not get it twice running either.",
         "the Windbreak"),
]

BANK = [
    clue("step_bank_width",
         "A quarter of a mile across, for a river that runs four weeks in the "
         "year. Nothing that runs four weeks a year cuts a bed that wide.",
         "the Ford Camp"),
    clue("step_bank_courses",
         "Forty feet down in the open face there are courses of dressed stone. "
         "Not fallen in and not washed down — laid, level, and going on into "
         "the bank both ways.",
         "the Dry Bed"),
    clue("step_bank_week",
         "The flood comes in the same week every year and the Lines move stock "
         "three days ahead of it. Ask any of them how they know and they will "
         "say the grass tells you, and they will not be able to say how.",
         "a rider"),
    clue("step_bank_ford",
         "There has been a camp at that crossing for nine hundred years, and "
         "the crossing is dry eleven months and impassable the twelfth. Nobody "
         "has ever needed to camp there.",
         "the Cut Store"),
]

WATER = [
    clue("step_water_never",
         "The spring at the edge of the pale ground has not failed in nine "
         "hundred years of record, and two miles further on nothing has run at "
         "all since before anybody was counting.",
         "the well watcher"),
    clue("step_water_warm",
         "It comes up warm and it tastes of iron. Every other water on this "
         "grass comes up cold and tastes of grass.",
         "the Ford Camp"),
    clue("step_water_shored",
         "Whatever goes down beside it is shored, with timber, properly. "
         "Shoring is a mine's work and there has never been a mine on this "
         "steppe.",
         "the shade camp"),
    clue("step_water_wont",
         "The Lines will water there and will not camp there, and they have "
         "twelve reasons between them and no two of the twelve agree.",
         "the Pale Ground"),
]

LORE = PLANTING + BANK + WATER

THREADS = [
    thread("step_line", "The Planting",
           "Eleven miles of one species set in a single season, running the "
           "wrong way to break any wind that blows here, with no record "
           "anywhere of the work.", PLANTING),
    thread("step_bank", "What the Bank Shows",
           "A quarter-mile bed for a four-week river, and forty feet down in "
           "the open face, courses that were laid level.", BANK),
    thread("step_water", "The Last Water",
           "A spring that has never failed at the edge of a country where "
           "nothing runs, warm and tasting of iron, with a shored way down "
           "beside it.", WATER),
]

ITEMS = [
    keepsake("planting_tally", "The Hayward's Count",
             "Forty years of counting the same eleven miles, in one hand, and "
             "the column does not settle.",
             holder="hayward_serel"),
    keepsake("flood_book", "The Relay Flood Book",
             "Nine hundred years of the same week, kept by riders who each "
             "wrote down the day the grass told them and never why.",
             holder="relay_rider_talith"),
    keepsake("shaft_warrant", "The Warrant for the Shoring",
             "A timber order, signed and sealed, for a working on ground that "
             "has never been worked, dated in a year nobody uses any more.",
             holder="well_watcher_ondir"),

    trophy("laid_course", "A Stone Out of the Face",
           "Dressed on five sides, laid level, and pulled out of a river bank "
           "forty feet below the grass.",
           "step_bank_courses"),

    relic("windbreak_belt", "The Belt of the Eleven Miles", "belt",
          "Bark cord off a tree that was set in a season nobody wrote down. "
          "The wearer counts what is in front of them and gets it right.",
          value=740, rarity="rare", skills={"perception": 3, "survival": 2}),
    relic("flood_ring", "The Ring of the Fourth Week", "ring",
          "Iron off a ford post nine hundred years of riders have tied to. "
          "Water is slower to take the wearer than it should be.",
          value=780, rarity="rare", resist=(("cold", 0.75),),
          skills={"athletics": 3, "survival": 2}),
    relic("warm_water_hood", "The Hood off the Warm Water", "head",
          "Felt gone stiff with iron out of a spring that has never failed. "
          "Heat and thirst arrive later for whoever wears it.",
          value=860, rarity="very_rare", guard=1,
          resist=(("fire", 0.75),), skills={"resolve": 2, "survival": 3}),
]

LOOT_TABLES = [
    carried("step_tally_carried", "What Serel Kept", "planting_tally"),
    carried("step_book_carried", "What Talith Kept", "flood_book"),
    carried("step_warrant_carried", "What Ondir Kept", "shaft_warrant"),
]

GATES = [
    sealed("step_line_root", "Under the Marker",
           "A stone at the middle of eleven miles of trees, and under it the "
           "roots go down further than roots go.",
           blocked("step_line_blocked",
                   "The count is the way in and the count does not settle. "
                   "Forty years of somebody writing down a different number "
                   "for the same eleven miles is the only record of this that "
                   "exists, and the hayward has it.",
                   "One species, eleven miles, one season. Somebody had four "
                   "hundred people and a reason, and left no note of either.",
                   "It runs with the wind rather than across it. Whatever "
                   "this line is for, it is not for the wind."),
           items=["planting_tally"], opens_flag="step_line_open"),

    sealed("step_bank_course", "Into the Laid Course",
           "Forty feet down the open face, a course of dressed stone going "
           "into the bank both ways, and one block out of it.",
           blocked("step_bank_blocked",
                   "The face is only open in the four weeks the water is in "
                   "it, and the week is in the relay book, and the relay book "
                   "is nine hundred years of riders writing down a day and "
                   "never a reason.",
                   "Laid, level, and going on into the bank in both "
                   "directions. This was not a wall. A wall has an end.",
                   "A quarter of a mile of bed for four weeks of river. "
                   "Something else cut this and the river only uses it."),
           items=["flood_book"], opens_flag="step_bank_open"),

    sealed("step_water_shoring", "Past the Shoring",
           "Sound timber in a country with no timber, holding up a way down "
           "beside a spring that has never failed.",
           blocked("step_water_blocked",
                   "Shoring is ordered, and an order is signed, and the order "
                   "for this one still exists. Without it you are looking at "
                   "a hole with good carpentry in it.",
                   "The water comes up warm and tastes of iron on a steppe "
                   "where every other spring is cold and tastes of grass.",
                   "They will water here and they will not camp here, and "
                   "there are twelve reasons and no two of them agree, which "
                   "is what people do instead of remembering."),
           items=["shaft_warrant"], opens_flag="step_water_open"),
]

POI_PATCHES = {
    # A marker stone in the middle of eleven miles of trees, not a dungeon
    # mouth, so what is under it carries its own table and its own chance.
    "windbreak_the_planter": {**rumoured("step_line", base=19, step=3, entries=4,
                                         skill="survival"),
                              "gate": "step_line_root",
                              "encounterTables": ["step_line_boss"],
                              "encounterChance": 1},
    "dry_river_cut_bank": {**rumoured("step_bank", base=20, step=3, entries=4),
                           "gate": "step_bank_course"},
    "south_reach_sand_shaft": {**rumoured("step_water", base=21, step=3, entries=4),
                               "gate": "step_water_shoring"},
}

POI_TRIGGERS = {
    "windbreak_the_line": [finding("step_found_line",
                                   "Which way the trees run, and which way the "
                                   "wind does.", "step_line_wrong")],
    "dry_river_the_bed": [finding("step_found_bed",
                                  "What is showing forty feet down in the open "
                                  "face.", "step_bank_courses")],
    "south_reach_the_pale": [finding("step_found_pale",
                                     "Where the grass stops, and how close the "
                                     "spring is to it.", "step_water_wont")],
    "horse_road_stone_horse": [finding("step_found_horse",
                                       "A relay marker for a stage that is not "
                                       "on the road.", "step_line_norecord")],
    "dry_river_ford_camp": [finding("step_found_camp",
                                    "Nine hundred years of hearths at a "
                                    "crossing nobody needs to cross.",
                                    "step_bank_ford")],

    "windbreak_the_planter": [{
        "id": "step_line_committed", "mode": "once", "on": "enter",
        "description": "At the stone in the middle of the eleven miles.",
        "requires": {"custom": {"gte": [{"ref": "threads.step_line.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "step_the_planting"}}}],
    }],
    "dry_river_cut_bank": [{
        "id": "step_bank_committed", "mode": "once", "on": "enter",
        "description": "Down the open face, at the course that was laid.",
        "requires": {"custom": {"gte": [{"ref": "threads.step_bank.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "step_what_the_bank_shows"}}}],
    }],
    "south_reach_sand_shaft": [{
        "id": "step_water_committed", "mode": "once", "on": "enter",
        "description": "Beside the spring, at the top of the shoring.",
        "requires": {"custom": {"gte": [{"ref": "threads.step_water.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "step_the_last_water"}}}],
    }],
}

BOSSES = {
    "steppe_cut_bank": "step_bank_boss",
    "steppe_sand_shaft": "step_water_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("step_the_planting", "The Planting",
            "Eleven miles of one species set in a single season, running the "
            "wrong way to break any wind that blows here.",
            [reach("to_the_marker", "Get to the stone in the middle of it.",
                   "windbreak_the_planter", hidden=True),
             flagged("settle_the_count", "Settle the count that will not "
                     "settle.", "step_line_open", hidden=True),
             kill("what_was_set", "Find what the line was set around.",
                  "the_set_thing", hidden=True)],
            xp=155, items=[("windbreak_belt", 1)], thread_key="step_line"),

    _hidden("step_what_the_bank_shows", "What the Bank Shows",
            "A quarter-mile bed for a four-week river, and forty feet down in "
            "the open face, courses that were laid level.",
            [reach("down_the_face", "Get down the open face.",
                   "dry_river_cut_bank", hidden=True),
             flagged("open_the_course", "Take a block out of the laid course.",
                     "step_bank_open", hidden=True),
             kill("what_it_carried", "Meet what the course was built to "
                  "carry.", "course_dweller", hidden=True)],
            xp=170, items=[("flood_ring", 1)], thread_key="step_bank"),

    _hidden("step_the_last_water", "The Last Water",
            "A spring that has never failed at the edge of a country where "
            "nothing runs, warm and tasting of iron, with a shored way down "
            "beside it.",
            [reach("to_the_shoring", "Get to the top of the shoring.",
                   "south_reach_sand_shaft", hidden=True),
             flagged("past_the_timber", "Get past the timber somebody ordered.",
                     "step_water_open", hidden=True),
             kill("what_warms_it", "Meet what has been keeping the water warm.",
                  "the_warm_thing", hidden=True)],
            xp=175, items=[("warm_water_hood", 1)], thread_key="step_water"),
]

ARCS = [
    arc("step_hidden", "The Sunward Steppe, Laid Out",
        "Three pieces of work under nine hundred years of grass, all three of "
        "them still doing what they were built to do.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("hayward_serel", "Serel, Hayward",
        "Counts what the village owns, including eleven miles of trees the "
        "village does not remember acquiring.",
        faction=LINES, dialogue_id="step_serel_talk",
        home="tallgrass_house_b", disposition=4, gullibility=0.3,
        memory_span=200, statblock="step_hayward"),

    npc("relay_rider_talith", "Talith of the Relay",
        "Rides the long stage and keeps the book the riders have kept since "
        "there were riders.",
        faction=LINES, dialogue_id="step_talith_talk",
        home="horse_road_relay", disposition=3, gullibility=0.25,
        memory_span=240, statblock="step_rider",
        shop=shop("keeper_stock", buys=("material",), multiplier=1.2)),

    npc("well_watcher_ondir", "Ondir, at the Last Water",
        "Lives at the edge of where things grow and lets people drink, which "
        "is the whole of the job and takes all of it.",
        faction=LINES, dialogue_id="step_ondir_talk",
        home="south_reach_last_water", disposition=2, gullibility=0.2,
        memory_span=260, statblock="step_watcher"),

    npc("ford_camper_bree", "Bree, at the Crossing",
        "Camps where nine hundred years of people have camped, at a crossing "
        "that has not needed crossing in any of them.",
        faction=LINES, dialogue_id="step_bree_talk",
        home="dry_river_ford_camp", disposition=6, gullibility=0.45,
        memory_span=150),

    npc("shade_herder_kosh", "Kosh, in the Shade",
        "Grazes four hundred head along eleven miles of trees and has walked "
        "the length of them more times than anybody alive.",
        faction=LINES, dialogue_id="step_kosh_talk",
        home="windbreak_shepherds_camp", disposition=5, gullibility=0.4,
        memory_span=170),

    npc("cut_store_ana", "Ana, at the Cut Store",
        "Buys hay by the load and sells everything a rider forgot, which is "
        "most things.",
        faction=LINES, dialogue_id="step_ana_talk",
        home="tallgrass_store", disposition=7, gullibility=0.45,
        memory_span=160,
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.25)),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from loot import group, encounters  # noqa: E402

_GRASS = dict(creature_type="humanoid", faction="the_horse_lords")

MONSTERS = [
    creature("step_hayward", "Serel, Hayward", 5, 0,
             A(13, 13, 14, 14, 15, 13), ["strike"],
             "Walks a parish boundary a week and argues about it for the other "
             "six days.",
             descriptors=["a sun-dark"], loot="step_tally_carried", hp=28,
             **_GRASS),
    creature("step_rider", "Talith of the Relay", 5, 0,
             A(13, 16, 14, 12, 14, 13), ["strike", "quick_shot"],
             "Sixty miles between remounts, in a day, routinely.",
             descriptors=["a wiry"], loot="step_book_carried", hp=30, **_GRASS),
    creature("step_watcher", "Ondir, at the Last Water", 5, 0,
             A(14, 12, 16, 12, 15, 11), ["strike", "guarded_stance"],
             "Stands between everybody's thirst and the only water for two "
             "days in any direction.",
             descriptors=["a still"], loot="step_warrant_carried", hp=33,
             **_GRASS),

    creature("the_set_thing", "What the Line Was Set Around", 6, 440,
             A(16, 13, 17, 11, 14, 10), ["root_and_branch", "stone_fist",
                                         "rend"],
             "Eleven miles of one species in one season, running the wrong way "
             "for the wind, and a count that comes out different depending "
             "which end you start from.",
             behaviour=[{"priority": 20, "use": "root_and_branch",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "stone_fist"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a root-bound", "an unmoving"],
             loot="step_line_hoard", immunities=["frightened", "prone"],
             hp=62),
    creature("course_dweller", "What the Course Carried", 7, 560,
             A(15, 16, 15, 13, 15, 12), ["drag_under", "latch", "rend"],
             "Level courses of dressed stone going into a river bank in both "
             "directions, forty feet under nine hundred years of grass, and "
             "the river only borrows them four weeks a year.",
             behaviour=[{"priority": 20, "use": "drag_under",
                         "when": {"chance": 0.4}},
                        {"priority": 5, "use": "latch"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a silt-grey", "a long"], loot="step_bank_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone"], hp=72),
    creature("the_warm_thing", "What Keeps It Warm", 7, 590,
             A(14, 14, 16, 15, 16, 13), ["salt_burn", "wither", "vent_breath"],
             "Nine hundred years of a spring that has never failed, running "
             "warm and tasting of iron two miles from a country where nothing "
             "runs at all.",
             behaviour=[{"priority": 20, "use": "vent_breath",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "salt_burn"},
                        {"priority": 0, "use": "wither"}],
             descriptors=["a fever-warm", "a patient"],
             loot="step_water_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "burning"], hp=70),
]

ENCOUNTER_TABLES = [
    encounters("step_line_boss", [group("b", [("the_set_thing", "1", False)])],
               chance=1, empty=0),
    encounters("step_bank_boss", [group("b", [("course_dweller", "1d2", True)])],
               chance=1, empty=0),
    encounters("step_water_boss", [group("b", [("the_warm_thing", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "step_line_hoard", "name": "Under the Marker", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "3d6"}},
                 {"weight": 2, "value": {"item": "amber_lump", "quantity": "1"}},
                 {"weight": 2, "value": {"item": "healing_draught",
                                         "quantity": "1"}},
                 {"weight": 1, "value": {"item": "torc_of_the_ridge",
                                         "quantity": "1"}}]},
    {"id": "step_bank_hoard", "name": "Into the Laid Course", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "4d6"}},
                 {"weight": 3, "value": {"item": "hold_silver", "quantity": "1"}},
                 {"weight": 2, "value": {"item": "ward_salt", "quantity": "1"}},
                 {"weight": 1, "value": {"item": "laid_course", "quantity": "1",
                                         "unique": True}}]},
    {"id": "step_water_hoard", "name": "Past the Shoring", "rolls": "2",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "4d6"}},
                 {"weight": 3, "value": {"item": "antidote", "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "glass_bead", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "warded_coat", "quantity": "1"}}]},
]

_serel = [
    rumour("step_serel_wrong", "The line of trees. What is it for?",
           "“It is for breaking the wind.” Serel says it the way you say the "
           "thing everybody says. Then, because you have not gone away: “The "
           "wind is off the south-west. Has been since before the Lines. And "
           "the trees run south-west to north-east.” A hand, flat, drawing it "
           "in the air. “They run *with* it. Eleven miles of doing nothing at "
           "all.”",
           "step_line_wrong", faction=LINES, base=13, skill="insight"),
    rumour("step_serel_count", "How many trees are in it?",
           "Serel goes quiet for long enough to be uncomfortable. “I have "
           "counted it forty years,” he says. “Going north I get one number. "
           "Coming back I get another. I have done it in a day, both ways, "
           "sober, with a boy counting beside me.” He shrugs, and it is not a "
           "casual shrug. “The boy gets different numbers too, and not my "
           "different numbers.”",
           "step_line_count", faction=LINES, base=15),
]
_serel.append(favour(
    "step_serel_tally",
    "Your count. All forty years of it.",
    "He brings out a roll of it, which is more than you expected and less "
    "tidy. “It does not settle,” he says. “Forty years of it not settling. I "
    "have never shown anybody because there is no way to say it that does not "
    "sound like a man who cannot count.”",
    "planting_tally", faction=LINES, base=13, cost=2,
    refused="“It is forty years of looking foolish,” Serel says, “and it is "
            "mine,” and puts it away."))

_talith = [
    rumour("step_talith_norecord", "Is the planting in the Lines' record?",
           "“No.” Talith does not need to check, which is itself the answer. "
           "“We have every foaling for nine hundred years. Every crossing. "
           "Every rider who did not come in.” A hand on the book. “Eleven "
           "miles of trees is a season's work for four hundred people and "
           "there is not one line about it anywhere. We do not fail to write "
           "things down.”",
           "step_line_norecord", faction=LINES, base=14),
    rumour("step_talith_week", "How do you know when the flood comes?",
           "“The grass tells you.” Immediate, and then Talith hears it. “That "
           "is what we say. Three days out, everybody moves stock, and we are "
           "never wrong, and the week is the same week.” A pause. “I have "
           "asked eleven riders what the grass does. I have had eleven "
           "answers. None of them is a thing the grass does.”",
           "step_bank_week", faction=LINES, base=15, skill="insight"),
]
_talith.append(favour(
    "step_talith_book",
    "The flood book. Let me have it.",
    "It is oilcloth-wrapped and it is heavy. “Nine hundred years of the same "
    "week,” Talith says, “written by people who each thought they were the "
    "first to notice. If you go down that bank in the dry, that book tells you "
    "how long you have.”",
    "flood_book", faction=LINES, base=14, cost=2,
    refused="“It rides with the relay,” Talith says. “It has always ridden "
            "with the relay.”"))

_ondir = [
    rumour("step_ondir_never", "Has the spring ever failed?",
           "“Not in the record.” Ondir does not look at you; the watching is "
           "the job. “Nine hundred years. Droughts that took the Lines down to "
           "half their stock and it ran the same.” A nod south. “Two miles "
           "that way nothing has run since before anybody was counting. It "
           "stops. Here does not.”",
           "step_water_never", faction=LINES, base=13),
    rumour("step_ondir_shored", "What is the hole beside it?",
           "“Shored.” Flatly. “Timber, cut and set, holding a way down. I have "
           "been in the first forty feet and the carpentry is better than my "
           "house.” Now Ondir looks at you. “There is no timber on this "
           "steppe. There is no mine on this steppe. Somebody carted the wood "
           "here and paid for it.”",
           "step_water_shored", faction=LINES, base=16),
]
_ondir.append(favour(
    "step_ondir_warrant",
    "Somebody paid for that timber. Do you have the paper?",
    "Ondir takes it out of a box that has nothing else in it. “Signed, "
    "sealed, and dated in a year we have not used for six hundred,” he says. "
    "“It came with the post. Every watcher gets it. Not one of us has ever "
    "gone down on the strength of it.”",
    "shaft_warrant", faction=LINES, base=15, cost=3,
    refused="“It comes with the post,” Ondir says, “and I have the post,” and "
            "the box shuts."))

DIALOGUES = [
    talk("step_serel_talk", "greet",
         ["A yard of hurdles and tallies and a man going down a column with "
          "his thumb, twice, and then a third time.",
          "“I am counting. You can talk while I count.”"],
         _serel),

    talk("step_talith_talk", "greet",
         ["Eight horses on a line, four of them cooling, and somebody going "
          "over a hoof without seeming to look at it.",
          "“Remount, message, or neither. Neither is fine, but stand clear.”"],
         _talith,
         redirects=[coldshoulder("step_talith", LINES, -30,
                                 "Talith mounts a cooled horse and takes it "
                                 "twice round the post without a word.",
                                 back="greet")[0]],
         extra_nodes=[coldshoulder("step_talith", LINES, -30,
                                   "Talith mounts a cooled horse and takes it "
                                   "twice round the post without a word.",
                                   back="greet")[1]]),

    talk("step_ondir_talk", "greet",
         ["A stone trough, a rope, and somebody sitting where they can see "
          "both the water and the road to it.",
          "“Drink what you need. Fill what you carry. Do not wash in it.”"],
         _ondir),

    talk("step_bree_talk", "greet",
         ["A camp in the lee of a bank a quarter of a mile from the other "
          "bank, and a fire in a ring of stones that is not this year's ring.",
          "“There is room. There has been room here for nine hundred years.”"],
         [rumour("step_bree_width",
                 "This bed is very wide for the water that comes down it.",
                 "“Four weeks.” Bree pokes the fire. “Four weeks of water and "
                 "a quarter mile of bed. I have seen the flood — it is a "
                 "frightening thing and it does not fill a fifth of this.” A "
                 "look up. “Something cut this. The river only borrows it.”",
                 "step_bank_width", faction=LINES, base=12, skill="insight"),
          rumour("step_bree_warm",
                 "The water at the Last Water.",
                 "“Warm, and iron.” Bree makes a face. “Every spring on this "
                 "grass is cold and tastes of grass. That one you could bathe "
                 "a child in without heating it, and it leaves a taste like a "
                 "coin.” A shrug. “Ondir says it has always been so. That is "
                 "not the same as knowing why.”",
                 "step_water_warm", faction=LINES, base=11)]),

    talk("step_kosh_talk", "greet",
         ["Four hundred head strung out along a line of trees, and a herder "
          "walking the length of them because that is what the day is.",
          "“Walk with me or stand still. Do not stand in the middle.”"],
         [rumour("step_kosh_season",
                 "The trees. Were they all set at once?",
                 "“Within a season.” Kosh does not break stride. “You can see "
                 "it in the boles — same girth, same lean, same scar year in "
                 "all of them. Eleven miles.” A glance across. “Four hundred "
                 "people for a season. On this grass, in that year, there were "
                 "not four hundred people.”",
                 "step_line_season", faction=LINES, base=13, skill="survival"),
          rumour("step_kosh_wont",
                 "Why will the Lines not camp at the Last Water?",
                 "“Ask twelve and you will get twelve answers.” Kosh sounds "
                 "genuinely amused. “Bad grass. Bad ground. A cousin who died "
                 "there. The Glasslands too close.” The amusement goes. “Now "
                 "ask why none of the twelve is the same, when we agree about "
                 "everything else on this steppe down to which side of a "
                 "hill.”",
                 "step_water_wont", faction=LINES, base=14,
                 skill="insight")]),

    talk("step_ana_talk", "greet",
         ["Hay by the load, girth straps, salt, and a woman who has already "
          "worked out what you forgot to bring.",
          "“Hay, salt, strap, or rope. It is always one of the four.”"],
         [rumour("step_ana_ford",
                 "The camp at the crossing. Why is it there?",
                 "“Because it has always been there.” Ana stacks something. "
                 "“Nine hundred years of hearths, one on top of the last. And "
                 "there is no crossing — it is dry eleven months, and the "
                 "twelfth you would not put a horse in it.” She stops "
                 "stacking. “Nobody has ever *needed* to camp at that spot. "
                 "They camp there anyway.”",
                 "step_bank_ford", faction=LINES, base=12),
          rumour("step_ana_courses",
                 "What is showing in the open face?",
                 "“Stone.” She says it like it is an inconvenience. “Forty "
                 "foot down, courses of it, dressed, laid level, going both "
                 "ways into the bank.” A hand out flat. “Not fallen. Not "
                 "washed. Laid. My father took a block out and it is my "
                 "doorstep, and you can see the chisel on it.”",
                 "step_bank_courses", faction=LINES, base=14,
                 skill="craft")]),
]
