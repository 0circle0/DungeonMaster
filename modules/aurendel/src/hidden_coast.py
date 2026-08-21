"""The Silver Coast's hidden threads — three, in the six areas nothing else uses."""
from dmkit.quests import npc, shop, quest, reach, kill, flagged, arc
from lore import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "silver_coast"
SALVORS = "the_salvors"

SCOURING = [
    clue("coast_horse_three",
         "Three parishes turn out to clear the chalk every spring, and every "
         "one of them will tell you they only come because the other two do.",
         "a downland shepherd"),
    clue("coast_horse_lines",
         "From four hundred feet up and two miles along it does not read as an "
         "animal at all. It reads as lines, and two of them cross square.",
         "the cliff path"),
    clue("coast_horse_shape",
         "The turf is let grow everywhere on that hill but one shape, and the "
         "shape has corners in it. Nothing that runs has corners.",
         "Downs Farm"),
    clue("coast_horse_pond",
         "There is standing water on the top of a chalk hill that has never "
         "once gone dry, in a drought, above the water table. Somebody built "
         "that, and building it took the same summer as the cutting.",
         "the water on the top"),
]

SIGNAL = [
    clue("coast_watch_correct",
         "Every skipper working out of the three villages comes two points to "
         "starboard off the head after dark, and not one of them can tell you "
         "what they are correcting for.",
         "a Gullmere skipper"),
    clue("coast_watch_light",
         "There is no stair in it and no floor above the second course, and a "
         "light has been seen in the top of it four times in living memory, "
         "always in the same week of the year.",
         "the harbour master"),
    clue("coast_watch_ring",
         "Forty thousand birds on that headland, and a circle of bare rock "
         "forty feet across at the tower's foot where nothing has ever nested.",
         "the cliff path"),
    clue("coast_watch_tide",
         "The way in under the head opens at the bottom of a spring tide and "
         "stays open about an hour, which is not long enough to go in and come "
         "back out again.",
         "the chandlery"),
]

UNCLAIMED = [
    clue("coast_yard_one",
         "The bailiff's book has one entry a year and has had for two hundred "
         "years: the same night in October, one taken up, never collected.",
         "the bailiff"),
    clue("coast_yard_wall",
         "The yard is dry-stone on three sides and mortared on the fourth, and "
         "the mortared face is older than the town by a very long way.",
         "a carter"),
    clue("coast_yard_horses",
         "The coach horses will not stand in that yard on that night, and the "
         "stablers gave up arguing with them about it two generations ago.",
         "the coach stables"),
    clue("coast_yard_paid",
         "The fee is paid every October, in coin, into the parish box, for a "
         "beast nobody ever comes for. The parish stopped asking who pays.",
         "Fennick's"),
]

LORE = SCOURING + SIGNAL + UNCLAIMED

THREADS = [
    thread("coast_horse", "The Scouring",
           "A chalk figure three parishes clear every spring without knowing "
           "why, that reads as lines from above and has corners in it.",
           SCOURING),
    thread("coast_watch", "The Tower That Still Signals",
           "A watchtower with no roof and no stair, off which every skipper on "
           "this coast corrects two points to starboard after dark.", SIGNAL),
    thread("coast_yard", "One a Year, Unclaimed",
           "Two hundred years of one entry each October — taken up, never "
           "collected — and the fee paid in coin by somebody.", UNCLAIMED),
]

ITEMS = [
    keepsake("scouring_tally", "The Scouring Tally",
             "A hazel rod notched once a year by whoever leads the clearing, "
             "and it has more notches on it than the parish has records.",
             holder="shepherd_ansel"),
    keepsake("harbour_night_book", "The Harbour Master's Night Book",
             "Two hundred years of bearings off a headland, in fourteen hands, "
             "and the correction is the same in all fourteen.",
             holder="harbour_master_veir"),
    keepsake("yard_book", "The Bailiff's Book",
             "One entry a year since the town was a crossroads. The October "
             "line is always the same eleven words.",
             holder="bailiff_hask"),

    trophy("corner_stone", "A Stone With a Corner On It",
           "Cut chalk out of a hill that has no cut chalk in it, square to "
           "within a finger's width over four feet.",
           "coast_horse_lines"),

    relic("scourers_belt", "The Scourers' Belt", "belt",
          "Hazel-bark cord and a buckle worn thin by three parishes' worth of "
          "hands. On open ground the wearer knows what is turf and what is "
          "only growing over.",
          value=560, rarity="rare", skills={"survival": 3, "perception": 2}),
    relic("signal_hood", "The Hood off the Signal Course", "head",
          "Tarred canvas out of a tower with no stair in it. Light behaves "
          "oddly at the edge of it, and always has.",
          value=640, rarity="rare", skills={"perception": 3, "insight": 2}),
    relic("unclaimed_ring", "The Ring Nobody Came For", "ring",
          "Off the October entry, the one year somebody looked. Worn, people "
          "find it hard to leave a question of yours unanswered.",
          value=580, rarity="uncommon", skills={"insight": 2, "persuasion": 3}),
]

LOOT_TABLES = [
    carried("coast_tally_carried", "What Ansel Kept", "scouring_tally"),
    carried("coast_book_carried", "What Veir Kept", "harbour_night_book"),
    carried("coast_yard_carried", "What Hask Kept", "yard_book"),
]

GATES = [
    sealed("coast_horse_adit", "Where the Lines Cross",
           "Two of the cut lines meet square, and the turf over the meeting "
           "has been lifted and put back more than once.",
           blocked("coast_horse_blocked",
                   "The clearing has been done to a count, every spring, and "
                   "the count is kept on a rod rather than in the parish "
                   "book. Without the rod you are looking at a hillside.",
                   "Lines that cross square on a hill nobody built anything "
                   "on. Whoever cut them was working to a plan, and the plan "
                   "is not the figure — the figure is the index to it.",
                   "The turf here lifts in one piece, which turf does not do "
                   "unless it has been lifted before."),
           items=["scouring_tally"], opens_flag="coast_horse_open"),

    sealed("coast_watch_undercroft", "Below the Second Course",
           "A tower with no stair going up, and a course of stone at the foot "
           "that is dressed on the inside face.",
           blocked("coast_watch_blocked",
                   "Fourteen hands of bearings all give the same correction "
                   "off this headland, and the book says what they were "
                   "correcting to. You do not have the book.",
                   "There is no way up and there has never been a way up. "
                   "Whatever this was built to do, it was done from "
                   "underneath.",
                   "Forty thousand birds on this head and a bare circle at "
                   "the foot of it. Birds are not sentimental about ruins."),
           items=["harbour_night_book"], opens_flag="coast_watch_open"),

    sealed("coast_yard_northface", "The Mortared Face",
           "Three walls of dry-stone a bailiff's grandfather laid, and a "
           "fourth that was standing here before the road was.",
           blocked("coast_yard_blocked",
                   "Two hundred years of one line a year, and the line names "
                   "where the beast was put. The book is the bailiff's and "
                   "the bailiff has it.",
                   "The mortar is not the town's mortar and is not the "
                   "Crown's either. It is older than both and it was mixed "
                   "with something that has not weathered.",
                   "Horses will not stand in this yard one night of the year. "
                   "They are not wrong about much."),
           items=["yard_book"], opens_flag="coast_yard_open"),
]

POI_PATCHES = {
    "chalk_downs_flint_mines": {**rumoured("coast_horse", base=17, step=3, entries=4,
                                           skill="survival"),
                                "gate": "coast_horse_adit"},
    "gannet_head_seacaves": {**rumoured("coast_watch", base=19, step=3, entries=4),
                             "gate": "coast_watch_undercroft"},
    # A point of interest, so the table and its chance hang on the place.
    "cobbleway_pound": {**rumoured("coast_yard", base=18, step=3, entries=4),
                        "gate": "coast_yard_northface",
                        "encounterTables": ["coast_yard_boss"],
                        "encounterChance": 1},
}

POI_TRIGGERS = {
    "chalk_downs_white_horse": [finding("coast_found_horse",
                                        "Close up, standing on it, what the "
                                        "shape is actually made of.",
                                        "coast_horse_shape")],
    "chalk_downs_dew_pond": [finding("coast_found_pond",
                                     "Water on the top of a chalk hill, in "
                                     "August.", "coast_horse_pond")],
    "gannet_head_path_poi": [finding("coast_found_path",
                                     "What the hill two miles inland looks "
                                     "like from four hundred feet up.",
                                     "coast_horse_lines")],
    "gannet_head_watchtower": [finding("coast_found_tower",
                                       "The circle of bare rock at the foot of "
                                       "it, and how sharp its edge is.",
                                       "coast_watch_ring")],
    "cobbleway_stables": [finding("coast_found_stables",
                                  "What the stablers have stopped arguing with "
                                  "the horses about.", "coast_yard_horses")],

    "chalk_downs_flint_mines": [{
        "id": "coast_horse_committed", "mode": "once", "on": "enter",
        "description": "Under the place where the lines cross.",
        "requires": {"custom": {"gte": [{"ref": "threads.coast_horse.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "coast_the_scouring"}}}],
    }],
    "gannet_head_seacaves": [{
        "id": "coast_watch_committed", "mode": "once", "on": "enter",
        "description": "In under the head, on the hour the tide allows.",
        "requires": {"custom": {"gte": [{"ref": "threads.coast_watch.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "coast_the_signal"}}}],
    }],
    "cobbleway_pound": [{
        "id": "coast_yard_committed", "mode": "once", "on": "enter",
        "description": "In the yard, on the wrong night, with the book.",
        "requires": {"custom": {"gte": [{"ref": "threads.coast_yard.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "coast_the_unclaimed"}}}],
    }],
}

BOSSES = {
    "chalk_flint_mines": "coast_horse_boss",
    "gannet_sea_caves": "coast_watch_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("coast_the_scouring", "The Scouring",
            "A chalk figure three parishes clear every spring without knowing "
            "why, that reads as lines from the cliff and has corners in it.",
            [reach("under_the_cross", "Get under where the lines cross.",
                   "chalk_downs_flint_mines", hidden=True),
             flagged("lift_the_turf", "Lift the turf the way it has been "
                     "lifted before.", "coast_horse_open", hidden=True),
             kill("what_cut_them", "Find what cut them square.",
                  "chalk_cutter", hidden=True)],
            xp=125, items=[("scourers_belt", 1)], thread_key="coast_horse"),

    _hidden("coast_the_signal", "The Tower That Still Signals",
            "No roof, no stair, and every skipper on this coast correcting two "
            "points to starboard off the head after dark.",
            [reach("in_under_the_head", "Get in under the head on the tide.",
                   "gannet_head_seacaves", hidden=True),
             flagged("below_the_course", "Open what the tower was worked from.",
                     "coast_watch_open", hidden=True),
             kill("what_lights_it", "Meet what has been keeping the "
                  "correction true.", "signal_keeper", hidden=True)],
            xp=140, items=[("signal_hood", 1)], thread_key="coast_watch"),

    _hidden("coast_the_unclaimed", "One a Year, Unclaimed",
            "Two hundred years of one entry each October — taken up, never "
            "collected — and the fee paid in coin by somebody.",
            [reach("into_the_yard", "Be in the yard on the night.",
                   "cobbleway_pound", hidden=True),
             flagged("open_the_face", "Open the wall that was here first.",
                     "coast_yard_open", hidden=True),
             kill("what_is_taken", "Meet what has been taken up every year.",
                  "the_unclaimed", hidden=True)],
            xp=130, items=[("unclaimed_ring", 1)], thread_key="coast_yard"),
]

ARCS = [
    arc("coast_hidden", "The Silver Coast, Surveyed",
        "Three pieces of work somebody did carefully along this coast and "
        "never filed with anybody.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("shepherd_ansel", "Ansel, on the Downs",
        "Runs four hundred sheep over the white rock and leads the spring "
        "clearing because his mother did and hers did.",
        faction=SALVORS, dialogue_id="coast_ansel_talk",
        home="chalk_downs_shepherds_hut", disposition=5, gullibility=0.4,
        memory_span=150, statblock="coast_shepherd"),

    npc("harbour_master_veir", "Veir, Harbour Master",
        "Berths every hull that comes into Sarnport and keeps the night book "
        "her predecessors kept, without ever having been told why.",
        faction=SALVORS, dialogue_id="coast_veir_talk",
        home="harbourside_harbour_master", disposition=2, gullibility=0.2,
        memory_span=260, statblock="coast_harbourmaster",
        shop=shop("salvors_stock", buys=("treasure",), multiplier=1.2)),

    npc("bailiff_hask", "Hask, Bailiff of Cobbleway",
        "Impounds strays, collects the fee, and writes one line every October "
        "that he did not put anything into.",
        faction="the_countinghouse", dialogue_id="coast_hask_talk",
        home="cobbleway_house_a", disposition=1, gullibility=0.15,
        memory_span=280, statblock="coast_bailiff"),

    npc("downs_farmer_tibb", "Tibb, at Downs Farm",
        "Farms the last field before the cliff and has looked up at that "
        "hillside every day of a long life.",
        faction=SALVORS, dialogue_id="coast_tibb_talk",
        home="thrift_house_a", disposition=7, gullibility=0.45,
        memory_span=170,
        shop=shop("keeper_stock", buys=("material",), multiplier=1.15)),

    npc("skipper_orsa", "Orsa, off the Haul",
        "Eleven boats work off that beach and hers is the one the other ten "
        "watch to see when it is worth going.",
        faction=SALVORS, dialogue_id="coast_orsa_talk",
        home="gullmere_the_bass", disposition=4, gullibility=0.35,
        memory_span=160),

    npc("chandler_rell", "Rell, Chandler",
        "Sells rope, tar, lamp oil and charts, and has opinions about which of "
        "the charts are worth the paper.",
        faction="the_countinghouse", dialogue_id="coast_rell_talk",
        home="harbourside_chandlery", disposition=6, gullibility=0.4,
        memory_span=180,
        shop=shop("countinghouse_stock", buys=("treasure",), multiplier=1.25)),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from dmkit.loot import group, encounters  # noqa: E402

_COAST = dict(creature_type="humanoid", faction="the_salvors")

MONSTERS = [
    creature("coast_shepherd", "Ansel, on the Downs", 4, 0,
             A(13, 13, 15, 10, 15, 12), ["strike"],
             "Walks the chalk from dark to dark and has never once been "
             "hurried.",
             descriptors=["a weathered"], loot="coast_tally_carried", hp=24,
             **_COAST),
    creature("coast_harbourmaster", "Veir, Harbour Master", 4, 0,
             A(12, 13, 13, 15, 14, 14), ["strike"],
             "Has talked forty tons of moving hull into the right berth "
             "without touching it.",
             descriptors=["a level"], loot="coast_book_carried", hp=21,
             **_COAST),
    creature("coast_bailiff", "Hask, Bailiff of Cobbleway", 4, 0,
             A(14, 12, 14, 13, 12, 13), ["strike", "shove"],
             "Takes hold of other people's livestock for a living, which "
             "selects for a grip.",
             descriptors=["a heavy-handed"], loot="coast_yard_carried", hp=25,
             creature_type="humanoid", faction="the_countinghouse"),

    creature("chalk_cutter", "What Cut Them Square", 5, 300,
             A(14, 16, 13, 13, 15, 9), ["cut_and_run", "rend", "digging_claw"],
             "Four feet of cut chalk square to a finger's width, on a hill "
             "with no cut chalk in it, kept clear by three parishes who think "
             "they are keeping a horse.",
             behaviour=[{"priority": 15, "use": "cut_and_run",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a chalk-pale", "a patient"],
             loot="coast_horse_hoard", immunities=["frightened"], hp=46),
    creature("signal_keeper", "What Keeps the Correction True", 5, 320,
             A(11, 15, 14, 15, 16, 14), ["wardlight", "grave_chill", "wither"],
             "Four sightings in living memory, always the same week, in a "
             "tower with no stair — and two points to starboard is still the "
             "right correction.",
             behaviour=[{"priority": 20, "use": "wardlight",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "grave_chill"},
                        {"priority": 0, "use": "wither"}],
             descriptors=["a steady", "a lit"], loot="coast_watch_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "blinded"], hp=44),
    creature("the_unclaimed", "The October Entry", 5, 340,
             A(16, 12, 16, 10, 13, 11), ["gore", "shove", "rend"],
             "Two hundred lines in a bailiff's book, all of them the same "
             "eleven words, and the fee paid in coin every year by somebody "
             "who has never once been seen at the yard.",
             behaviour=[{"priority": 15, "use": "gore",
                         "when": {"chance": 0.4}},
                        {"priority": 5, "use": "shove"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a hulking", "an unshorn"], loot="coast_yard_hoard",
             immunities=["frightened", "prone"], hp=50),
]

ENCOUNTER_TABLES = [
    encounters("coast_horse_boss", [group("b", [("chalk_cutter", "1d2", True)])],
               chance=1, empty=0),
    encounters("coast_watch_boss", [group("b", [("signal_keeper", "1", False)])],
               chance=1, empty=0),
    encounters("coast_yard_boss", [group("b", [("the_unclaimed", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "coast_horse_hoard", "name": "Under Where the Lines Cross",
     "rolls": "2", "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "2d6"}},
                 {"weight": 2, "value": {"item": "bandages", "quantity": "1d2"}},
                 {"weight": 1, "value": {"item": "corner_stone", "quantity": "1",
                                         "unique": True}}]},
    {"id": "coast_watch_hoard", "name": "Below the Second Course", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "3d6"}},
                 {"weight": 3, "value": {"item": "wreck_brass", "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "wreckers_lantern",
                                         "quantity": "1"}},
                 {"weight": 1, "value": {"item": "ward_salt", "quantity": "1"}}]},
    {"id": "coast_yard_hoard", "name": "Behind the Mortared Face", "rolls": "2",
     "emptyChance": 0.05, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "4d6"}},
                 {"weight": 2, "value": {"item": "hold_silver", "quantity": "1"}},
                 {"weight": 2, "value": {"item": "healing_draught",
                                         "quantity": "1"}},
                 {"weight": 1, "value": {"item": "barrow_torc", "quantity": "1"}}]},
]

_ansel = [
    rumour("coast_ansel_three", "Who clears the chalk?",
           "“Three parishes. Us, Thrift, and the Cobbleway lot who come out "
           "in carts and are no use.” He shears on. “Ask any of the three why "
           "and you will get the same answer, which is that the other two "
           "turn out and it would look bad not to. That is the whole of the "
           "reasoning and it has run four hundred years.”",
           "coast_horse_three", faction=SALVORS, base=10),
    rumour("coast_ansel_shape",
           "You have walked over it all your life. What shape is it?",
           "Ansel stops, which he does not do. “It has corners on it,” he "
           "says, carefully, like a man who has never said it aloud. “You "
           "cannot see them from the road and you cannot see them from the "
           "green. You can see them from on it, and once you have you cannot "
           "stop.” He goes back to the sheep. “Nothing that runs has corners.”",
           "coast_horse_shape", faction=SALVORS, base=13, skill="insight"),
]
_ansel.append(favour(
    "coast_ansel_tally",
    "The rod you keep the count on. Lend it to me.",
    "He fetches it out of the thatch, which is where it has always lived. "
    "“There are more notches on that than the parish has years of records,” he "
    "says. “I have never known what to do about that, so I have gone on "
    "cutting them.”",
    "scouring_tally", faction=SALVORS, base=12, cost=2,
    refused="“It goes back in the thatch,” he says, and it does, and that is "
            "the end of the conversation."))

_veir = [
    rumour("coast_veir_light", "The tower on the head. Has anything been in it?",
           "“Four times.” She does not look up from the berth list. “1187, "
           "1224, 1251, and eleven years ago, which I saw. Same week of the "
           "year every time.” Now she looks up. “There is no stair in that "
           "tower. There has never been a stair in that tower. I have had the "
           "masons out.”",
           "coast_watch_light", faction=SALVORS, base=14, skill="persuasion"),
    rumour("coast_veir_tide", "The way in under the head.",
           "“Bottom of a spring tide, and it shuts again inside the hour.” "
           "She taps a tide table she has clearly consulted for other reasons. "
           "“Which means anybody who has ever gone in has either come out very "
           "fast or has not come out. We have never recovered one.”",
           "coast_watch_tide", faction=SALVORS, base=15),
]
_veir.append(favour(
    "coast_veir_book",
    "The night book. I want to read it.",
    "She puts it on the counter and keeps a hand on it. “Fourteen hands going "
    "back to before the mole was built,” she says. “Every one of them writes "
    "the same correction and not one of them says what for. If you find out, "
    "come back. I will have kept the page.”",
    "harbour_night_book", faction=SALVORS, base=14, cost=2,
    refused="“It is the office's,” she says, “and I am the office,” and puts "
            "it back under the counter."))

_hask = [
    rumour("coast_hask_one", "The October entry.",
           "The bailiff does not pretend not to know what you mean, which is "
           "itself an answer. “One a year. Same night. Taken up, unclaimed, "
           "and the fee paid.” He closes the book. “My father wrote it. His "
           "father wrote it. I have written it nineteen times and I have never "
           "once been in that yard to see what I was writing about.”",
           "coast_yard_one", faction="the_countinghouse", base=13),
    rumour("coast_hask_horses", "Why will the coach horses not stand there?",
           "“Because they are not stupid.” He says it flatly. “One night of "
           "the year they will not go through the gate and they will not be "
           "made to. The stablers stopped trying before I was born and put the "
           "night in the coaching timetable instead, which tells you how long "
           "this has been the arrangement.”",
           "coast_yard_horses", faction="the_countinghouse", base=12,
           skill="insight"),
]
_hask.append(favour(
    "coast_hask_book",
    "Give me the book.",
    "He hands it across with both hands, which is not how a man hands over a "
    "ledger. “The October line is eleven words and it names where the beast "
    "was put,” he says. “I have read it nineteen times. I would rather "
    "somebody else went and looked.”",
    "yard_book", faction="the_countinghouse", base=14, cost=2,
    refused="“It is the town's book and I am the town's bailiff,” he says, "
            "which is a sentence he has clearly had ready for years."))

DIALOGUES = [
    talk("coast_ansel_talk", "greet",
         ["Four hundred sheep on short turf over white rock, and a man in the "
          "middle of them working a pair of shears without looking at them.",
          "“Mind the flock. Say what you want, I will hear you.”"],
         _ansel),

    talk("coast_veir_talk", "greet",
         ["A first-floor office over the mole with every window facing water, "
          "and a berth list going down a slate faster than it comes off.",
          "“If it is a berth you want, it is tomorrow. If it is anything "
          "else, be quick.”"],
         _veir,
         redirects=[coldshoulder("coast_veir", SALVORS, -30,
                                 "She turns the berth list over and goes on "
                                 "writing on the back of it.",
                                 back="greet")[0]],
         extra_nodes=[coldshoulder("coast_veir", SALVORS, -30,
                                   "She turns the berth list over and goes on "
                                   "writing on the back of it.",
                                   back="greet")[1]]),

    talk("coast_hask_talk", "greet",
         ["A front room with a table, a strongbox and a book, and a man who "
          "has been bailiff long enough that the room has stopped being a "
          "front room.",
          "“Strays, fees, and the pinfold. Which is it?”"],
         _hask),

    talk("coast_tibb_talk", "greet",
         ["The last field before four hundred feet of nothing, and an old "
          "farmer leaning on a gate looking inland rather than out.",
          "“I have looked at that hill for sixty years. Go on, then.”"],
         [rumour("coast_tibb_lines",
                 "You have looked at it for sixty years. What is it?",
                 "“It is not a horse.” Tibb says it without any weight at "
                 "all, the way you say a thing you settled long ago. “From up "
                 "the cliff path you can see two of the cuts go square to each "
                 "other, and they run on past where the beast would stop.” A "
                 "shrug. “I told the vicar once. He wrote it down and nothing "
                 "happened, which is what I expected.”",
                 "coast_horse_lines", faction=SALVORS, base=11,
                 skill="insight"),
          rumour("coast_tibb_ring",
                 "The birds on the head. Is there anywhere they don't nest?",
                 "“Round the tower's foot. Forty feet of bare rock, near "
                 "enough a circle.” Tibb spits over the gate. “There is guano "
                 "a foot deep on every other stone of that headland. Birds "
                 "are not sentimental. If they will not sit there, there is a "
                 "reason and it is not history.”",
                 "coast_watch_ring", faction=SALVORS, base=12),
          rumour("coast_tibb_paid",
                 "Somebody pays the October fee at Cobbleway.",
                 "“In coin, into the box, every year.” Tibb has clearly "
                 "thought about this. “Now a fee is paid by the owner. So "
                 "somebody owns it, and has for two hundred years, and has "
                 "never once come and collected the animal they are paying "
                 "for.”",
                 "coast_yard_paid", faction=SALVORS, base=14,
                 skill="insight")]),

    talk("coast_orsa_talk", "greet",
         ["Eleven boats up the shingle above the tide line, and a woman going "
          "over the seams of the nearest one on her knees.",
          "“If you are buying fish it is up the beach. If you are asking about "
          "the water, ask.”"],
         [rumour("coast_orsa_correct",
                 "Do you change course off the head at night?",
                 "“Two points to starboard.” Immediately, without thinking. "
                 "Then she hears herself. “Everybody does. My father did. I "
                 "have never asked him what for and he is dead now.” She sits "
                 "back on her heels. “There is nothing there to clear. I have "
                 "sounded it. There is nothing there.”",
                 "coast_watch_correct", faction=SALVORS, base=11),
          rumour("coast_orsa_pond",
                 "The standing water on top of the downs.",
                 "“Never dry.” She is definite. “Two summers ago the wells "
                 "went at Thrift and the beasts were being walked four miles "
                 "and that water was where it always is.” A grin with no "
                 "humour in it. “On chalk. On the *top* of chalk. Somebody "
                 "made that, and it was not this century.”",
                 "coast_horse_pond", faction=SALVORS, base=13,
                 skill="insight")]),

    talk("coast_rell_talk", "greet",
         ["Rope by the fathom, tar by the barrel, lamp oil, and a wall of "
          "charts with three of them turned face-in.",
          "“Rope, tar, oil, glass. Charts if you promise not to sue me.”"],
         [rumour("coast_rell_tide",
                 "What is under the head?",
                 "“A way in, at the bottom of a spring tide.” He does not "
                 "have to look it up. “Open about an hour. I have sold gear "
                 "to four parties who meant to go in and I have had two of "
                 "them back.” He straightens a coil. “I do not sell them the "
                 "rope any more. They buy it at Gullmere and think I do not "
                 "know.”",
                 "coast_watch_tide", faction="the_countinghouse", base=12),
          rumour("coast_rell_wall",
                 "The pinfold wall at Cobbleway.",
                 "“Three sides are the town's and the fourth is not.” He is "
                 "pleased to be asked. “I carted the lime up there when they "
                 "repointed the good sides. Could not match the old face. "
                 "Nobody can match the old face — it was mixed with something "
                 "that is not in it any more, and it has not weathered in "
                 "eight hundred years.”",
                 "coast_yard_wall", faction="the_countinghouse", base=13,
                 skill="craft")]),
]
