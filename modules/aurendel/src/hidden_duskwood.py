"""The Duskwood's hidden threads — three, in the five areas nothing else uses.

Fenny Cross is a wet hollow where two roads meet and everybody arriving is
already in a bad mood: an inn, a store, a forge and two cottages, none of them
with anybody in. Rooksrest burns charcoal and the smoke never quite leaves the
clearing. The Moot Road runs dead straight to Elderhollow because, the phrasing
in every account is the same, the trees were persuaded to allow it. The Greenway
is older than the Moot Road and straighter, and nobody cut it. The Undereaves is
where the fields stop and do not start again for four days.

Three threads, and they share a shape: **terms were agreed with this forest, and
somebody is still keeping them.**

  * **The Extra Miles** — fourteen marked miles on an eleven-mile road, and the
    three that do not fit line up with each other instead.
  * **The Road Nobody Cut** — forty yards wide, nine miles dead straight, in a
    wood that closes a gap in four years, and nothing crosses it after dark.
  * **The Round** — the parish has paid a woodward for four hundred years and
    cannot name the current one, and the marks have moved outward.
"""
from questkit import npc, shop, quest, reach, kill, flagged, arc
from lorekit import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "duskwood"
KEEPERS = "the_keepers"

MILES = [
    clue("dusk_miles_count",
         "There are fourteen marked miles on a road that is eleven miles long, "
         "and the wayhouse book has counted it that way since it was opened.",
         "the wayhouse book"),
    clue("dusk_miles_three",
         "Three of the marks do not sit on the road at all. Sighted from one "
         "another they make a straight line of their own, crossing it.",
         "a carter"),
    clue("dusk_miles_cuttings",
         "The oaks were not planted. Every one of them is a cutting off the "
         "same tree, which you can see in the leaf, and that tree is not on "
         "this road.",
         "the charcoal store"),
    clue("dusk_miles_sunken",
         "There is a lane out that way worn six feet down into the ground. It "
         "takes a hundred years of carts to wear a lane that deep and nothing "
         "has used it in living memory.",
         "the Mile Oaks"),
]

GREEN = [
    clue("dusk_green_width",
         "Forty yards wide and dead straight for nine miles, in a wood that "
         "shuts a cart track in four years if you stop using it.",
         "the Avenue"),
    clue("dusk_green_ages",
         "Every tree along its edge is the same age, and none of them is old. "
         "Something clears it, and clears it often enough that nothing gets "
         "big.",
         "a charcoal burner"),
    clue("dusk_green_bridge",
         "The bridge on it crosses nothing. The stream moved two hundred years "
         "ago and the bridge is still pointed, still sound, and somebody is "
         "still keeping it that way.",
         "the crossing at Fenny"),
    clue("dusk_green_night",
         "Nothing crosses it after dark. Not the deer, which will cross a "
         "turnpike. They go up it or down it, and they do not go over.",
         "the Wet Boot"),
]

ROUND = [
    clue("dusk_ward_paid",
         "The parish has paid a woodward every quarter for four hundred years "
         "and nobody at Fenny Cross can tell you the name of the current one.",
         "the Wet Boot"),
    clue("dusk_ward_moved",
         "The last field ends where it has always ended. The marks on the edge "
         "of the wood are eighty yards further out than the survey puts them, "
         "and the survey is not wrong.",
         "the Last Field"),
    clue("dusk_ward_line",
         "The burners will not cut inside a line every one of them can walk "
         "you along and not one of them can account for.",
         "a charcoal burner"),
    clue("dusk_ward_recut",
         "Every stone on the edge has been re-cut on the same face, and the "
         "cuts are fresh, and there is nobody the parish is paying to do it.",
         "the woodward's hut"),
]

LORE = MILES + GREEN + ROUND

THREADS = [
    thread("dusk_miles", "The Extra Miles",
           "Fourteen marked miles on an eleven-mile road, three of which sight "
           "along a line of their own.", MILES),
    thread("dusk_green", "The Road Nobody Cut",
           "Forty yards wide and nine miles straight through a wood that "
           "closes any gap in four years, and nothing crosses it at night.",
           GREEN),
    thread("dusk_ward", "The Round",
           "Four hundred years of paying a woodward nobody can name, and marks "
           "that have moved outward.", ROUND),
]

ITEMS = [
    keepsake("mile_book", "The Wayhouse Mile Book",
             "Every stage, every fare and every mark on the road, kept by four "
             "generations of the same family, all of whom counted fourteen.",
             holder="wayhouse_keeper_pyle"),
    keepsake("burners_charter", "The Burners' Charter",
             "The right to cut, in writing, with the line they may not cut "
             "inside drawn on the back of it in a hand nobody at Rooksrest "
             "writes.",
             holder="charcoal_burner_moll"),
    keepsake("woodwards_rod", "The Woodward's Rod",
             "A perambulation rod, sixteen and a half feet, worn smooth at "
             "both ends by four hundred years of somebody's hands.",
             holder="woodward_kest"),

    trophy("oak_cutting", "A Cutting Off the Same Tree",
           "Live wood out of a mile-oak, and the leaf on it matches thirteen "
           "others and no tree anybody can find.",
           "dusk_miles_cuttings"),

    relic("mile_oak_ring", "The Ring of the Fourteenth Mile", "ring",
          "Oak and iron off a mark that is not on the road. Distances stop "
          "surprising the wearer.",
          value=720, rarity="rare", skills={"survival": 3, "athletics": 2}),
    relic("greenway_cloak", "The Cloak off the Green Bridge", "cloak",
          "Kept sound for two hundred years over a stream that is not there. "
          "Whatever crosses at night does not notice the wearer.",
          value=820, rarity="very_rare", guard=1,
          resist=(("poison", 0.75),), skills={"stealth": 3, "insight": 2}),
    relic("woodwards_belt", "The Woodward's Belt", "belt",
          "Sixteen and a half feet of rod hangs off it, and the wearer walks a "
          "line they have walked once as though they had walked it always.",
          value=760, rarity="rare", carry=3,
          skills={"perception": 3, "survival": 2}),
]

LOOT_TABLES = [
    carried("dusk_book_carried", "What Pyle Kept", "mile_book"),
    carried("dusk_charter_carried", "What Moll Kept", "burners_charter"),
    carried("dusk_rod_carried", "What Kest Kept", "woodwards_rod"),
]

GATES = [
    sealed("dusk_miles_lane", "Six Feet Down",
           "A lane worn deeper than a century of carts could wear it, going "
           "somewhere the road stopped going.",
           blocked("dusk_miles_blocked",
                   "Fourteen marks and eleven miles. Which three are the extra "
                   "ones is in the wayhouse book and nowhere else, and without "
                   "it you are standing in a ditch.",
                   "It takes a hundred years of loaded carts to wear a lane "
                   "this deep. Nothing has used it in living memory, and the "
                   "sides have not fallen in.",
                   "The three marks that do not fit sight along each other. "
                   "This is where the line they make goes under."),
           items=["mile_book"], opens_flag="dusk_miles_open"),

    sealed("dusk_green_span", "Under the Span",
           "A bridge in good repair over a stream that moved two hundred years "
           "ago, and a dry arch under it that is not silted.",
           blocked("dusk_green_blocked",
                   "The right to cut here is written down and so is the line "
                   "nobody may cut inside. The line is on the back of the "
                   "charter, in a hand nobody in the wood writes.",
                   "Somebody has been maintaining a bridge over nothing for "
                   "two centuries, on a road nobody cut, and has never once "
                   "asked the parish for the cost of it.",
                   "Deer will cross a turnpike. They will not cross this."),
           items=["burners_charter"], opens_flag="dusk_green_open"),

    sealed("dusk_ward_mark", "The Face That Was Re-Cut",
           "One stone of the several, cut on the same face as all the others, "
           "and the cut on this one goes all the way through.",
           blocked("dusk_ward_blocked",
                   "A round is walked with a rod, and the rod is the woodward's, "
                   "and the woodward has it. Pacing it out will put you eighty "
                   "yards wrong, which is the whole of the problem.",
                   "The marks are further out than the survey and the survey is "
                   "not wrong. Something has been moving them, outward, slowly, "
                   "and re-cutting the faces as it goes.",
                   "Four hundred years of quarterly payment to a post nobody "
                   "has filled in living memory, and the work is being done."),
           items=["woodwards_rod"], opens_flag="dusk_ward_open"),
]

POI_PATCHES = {
    "moot_road_hollow_way": {**rumoured("dusk_miles", base=19, step=3, entries=4),
                             "gate": "dusk_miles_lane"},
    "greenway_barrow_of_the_ride": {**rumoured("dusk_green", base=21, step=3,
                                               entries=4, skill="survival"),
                                    "gate": "dusk_green_span"},
    # The stones on the wood's edge are a point of interest, not a dungeon
    # mouth, so what walks the round carries its own table and its own chance.
    "undereaves_boundary_stone": {**rumoured("dusk_ward", base=20, step=3, entries=4),
                                  "gate": "dusk_ward_mark",
                                  "encounterTables": ["dusk_ward_boss"],
                                  "encounterChance": 1},
}

POI_TRIGGERS = {
    "moot_road_mile_oaks": [finding("dusk_found_oaks",
                                    "Standing at one and sighting along to the "
                                    "next two.", "dusk_miles_sunken")],
    "greenway_the_avenue": [finding("dusk_found_avenue",
                                    "Nine miles of it, and how old the edge "
                                    "trees are not.", "dusk_green_ages")],
    "greenway_elf_bridge": [finding("dusk_found_bridge",
                                    "A sound bridge, pointed this decade, over "
                                    "a dry bed.", "dusk_green_bridge")],
    "undereaves_last_field": [finding("dusk_found_field",
                                      "Where the ploughing stops, against "
                                      "where the marks say it should.",
                                      "dusk_ward_moved")],
    "undereaves_woodward_hut": [finding("dusk_found_hut",
                                        "A hut kept, a hearth used, and no "
                                        "woodward on the parish roll.",
                                        "dusk_ward_recut")],

    "moot_road_hollow_way": [{
        "id": "dusk_miles_committed", "mode": "once", "on": "enter",
        "description": "Down in the lane, where the extra marks line up.",
        "requires": {"custom": {"gte": [{"ref": "threads.dusk_miles.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "dusk_the_extra_miles"}}}],
    }],
    "greenway_barrow_of_the_ride": [{
        "id": "dusk_green_committed", "mode": "once", "on": "enter",
        "description": "On the road nobody cut, at the only thing built on it.",
        "requires": {"custom": {"gte": [{"ref": "threads.dusk_green.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "dusk_the_road"}}}],
    }],
    "undereaves_boundary_stone": [{
        "id": "dusk_ward_committed", "mode": "once", "on": "enter",
        "description": "At the mark that was cut all the way through.",
        "requires": {"custom": {"gte": [{"ref": "threads.dusk_ward.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "dusk_the_round"}}}],
    }],
}

BOSSES = {
    "duskwood_hollow_way": "dusk_miles_boss",
    "duskwood_ride_barrow": "dusk_green_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("dusk_the_extra_miles", "The Extra Miles",
            "Fourteen marked miles on an eleven-mile road, and the three that "
            "do not fit sight along a line of their own.",
            [reach("down_the_lane", "Get down into the sunken lane.",
                   "moot_road_hollow_way", hidden=True),
             flagged("read_the_count", "Work out which three marks are the "
                     "extra ones.", "dusk_miles_open", hidden=True),
             kill("who_walks_them", "Find what has been walking them.",
                  "mile_walker", hidden=True)],
            xp=150, items=[("mile_oak_ring", 1)], thread_key="dusk_miles"),

    _hidden("dusk_the_road", "The Road Nobody Cut",
            "Forty yards wide and nine miles straight through a wood that "
            "closes any gap in four years, and nothing crosses it at night.",
            [reach("onto_the_green", "Get to the only thing built on it.",
                   "greenway_barrow_of_the_ride", hidden=True),
             flagged("under_the_span", "Open the dry arch under the bridge.",
                     "dusk_green_open", hidden=True),
             kill("what_uses_it", "Meet what uses it after dark.",
                  "the_ride", hidden=True)],
            xp=165, items=[("greenway_cloak", 1)], thread_key="dusk_green"),

    _hidden("dusk_the_round", "The Round",
            "Four hundred years of quarterly payment to a woodward nobody can "
            "name, and marks that have moved eighty yards outward.",
            [reach("to_the_marks", "Get to the mark cut all the way through.",
                   "undereaves_boundary_stone", hidden=True),
             flagged("walk_the_round", "Walk the round with the rod that "
                     "measures it.", "dusk_ward_open", hidden=True),
             kill("who_walks_it", "Meet whoever has been earning the fee.",
                  "the_woodward", hidden=True)],
            xp=155, items=[("woodwards_belt", 1)], thread_key="dusk_ward"),
]

ARCS = [
    arc("dusk_hidden", "The Duskwood, on Terms",
        "Three arrangements this forest was made to accept, all of them still "
        "being honoured by somebody.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("wayhouse_keeper_pyle", "Pyle, at the Wayhouse",
        "Fourth of the family to keep the stage on the Moot Road, and the "
        "fourth to count fourteen miles on an eleven-mile road.",
        faction=KEEPERS, dialogue_id="dusk_pyle_talk",
        home="moot_road_wayhouse", disposition=4, gullibility=0.3,
        memory_span=200, statblock="dusk_wayhouse_keeper",
        shop=shop("keeper_stock", buys=("treasure",), multiplier=1.2)),

    npc("charcoal_burner_moll", "Moll of the Burn",
        "Burns charcoal in a clearing the smoke never leaves, and holds the "
        "charter that says where she may not do it.",
        faction=KEEPERS, dialogue_id="dusk_moll_talk",
        home="rooksrest_house_a", disposition=3, gullibility=0.35,
        memory_span=180, statblock="dusk_burner"),

    npc("woodward_kest", "Kest, who Keeps the Hut",
        "Lives in a woodward's hut, is not the woodward, and has stopped "
        "explaining the difference to people.",
        faction=KEEPERS, dialogue_id="dusk_kest_talk",
        home="undereaves_woodward_hut", disposition=1, gullibility=0.2,
        memory_span=240, statblock="dusk_hutkeeper"),

    npc("carter_dunn", "Dunn, who Carts",
        "Runs the coast road and the forest road in the same week and has "
        "opinions about both, mostly about the state of them.",
        faction=KEEPERS, dialogue_id="dusk_dunn_talk",
        home="fenny_cross_house_b", disposition=6, gullibility=0.45,
        memory_span=140,
        shop=shop("hollowdene_stock", buys=("material",), multiplier=1.2)),

    npc("store_keeper_ives", "Ives, at the Charcoal Store",
        "Weighs, bags and sells what comes out of the burns, and knows every "
        "burner's stretch of wood by the taste of the smoke.",
        faction=KEEPERS, dialogue_id="dusk_ives_talk",
        home="rooksrest_store", disposition=5, gullibility=0.4,
        memory_span=160,
        shop=shop("keeper_stock", buys=("material",), multiplier=1.15)),

    npc("boot_landlady_ferre", "Ferre, at the Wet Boot",
        "Keeps the only bed at a crossroads everybody arrives at wet, and "
        "hears the whole of both roads twice a day.",
        faction=KEEPERS, dialogue_id="dusk_ferre_talk",
        home="fenny_cross_the_wet_boot", disposition=7, gullibility=0.5,
        memory_span=190,
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.3)),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from loot import group, encounters  # noqa: E402

_WOOD = dict(creature_type="humanoid", faction="the_keepers")

MONSTERS = [
    creature("dusk_wayhouse_keeper", "Pyle, at the Wayhouse", 5, 0,
             A(13, 12, 15, 13, 13, 14), ["strike"],
             "Turns horses, hauls trunks and settles arguments, all day, every "
             "day.",
             descriptors=["a broad"], loot="dusk_book_carried", hp=30, **_WOOD),
    creature("dusk_burner", "Moll of the Burn", 5, 0,
             A(14, 13, 15, 11, 14, 11), ["strike", "cut_and_run"],
             "Tends a burn for four days without sleeping when it is at the "
             "wrong stage, which most years it is.",
             descriptors=["a soot-black"], loot="dusk_charter_carried", hp=32,
             **_WOOD),
    creature("dusk_hutkeeper", "Kest, who Keeps the Hut", 5, 0,
             A(12, 15, 14, 13, 16, 10), ["strike", "quick_shot"],
             "Lives four days' walk from the nearest field and has not needed "
             "anybody in all that time.",
             descriptors=["a lean"], loot="dusk_rod_carried", hp=28, **_WOOD),

    creature("mile_walker", "What Walks the Extra Three", 6, 420,
             A(13, 17, 14, 14, 16, 12), ["cut_and_run", "quick_shot", "rend"],
             "Three marks that are not on the road, sighting along each other, "
             "and a lane worn six feet deep by something that has been keeping "
             "to it.",
             behaviour=[{"priority": 15, "use": "cut_and_run",
                         "when": {"chance": 0.45}},
                        {"priority": 5, "use": "quick_shot"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a long-strided", "a sighting"],
             loot="dusk_miles_hoard", immunities=["frightened", "prone"],
             hp=58),
    creature("the_ride", "What Goes Up It At Night", 6, 450,
             A(16, 16, 15, 12, 15, 15), ["gore", "shove", "root_and_branch"],
             "Forty yards wide, nine miles straight, kept clear by something "
             "that has never once been seen doing it, and the deer will not "
             "cross.",
             behaviour=[{"priority": 20, "use": "root_and_branch",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "gore"},
                        {"priority": 0, "use": "shove"}],
             descriptors=["a antlered", "a silent"], loot="dusk_green_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned"], hp=64),
    creature("the_woodward", "Whoever Has Been Earning the Fee", 6, 430,
             A(15, 14, 16, 13, 15, 12), ["strike", "wither", "grave_chill"],
             "Four hundred years of a quarterly payment to a post nobody has "
             "filled, and every mark on the edge of the wood re-cut on the "
             "same face, recently.",
             behaviour=[{"priority": 15, "use": "wither",
                         "when": {"chance": 0.35}},
                        {"priority": 5, "use": "grave_chill"},
                        {"priority": 0, "use": "strike"}],
             descriptors=["a methodical", "a bark-grey"],
             loot="dusk_ward_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned"], hp=60),
]

ENCOUNTER_TABLES = [
    encounters("dusk_miles_boss", [group("b", [("mile_walker", "1d2", True)])],
               chance=1, empty=0),
    encounters("dusk_green_boss", [group("b", [("the_ride", "1", False)])],
               chance=1, empty=0),
    encounters("dusk_ward_boss", [group("b", [("the_woodward", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "dusk_miles_hoard", "name": "Down the Sunken Lane", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "3d6"}},
                 {"weight": 2, "value": {"item": "amber_lump", "quantity": "1"}},
                 {"weight": 2, "value": {"item": "healing_draught",
                                         "quantity": "1"}},
                 {"weight": 1, "value": {"item": "oak_cutting", "quantity": "1",
                                         "unique": True}}]},
    {"id": "dusk_green_hoard", "name": "Under the Dry Arch", "rolls": "2",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "4d6"}},
                 {"weight": 3, "value": {"item": "greenway_charm",
                                         "quantity": "1"}},
                 {"weight": 2, "value": {"item": "ward_salt", "quantity": "1"}},
                 {"weight": 1, "value": {"item": "torc_of_the_ridge",
                                         "quantity": "1"}}]},
    {"id": "dusk_ward_hoard", "name": "Through the Re-Cut Face", "rolls": "2",
     "emptyChance": 0.05, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "3d6"}},
                 {"weight": 3, "value": {"item": "antidote", "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "wight_ash", "quantity": "1"}},
                 {"weight": 1, "value": {"item": "warded_coat", "quantity": "1"}}]},
]

_pyle = [
    rumour("dusk_pyle_count", "How long is the Moot Road?",
           "“Eleven miles.” Pyle does not look up from the fare slate. “And "
           "fourteen marks on it.” A pause exactly long enough to be "
           "deliberate. “My great-grandmother opened this house and wrote "
           "fourteen in the book, and her son wrote fourteen, and I write "
           "fourteen. Nobody has ever bothered to be troubled by it but me.”",
           "dusk_miles_count", faction=KEEPERS, base=12),
    rumour("dusk_pyle_sunken", "The oaks. Is there anything out by them?",
           "“There is a lane.” Now Pyle looks up. “Six foot down into the "
           "ground, sides standing, no spoil either side of it. That is a "
           "hundred years of loaded carts.” The slate goes down. “Nothing has "
           "been down there in my life, my father's life, or the book.”",
           "dusk_miles_sunken", faction=KEEPERS, base=14, skill="insight"),
]
_pyle.append(favour(
    "dusk_pyle_book",
    "The mile book. Let me take it.",
    "It comes off the shelf with a cloth round it, which tells you what the "
    "family thinks of it. “Every stage and every fare since the house opened,” "
    "Pyle says. “And every one of us counting to fourteen. Find out which "
    "three, and come and tell me, and I will stand you whatever you like.”",
    "mile_book", faction=KEEPERS, base=13, cost=2,
    refused="“It is the house's,” Pyle says, and the cloth goes back round it, "
            "and back on the shelf."))

_moll = [
    rumour("dusk_moll_ages", "The trees along the Greenway.",
           "“All of an age and none of them old.” Moll rakes over a section of "
           "the burn that does not need it. “A wood does not do that. Leave "
           "any gap in this wood and in four years it is thicket and in twenty "
           "it is wood again. That has been forty yards wide for longer than "
           "the Moot Road has existed.”",
           "dusk_green_ages", faction=KEEPERS, base=12),
    rumour("dusk_moll_line", "What is the line you will not cut inside?",
           "She walks you to it, which takes a quarter of an hour, and stops "
           "at a place with nothing at it. “Here.” Then along, a hundred paces, "
           "still nothing. “And here.” She turns round. “Every burner in "
           "Rooksrest can do that and not one of us can tell you what we are "
           "walking. We learned it off the last lot. They learned it off "
           "theirs.”",
           "dusk_ward_line", faction=KEEPERS, base=15, skill="insight"),
]
_moll.append(favour(
    "dusk_moll_charter",
    "The charter. I want to see the back of it.",
    "She unrolls it on a stump. The front is the parish's right to cut, in the "
    "parish's clerk's hand. The back is a line drawn freehand, closed, with no "
    "words on it at all. “That is not our writing,” Moll says. “That is not "
    "anybody's writing. That is a shape.”",
    "burners_charter", faction=KEEPERS, base=14, cost=2,
    refused="“It is the right to feed forty people,” she says, rolling it up. "
            "“No.”"))

_kest = [
    rumour("dusk_kest_recut", "Who re-cuts the marks?",
           "“Not me.” Kest says it fast, which is the most interesting thing "
           "about the answer. “I keep the hut. I have kept it eleven years. I "
           "am not on the parish roll and I have never been paid a quarter in "
           "my life.” A long look out at the trees. “The faces get cut. I have "
           "sat up for it twice and both times I woke where I sat and it was "
           "done.”",
           "dusk_ward_recut", faction=KEEPERS, base=15),
    rumour("dusk_kest_moved", "The marks are further out than the survey.",
           "“Eighty yards.” No hesitation at all. “I have chained it. Twice, "
           "in different years, and it was not the same eighty both times.” "
           "Kest looks at you properly for the first time. “It is going out. "
           "Slowly. And the field is where the field has always been, so "
           "nobody in Fenny Cross has noticed a thing.”",
           "dusk_ward_moved", faction=KEEPERS, base=16, skill="insight"),
]
_kest.append(favour(
    "dusk_kest_rod",
    "The rod. Lend it to me.",
    "Kest takes it down off two pegs. “Sixteen and a half foot, and worn "
    "smooth at both ends,” Kest says. “I have had it eleven years. Somebody "
    "wore those ends and it was not me and it was not in eleven years.”",
    "woodwards_rod", faction=KEEPERS, base=12, cost=1,
    refused="“It came with the hut,” Kest says. “It stays with the hut.”"))

DIALOGUES = [
    talk("dusk_pyle_talk", "greet",
         ["A stage house on a straight road, four horses out and four in, and "
          "a fare slate being rewritten faster than it can be read.",
          "“Bed, bait, or the next coach. In that order of likelihood.”"],
         _pyle),

    talk("dusk_moll_talk", "greet",
         ["A covered burn the size of a cottage giving off no visible smoke at "
          "all, which took forty years to learn, and a woman watching it.",
          "“Do not stand upwind and do not touch the sides.”"],
         _moll,
         redirects=[coldshoulder("dusk_moll", KEEPERS, -30,
                                 "She walks round to the far side of the burn "
                                 "and stays there.", back="greet")[0]],
         extra_nodes=[coldshoulder("dusk_moll", KEEPERS, -30,
                                   "She walks round to the far side of the "
                                   "burn and stays there.", back="greet")[1]]),

    talk("dusk_kest_talk", "greet",
         ["A hut with a swept step, a hearth in use, and somebody in the "
          "doorway who heard you coming a long way off.",
          "“You are four days from a field. Say what brought you.”"],
         _kest),

    talk("dusk_dunn_talk", "greet",
         ["A cart backed under an eave, one wheel off, and a man doing "
          "something to the hub he is clearly not enjoying.",
          "“Coast road or forest road? I will complain about either.”"],
         [rumour("dusk_dunn_three",
                 "You've counted the marks on the Moot Road.",
                 "“Every trip.” Dunn wipes the hub. “Three of them are not on "
                 "the road. They are off it — twenty yards, forty, sixty. I "
                 "used to think they had shifted the road round them.” He "
                 "straightens. “Then I stood at one and sighted the other two "
                 "and they line up with each other, and the line they make "
                 "goes across the road, not along it.”",
                 "dusk_miles_three", faction=KEEPERS, base=13, skill="insight"),
          rumour("dusk_dunn_bridge",
                 "The bridge on the Greenway.",
                 "“Crosses nothing.” He laughs, but not much. “Stream went "
                 "round two hundred years back — there is the old bed, dry as "
                 "a road. Bridge is pointed, parapet is sound, and I have "
                 "carted every load of lime that has gone into this parish for "
                 "twenty years and not one of them went there.”",
                 "dusk_green_bridge", faction=KEEPERS, base=12)]),

    talk("dusk_ives_talk", "greet",
         ["Sacks by the hundredweight, a set of scales worn to a shine, and a "
          "man who has just told somebody their charcoal is damp.",
          "“By the sack or by the load. Damp is half price and I will know.”"],
         [rumour("dusk_ives_cuttings",
                 "The mile oaks. Were they planted?",
                 "“Struck.” Ives is definite. “Every one of them off the same "
                 "tree — you can see it in the leaf, they are all the same "
                 "leaf, and oak is not shy about being different.” He weighs "
                 "something. “I have looked for the mother tree for thirty "
                 "years. It is not on the road and it is not off it either, "
                 "and I have been most of the way to Elderhollow looking.”",
                 "dusk_miles_cuttings", faction=KEEPERS, base=13,
                 skill="survival"),
          rumour("dusk_ives_paid",
                 "Who is the woodward?",
                 "“The parish pays one.” He puts the weight down. “Quarterly. "
                 "Four hundred years of quarters, in the parish book, never "
                 "missed.” He shrugs. “Ask Fenny Cross who it is. Ask the "
                 "vicar. Ask Kest, who lives in the hut and is not it. Nobody "
                 "knows and the money goes.”",
                 "dusk_ward_paid", faction=KEEPERS, base=14)]),

    talk("dusk_ferre_talk", "greet",
         ["A low taproom with everything in it damp, a fire that is winning, "
          "and a landlady who has already put a mat down for you.",
          "“Boots by the fire. Both roads meet here, so I hear both.”"],
         [rumour("dusk_ferre_width",
                 "The Greenway. Who cut it?",
                 "“That is the question, is it not.” She says it like somebody "
                 "who has heard it before and never had a good answer. “Nine "
                 "miles, dead straight, forty yards across. The Moot Road took "
                 "the parish eleven years and a great deal of arguing with the "
                 "wood.” A cloth over the bar. “Nobody argued about the "
                 "Greenway. It was there.”",
                 "dusk_green_width", faction=KEEPERS, base=11),
          rumour("dusk_ferre_night",
                 "Does anything cross it at night?",
                 "“No.” Flat, and she does not soften it. “The deer go up it "
                 "and down it. They will cross the turnpike, the coast road "
                 "and my yard, and they will not step over the Greenway after "
                 "dark.” She looks at the fire. “I have had drovers in here "
                 "who lost a night going round rather than over, and they were "
                 "not men who lose nights.”",
                 "dusk_green_night", faction=KEEPERS, base=13,
                 skill="insight")]),
]
