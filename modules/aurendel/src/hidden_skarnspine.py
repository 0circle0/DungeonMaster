"""The Skarnspine's hidden threads — three, in the four areas nothing else uses.

Snowgate is nine houses dug half into the slope, with a store, a forge and a
bell to ring when the road shuts, and nobody had ever gone into one of them. The
Broken Road is the old way up from the vale, taken out by a slip in the year of
the great rains and never properly mended. The Ironstair is nine hundred steps
cut and railed and swept up the cliff to Karn Dolur's gate. The Cold Shoulder is
the north face, in shade from Emberfall to Greening, and the way to the ice.

Three threads, and they share a shape: **this mountain is being kept, and the
keeping is older than the hold that thinks it is doing the keeping.**

  * **Nine Hundred and One** — the steps are swept daily by nobody the hold
    pays, there are two stairs, and the count does not agree with the record.
  * **Rung From Below** — the bell is for a shut road and it has rung eleven
    times on an open one, and the rope is worn on the inside.
  * **The Breathing Face** — a cave that draws and blows on a cycle you can
    time, warm, out of a face that is in shade eight months of the year.
"""
from dmkit.quests import npc, shop, quest, reach, kill, flagged, arc
from lore import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "skarnspine"
HOLD = "karn_dolur"

STAIR = [
    clue("skarn_stair_swept",
         "Nine hundred steps, cut and railed, and swept every day of the year. "
         "The hold pays a great many people and not one of them for that.",
         "the Halfway House"),
    clue("skarn_stair_two",
         "There are two of them. The broken one is older, and it was cut by a "
         "hand that worked to a different tread — shorter, deeper, and not for "
         "legs the length of ours.",
         "the Gate Store"),
    clue("skarn_stair_count",
         "Walk it and count and you get nine hundred and one. The hold's own "
         "measure, cut into the gate lintel, says nine hundred.",
         "a sweeper"),
    clue("skarn_stair_shade",
         "Nothing nests in the shade of the older one. On a gritstone face, in "
         "this country, that is the strangest sentence anybody has said to you "
         "all week.",
         "the Gate Store"),
]

BELL = [
    clue("skarn_bell_open",
         "It is rung when the road is shut. The watch book has it rung eleven "
         "times on a night the road was open, and each time the watch was "
         "asleep and each time the watch was believed.",
         "the watch book"),
    clue("skarn_bell_rope",
         "The rope is worn on the inside of the turn, which is the face a hand "
         "does not touch. Something has been pulling it from a direction "
         "nobody stands in.",
         "the Snowgate Bell"),
    clue("skarn_bell_dug",
         "Nine houses dug into the slope, all of them a room and a half. One "
         "of them goes back seventy feet, and its people have never mentioned "
         "it, and their neighbours have never asked.",
         "the wayhouse"),
    clue("skarn_bell_coal",
         "The forge's coal comes up out of the slope warmer than it went down "
         "into it, and the smith has stopped saying so out loud.",
         "the forge"),
]

BREATH = [
    clue("skarn_wind_cycle",
         "It draws and blows on a count you can keep with a watch. Weather does "
         "not keep time and this does, to the minute, in a gale or a calm.",
         "an ice-road guide"),
    clue("skarn_wind_warm",
         "What comes out is warmer than what goes in, on a face that is in "
         "shade from Emberfall to Greening and has never once thawed.",
         "an ice-road guide"),
    clue("skarn_wind_ice",
         "The road runs past its mouth and the ice will not form within forty "
         "feet of it, which the guides use and none of them will discuss.",
         "the Broken Road Wayhouse"),
    clue("skarn_wind_maps",
         "Karn Dolur has mapped every hole in this mountain to the inch, and "
         "the survey stops at that mouth with a blank margin and no note "
         "saying why.",
         "the forge"),
]

LORE = STAIR + BELL + BREATH

THREADS = [
    thread("skarn_stair", "Nine Hundred and One",
           "Two stairs where the hold admits to one, swept daily by nobody on "
           "any payroll, and a count that will not agree with the lintel.",
           STAIR),
    thread("skarn_bell", "Rung From Below",
           "A bell for a shut road, rung eleven times on an open one, with the "
           "rope worn on the face a hand cannot reach.", BELL),
    thread("skarn_wind", "The Breathing Face",
           "A cave that draws and blows to the minute, warm, out of a north "
           "face that has never thawed.", BREATH),
]

ITEMS = [
    keepsake("sweeping_tally", "The Sweeper's Tally",
             "Four generations of somebody writing down that the steps were "
             "already clean, and the count they made each time.",
             holder="stair_sweeper_bel"),
    keepsake("watch_book", "The Snowgate Watch Book",
             "Every night the road was shut, every night the bell was rung, "
             "and eleven nights on which those are not the same list.",
             holder="bell_watch_orn"),
    keepsake("stopped_survey", "The Survey That Stops",
             "Karn Dolur's own mapping of the Cold Shoulder, to the inch, "
             "ending at a mouth with clean margin after it.",
             holder="ice_guide_vesk"),

    trophy("short_tread", "A Tread Off the Older Stair",
           "Cut shorter and deeper than any step on the hold's stair, worn in "
           "the middle by something that did not walk the way we walk.",
           "skarn_stair_two"),

    relic("sweepers_belt", "The Sweeper's Belt", "belt",
          "Off somebody who climbed nine hundred and one steps a day for a "
          "wage nobody paid. Height stops mattering to the wearer's legs.",
          value=880, rarity="rare", carry=3,
          skills={"athletics": 3, "perception": 2}),
    relic("bell_rope_ring", "The Ring in the Bell Rope", "ring",
          "Iron off the inside of the turn, worn by something that pulled from "
          "underneath. What the wearer signals is heard further than it should "
          "be.",
          value=920, rarity="very_rare",
          skills={"persuasion": 3, "intimidation": 2, "resolve": 2}),
    relic("breathing_hood", "The Hood off the Breathing Face", "head",
          "Felt and hide out of a mouth that blows warm onto ice that will not "
          "form. Cold arrives at the wearer late and leaves early.",
          value=980, rarity="very_rare", guard=1,
          resist=(("cold", 0.5),), skills={"survival": 3, "resolve": 2}),
]

LOOT_TABLES = [
    carried("skarn_tally_carried", "What Bel Kept", "sweeping_tally"),
    carried("skarn_watch_carried", "What Orn Kept", "watch_book"),
    carried("skarn_survey_carried", "What Vesk Kept", "stopped_survey"),
]

GATES = [
    sealed("skarn_stair_tread", "The Step That Is Not Counted",
           "One tread on the broken flight that has been swept as carefully as "
           "the nine hundred that are used.",
           blocked("skarn_stair_blocked",
                   "Nine hundred and one by the foot, nine hundred by the "
                   "lintel. Which step is the extra one is in four generations "
                   "of a sweeper's count and nowhere else.",
                   "Cut shorter and deeper than the hold's stair, and worn in "
                   "the middle rather than the front. Whatever wore that did "
                   "not climb the way we climb.",
                   "Nothing nests in the shade of this flight, on a gritstone "
                   "face, in a country where the birds nest in everything."),
           items=["sweeping_tally"], opens_flag="skarn_stair_open"),

    sealed("skarn_bell_backroom", "Seventy Feet Back",
           "A house dug a room and a half into the slope like its eight "
           "neighbours, and then dug rather further.",
           blocked("skarn_bell_blocked",
                   "Eleven nights the bell rang on an open road, and the watch "
                   "book has the dates. Without the dates you are knocking on "
                   "a neighbour's door about a draught.",
                   "The rope is worn on the inside of the turn. Stand where "
                   "you would have to stand to wear it there and you are "
                   "standing in the floor.",
                   "The coal comes up warmer than it went down. Nobody in "
                   "Snowgate says so twice."),
           items=["watch_book"], opens_flag="skarn_bell_open"),

    sealed("skarn_wind_throat", "Past the Clean Margin",
           "Where the hold's survey stops: a throat the mapping did not "
           "measure, in a mountain the hold has measured to the inch.",
           blocked("skarn_wind_blocked",
                   "The hold maps everything and this map ends. Where it ends "
                   "and how cleanly is on the sheet itself, and the sheet is "
                   "the guides' and they do not lend it.",
                   "In and out, to the minute, in a gale or a calm. Weather "
                   "does not keep time.",
                   "Warm air off a face that has not thawed since anybody "
                   "started writing things down."),
           items=["stopped_survey"], opens_flag="skarn_wind_open"),
]

POI_PATCHES = {
    # Two of the three anchors are places on the surface rather than dungeon
    # mouths, so each carries its own table and its own chance.
    "ironstair_fallen_stair": {**rumoured("skarn_stair", base=20, step=3, entries=4),
                               "gate": "skarn_stair_tread",
                               "encounterTables": ["skarn_stair_boss"],
                               "encounterChance": 1},
    "snowgate_house_a": {**rumoured("skarn_bell", base=21, step=3, entries=4),
                         "gate": "skarn_bell_backroom",
                         "encounterTables": ["skarn_bell_boss"],
                         "encounterChance": 1},
    "cold_shoulder_wind_cave": {**rumoured("skarn_wind", base=22, step=3, entries=4,
                                           skill="survival"),
                                "gate": "skarn_wind_throat"},
}

POI_TRIGGERS = {
    "ironstair_the_steps": [finding("skarn_found_steps",
                                    "Counting them on the way up, and again on "
                                    "the way down.", "skarn_stair_count")],
    "snowgate_bell": [finding("skarn_found_rope",
                              "Which face of the rope is worn.",
                              "skarn_bell_rope")],
    "cold_shoulder_ice_road": [finding("skarn_found_ice",
                                       "Where the ice stops forming, and how "
                                       "sharply.", "skarn_wind_ice")],
    "cold_shoulder_north_face": [finding("skarn_found_face",
                                         "Warm air off a face that has not "
                                         "thawed.", "skarn_wind_warm")],
    "broken_road_the_slip": [finding("skarn_found_slip",
                                     "What the slip took out, and what was "
                                     "under it.", "skarn_stair_two")],

    "ironstair_fallen_stair": [{
        "id": "skarn_stair_committed", "mode": "once", "on": "enter",
        "description": "On the flight the hold does not count.",
        "requires": {"custom": {"gte": [{"ref": "threads.skarn_stair.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "skarn_nine_hundred_and_one"}}}],
    }],
    "snowgate_house_a": [{
        "id": "skarn_bell_committed", "mode": "once", "on": "enter",
        "description": "Seventy feet into a slope everybody else stopped "
                       "digging at twenty.",
        "requires": {"custom": {"gte": [{"ref": "threads.skarn_bell.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "skarn_rung_from_below"}}}],
    }],
    "cold_shoulder_wind_cave": [{
        "id": "skarn_wind_committed", "mode": "once", "on": "enter",
        "description": "In the mouth, on the draw, where the survey stops.",
        "requires": {"custom": {"gte": [{"ref": "threads.skarn_wind.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "skarn_the_breathing_face"}}}],
    }],
}

BOSSES = {
    "skarn_wind_cave": "skarn_wind_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("skarn_nine_hundred_and_one", "Nine Hundred and One",
            "Two stairs where the hold admits to one, swept daily by nobody on "
            "any payroll, and a count that will not agree with the lintel.",
            [reach("onto_the_older", "Get onto the flight nobody uses.",
                   "ironstair_fallen_stair", hidden=True),
             flagged("find_the_extra", "Find which step is the one too many.",
                     "skarn_stair_open", hidden=True),
             kill("who_sweeps", "Meet whoever has been sweeping them.",
                  "the_sweeper", hidden=True)],
            xp=185, items=[("sweepers_belt", 1)], thread_key="skarn_stair"),

    _hidden("skarn_rung_from_below", "Rung From Below",
            "A bell for a shut road, rung eleven times on an open one, with "
            "the rope worn on the face a hand cannot reach.",
            [reach("into_the_slope", "Get into the house that goes further.",
                   "snowgate_house_a", hidden=True),
             flagged("match_the_nights", "Match the eleven nights to what was "
                     "under them.", "skarn_bell_open", hidden=True),
             kill("who_pulls", "Meet what has been pulling from underneath.",
                  "the_ringer", hidden=True)],
            xp=195, items=[("bell_rope_ring", 1)], thread_key="skarn_bell"),

    _hidden("skarn_the_breathing_face", "The Breathing Face",
            "A cave that draws and blows to the minute, warm, out of a north "
            "face that has never thawed.",
            [reach("into_the_mouth", "Get into the mouth on the draw.",
                   "cold_shoulder_wind_cave", hidden=True),
             flagged("past_the_margin", "Get past where the survey stops.",
                     "skarn_wind_open", hidden=True),
             kill("what_breathes", "Meet what has been doing the breathing.",
                  "the_breath", hidden=True)],
            xp=205, items=[("breathing_hood", 1)], thread_key="skarn_wind"),
]

ARCS = [
    arc("skarn_hidden", "The Skarnspine, Kept",
        "Three pieces of upkeep on a mountain that has a hold on it, none of "
        "them the hold's.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("stair_sweeper_bel", "Bel, on the Steps",
        "Fourth of the family to sweep a stair that is always already clean, "
        "and the fourth to go on doing it anyway.",
        faction=HOLD, dialogue_id="skarn_bel_talk",
        home="ironstair_halfway_house", disposition=4, gullibility=0.3,
        memory_span=220, statblock="skarn_sweeper"),

    npc("bell_watch_orn", "Orn, on Watch",
        "Sits up for the nights the road might shut, and has written down "
        "eleven he cannot account for.",
        faction=HOLD, dialogue_id="skarn_orn_talk",
        home="snowgate_house_b", disposition=2, gullibility=0.2,
        memory_span=250, statblock="skarn_watch"),

    npc("ice_guide_vesk", "Vesk of the Ice Road",
        "Takes people over the shoulder to the ice and back, and holds the "
        "hold's survey of it because somebody has to.",
        faction=HOLD, dialogue_id="skarn_vesk_talk",
        home="cold_shoulder_ice_road", disposition=3, gullibility=0.25,
        memory_span=200, statblock="skarn_guide"),

    npc("wayhouse_keeper_dorn", "Dorn, at the Broken Road",
        "Keeps a house on a road that has not been mended since the great "
        "rains and does perfectly well out of the fact.",
        faction=HOLD, dialogue_id="skarn_dorn_talk",
        home="broken_road_wayhouse", disposition=6, gullibility=0.45,
        memory_span=170,
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.3)),

    npc("gate_store_hesk", "Hesk, at the Gate Store",
        "Sells rope, tallow, nails and boots to everybody going up and "
        "everybody coming down, and looks at both.",
        faction=HOLD, dialogue_id="skarn_hesk_talk",
        home="snowgate_store", disposition=5, gullibility=0.4,
        memory_span=190,
        shop=shop("keeper_stock", buys=("material",), multiplier=1.2)),

    npc("snowgate_smith_ruvo", "Ruvo, at the Forge",
        "Works coal that comes up warm and has stopped mentioning it, which "
        "took some doing.",
        faction=HOLD, dialogue_id="skarn_ruvo_talk",
        home="snowgate_forge", disposition=3, gullibility=0.3,
        memory_span=200,
        shop=shop("keeper_stock", buys=("material",), multiplier=1.15)),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from dmkit.loot import group, encounters  # noqa: E402

_MOUNTAIN = dict(creature_type="humanoid", faction="karn_dolur")

MONSTERS = [
    creature("skarn_sweeper", "Bel, on the Steps", 6, 0,
             A(14, 14, 16, 12, 14, 12), ["strike"],
             "Climbs nine hundred and one steps a day and has since she could "
             "carry the broom.",
             descriptors=["a hard-legged"], loot="skarn_tally_carried", hp=38,
             **_MOUNTAIN),
    creature("skarn_watch", "Orn, on Watch", 6, 0,
             A(13, 13, 15, 13, 16, 12), ["strike", "quick_shot"],
             "Stays awake for two nights when the sky looks wrong, which it "
             "does often here.",
             descriptors=["a hollow-eyed"], loot="skarn_watch_carried", hp=35,
             **_MOUNTAIN),
    creature("skarn_guide", "Vesk of the Ice Road", 6, 0,
             A(15, 15, 16, 12, 15, 11), ["strike", "guarded_stance"],
             "Has brought parties off the shoulder in weather that took the "
             "parties behind them.",
             descriptors=["a frost-bitten"], loot="skarn_survey_carried", hp=40,
             **_MOUNTAIN),

    creature("the_sweeper", "Whoever Sweeps Them", 7, 700,
             A(15, 17, 15, 13, 16, 11), ["cut_and_run", "rend", "shove"],
             "Nine hundred steps swept every day of the year on a payroll that "
             "has no line for it, and a nine hundred and first that is swept "
             "as carefully as the rest.",
             behaviour=[{"priority": 15, "use": "cut_and_run",
                         "when": {"chance": 0.4}},
                        {"priority": 5, "use": "shove"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a stooped", "a tireless"],
             loot="skarn_stair_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone"], hp=80),
    creature("the_ringer", "What Pulls From Underneath", 8, 860,
             A(17, 13, 18, 12, 15, 13), ["stone_fist", "shove", "rend"],
             "Eleven nights of a bell rung for a road that was open, and a "
             "rope worn on the face a standing hand cannot reach.",
             behaviour=[{"priority": 20, "use": "stone_fist",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "shove"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a coal-warm", "a deliberate"],
             loot="skarn_bell_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone", "blinded"], hp=98),
    creature("the_breath", "What Does the Breathing", 8, 900,
             A(14, 16, 17, 14, 17, 14), ["vent_breath", "rime_touch",
                                         "scouring_wind"],
             "In and out to the minute, in a gale or a calm, warm, out of a "
             "face that has been in shade since anybody began writing things "
             "down.",
             behaviour=[{"priority": 20, "use": "vent_breath",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "scouring_wind"},
                        {"priority": 0, "use": "rime_touch"}],
             descriptors=["a vast", "a slow-lunged"],
             loot="skarn_wind_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "slowed", "prone"], hp=104),
]

ENCOUNTER_TABLES = [
    encounters("skarn_stair_boss", [group("b", [("the_sweeper", "1d2", True)])],
               chance=1, empty=0),
    encounters("skarn_bell_boss", [group("b", [("the_ringer", "1", False)])],
               chance=1, empty=0),
    encounters("skarn_wind_boss", [group("b", [("the_breath", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "skarn_stair_hoard", "name": "On the Flight Nobody Uses",
     "rolls": "2", "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "4d6"}},
                 {"weight": 3, "value": {"item": "hold_silver", "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "healing_draught",
                                         "quantity": "1"}},
                 {"weight": 1, "value": {"item": "short_tread", "quantity": "1",
                                         "unique": True}}]},
    {"id": "skarn_bell_hoard", "name": "Seventy Feet Back", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "5d6"}},
                 {"weight": 3, "value": {"item": "hold_silver", "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "iron_ore", "quantity": "2d4"}},
                 {"weight": 1, "value": {"item": "silvered_blade",
                                         "quantity": "1"}}]},
    {"id": "skarn_wind_hoard", "name": "Past the Clean Margin", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "5d6"}},
                 {"weight": 3, "value": {"item": "ward_salt", "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "antidote", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "warded_coat", "quantity": "1"}}]},
]

_bel = [
    rumour("skarn_bel_swept", "Who pays you to sweep the stair?",
           "“Nobody.” Bel says it without any bitterness, which is the "
           "unsettling part. “The hold pays the railmen, the lampmen and the "
           "gate. Not the sweeping.” A shrug. “My great-grandfather started "
           "coming up because it wanted doing. It has never wanted doing. It "
           "is clean when I get there, every day, and I sweep it anyway.”",
           "skarn_stair_swept", faction=HOLD, base=12),
    rumour("skarn_bel_count", "How many steps is it?",
           "“Nine hundred and one.” Instantly. Then, watching your face: “The "
           "lintel says nine hundred. It has said nine hundred for six hundred "
           "years and the hold does not make that kind of mistake.” Bel "
           "shoulders the broom. “Four of us have counted. We all get nine "
           "hundred and one. We have never worked out which one is the extra.”",
           "skarn_stair_count", faction=HOLD, base=14, skill="insight"),
]
_bel.append(favour(
    "skarn_bel_tally",
    "Four generations of counting. I want it.",
    "It is a folded sheaf, tied. “Every day, the count and the state of it,” "
    "Bel says. “Four hands and the same two things written down over and over: "
    "nine hundred and one, and already clean.” A pause. “If you find the "
    "extra one, do not tell the hold before you tell me.”",
    "sweeping_tally", faction=HOLD, base=13, cost=2,
    refused="“It is the family's,” Bel says, and the sheaf goes back inside "
            "her coat."))

_orn = [
    rumour("skarn_orn_open", "Has the bell ever rung on an open road?",
           "Orn looks at you for a while. “Eleven times,” he says. “I have the "
           "nights. My predecessor had four of them and I have seven.” He "
           "turns the book round without opening it. “Every one of those "
           "nights the watch was asleep. Including me. Twice.” Flat. “I do not "
           "sleep on watch.”",
           "skarn_bell_open", faction=HOLD, base=15),
    rumour("skarn_orn_rope", "The rope.",
           "“Worn on the inside of the turn.” He mimes it, hands round nothing. "
           "“You pull a bell rope, you wear the outside — the face away from "
           "the wall, where your grip drags.” The hands drop. “That rope is "
           "worn on the other face. To wear it there you would have to be "
           "standing where the floor is.”",
           "skarn_bell_rope", faction=HOLD, base=16, skill="insight"),
]
_orn.append(favour(
    "skarn_orn_book",
    "The watch book. The eleven nights.",
    "He hands it over faster than you expected, and you realise he has been "
    "hoping somebody would ask. “Take it. Read it in daylight.” He does not "
    "quite manage a smile. “Eleven dates. See if they are anything. I have "
    "looked at them for nine years and they are not moons and they are not "
    "weather.”",
    "watch_book", faction=HOLD, base=12, cost=1,
    refused="“It is the gate's book,” Orn says, “and the gate is mine "
            "tonight,” and puts it under the lamp."))

_vesk = [
    rumour("skarn_vesk_cycle", "The cave on the shoulder.",
           "“Breathes.” Vesk says it like a fact about a road, which to Vesk "
           "it is. “In, then out, and you can keep the count on a watch. I "
           "have. Same count in a gale, same count in a dead calm.” A look up "
           "at the face. “Weather does not keep time. That keeps time.”",
           "skarn_wind_cycle", faction=HOLD, base=13),
    rumour("skarn_vesk_warm", "Warm or cold, what comes out of it?",
           "“Warm.” Vesk lets that sit. “North face. Shade from Emberfall to "
           "Greening. That rock has not thawed in any year anybody has written "
           "down, and there is warm air coming out of a hole in it, on a "
           "count.” A shrug that is not a shrug. “I take parties past it. I do "
           "not take them in.”",
           "skarn_wind_warm", faction=HOLD, base=15),
]
_vesk.append(favour(
    "skarn_vesk_survey",
    "The hold's survey of the shoulder. Lend it to me.",
    "Vesk unrolls it on a rock and puts stones on the corners. Every hole, "
    "every fault, every fall of scree, to the inch — and then, where the mouth "
    "is, the ink simply stops and there is good clean vellum after it. “No "
    "note,” Vesk says. “The hold does not leave a margin. The hold has never "
    "once left a margin.”",
    "stopped_survey", faction=HOLD, base=15, cost=3,
    refused="“It is the guides',” Vesk says, rolling it. “Four of us alive can "
            "read it. Ask one of the other three.”"))

DIALOGUES = [
    talk("skarn_bel_talk", "greet",
         ["A shelf of rock halfway up nine hundred steps, a bench, a brazier, "
          "and somebody sitting with a broom across her knees.",
          "“Sit if you are climbing. Everybody sits.”"],
         _bel),

    talk("skarn_orn_talk", "greet",
         ["A cottage with one window facing the road and a lamp burning in it "
          "at an hour that does not need a lamp.",
          "“Road is open. If you have come to ask, it is open.”"],
         _orn,
         redirects=[coldshoulder("skarn_orn", HOLD, -30,
                                 "He turns the lamp down and goes on watching "
                                 "the road, and does not watch you.",
                                 back="greet")[0]],
         extra_nodes=[coldshoulder("skarn_orn", HOLD, -30,
                                   "He turns the lamp down and goes on "
                                   "watching the road, and does not watch "
                                   "you.", back="greet")[1]]),

    talk("skarn_vesk_talk", "greet",
         ["Rope, poles and crampons laid out in an order somebody would fight "
          "you about, on ice, in shade.",
          "“Going to the ice? Then we talk about your boots first.”"],
         _vesk),

    talk("skarn_dorn_talk", "greet",
         ["A wayhouse on a road with a hole in it, doing better trade than the "
          "road can account for, and a landlord who knows exactly why.",
          "“Beds, stew, and I will tell you the road is impassable whether it "
          "is or not.”"],
         [rumour("skarn_dorn_dug",
                 "The houses at Snowgate.",
                 "“A room and a half, all of them, dug back into the slope.” "
                 "Dorn wipes a table. “Except one. That one goes back seventy "
                 "foot — I have paced it from the outside and the door is "
                 "where the others' doors are.” He straightens. “In forty "
                 "years nobody in that house has mentioned it and nobody next "
                 "door has asked. That is not how villages work.”",
                 "skarn_bell_dug", faction=HOLD, base=14, skill="insight"),
          rumour("skarn_dorn_ice",
                 "The ice on the shoulder road.",
                 "“Will not form within forty foot of that mouth.” He says it "
                 "cheerfully. “Which is why the guides take the parties that "
                 "way and why they charge what they charge. Ask Vesk about it "
                 "and see how fast the conversation is about boots again.”",
                 "skarn_wind_ice", faction=HOLD, base=12)]),

    talk("skarn_hesk_talk", "greet",
         ["Rope, tallow, nails, boots, and a counter positioned so its keeper "
          "can see both the up road and the down.",
          "“Going up or coming down? It changes what you need and what I "
          "charge.”"],
         [rumour("skarn_hesk_two",
                 "There are two stairs on that cliff.",
                 "“There are.” Hesk does not stop counting nails. “The one you "
                 "climb and the one that came down in the rains. Go and stand "
                 "on the broken one.” Now the counting stops. “The treads are "
                 "short and deep. Ours are long and shallow, because we have "
                 "legs. Whoever cut that one was working to a different leg.”",
                 "skarn_stair_two", faction=HOLD, base=14, skill="craft"),
          rumour("skarn_hesk_shade",
                 "Does anything nest on the broken stair?",
                 "“No.” He puts the nails down. “Gritstone face in this "
                 "country, you cannot walk under an overhang without wearing "
                 "it. Every ledge on that cliff is white with them.” A hand "
                 "toward the window. “Not that flight. Not one nest, not one "
                 "streak, the whole length of it.”",
                 "skarn_stair_shade", faction=HOLD, base=13)]),

    talk("skarn_ruvo_talk", "greet",
         ["A forge dug into a slope, working, with the door open in weather "
          "that should have it shut.",
          "“Mind the door stays open. I like it open.”"],
         [rumour("skarn_ruvo_coal",
                 "Your coal comes up warm.",
                 "Ruvo does not answer for a while, and works. “It does,” he "
                 "says eventually. “Goes down cold in the basket. Comes up you "
                 "can feel it through the wicker.” The hammer goes down. “I "
                 "said so once, in the Drift, in front of eleven people. "
                 "Nobody argued and nobody looked at me and the subject "
                 "changed. I have not said it since. You are the first.”",
                 "skarn_bell_coal", faction=HOLD, base=16),
          rumour("skarn_ruvo_maps",
                 "The hold has surveyed this mountain.",
                 "“To the inch.” He is proud of it and then he is not. “Every "
                 "hole, every seam, every fault, since the founding. I have "
                 "seen the sheets — my father cut plate for the cases they "
                 "keep them in.” A look toward the shoulder. “And the "
                 "shoulder sheet stops at that mouth. Clean. No note. The hold "
                 "*always* notes.”",
                 "skarn_wind_maps", faction=HOLD, base=15, skill="insight")]),
]
