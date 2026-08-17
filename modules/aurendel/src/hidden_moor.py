"""The Weeping Moor's hidden threads — three, in the four areas nothing uses.

Colder's Hearth is named for a man who kept a fire going for forty years so
people could find their way off the moor, and they still keep it going: an inn,
a store, a chapel and two cottages, and nobody had ever been in one of them.
Mirestead cuts peat on the only firm ground for two miles and has a cutting
deep enough to reach what the bog has been keeping. The Heatherlands have no
shelter anywhere in them but a bothy and a burnt farm. Kestrel Edge is two
hundred feet of gritstone with the whole vale laid out below it and a shooting
house nobody shoots from.

Three threads, and they share a shape: **the moor takes things and something
has been putting them back.**

  * **Colder's Fire** — two hundred years without going out, on a third of the
    peat a fire that size burns, kept by a man the register buries twice.
  * **Forty-One Out, Forty-One In** — the cutters take bodies out of the deep
    peat and the store's book records every one of them returned, and they are
    not always the same ones.
  * **The Drive That Goes Over** — a roofless shooting house with fresh wear in
    eight places, and a beaters' line on the estate map that runs off the edge.
"""
from questkit import npc, shop, quest, reach, kill, flagged, arc
from lorekit import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "weeping_moor"
LIBRARY = "the_library"

FIRE = [
    clue("moor_fire_years",
         "It has not been out in two hundred years. Colder kept it forty and "
         "the parish has kept it a hundred and sixty since, by rota, without "
         "one lapse anybody can find.",
         "the Beacon"),
    clue("moor_fire_fuel",
         "The parish buys peat for it by the load and the load it buys is "
         "about a third of what a fire that size eats. Nobody has ever been "
         "short.",
         "the Hearth Store"),
    clue("moor_fire_twice",
         "Colder is in the register twice, buried forty years apart, in the "
         "same hand, with the same three words after the name.",
         "a rota keeper"),
    clue("moor_fire_green",
         "Two nights a year, when the wind comes off the moor rather than the "
         "vale, it burns green and the whole village is indoors by dark "
         "without anybody having said so.",
         "the chapel rota"),
]

CUTTING = [
    clue("moor_cut_count",
         "Forty-one have come out of the deep peat since the cutters started "
         "keeping count, and the store's book records forty-one put back.",
         "the Cutters' Store"),
    clue("moor_cut_swapped",
         "They are not always the same ones. Two were noted as returned in a "
         "different condition than they went in, and the note is in the "
         "clerk's ordinary hand, as though it were ordinary.",
         "the store book"),
    clue("moor_cut_buckle",
         "The peat at that depth is eleven thousand years old. One of the "
         "forty-one had an iron buckle on it and iron is four thousand.",
         "a peat cutter"),
    clue("moor_cut_band",
         "Nobody cuts below the black band, and every cutter here can find the "
         "black band in the dark, and not one of them was ever taught where it "
         "is.",
         "the Cuttings"),
]

DRIVE = [
    clue("moor_shoot_wear",
         "The house has no roof and the flags in front of it are worn through "
         "in eight places, evenly spaced, and the wear is this century.",
         "the Heather Bothy"),
    clue("moor_shoot_line",
         "The beaters' line on the old estate map does not stop at the scarp. "
         "It is drawn over it and down, and the ink is the same ink.",
         "the estate map"),
    clue("moor_shoot_birds",
         "Birds go out over that drop on one day of the year, in numbers, and "
         "the count that goes out is not the count that comes back, and it "
         "never has been.",
         "the Edge"),
    clue("moor_shoot_draught",
         "The holes under the scarp draw upward. Every other hole on this moor "
         "breathes down, because cold air falls, which is a thing cold air "
         "does everywhere.",
         "the Burnt Farm"),
]

LORE = FIRE + CUTTING + DRIVE

THREADS = [
    thread("moor_fire", "Colder's Fire",
           "Two hundred years alight on a third of the fuel it needs, kept for "
           "a man the parish register buries twice.", FIRE),
    thread("moor_cut", "Forty-One Out, Forty-One In",
           "Every body the deep peat gave up written down as returned, and not "
           "always the one that was taken.", CUTTING),
    thread("moor_shoot", "The Drive That Goes Over",
           "A roofless shooting house with this century's wear in eight even "
           "places, and a beaters' line drawn over the scarp and down.", DRIVE),
]

ITEMS = [
    keepsake("hearth_rota", "The Hearth Rota",
             "A hundred and sixty years of whose turn it was, unbroken, with "
             "two nights a year ruled through and nobody's name against them.",
             holder="fire_keeper_wenna"),
    keepsake("cutters_book", "The Cutters' Book",
             "Forty-one out and forty-one back, in four clerks' hands, with "
             "two lines that describe a difference and do not remark on it.",
             holder="peat_cutter_hald"),
    keepsake("estate_map", "The Old Estate Map",
             "Drives, butts and beaters' lines over the whole moor, and one "
             "line that goes over the scarp and keeps going.",
             holder="bothy_man_ferrin"),

    trophy("green_ash", "Ash That Burned Green",
           "Raked cold out of a fire that has been alight for two hundred "
           "years, off one of the two nights a year it changes colour.",
           "moor_fire_green"),

    relic("hearth_ring", "The Ring off the Long Fire", "ring",
          "Iron out of a hearth nobody has let go out. What the wearer lights "
          "is hard to put out, and so is the wearer.",
          value=900, rarity="rare", resist=(("fire", 0.5),),
          skills={"resolve": 3, "survival": 2}),
    relic("bog_belt", "The Belt Out of the Black Band", "belt",
          "Tanned by eleven thousand years of peat into something that is not "
          "leather any more. It does not rot and neither, for a while, does "
          "what it is buckled around.",
          value=940, rarity="very_rare", carry=3,
          resist=(("poison", 0.5),), skills={"medicine": 2, "resolve": 3}),
    relic("beaters_cloak", "The Beater's Cloak", "cloak",
          "Off the eighth place in the line, the one that stands where the "
          "ground stops. Whatever is driven, it does not come at the wearer "
          "first.",
          value=1000, rarity="very_rare", guard=2,
          skills={"stealth": 3, "perception": 2}),
]

LOOT_TABLES = [
    carried("moor_rota_carried", "What Wenna Kept", "hearth_rota"),
    carried("moor_book_carried", "What Hald Kept", "cutters_book"),
    carried("moor_map_carried", "What Ferrin Kept", "estate_map"),
]

GATES = [
    sealed("moor_fire_undercroft", "Where the Fuel Goes",
           "A cold room under a warm building, and a floor that has been up "
           "and down more often than a floor is.",
           blocked("moor_fire_blocked",
                   "A hundred and sixty years of whose turn it was, and two "
                   "nights a year ruled through with no name against them. "
                   "Which two nights is on the rota and the rota is the "
                   "keeper's.",
                   "The parish buys a third of the peat that fire eats and "
                   "nobody has ever been short. The rest is coming from "
                   "somewhere and it is not coming in through the door.",
                   "Colder is buried twice, forty years apart, in one hand, "
                   "with the same three words after the name both times."),
           items=["hearth_rota"], opens_flag="moor_fire_open"),

    sealed("moor_cut_black_band", "Below the Black Band",
           "The depth every cutter here can find in the dark and none of them "
           "was taught, and one face of it opened.",
           blocked("moor_cut_blocked",
                   "Forty-one out and forty-one back is a count, and a count "
                   "is kept in a book. Which of them went back different is in "
                   "two lines nobody thought worth remarking on.",
                   "Eleven thousand years of peat at that depth, and iron is "
                   "four. Something was put in below the band long after the "
                   "band was made.",
                   "Nobody cuts below it. Every cutter can walk to it "
                   "blindfold. Not one of them can tell you who told them."),
           items=["cutters_book"], opens_flag="moor_cut_open"),

    sealed("moor_shoot_eighth", "The Eighth Butt",
           "Eight worn places in front of a roofless house, evenly spaced, and "
           "the eighth of them stands where the ground stops.",
           blocked("moor_shoot_blocked",
                   "The line is drawn on the estate map and the map is the "
                   "bothy man's. Pacing it out will put you at seven butts and "
                   "an empty ledge.",
                   "Eight places worn through this century, in front of a "
                   "house that lost its roof in the last one.",
                   "The birds go out over the drop in numbers on one day a "
                   "year, and the count out has never been the count back."),
           items=["estate_map"], opens_flag="moor_shoot_open"),
]

POI_PATCHES = {
    # A chapel on firm ground rather than a dungeon mouth, so what is under it
    # carries its own table and its own chance.
    "colders_hearth_chapel": {**rumoured("moor_fire", base=19, step=3, entries=4),
                              "gate": "moor_fire_undercroft",
                              "encounterTables": ["moor_fire_boss"],
                              "encounterChance": 1},
    "mirestead_bog_body_cut": {**rumoured("moor_cut", base=21, step=3, entries=4),
                               "gate": "moor_cut_black_band"},
    "kestrel_edge_grit_caves": {**rumoured("moor_shoot", base=22, step=3, entries=4,
                                           skill="survival"),
                                "gate": "moor_shoot_eighth"},
}

POI_TRIGGERS = {
    "colders_hearth_the_fire": [finding("moor_found_fire",
                                        "How much peat is stacked against it, "
                                        "and how long that would last.",
                                        "moor_fire_fuel")],
    "mirestead_peat_cuttings": [finding("moor_found_band",
                                        "The depth everybody stops at, and how "
                                        "exactly they all stop at it.",
                                        "moor_cut_band")],
    "kestrel_edge_the_edge": [finding("moor_found_edge",
                                      "What goes out over the drop, and what "
                                      "comes back.", "moor_shoot_birds")],
    "kestrel_edge_shooting_house": [finding("moor_found_house",
                                            "Eight worn places in front of a "
                                            "house with no roof.",
                                            "moor_shoot_wear")],
    "heatherlands_burnt_farm": [finding("moor_found_draught",
                                        "Which way the air moves in the holes "
                                        "under the scarp.",
                                        "moor_shoot_draught")],

    "colders_hearth_chapel": [{
        "id": "moor_fire_committed", "mode": "once", "on": "enter",
        "description": "In the cold room under the warm building.",
        "requires": {"custom": {"gte": [{"ref": "threads.moor_fire.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "moor_colders_fire"}}}],
    }],
    "mirestead_bog_body_cut": [{
        "id": "moor_cut_committed", "mode": "once", "on": "enter",
        "description": "Below the band, on the face nobody opens.",
        "requires": {"custom": {"gte": [{"ref": "threads.moor_cut.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "moor_forty_one"}}}],
    }],
    "kestrel_edge_grit_caves": [{
        "id": "moor_shoot_committed", "mode": "once", "on": "enter",
        "description": "Under the scarp, where the eighth of the line stands.",
        "requires": {"custom": {"gte": [{"ref": "threads.moor_shoot.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "moor_the_drive"}}}],
    }],
}

BOSSES = {
    "moor_deep_cutting": "moor_cut_boss",
    "moor_grit_caves": "moor_shoot_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("moor_colders_fire", "Colder's Fire",
            "Two hundred years alight on a third of the fuel it needs, kept "
            "for a man the parish register buries twice.",
            [reach("under_the_warm", "Get into the cold room underneath.",
                   "colders_hearth_chapel", hidden=True),
             flagged("read_the_rota", "Find which two nights have no name "
                     "against them.", "moor_fire_open", hidden=True),
             kill("what_is_fed", "Meet what the fire has been feeding.",
                  "the_long_fire", hidden=True)],
            xp=185, items=[("hearth_ring", 1)], thread_key="moor_fire"),

    _hidden("moor_forty_one", "Forty-One Out, Forty-One In",
            "Every body the deep peat gave up written down as returned, and "
            "not always the one that was taken.",
            [reach("below_the_band", "Get below the band nobody cuts past.",
                   "mirestead_bog_body_cut", hidden=True),
             flagged("match_the_count", "Work out which two went back "
                     "different.", "moor_cut_open", hidden=True),
             kill("what_swaps", "Meet what has been doing the returning.",
                  "the_returner", hidden=True)],
            xp=195, items=[("bog_belt", 1)], thread_key="moor_cut"),

    _hidden("moor_the_drive", "The Drive That Goes Over",
            "A roofless shooting house with this century's wear in eight even "
            "places, and a beaters' line drawn over the scarp and down.",
            [reach("under_the_scarp", "Get under the scarp where the line "
                   "goes.", "kestrel_edge_grit_caves", hidden=True),
             flagged("stand_the_eighth", "Take the eighth place in the line.",
                     "moor_shoot_open", hidden=True),
             kill("what_is_driven", "Meet what the drive has been driving.",
                  "the_driven", hidden=True)],
            xp=205, items=[("beaters_cloak", 1)], thread_key="moor_shoot"),
]

ARCS = [
    arc("moor_hidden", "The Weeping Moor, Returned",
        "Three counts this moor has been keeping, and all three of them "
        "balance, which is the trouble.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("fire_keeper_wenna", "Wenna, whose Turn It Is",
        "Holds the rota for a fire that has not gone out in two hundred years "
        "and has never once had to hurry.",
        faction=LIBRARY, dialogue_id="moor_wenna_talk",
        home="colders_hearth_house_a", disposition=4, gullibility=0.3,
        memory_span=230, statblock="moor_keeper"),

    npc("peat_cutter_hald", "Hald, who Cuts",
        "Takes turf out of the only firm ground for two miles and has carried "
        "three of the forty-one up the duckboards himself.",
        faction=LIBRARY, dialogue_id="moor_hald_talk",
        home="mirestead_house_a", disposition=3, gullibility=0.3,
        memory_span=200, statblock="moor_cutter"),

    npc("bothy_man_ferrin", "Ferrin, at the Bothy",
        "Lives in the only shelter in the Heatherlands and keeps the estate's "
        "old map because the estate stopped wanting it.",
        faction=LIBRARY, dialogue_id="moor_ferrin_talk",
        home="heatherlands_bothy", disposition=2, gullibility=0.25,
        memory_span=210, statblock="moor_bothy"),

    npc("hearth_store_ivy", "Ivy, at the Hearth Store",
        "Sells the parish its peat by the load and has done the arithmetic "
        "more than once.",
        faction=LIBRARY, dialogue_id="moor_ivy_talk",
        home="colders_hearth_store", disposition=6, gullibility=0.4,
        memory_span=180,
        shop=shop("keeper_stock", buys=("material",), multiplier=1.2)),

    npc("beacon_landlord_sask", "Sask, at the Beacon",
        "Keeps the inn a fire was lit to guide people to, and hears every "
        "version of every story on this moor twice a night.",
        faction=LIBRARY, dialogue_id="moor_sask_talk",
        home="colders_hearth_inn", disposition=7, gullibility=0.45,
        memory_span=190,
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.3)),

    npc("cutters_store_bram", "Bram, at the Cutters' Store",
        "Weighs turf, keeps the book, and wrote two of the lines in it that he "
        "would rather he had not.",
        faction=LIBRARY, dialogue_id="moor_bram_talk",
        home="mirestead_store", disposition=4, gullibility=0.35,
        memory_span=220,
        shop=shop("keeper_stock", buys=("treasure",), multiplier=1.2)),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from loot import group, encounters  # noqa: E402

_MOOR = dict(creature_type="humanoid", faction="the_library")

MONSTERS = [
    creature("moor_keeper", "Wenna, whose Turn It Is", 6, 0,
             A(13, 13, 16, 13, 15, 13), ["strike"],
             "Has carried peat across open moor in weather that stopped the "
             "mail, on a rota, without comment.",
             descriptors=["a soot-marked"], loot="moor_rota_carried", hp=36,
             **_MOOR),
    creature("moor_cutter", "Hald, who Cuts", 6, 0,
             A(16, 13, 16, 11, 14, 11), ["strike", "shove"],
             "Swings a turf spade all day in ground that does not want to let "
             "go of it.",
             descriptors=["a peat-black"], loot="moor_book_carried", hp=40,
             **_MOOR),
    creature("moor_bothy", "Ferrin, at the Bothy", 6, 0,
             A(13, 16, 15, 13, 16, 10), ["strike", "quick_shot"],
             "Lives eleven miles from the nearest roof that is not his and "
             "prefers it.",
             descriptors=["a heather-brown"], loot="moor_map_carried", hp=34,
             **_MOOR),

    creature("the_long_fire", "What the Fire Feeds", 7, 720,
             A(14, 14, 16, 15, 16, 15), ["cinder_lash", "wither",
                                         "grave_chill"],
             "Two hundred years alight on a third of the peat it burns, and "
             "two nights a year when it goes green and a village is indoors "
             "before dark without anybody saying so.",
             behaviour=[{"priority": 20, "use": "cinder_lash",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "wither"},
                        {"priority": 0, "use": "grave_chill"}],
             descriptors=["a green-lit", "a patient"],
             loot="moor_fire_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "burning"], hp=84),
    creature("the_returner", "What Puts Them Back", 8, 880,
             A(16, 14, 18, 12, 15, 12), ["drag_under", "latch", "bleed_white"],
             "Forty-one out of the deep peat and forty-one written down as "
             "returned, in four clerks' hands, two of the lines noting a "
             "difference and none of them remarking on it.",
             behaviour=[{"priority": 20, "use": "drag_under",
                         "when": {"chance": 0.4}},
                        {"priority": 10, "use": "bleed_white"},
                        {"priority": 0, "use": "latch"}],
             descriptors=["a tanned", "an unhurried"],
             loot="moor_cut_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "prone"], hp=100),
    creature("the_driven", "What the Drive Drives", 8, 920,
             A(15, 18, 16, 12, 17, 11), ["quick_shot", "cut_and_run", "rend"],
             "Eight worn places in front of a roofless house, evenly spaced, "
             "and a line on the map that goes over the scarp and keeps going "
             "down.",
             behaviour=[{"priority": 20, "use": "cut_and_run",
                         "when": {"chance": 0.45}},
                        {"priority": 10, "use": "quick_shot"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a broken-winged", "a great many"],
             loot="moor_shoot_hoard", immunities=["frightened", "prone"],
             hp=94),
]

ENCOUNTER_TABLES = [
    encounters("moor_fire_boss", [group("b", [("the_long_fire", "1", False)])],
               chance=1, empty=0),
    encounters("moor_cut_boss", [group("b", [("the_returner", "1", False)])],
               chance=1, empty=0),
    encounters("moor_shoot_boss", [group("b", [("the_driven", "1d3", True)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "moor_fire_hoard", "name": "The Cold Room Under the Warm One",
     "rolls": "2", "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "4d6"}},
                 {"weight": 3, "value": {"item": "healing_draught",
                                         "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "wight_ash", "quantity": "1"}},
                 {"weight": 1, "value": {"item": "green_ash", "quantity": "1",
                                         "unique": True}}]},
    {"id": "moor_cut_hoard", "name": "Below the Black Band", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "5d6"}},
                 {"weight": 3, "value": {"item": "barrow_torc", "quantity": "1"}},
                 {"weight": 2, "value": {"item": "antidote", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "silvered_blade",
                                         "quantity": "1"}}]},
    {"id": "moor_shoot_hoard", "name": "Under the Eighth Butt", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "5d6"}},
                 {"weight": 3, "value": {"item": "ward_salt", "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "amber_lump", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "warded_coat", "quantity": "1"}}]},
]

_wenna = [
    rumour("moor_wenna_years", "How long has the fire been going?",
           "“Two hundred years and a bit.” Wenna says it the way you say your "
           "own age. “Colder kept it forty. The parish has kept it since, on "
           "the rota, and there is no gap in the rota — I have been through it "
           "twice looking for one.” A dry look. “Every parish record in "
           "Aurendel has a gap in it. Ours does not.”",
           "moor_fire_years", faction=LIBRARY, base=12),
    rumour("moor_wenna_green", "What happens on the nights it burns green?",
           "The friendliness goes out of her, not unkindly. “Two nights a "
           "year. When the wind comes off the moor instead of the vale.” She "
           "looks at the door. “Everybody is inside by dark. Nobody rings a "
           "bell and nobody knocks and nobody has ever said out loud that we "
           "do it. I did it as a child before I knew I was doing it.”",
           "moor_fire_green", faction=LIBRARY, base=16, skill="insight"),
]
_wenna.append(favour(
    "moor_wenna_rota",
    "The rota. Let me take it.",
    "She hands it over in an oilcloth. “A hundred and sixty years of whose "
    "turn,” she says. “And two nights a year ruled straight through with "
    "nobody's name against them, every year, in every hand.” A beat. “Somebody "
    "keeps it those nights. It has never gone out.”",
    "hearth_rota", faction=LIBRARY, base=14, cost=2,
    refused="“It is the parish's and it is my turn,” Wenna says, and the "
            "oilcloth goes back in the dresser."))

_hald = [
    rumour("moor_hald_buckle", "The bodies out of the deep peat.",
           "“Forty-one.” Hald leans on the spade. “I have carried three "
           "myself.” He is quiet a moment. “The peat down there is eleven "
           "thousand year. Everybody knows that, it is why the Library pays. "
           "And one of the forty-one had an iron buckle on it.” He meets your "
           "eye. “Iron is four thousand. I am a turf cutter and even I can do "
           "that sum.”",
           "moor_cut_buckle", faction=LIBRARY, base=14, skill="insight"),
    rumour("moor_hald_band", "How deep do you cut?",
           "“To the black band and not past it.” Instant. Then he hears the "
           "next question coming and answers it. “No, nobody told me. I was "
           "eleven and I stopped at it, and my hands stopped at it before I "
           "did.” The spade goes back in. “Take any cutter out there at night "
           "with no lamp and they will put a hand on that band first go.”",
           "moor_cut_band", faction=LIBRARY, base=15),
]
_hald.append(favour(
    "moor_hald_book",
    "The cutters' book. I want the two lines.",
    "He gets it from under a dry sack. “Forty-one out, forty-one back,” he "
    "says. “And two of them written up as going back different to how they "
    "came out, in Bram's grandfather's ordinary hand, as though it were an "
    "ordinary thing to write.” He does not let go of it at once. “I would "
    "rather know.”",
    "cutters_book", faction=LIBRARY, base=15, cost=2,
    refused="“It is the cut's book,” Hald says, “and the cut is all of ours,” "
            "and it goes back under the sack."))

_ferrin = [
    rumour("moor_ferrin_wear", "The house on the edge.",
           "“No roof since my father's time.” Ferrin does not look up from the "
           "fire. “And eight worn places in the flags in front of it, even as "
           "fence posts.” Now the look up. “Worn through. Grit does not wear "
           "through in a century unless somebody is standing on it, and there "
           "has not been a shoot off that house since before the roof went.”",
           "moor_shoot_wear", faction=LIBRARY, base=14),
    rumour("moor_ferrin_line", "You keep the estate's old map.",
           "“They did not want it and I did.” He unrolls a corner of it "
           "without being asked, which tells you how often he looks at it. "
           "“Drives, butts, beaters' lines, the whole moor.” A finger on one "
           "line. “That one does not stop at the scarp. It is drawn over and "
           "down, and it is the same ink as the rest, which means whoever drew "
           "it drew it on the same afternoon and thought nothing of it.”",
           "moor_shoot_line", faction=LIBRARY, base=15, skill="insight"),
    # Eleven miles out with nothing between him and it, Ferrin can see the
    # colour of that fire — which is also what keeps this thread's tellers in
    # more than one settlement.
    rumour("moor_ferrin_green", "You can see Colder's Fire from here.",
           "“Every night of my life.” Ferrin does not think it worth "
           "remarking on until he does. “Twice a year it goes green. I can "
           "see it go from this door, eleven mile off, and the lamps in the "
           "village all come on inside the same quarter hour and then they "
           "all go out.” He sets the cup down. “Nobody rings anything. They "
           "just go in.”",
           "moor_fire_green", faction=LIBRARY, base=14),
]
_ferrin.append(favour(
    "moor_ferrin_map",
    "The map. Lend it to me.",
    "He rolls it properly before he hands it over, which takes a while and is "
    "the whole of what he thinks about it. “Eight in the line,” Ferrin says. "
    "“Seven of them you can walk to. The eighth is drawn where there is no "
    "ground.”",
    "estate_map", faction=LIBRARY, base=14, cost=2,
    refused="“It is the only thing in here worth anything,” Ferrin says, “and "
            "I am not sentimental about much,” and rolls it up."))

DIALOGUES = [
    talk("moor_wenna_talk", "greet",
         ["A cottage with a peat stack under the eave twice the size of the "
          "cottage, and a woman counting it who does not need to.",
          "“It is my turn this fortnight. Talk while I carry.”"],
         _wenna),

    talk("moor_hald_talk", "greet",
         ["Duckboards out over black water to a face of cut turf twelve feet "
          "high, and a man on the top of it working down.",
          "“Stay on the boards. I mean that kindly.”"],
         _hald),

    talk("moor_ferrin_talk", "greet",
         ["One room, one door, one window, eleven miles of heather, and "
          "somebody who has clearly been alone long enough to have views.",
          "“There is tea. There is not much else.”"],
         _ferrin,
         redirects=[coldshoulder("moor_ferrin", LIBRARY, -30,
                                 "He puts the map in the box, sits on the box, "
                                 "and looks at the fire.", back="greet")[0]],
         extra_nodes=[coldshoulder("moor_ferrin", LIBRARY, -30,
                                   "He puts the map in the box, sits on the "
                                   "box, and looks at the fire.",
                                   back="greet")[1]]),

    talk("moor_ivy_talk", "greet",
         ["Peat by the load, tallow, rope, and a slate with the parish's "
          "account on it in a hand that has clearly added it up twice.",
          "“Load, half load, or the parish's account. It is usually the "
          "parish's account.”"],
         [rumour("moor_ivy_fuel",
                 "How much peat does the parish buy for that fire?",
                 "“Eleven loads a year.” Ivy taps the slate. “I have sold it "
                 "eleven loads a year for nineteen years.” She puts the chalk "
                 "down. “A fire that size, going day and night, eats thirty. I "
                 "have said so to the vestry twice. Both times somebody said "
                 "*well, it has never gone out, has it* and that was the end "
                 "of the meeting.”",
                 "moor_fire_fuel", faction=LIBRARY, base=12, skill="craft"),
          rumour("moor_ivy_draught",
                 "The holes under the scarp.",
                 "“Draw up.” She is definite. “Every hole on this moor "
                 "breathes down — cold air falls, that is all it does. Put a "
                 "candle at any of the ones under that edge and it lies flat "
                 "the wrong way.” A shrug. “The shooting parties used to think "
                 "it was funny. There have been no shooting parties for a "
                 "while.”",
                 "moor_shoot_draught", faction=LIBRARY, base=13)]),

    talk("moor_sask_talk", "greet",
         ["A taproom built to be found from a long way off, with the door on "
          "the moor side and a lamp in every window of that wall.",
          "“Bed, fire, or the fire. Most people want the fire.”"],
         [rumour("moor_sask_twice",
                 "Colder. What do the parish records say about him?",
                 "Sask leans on the bar with the air of a man who has been "
                 "waiting years. “Buried twice,” he says. “Forty year apart. "
                 "Same hand — the register was kept by one clerk for fifty "
                 "years, so it *is* the same hand — and the same three words "
                 "written after the name both times.” He straightens. “I have "
                 "shown four people. Three said it was a copying error. The "
                 "fourth was a Library man and he went very quiet.”",
                 "moor_fire_twice", faction=LIBRARY, base=15,
                 skill="insight"),
          rumour("moor_sask_birds",
                 "The birds over the edge.",
                 "“One day a year, in their thousands.” He says it without "
                 "wonder, which is worse. “Out over the drop and down. My "
                 "father counted them out and counted them back for eleven "
                 "years because he did not believe the first ten.” A cloth on "
                 "the bar. “Fewer come back. Every year. Never once the same "
                 "number.”",
                 "moor_shoot_birds", faction=LIBRARY, base=14),
          # Mirestead is two hours off and every one of the forty-one has been
          # argued about in this room. It is also the second settlement this
          # thread needs, so one missed conversation cannot end it.
          rumour("moor_sask_buckle",
                 "What do the cutters say comes out of the deep cut?",
                 "“Forty-one, and I have heard about all forty-one in here "
                 "twice.” Sask is enjoying himself, and then is not. “The "
                 "one they will not let go is the buckle. Iron buckle, on a "
                 "body out of eleven-thousand-year peat.” He turns a glass "
                 "over. “The Library man said the face must have slumped. "
                 "Hald carried that one up the boards himself and Hald says "
                 "the face was clean.”",
                 "moor_cut_buckle", faction=LIBRARY, base=15,
                 skill="insight")]),

    talk("moor_bram_talk", "greet",
         ["Turf stacked by the thousand under a long open shed, scales, and a "
          "book on a stand that has been in that spot a very long time.",
          "“By the thousand or by the load. The book stays here.”"],
         [rumour("moor_bram_count",
                 "How many have come out of the deep cut?",
                 "“Forty-one.” Bram does not have to check and does not "
                 "pretend to. “Since we started counting, which is my "
                 "great-grandfather.” He turns the stand slightly, not enough "
                 "to show you the page. “And forty-one put back. That is in "
                 "there too. The Library takes them, the Library measures "
                 "them, the Library sends them home, and we put them back "
                 "where they came from.”",
                 "moor_cut_count", faction=LIBRARY, base=13),
          rumour("moor_bram_swapped",
                 "Were the forty-one put back the ones that came out?",
                 "It takes him a long moment. “No,” he says. “Two of them are "
                 "written up different going in to coming out. Different "
                 "height on one. Different hands on the other — *hands*, "
                 "written just like that.” He shuts the book. “My "
                 "grandfather's hand, in among the weights and the dates, like "
                 "it was a Tuesday.”",
                 "moor_cut_swapped", faction=LIBRARY, base=17,
                 skill="insight")]),
]
