"""The Kingsvale's hidden threads — three, at the level the game starts on.

Aurenhal has a Craftrow with eight trades on it and a Riverside with a wharf, a
boatyard, a fish market and a grate down into the undercity. Wraymill is a mill
town with a brewery and a weaver. Ashcott has a hedge maze. Pennyford has a ford
and a sluice house. The Kingsroad South has a quarry, a milestone and a gibbet.
Not one person had ever stood in any of it.

These are deliberately the gentlest threads in the world and they are here for a
specific reason: **this is where a player learns that clues exist at all.** The
Kingsvale is level 1–2 ground you cross in the first hour, and if nothing here
rewards listening then the whole layer is something a player discovers eleven
regions too late.

  * **The Quarry's Second Face** — the roadstone quarry has been worked from two
    faces and the Crown only ever paid for one.
  * **What Goes Under Aurenhal** — the undercity grate is bricked at the third
    turn, and the brick is newer than the city.
  * **The Ford Toll** — Pennyford's sluice house has a keeper's cottage and no
    keeper, and the sluice is worked.
"""
from questkit import npc, shop, quest, reach, kill, flagged, arc
from lorekit import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "kingsvale"
CROWN = "the_crown"

QUARRY = [
    clue("kings_quarry_two",
         "The quarry has been worked from two faces. The Crown's warrant is for "
         "one, and the tallies are for one, and there are two.",
         "a road mason"),
    clue("kings_quarry_stone",
         "The stone off the second face is not roadstone. It is finer, and "
         "there is none of it in any road in the Kingsvale.",
         "the Craftrow masons"),
    clue("kings_quarry_gibbet",
         "The gibbet on the Kingsroad was put up the year the second face "
         "opened, and the assize rolls have nobody hanged on it.",
         "the posting house"),
    clue("kings_quarry_night",
         "Carts went south off that road at night for eleven years and the "
         "posting house has every one of them in the book, unlicensed.",
         "the posting house's book"),
]

UNDER = [
    clue("kings_under_brick",
         "The undercity is bricked off at the third turn. The brick is newer "
         "than the city and older than the King's Gate.",
         "a Riverside boatman"),
    clue("kings_under_air",
         "Air comes out of that grate all year and it is warmer than the "
         "river, which the river should not permit.",
         "the fish market"),
    clue("kings_under_maps",
         "The Library has the city's drains back four hundred years, and the "
         "sheet for the year the brick went in is missing from the run.",
         "a copyist"),
    clue("kings_under_wharf",
         "The Long Wharf was rebuilt on new piles in the same year, and the "
         "old piles are still down there in the mud, cut off level.",
         "the boatyard"),
]

FORD = [
    clue("kings_ford_keeper",
         "There is a keeper's cottage on the end of the gear at Pennyford, "
         "with a roof and a door that shuts, and the parish has not paid a "
         "keeper in ninety years.",
         "the Drowned Ox"),
    clue("kings_ford_worked",
         "The sluice is worked. It is up in the spring and down at the "
         "harvest, every year, on the day.",
         "a ford-side farmer"),
    clue("kings_ford_ox",
         "The inn is called the Drowned Ox for an ox that drowned at a ford "
         "eleven inches deep, which is a thing an ox cannot do.",
         "the parish register"),
    clue("kings_ford_stone",
         "There is a stone in the ford bed with a hole through it, and the "
         "hole is worn by rope, and nobody has tied anything there in living "
         "memory.",
         "a ford-side farmer"),
]

LORE = QUARRY + UNDER + FORD

THREADS = [
    thread("kings_quarry", "The Quarry's Second Face",
           "One warrant, two faces, and eleven years of unlicensed carts going "
           "south at night.", QUARRY),
    thread("kings_under", "What Goes Under Aurenhal",
           "Brick newer than the city and older than the gate, warm air off "
           "the river, and a missing sheet in the Library's run.", UNDER),
    thread("kings_ford", "The Ford Toll",
           "A sluice worked to the day by a keeper the parish stopped paying "
           "ninety years ago.", FORD),
]

ITEMS = [
    keepsake("posting_book", "The Posting House Book",
             "Eleven years of southbound carts at night, none of them "
             "licensed, all of them written down by somebody who was paid not "
             "to notice and noticed anyway.",
             holder="post_master_wend"),
    keepsake("drain_sheet", "The Missing Drain Sheet",
             "One sheet out of four hundred years of Aurenhal's drains, in a "
             "copyist's hand rather than the Library's, because the original "
             "went and somebody copied it first.",
             holder="copyist_marn"),
    keepsake("sluice_key", "The Sluice Key",
             "For a gate the parish stopped paying anybody to work ninety "
             "years ago, and which is worked to the day.",
             holder="ford_farmer_alsey"),

    trophy("second_face_stone", "A Piece off the Second Face",
           "Finer than roadstone, and there is none of it in any road.",
           "kings_quarry_stone"),

    relic("masons_belt", "The Road Mason's Belt", "belt",
          "Tool-worn leather off somebody who worked both faces and was paid "
          "for one. It carries more than it looks like it should.",
          value=420, rarity="uncommon", carry=4, skills={"craft": 2}),
    relic("undercity_hood", "The Hood off the Third Turn", "head",
          "Oiled canvas, sooted through, out of a passage that has been "
          "bricked since before the King's Gate.",
          value=520, rarity="rare", skills={"stealth": 3, "perception": 2}),
    relic("ford_ring", "The Ring in the Ford Stone", "ring",
          "Iron worn thin by a rope nobody has tied in living memory. Cold "
          "water does not trouble the wearer.",
          value=480, rarity="uncommon", resist=(("cold", 0.75),),
          skills={"athletics": 2, "survival": 2}),
]

LOOT_TABLES = [
    carried("kings_book_carried", "What Wend Kept", "posting_book"),
    carried("kings_sheet_carried", "What Marn Kept", "drain_sheet"),
    carried("kings_key_carried", "What Alsey Kept", "sluice_key"),
]

GATES = [
    sealed("kings_quarry_face", "The Second Face",
           "Two faces worked, one warrant, and the second face has a way into "
           "the hill at the bottom of it.",
           blocked("kings_quarry_blocked",
                   "The cut at the bottom of the second face is shored and the "
                   "shoring is sound, which is not what eleven years of "
                   "abandonment looks like. Somebody kept a book on this and "
                   "the book will say who.",
                   "Timber this good does not stand for eleven years unless "
                   "somebody has been replacing it.",
                   "Fine stone, cut and carried south at night, and a hole in "
                   "the hill at the end of it. You would want to know whose "
                   "carts before you went in."),
           items=["posting_book"], opens_flag="kings_quarry_open"),

    sealed("kings_under_brick_wall", "The Brick at the Third Turn",
           "Newer than the city, older than the gate, and laid by somebody in "
           "a hurry who was nonetheless very good at it.",
           blocked("kings_under_blocked",
                   "The brick is sound and the mortar is better than the "
                   "city's. There is a sheet of the drains for the year it "
                   "went in, and it is not in the Library's run any more.",
                   "Warm air comes through the joints, which brick should not "
                   "permit and this brick is doing anyway.",
                   "Four hundred years of drain sheets and one of them gone. "
                   "Somebody wanted this turn forgotten and very nearly "
                   "managed it."),
           items=["drain_sheet"], opens_flag="kings_under_open"),

    sealed("kings_ford_sluice", "Under the Sluice",
           "A gate worked to the day for ninety years by nobody the parish "
           "pays, and a chamber under it.",
           blocked("kings_ford_blocked",
                   "The sluice is locked and the lock is oiled. There is one "
                   "key, and the parish gave up trying to find out who has "
                   "it.",
                   "Up in the spring, down at the harvest, on the day, every "
                   "year. Somebody is doing this.",
                   "A stone in the ford bed with a rope-worn hole in it, and "
                   "nothing tied there in living memory."),
           items=["sluice_key"], opens_flag="kings_ford_open"),
]

POI_PATCHES = {
    "kingsroad_south_quarry": {**rumoured("kings_quarry", base=17, step=3, entries=4),
                               "gate": "kings_quarry_face"},
    "riverside_undercity_grate": {**rumoured("kings_under", base=18, step=3, entries=4),
                                  "gate": "kings_under_brick_wall"},
    "pennyford_sluice_house": {**rumoured("kings_ford", base=16, step=3, entries=4),
                               "gate": "kings_ford_sluice"},
}

POI_TRIGGERS = {
    "kingsroad_south_gibbet": [finding("kings_found_gibbet",
                                       "A gibbet with nobody on the assize "
                                       "rolls for it.", "kings_quarry_gibbet")],
    "pennyford_ford": [finding("kings_found_ford",
                               "A stone in the bed with a rope-worn hole.",
                               "kings_ford_stone")],
    "riverside_customs_house": [finding("kings_found_customs",
                                        "Piles cut off level, under the mud, "
                                        "beside newer ones.",
                                        "kings_under_wharf")],
    "ashcott_hedge_maze": [finding("kings_found_maze",
                                   "Fine stone in the maze's paths that is in "
                                   "no road in the Kingsvale.",
                                   "kings_quarry_stone")],

    "kingsroad_south_quarry": [{
        "id": "kings_quarry_committed", "mode": "once", "on": "enter",
        "description": "At the foot of a face nobody was paid to cut.",
        "requires": {"custom": {"gte": [{"ref": "threads.kings_quarry.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "kings_the_second_face"}}}],
    }],
    "riverside_undercity_grate": [{
        "id": "kings_under_committed", "mode": "once", "on": "enter",
        "description": "Down at the grate, with warm air coming up.",
        "requires": {"custom": {"gte": [{"ref": "threads.kings_under.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "kings_what_goes_under"}}}],
    }],
    "pennyford_sluice_house": [{
        "id": "kings_ford_committed", "mode": "once", "on": "enter",
        "description": "In the sluice house, with the gear oiled.",
        "requires": {"custom": {"gte": [{"ref": "threads.kings_ford.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "kings_the_ford_toll"}}}],
    }],
}

BOSSES = {
    "roadstone_quarry": "kings_quarry_boss",
    "aurenhal_undercity": "kings_under_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("kings_the_second_face", "The Quarry's Second Face",
            "One warrant, two faces, eleven years of unlicensed carts going "
            "south at night, and a shored cut at the bottom of the wrong one.",
            [reach("at_the_face", "Get to the second face.",
                   "kingsroad_south_quarry", hidden=True),
             flagged("into_the_hill", "Get into the hill.",
                     "kings_quarry_open", hidden=True),
             kill("what_was_cut_for", "Find what the fine stone was cut for.",
                  "quarry_thing", hidden=True)],
            xp=90, items=[("masons_belt", 1)], thread_key="kings_quarry"),

    _hidden("kings_what_goes_under", "What Goes Under Aurenhal",
            "Brick newer than the city and older than the gate, warm air off "
            "the river, and one sheet missing from four hundred years of "
            "drains.",
            [reach("at_the_grate", "Get down the undercity grate.",
                   "riverside_undercity_grate", hidden=True),
             flagged("past_the_brick", "Get past the third turn.",
                     "kings_under_open", hidden=True),
             kill("what_is_warm", "Find what has been keeping it warm.",
                  "under_warmth", hidden=True)],
            xp=110, items=[("undercity_hood", 1)], thread_key="kings_under"),

    _hidden("kings_the_ford_toll", "The Ford Toll",
            "A sluice worked to the day for ninety years by a keeper the "
            "parish stopped paying, over a chamber nobody has opened.",
            [reach("in_the_sluice_house", "Get into the sluice house.",
                   "pennyford_sluice_house", hidden=True),
             flagged("under_the_gate", "Get under the gate.",
                     "kings_ford_open", hidden=True),
             kill("the_keeper", "Meet the keeper.", "ford_keeper",
                  hidden=True)],
            xp=100, items=[("ford_ring", 1)], thread_key="kings_ford"),
]

ARCS = [
    arc("kings_hidden", "The Kingsvale, Unwarranted",
        "Three things the Crown's paperwork does not cover, within two days' "
        "walk of where you started.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("post_master_wend", "Wend, at the Posting House",
        "Changes horses on the Kingsroad and writes down every cart that goes "
        "past, which the Crown has never asked her to do.",
        faction=CROWN, dialogue_id="kings_wend_talk",
        home="kingsroad_south_posting_house", disposition=4, gullibility=0.3,
        memory_span=250, statblock="kings_postmaster",
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.25)),

    npc("copyist_marn", "Marn, a Copyist",
        "Copies the Library's drain sheets for the Craftrow guilds and once "
        "copied one the week before it went missing.",
        faction="the_library", dialogue_id="kings_marn_talk",
        home="craftrow_market_square", disposition=2, gullibility=0.25,
        memory_span=200, statblock="kings_copyist"),

    npc("ford_farmer_alsey", "Alsey, at the Ford",
        "Farms both banks at Pennyford and has watched the sluice go up in "
        "the spring and down at the harvest her whole life.",
        faction=CROWN, dialogue_id="kings_alsey_talk",
        home="pennyford_house_a", disposition=8, gullibility=0.45,
        memory_span=180, statblock="kings_farmer"),

    npc("road_mason_hob", "Hob, Road Mason",
        "Lays and relays the Kingsroad and can tell you which quarry every "
        "stone in it came out of, which is why the second face bothers him.",
        faction=CROWN, dialogue_id="kings_hob_talk",
        home="craftrow_great_forge", disposition=6, gullibility=0.4,
        memory_span=150),

    npc("boatman_tass", "Tass, of the Long Wharf",
        "Works lighters up and down the Aurenhal reach and has been past that "
        "grate four times a day for twenty years.",
        faction=CROWN, dialogue_id="kings_tass_talk",
        home="riverside_long_wharf", disposition=6, gullibility=0.45,
        memory_span=150),

    npc("ox_landlord_nib", "Nib, at the Drowned Ox",
        "Keeps an inn named after an animal that drowned in eleven inches of "
        "water and has heard every joke about it.",
        faction=CROWN, dialogue_id="kings_nib_talk",
        home="pennyford_the_drowned_ox", disposition=8, gullibility=0.5,
        memory_span=120,
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.3)),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from loot import group, encounters  # noqa: E402

_FOLK = dict(creature_type="humanoid", faction="the_crown")

MONSTERS = [
    creature("kings_postmaster", "Wend, at the Posting House", 3, 0,
             A(11, 13, 12, 13, 14, 13), ["strike"],
             "Handles horses that do not want handling, all day.",
             descriptors=["a brisk"], loot="kings_book_carried", hp=18, **_FOLK),
    creature("kings_copyist", "Marn, a Copyist", 3, 0,
             A(9, 13, 10, 15, 13, 11), ["strike"],
             "Sits still for a living and is not built for anything else.",
             descriptors=["an ink-stained"], loot="kings_sheet_carried", hp=14,
             creature_type="humanoid", faction="the_library"),
    creature("kings_farmer", "Alsey, at the Ford", 3, 0,
             A(14, 11, 14, 10, 13, 12), ["strike"],
             "Farms two banks of a river, which is twice the walking.",
             descriptors=["a red-faced"], loot="kings_key_carried", hp=20,
             **_FOLK),

    creature("quarry_thing", "What the Fine Stone Was Cut For", 4, 220,
             A(15, 11, 15, 8, 12, 9), ["stone_fist", "rend"],
             "Eleven years of the best stone in the Kingsvale going south at "
             "night, and something at the bottom of the hole it came out of.",
             descriptors=["a dust-white", "a heavy"], loot="kings_quarry_hoard",
             immunities=["prone", "frightened"], hp=38),
    creature("under_warmth", "What Keeps the Third Turn Warm", 4, 240,
             A(12, 14, 14, 12, 15, 13), ["grave_chill", "wither"],
             "Warm air off a bricked passage under a city, all year, since "
             "before the King's Gate.",
             descriptors=["a close", "a breathing"], loot="kings_under_hoard",
             interactions=HALF_UNLESS_SILVER, immunities=["frightened"], hp=34),
    creature("ford_keeper", "The Keeper", 4, 230,
             A(14, 13, 15, 11, 14, 12), ["drag_under", "latch"],
             "Ninety years of a sluice worked to the day, by somebody the "
             "parish stopped paying and who did not stop.",
             behaviour=[{"priority": 15, "use": "drag_under",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "latch"}],
             descriptors=["a sodden", "a dutiful"], loot="kings_ford_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "prone"], hp=36),
]

ENCOUNTER_TABLES = [
    encounters("kings_quarry_boss", [group("b", [("quarry_thing", "1", False)])],
               chance=1, empty=0),
    encounters("kings_under_boss", [group("b", [("under_warmth", "1d2", True)])],
               chance=1, empty=0),
    encounters("kings_ford_boss", [group("b", [("ford_keeper", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "kings_quarry_hoard", "name": "Bottom of the Second Face",
     "rolls": "2", "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "2d6"}},
                 {"weight": 2, "value": {"item": "bandages", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "second_face_stone",
                                         "quantity": "1", "unique": True}}]},
    {"id": "kings_under_hoard", "name": "Past the Third Turn", "rolls": "2",
     "emptyChance": 0.15, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "2d6"}},
                 {"weight": 2, "value": {"item": "healing_draught",
                                         "quantity": "1"}},
                 {"weight": 1, "value": {"item": "ward_salt", "quantity": "1"}}]},
    {"id": "kings_ford_hoard", "name": "Under the Sluice", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "3d6"}},
                 {"weight": 2, "value": {"item": "eel_skin", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "antidote", "quantity": "1"}}]},
]

_wend = [
    rumour("kings_wend_night",
           "Do many carts go south off this road at night?",
           "“They did.” She checks over her shoulder, which answers a "
           "different question. “Eleven years of them and not one licensed. I "
           "wrote every one down because a posting house writes things down, "
           "and nobody ever came and asked me for the book, which I have "
           "thought about a great deal.”",
           "kings_quarry_night", faction=CROWN, base=13, skill="persuasion"),
    rumour("kings_wend_gibbet",
           "There is a gibbet down the road with nobody's name on it.",
           "“Went up the same year the carts started.” She says it flatly. "
           "“Nobody hanged on it — I have had the assize clerk look, he owed "
           "me a favour. It is a gibbet that has never been used, on a road "
           "with no highwaymen, put up the year something else started.”",
           "kings_quarry_gibbet", faction=CROWN, base=14),
]
_wend.append(rumour(
    "kings_wend_worked",
    "You post horses over Pennyford. Is that sluice worked?",
    "“Up in the spring, down at the harvest, and I set my remounts by it.” She "
    "says it without looking up, and then does look up. “Which I have just "
    "heard myself say out loud for the first time. The parish has not paid "
    "anybody to do that since before I was born.”",
    "kings_ford_worked", faction=CROWN, base=12, skill="insight"))
_wend.append(favour(
    "kings_wend_book",
    "Let me take the book.",
    "She gets it from under the counter, which is not where a posting house "
    "keeps its book. “Eleven years,” she says. “If it turns out somebody at "
    "Kingshold has known this the whole time, I would rather hear it from you "
    "than from them.”",
    "posting_book", faction=CROWN, base=14, cost=2,
    refused="“Not the book,” she says. “I will tell you what is in it. The "
            "book stays where it is.”"))

DIALOGUES = [
    talk("kings_wend_talk", "greet",
         ["A posting house on a straight road, four horses in the yard and a "
          "woman writing in a book on the counter.",
          "“Horses are hired by the stage. If it is the Kingshold road you "
          "want the earlier one.”"],
         _wend),

    talk("kings_hob_talk", "greet",
         ["A forge yard with a road mason's kit against the wall and a man "
          "sorting setts by size.",
          "“Roadwork. If the road did it to your cart, take it up with the "
          "Crown, not me.”"],
         [rumour("kings_hob_two",
                 "How many faces is that quarry worked from?",
                 "“Two.” He puts a sett down. “The warrant is for one. The "
                 "tallies are for one. There are two, and I have laid road out "
                 "of that quarry for nineteen years and I would like somebody "
                 "to explain it who is not a clerk.”",
                 "kings_quarry_two", faction=CROWN, base=10),
          rumour("kings_hob_stone",
                 "Is the stone the same off both?",
                 "“No.” Emphatic. “Second face is finer. Better stone than the "
                 "Kingsroad has any use for, and there is *none of it* in the "
                 "Kingsroad, or the Craftrow, or the King's Gate. I have "
                 "looked at every road in this vale.” A pause. “It went "
                 "somewhere.”",
                 "kings_quarry_stone", faction=CROWN, base=12, skill="insight")]),

    talk("kings_tass_talk", "greet",
         ["A lighter tied at the Long Wharf and a man coiling rope on it who "
          "has clearly done this ten thousand times.",
          "“Cargo's by the ton and I do not take passengers past the "
          "watergate.”"],
         [rumour("kings_tass_air",
                 "That grate breathes.",
                 "“All year.” He does not stop coiling. “Warm, and warmer than "
                 "the river, which the river should not permit. Twenty years I "
                 "have gone past it four times a day. Winter, summer, flood — "
                 "same warm air.”",
                 "kings_under_air", faction=CROWN, base=10),
          rumour("kings_tass_brick",
                 "How far in does it go?",
                 "“Third turn, and then brick.” He ties off. “And the brick is "
                 "newer than the city and older than the Gate, which every "
                 "boatman on this reach knows and nobody has ever put in "
                 "writing.”",
                 "kings_under_brick", faction=CROWN, base=12),
          rumour("kings_tass_wharf",
                 "The wharf was rebuilt?",
                 "“New piles, same year as the brick. Old ones are still down "
                 "there, cut off level in the mud.” He looks at the water. "
                 "“Cut off *level*. You do not cut a pile off level under six "
                 "feet of river for fun.”",
                 "kings_under_wharf", faction=CROWN, base=13,
                 skill="insight")]),
]

_marn = [
    rumour("kings_marn_maps",
           "The Library keeps the city's drains, doesn't it?",
           "“Four hundred years of them, and I copy them for the guilds.” He "
           "lowers his voice without seeming to decide to. “There is a year "
           "missing out of the run. One sheet. And the run is bound, so "
           "somebody cut it out and rebound it, which is a week's work by "
           "somebody who knew how.”",
           "kings_under_maps", faction="the_library", base=15,
           skill="persuasion"),
    rumour("kings_marn_brick",
           "What is at the third turn under Riverside?",
           "“Brick.” He is precise about it, because he is a copyist. “And I "
           "have the profile off my copy — it is a foot thick, English bond, "
           "and the mortar is better than anything the city was laying at the "
           "time.” He sits back. “Somebody good was in a hurry.”",
           "kings_under_brick", faction="the_library", base=13),
]
_marn.append(favour(
    "kings_marn_sheet",
    "You copied the sheet before it went. I want your copy.",
    "He does not pretend not to have it. He gets it out of a case and unrolls "
    "the corner and rolls it back up again. “I made this the week before. I "
    "have never shown it to the Library.” He hands it over. “I would like to "
    "not be the only person who has seen it.”",
    "drain_sheet", faction="the_library", base=16, cost=2,
    refused="“I am a copyist in a city that has already cut one sheet out of a "
            "bound run,” he says. “No.”"))

DIALOGUES.append(
    talk("kings_marn_talk", "greet",
         ["A stall on the market square with a board, a case of rolls and a "
          "man ruling a line with the concentration of a surgeon.",
          "“Copying is by the sheet and I do not do it while you wait.”"],
         _marn,
         redirects=[coldshoulder("kings_marn", "the_library", -25,
                                 "He rolls what he was working on and puts it "
                                 "in the case and closes the case.",
                                 back="greet")[0]],
         extra_nodes=[coldshoulder("kings_marn", "the_library", -25,
                                   "He rolls what he was working on and puts "
                                   "it in the case and closes the case.",
                                   back="greet")[1]]))

_alsey = [
    rumour("kings_alsey_worked",
           "Somebody works that sluice.",
           "“Up in the spring, down at the harvest.” She is entirely matter of "
           "fact, which is the unnerving part. “On the day. Every year of my "
           "life and my mother's.” She goes back to the gate she is mending. "
           "“The parish stopped paying a keeper before I was born. I have "
           "never once seen it done.”",
           "kings_ford_worked", faction=CROWN, base=11),
    rumour("kings_alsey_stone",
           "There is a stone in the ford with a hole through it.",
           "“Rope-worn.” She nods at the water. “Worn all the way through, "
           "which is a lot of rope. Nobody has tied anything there in living "
           "memory and the wear is fresh at the edges, and I have stopped "
           "mentioning that to people.”",
           "kings_ford_stone", faction=CROWN, base=13, skill="insight"),
]
_alsey.append(favour(
    "kings_alsey_key",
    "Somebody has the sluice key. It is you.",
    "She is quiet a long moment. “It was in the thatch when we retiled. My "
    "father put it back.” She fetches it. “I have never used it and I have "
    "never thrown it away, and I would be glad to have it out of the house.”",
    "sluice_key", faction=CROWN, base=15, cost=2,
    refused="“I do not have a key,” she says, which is a lie, and she is not "
            "good at it, and she is not going to change her mind today."))

DIALOGUES.append(
    talk("kings_alsey_talk", "greet",
         ["A field gate being mended by somebody who has mended it many times "
          "and expects to again.",
          "“Ford's eleven inches. Do not let the horse drink and walk at the "
          "same time.”"],
         _alsey))

DIALOGUES.append(
    talk("kings_nib_talk", "greet",
         ["A taproom with an ox's yoke over the fire and a landlord who has "
          "seen you look at it.",
          "“Go on then. Get it out of the way.”"],
         [rumour("kings_nib_ox",
                 "How does an ox drown in eleven inches of water?",
                 "“It does not.” He says it before you have finished. “That is "
                 "the joke and that is also the answer. It is in the parish "
                 "register — drowned at the ford, and the ford is eleven "
                 "inches, and it was eleven inches that year because the "
                 "sluice was down.” He wipes the counter. “Somebody wrote "
                 "*drowned* because there was no other word for what they "
                 "found.”",
                 "kings_ford_ox", faction=CROWN, base=11),
          rumour("kings_nib_keeper",
                 "Who keeps the sluice house?",
                 "“Nobody. Ninety years, nobody.” He shrugs. “There is a "
                 "keeper's cottage on the end of it with a roof on it and a "
                 "door that shuts, and the parish has not paid a keeper since "
                 "my grandfather. Make of that what you like. Most people "
                 "make nothing of it, which is restful.”",
                 "kings_ford_keeper", faction=CROWN, base=10)]))
