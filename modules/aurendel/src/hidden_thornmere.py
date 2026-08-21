"""Thornmere's hidden threads — three, in the five areas nothing else uses."""
from dmkit.quests import npc, shop, quest, reach, kill, flagged, arc
from lore import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "thornmere"
FERRY = "the_ferrymen"

KNEES = [
    clue("thorn_knees_rows",
         "Cypress knees come up where the roots run, which is to say anywhere. "
         "In the deep maze they are in rows, and the rows are straight.",
         "a reed-cutter"),
    clue("thorn_knees_point",
         "The rows converge. Follow two of them far enough and they meet, and "
         "they meet over the water rather than at a tree.",
         "the hunter's stand"),
    clue("thorn_knees_cut",
         "Half of them are cut off level at the top, and the cuts have healed "
         "over, which takes forty years. Nobody has worked that maze in a "
         "hundred.",
         "the thatcher"),
    clue("thorn_knees_quiet",
         "There are no leeches in the deep maze. There are leeches in every "
         "other inch of this marsh.",
         "the leech camp"),
]

TOLL = [
    clue("thorn_toll_abandoned",
         "The toll house on the causeway has taken nothing in two hundred "
         "years. The Crown stopped manning it when the causeway sank.",
         "the Marker House"),
    clue("thorn_toll_balance",
         "Somebody still sends a ledger in every year, and every year it "
         "balances, and the takings on it are a shilling a head.",
         "the ferrymen's book"),
    clue("thorn_toll_hand",
         "It has been the same hand for two hundred years. Not a copied hand — "
         "the same one, with the same slant and the same broken g.",
         "a ferryman"),
    clue("thorn_toll_paid",
         "Nobody has ever seen it collected and nobody who walks the causeway "
         "is short a shilling afterwards. Something is paying.",
         "the old toll house"),
]

HERMIT = [
    clue("thorn_hermit_none",
         "There is a hut on the far hummock with a fire pit that has been used "
         "and nobody in this marsh can name who lives in it.",
         "the Bundle's landlady"),
    clue("thorn_hermit_tally",
         "Ninety years of tally marks up the door post, five and five and "
         "five, and the newest of them are not weathered.",
         "a wader"),
    clue("thorn_hermit_facing",
         "The hut faces away from the water and away from the road, which "
         "leaves one island, and that is a thing to build a hut looking at.",
         "the hunter's stand"),
    clue("thorn_hermit_warm",
         "The channels near it run warm, and warm water in this marsh means "
         "the water is coming up rather than down.",
         "the leech camp"),
]

LORE = KNEES + TOLL + HERMIT

THREADS = [
    thread("thorn_knees", "The Knees",
           "Cypress knees standing in straight rows that converge over open "
           "water, half of them cut level and healed.", KNEES),
    thread("thorn_toll", "The Toll That Is Still Collected",
           "Two hundred years of a balanced ledger in one unbroken hand, for a "
           "toll nobody has ever seen taken.", TOLL),
    thread("thorn_hermit", "What the Hermit Was Watching",
           "Ninety years of tally marks on a door post, a fire pit still in "
           "use, and a hut built facing the wrong way on purpose.", HERMIT),
]

ITEMS = [
    keepsake("cutters_bill", "The Reed-Cutter's Bill",
             "A hooked blade on a long haft, the only tool in the marsh that "
             "will take a cypress knee off level. Its edge is older than its "
             "handle by a century.",
             holder="reed_cutter_maud"),
    keepsake("toll_ledger", "The Toll Ledger",
             "Two hundred years of a shilling a head, balanced every year, in "
             "one hand with a broken g.",
             holder="ferryman_sarl"),
    keepsake("hermits_tally", "The Hermit's Tally",
             "The door post itself, cut out and carried off: ninety years of "
             "fives, and the last ones not weathered.",
             holder="wader_pell"),

    trophy("knee_heart", "The Heart of a Knee",
           "Cut level and healed over forty years ago by something with a very "
           "good edge and no hands anybody would recognise.",
           "thorn_knees_cut"),

    relic("marshlight_belt", "The Marshlight Belt", "belt",
          "Woven reed with something bright worked through it. In the maze it "
          "shows which rows are rows.",
          value=850, rarity="rare", skills={"survival": 3, "perception": 2}),
    relic("shilling_ring", "The Shilling Ring", "ring",
          "Two hundred years of tolls, one shilling at a time, fused into a "
          "band. Worn, people ask you for less.",
          value=900, rarity="rare", skills={"persuasion": 3, "insight": 2}),
    relic("hermits_watch_cloak", "The Hermit's Watching Cloak", "cloak",
          "Oiled reed and something under it. Ninety years of sitting still "
          "facing the wrong way, and it has kept out every one of them.",
          value=1150, rarity="very_rare", guard=2,
          resist=(("poison", 0.5), ("cold", 0.75)), skills={"stealth": 3}),
]

LOOT_TABLES = [
    carried("thorn_bill_carried", "What Maud Kept", "cutters_bill"),
    carried("thorn_ledger_carried", "What Sarl Kept", "toll_ledger"),
    carried("thorn_tally_carried", "What Pell Kept", "hermits_tally"),
]

GATES = [
    sealed("thorn_mound_rows", "Where the Rows Meet",
           "Two lines of cut knees converging over open water, and something "
           "under the water where they meet.",
           blocked("thorn_mound_blocked",
                   "The rows meet over deep water and there is nothing to "
                   "stand on. Whatever cut these off level did it with an "
                   "edge, and the only edge in the marsh that will do it is "
                   "in Reedy Bottom.",
                   "Straight rows in a marsh, converging on a spot with "
                   "nothing at it. You would want the bill to open a way, and "
                   "you would want to have thought about what else uses it.",
                   "No leeches here. Nowhere else in Thornmere is there "
                   "nowhere without leeches."),
           items=["cutters_bill"], opens_flag="thorn_knees_open"),

    sealed("thorn_toll_strongroom", "Behind the Counting Room",
           "A toll house with nothing in it but a door that has been oiled "
           "more recently than the Crown has manned the place.",
           blocked("thorn_toll_blocked",
                   "Two hundred years of a balanced ledger is two hundred "
                   "years of something being counted and put somewhere. The "
                   "ledger says where. You do not have the ledger.",
                   "The lock is sound and the hinges are oiled and the Crown "
                   "has not paid anybody to do either since the causeway "
                   "sank.",
                   "Shilling a head, every year, balanced. Somebody has been "
                   "keeping very careful books about a road nobody pays on."),
           items=["toll_ledger"], opens_flag="thorn_toll_open"),

    sealed("thorn_hummock_watch", "What the Hut Faces",
           "Ninety years of somebody sitting in a doorway looking at this, and "
           "cutting a mark for each year they went on looking.",
           blocked("thorn_hummock_blocked",
                   "The hut faces this and nothing else, and the marks go up "
                   "the post in fives for ninety years. Reading what the "
                   "hermit was counting would want the post, and the post is "
                   "not on the hut any more.",
                   "It faces away from the water and away from the road, "
                   "which leaves exactly one thing it faces.",
                   "The channels here run warm, which in this marsh means the "
                   "water is coming up. Something below is warmer than the "
                   "marsh, and has been for ninety years at least."),
           items=["hermits_tally"], opens_flag="thorn_hermit_open"),
]

POI_PATCHES = {
    "cypress_maze_the_mound": {**rumoured("thorn_knees", base=21, step=3, entries=4,
                                          skill="survival"),
                               "gate": "thorn_mound_rows"},
    # A point of interest, so the table and `encounterChance` both hang on the place.
    "sunken_causeway_toll_ruin": {**rumoured("thorn_toll", base=19, step=3, entries=4),
                                  "gate": "thorn_toll_strongroom",
                                  "encounterTables": ["thorn_toll_boss"],
                                  "encounterChance": 1},
    "hummocks_the_deep_hummock": {**rumoured("thorn_hermit", base=22, step=3, entries=4,
                                             skill="survival"),
                                  "gate": "thorn_hummock_watch"},
}

POI_TRIGGERS = {
    "cypress_maze_the_knees": [finding("thorn_found_knees",
                                       "Knees in rows, and the rows straight.",
                                       "thorn_knees_rows")],
    "cypress_maze_hunters_stand": [finding("thorn_found_stand",
                                           "What you can see from up here that "
                                           "you cannot see from the water.",
                                           "thorn_knees_point")],
    "hummocks_hermit_hummock": [finding("thorn_found_hut",
                                        "Which way the hut is built to look.",
                                        "thorn_hermit_facing")],
    "leech_channels_the_warm": [finding("thorn_found_warm",
                                        "Warm water, in a marsh, coming up.",
                                        "thorn_hermit_warm")],

    "cypress_maze_the_mound": [{
        "id": "thorn_knees_committed", "mode": "once", "on": "enter",
        "description": "Standing where the rows meet.",
        "requires": {"custom": {"gte": [{"ref": "threads.thorn_knees.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "thorn_the_knees"}}}],
    }],
    # One key, one list.
    "sunken_causeway_toll_ruin": [
        finding("thorn_found_toll",
                "A counting room, and the hinges oiled.", "thorn_toll_paid"),
        {
            "id": "thorn_toll_committed", "mode": "once", "on": "enter",
            "description": "Inside the counting room, with the ledger in hand.",
            "requires": {"custom": {"gte": [{"ref": "threads.thorn_toll.known"}, 2]}},
            "effects": [{"emit": {"event": "startQuest",
                                  "data": {"quest": "thorn_the_toll"}}}],
        },
    ],
    "hummocks_the_deep_hummock": [{
        "id": "thorn_hermit_committed", "mode": "once", "on": "enter",
        "description": "On the thing the hut has been looking at.",
        "requires": {"custom": {"gte": [{"ref": "threads.thorn_hermit.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "thorn_what_it_watched"}}}],
    }],
}

BOSSES = {
    "thornmere_cypress_mound": "thorn_knees_boss",
    "thornmere_deep_hummock": "thorn_hummock_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("thorn_the_knees", "The Knees",
            "Straight rows of cypress knees converging over open water, half "
            "of them cut level and healed over forty years ago.",
            [reach("where_they_meet", "Get to where the rows meet.",
                   "cypress_maze_the_mound", hidden=True),
             flagged("cut_a_way", "Open a way with the one edge that will.",
                     "thorn_knees_open", hidden=True),
             kill("what_cuts", "Find what has been cutting them level.",
                  "knee_cutter", hidden=True)],
            xp=190, items=[("marshlight_belt", 1)], thread_key="thorn_knees"),

    _hidden("thorn_the_toll", "The Toll That Is Still Collected",
            "Two hundred years of a balanced ledger in one unbroken hand, for "
            "a shilling a head nobody has ever seen taken.",
            [reach("in_the_counting_room", "Get into the counting room.",
                   "sunken_causeway_toll_ruin", hidden=True),
             flagged("open_the_strongroom", "Open what the ledger says is "
                     "there.", "thorn_toll_open", hidden=True),
             kill("the_collector", "Meet the collector.", "toll_collector",
                  hidden=True)],
            xp=185, items=[("shilling_ring", 1)], thread_key="thorn_toll"),

    _hidden("thorn_what_it_watched", "What the Hermit Was Watching",
            "Ninety years of tally marks up a door post, a fire pit still in "
            "use, and a hut built facing away from everything except one "
            "island.",
            [reach("on_the_hummock", "Get onto the deep hummock.",
                   "hummocks_the_deep_hummock", hidden=True),
             flagged("read_the_post", "Read what the marks were counting.",
                     "thorn_hermit_open", hidden=True),
             kill("what_was_watched", "Meet what ninety years of watching was "
                  "for.", "hummock_thing", hidden=True)],
            xp=215, items=[("hermits_watch_cloak", 1)],
            thread_key="thorn_hermit"),
]

ARCS = [
    arc("thorn_hidden", "Thornmere, in Account",
        "Three sets of books the marsh has been keeping, none of them for "
        "anybody who asked.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("reed_cutter_maud", "Maud, Reed-Cutter",
        "Cuts and bundles for the thatchers, and owns the only bill in "
        "Thornmere whose edge is a hundred years older than its handle.",
        faction=FERRY, dialogue_id="thorn_maud_talk",
        home="reedy_bottom_cuttings", disposition=6, gullibility=0.4,
        memory_span=150, statblock="thorn_cutter"),

    npc("ferryman_sarl", "Sarl of the Causeway",
        "Poles the crossing when the causeway is under, and keeps the "
        "ferrymen's book, which is where the toll ledger goes.",
        faction=FERRY, dialogue_id="thorn_sarl_talk",
        home="sunken_causeway_marker_house", disposition=2, gullibility=0.25,
        memory_span=250, statblock="thorn_ferryman",
        shop=shop("keeper_stock", buys=("treasure",), multiplier=1.25)),

    npc("wader_pell", "Pell, who Wades",
        "Goes where the punts cannot and came back once with a door post "
        "nobody had asked for.",
        faction=FERRY, dialogue_id="thorn_pell_talk",
        home="hummocks_the_islands", disposition=4, gullibility=0.45,
        memory_span=120, statblock="thorn_wader"),

    npc("bundle_landlady_orin", "Orin, at the Bundle",
        "Knows every cutter, thatcher and leech-man in the Bottom by name, "
        "which is why the one she cannot name bothers her.",
        faction=FERRY, dialogue_id="thorn_orin_talk",
        home="reedy_bottom_the_bundle", disposition=8, gullibility=0.5,
        memory_span=180,
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.3)),

    npc("thatcher_bel", "Bel the Thatcher",
        "Roofs half of Thornmere and has an opinion about every cut surface "
        "in the marsh, professionally.",
        faction=FERRY, dialogue_id="thorn_bel_talk",
        home="reedy_bottom_thatcher", disposition=6, gullibility=0.4,
        memory_span=150,
        shop=shop("keeper_stock", buys=("material",), multiplier=1.15)),

    npc("leech_man_gost", "Gost of the Leech Camp",
        "Farms leeches for the temples and knows to the yard where they will "
        "not live.",
        faction=FERRY, dialogue_id="thorn_gost_talk",
        home="leech_channels_leech_camp", disposition=2, gullibility=0.35,
        memory_span=150),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from dmkit.loot import group, encounters  # noqa: E402

_FEN = dict(creature_type="humanoid", faction="the_ferrymen")

MONSTERS = [
    creature("thorn_cutter", "Maud, Reed-Cutter", 5, 0,
             A(14, 14, 14, 10, 13, 11), ["strike", "cut_and_run"],
             "Swings a hooked bill all day in water to the thigh.",
             descriptors=["a sinewy"], loot="thorn_bill_carried", hp=31, **_FEN),
    creature("thorn_ferryman", "Sarl of the Causeway", 5, 0,
             A(15, 13, 15, 12, 13, 12), ["strike"],
             "Poles a loaded punt against a tide twice a day.",
             descriptors=["a weather-brown"], loot="thorn_ledger_carried",
             hp=34, **_FEN),
    creature("thorn_wader", "Pell, who Wades", 5, 0,
             A(13, 16, 14, 10, 15, 10), ["strike", "quick_shot"],
             "Goes where punts cannot, which selects for a certain nerve.",
             descriptors=["a mud-caked"], loot="thorn_tally_carried", hp=29,
             **_FEN),

    creature("knee_cutter", "What Cuts Them Level", 7, 720,
             A(15, 18, 14, 12, 16, 10), ["cut_and_run", "rend", "latch"],
             "Forty years for a cypress knee to heal over a level cut. There "
             "are a hundred of them and they are in rows.",
             behaviour=[{"priority": 15, "use": "cut_and_run",
                         "when": {"chance": 0.45}},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a long-limbed", "a silent"],
             loot="thorn_knees_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened"], hp=80),
    creature("toll_collector", "The Collector", 7, 750,
             A(13, 14, 15, 16, 16, 17), ["wither", "grave_chill", "toll"],
             "Two hundred years of a balanced ledger. Somebody has been very "
             "conscientious about a road the Crown abandoned.",
             behaviour=[{"priority": 20, "use": "toll",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "wither"},
                        {"priority": 0, "use": "grave_chill"}],
             descriptors=["a neat", "a patient"], loot="thorn_toll_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned"], hp=78),
    creature("hummock_thing", "What Was Watched", 8, 900,
             A(18, 12, 19, 13, 16, 14), ["drag_under", "bleed_white", "rend"],
             "Ninety years of somebody sitting in a doorway cutting a mark for "
             "each year they went on looking at it.",
             behaviour=[{"priority": 20, "use": "drag_under",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "bleed_white"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a swollen", "a slow"], loot="thorn_hummock_hoard",
             immunities=["prone", "frightened", "poisoned"], hp=105),
]

ENCOUNTER_TABLES = [
    encounters("thorn_knees_boss", [group("b", [("knee_cutter", "1d2", True)])],
               chance=1, empty=0),
    encounters("thorn_hummock_boss", [group("b", [("hummock_thing", "1", False)])],
               chance=1, empty=0),
    encounters("thorn_toll_boss", [group("b", [("toll_collector", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "thorn_knees_hoard", "name": "Where the Rows Meet", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "2d6"}},
                 {"weight": 2, "value": {"item": "amber_lump", "quantity": "1"}},
                 {"weight": 1, "value": {"item": "knee_heart", "quantity": "1",
                                         "unique": True}}]},
    {"id": "thorn_toll_hoard", "name": "Two Hundred Years of Shillings",
     "rolls": "3", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 5, "value": {"item": "old_coin", "quantity": "6d6"}},
                 {"weight": 2, "value": {"item": "barrow_torc", "quantity": "1"}},
                 {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}}]},
    {"id": "thorn_hummock_hoard", "name": "Under the Deep Hummock",
     "rolls": "2", "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 3, "value": {"item": "old_coin", "quantity": "3d6"}},
                 {"weight": 2, "value": {"item": "antidote", "quantity": "1d2"}},
                 {"weight": 2, "value": {"item": "warded_coat", "quantity": "1"}}]},
]

_maud = [
    rumour("thorn_maud_rows", "The knees in the deep maze are in rows.",
           "“They are.” She keeps bundling. “Knees come up where the roots "
           "run, and roots do not run straight. I have cut reed in this marsh "
           "for thirty years and I have never worked that stretch, and neither "
           "did my mother, and she gave a reason once and would not give it "
           "twice.”",
           "thorn_knees_rows", faction=FERRY, base=11),
    rumour("thorn_maud_cut", "Something has been cutting them level.",
           "She stops. “You have seen the healed ones.” She holds up the bill. "
           "“This is the only edge in Thornmere that takes a knee off level, "
           "and this edge is a hundred years older than the handle, and I did "
           "not make either.” A shrug that is not casual. “The cuts out there "
           "are forty years healed. I was six.”",
           "thorn_knees_cut", faction=FERRY, base=14, skill="insight"),
]
_maud.append(favour(
    "thorn_maud_bill",
    "Lend me the bill.",
    "She hands it over haft first, which is how you hand somebody a bill if "
    "you have any sense. “It came with the cottage. Mind the hook, it comes "
    "back at you.”",
    "cutters_bill", faction=FERRY, base=13, cost=2,
    refused="“It is how I eat,” she says. “Buy a new one at Bel's and see how "
            "it does on a knee.”"))

DIALOGUES = [
    talk("thorn_maud_talk", "greet",
         ["Water to the thigh, a hooked bill going through reed like it is "
          "not there, and a stack of bundles behind her taller than she is.",
          "“Bundles are sold. Talk if you want, I am not stopping.”"],
         _maud),

    talk("thorn_bel_talk", "greet",
         ["A yard of reed in every stage between cut and roofed, and a man "
          "sorting it by feel.",
          "“Roofing, thatching, or reed. If it is reed, Maud's your woman.”"],
         [rumour("thorn_bel_cut",
                 "You judge cut surfaces for a living. What cuts a cypress "
                 "knee off level?",
                 "“Nothing I sell.” He is definite. “Bill will do it if it is "
                 "Maud's bill and Maud is swinging it. Anything else crushes "
                 "before it cuts.” He turns a reed over. “There are a hundred "
                 "of them out there cut clean and healed. Somebody had a very "
                 "good edge and forty years ago.”",
                 "thorn_knees_cut", faction=FERRY, base=12, skill="insight"),
          rumour("thorn_bel_hand",
                 "Have you ever seen the toll ledger?",
                 "“Sarl has it. I have signed the book next to it for twenty "
                 "years.” He straightens up. “Same hand the whole way back. "
                 "Not a copied hand — I copy hands, it is half of thatching a "
                 "name into a ridge. That is one hand with a broken g and it "
                 "goes back two hundred years.”",
                 "thorn_toll_hand", faction=FERRY, base=13, skill="insight")]),

    talk("thorn_gost_talk", "greet",
         ["Trays of dark water under reed shade, and a man moving them out of "
          "the sun with a hooked pole.",
          "“Leeches. Temples buy them. If you are squeamish, stand upwind.”"],
         [rumour("thorn_gost_quiet",
                 "Where in this marsh will leeches not live?",
                 "“One place.” He does not have to think. “The deep maze. Not "
                 "one, anywhere in it, and I have tried to seed it twice "
                 "because it would be a fine quiet water for it.” He moves "
                 "another tray. “They will not stop in it. That is not a thing "
                 "leeches do.”",
                 "thorn_knees_quiet", faction=FERRY, base=12),
          rumour("thorn_gost_warm",
                 "The channels out by the hummocks run warm.",
                 "“They do, and warm water in a marsh is water coming *up*.” "
                 "He looks out that way. “Down here everything drains. "
                 "Something out there is pushing, and it has been pushing "
                 "since before I had this camp.”",
                 "thorn_hermit_warm", faction=FERRY, base=13)]),
]

_sarl = [
    rumour("thorn_sarl_balance", "The toll ledger. Does it still come in?",
           "“Every year.” He says it like a man who has decided not to think "
           "about it. “Shilling a head, balanced to the penny, and the Crown "
           "stopped manning that house when the causeway sank. I file it. My "
           "father filed it. I have never asked who sends it.”",
           "thorn_toll_balance", faction=FERRY, base=14, skill="persuasion"),
    rumour("thorn_sarl_paid", "Has anybody ever seen it collected?",
           "“No.” Flat. “And nobody who walks that causeway is a shilling "
           "short afterwards, which I have checked, because I am not stupid.” "
           "He coils a rope he has already coiled. “So something is paying. "
           "That is the sentence I have been avoiding for thirty years.”",
           "thorn_toll_paid", faction=FERRY, base=16),
]
_sarl.append(favour(
    "thorn_sarl_ledger",
    "Give me the ledger.",
    "He gets it out of the box under the seat and holds it a moment. “Two "
    "hundred years,” he says. “If you find out who has been writing it, I "
    "would like it back with the answer in the margin.”",
    "toll_ledger", faction=FERRY, base=15, cost=2,
    refused="“It is the ferrymen's,” he says, and puts it back in the box, and "
            "sits on the box."))

DIALOGUES.append(
    talk("thorn_sarl_talk", "greet",
         ["A marker house at the end of a road that is under water half the "
          "year, and a man on a punt who has been watching you approach for a "
          "while.",
          "“Crossing's a penny when the causeway's under. It is under.”"],
         _sarl,
         redirects=[coldshoulder("thorn_sarl", FERRY, -30,
                                 "He poles off from the stage without a word "
                                 "and stops just out of reach.",
                                 back="greet")[0]],
         extra_nodes=[coldshoulder("thorn_sarl", FERRY, -30,
                                   "He poles off from the stage without a word "
                                   "and stops just out of reach.",
                                   back="greet")[1]]))

_pell = [
    rumour("thorn_pell_tally", "The hut on the far hummock.",
           "“Door post is cut all up it. Fives.” Pell holds up both hands and "
           "then, because that is not enough, does it again. “Ninety years of "
           "them, near enough. And the top ones are not weathered, and the "
           "post has been standing in this marsh, so the top ones are new.”",
           "thorn_hermit_tally", faction=FERRY, base=12),
    rumour("thorn_pell_facing", "Which way does it face?",
           "“Away from the water and away from the road.” A pause. “Which "
           "leaves one island out there, and you do not build a hut facing an "
           "island unless the island is the point of the hut.”",
           "thorn_hermit_facing", faction=FERRY, base=13, skill="insight"),
]
_pell.append(favour(
    "thorn_pell_post",
    "You took the post. I want it.",
    "Pell fetches it out from under the bed, which answers the question of "
    "whether taking it was a good idea. “Count them,” Pell says. “I have "
    "counted them and I would rather two of us were wrong.”",
    "hermits_tally", faction=FERRY, base=12, cost=1,
    refused="“It is not mine to give twice,” Pell says, which is not an answer "
            "and is clearly all you are getting."))

DIALOGUES.append(
    talk("thorn_pell_talk", "greet",
         ["Mud to the chest and cheerful about it, on a hummock barely big "
          "enough for the both of you.",
          "“Do not follow me,” Pell says. “Not being rude. You will go in.”"],
         _pell))

DIALOGUES.append(
    talk("thorn_orin_talk", "greet",
         ["A low taproom smelling of wet reed, and a landlady who has already "
          "worked out you are not from here.",
          "“Bed's a shilling, ale's a penny, and if you are after the "
          "leech-men they drink at the camp.”"],
         [rumour("thorn_orin_none",
                 "Is there anybody living out on the hummocks?",
                 "“There is a hut,” she says, and stops, and starts again. “I "
                 "know every cutter, thatcher and leech-man between here and "
                 "Stiltmarket by name. I have known them since they were "
                 "children.” She puts the cloth down. “There is a fire pit out "
                 "there that has been used, and I cannot name who uses it, and "
                 "that has never once been true of anybody else.”",
                 "thorn_hermit_none", faction=FERRY, base=11),
          rumour("thorn_orin_abandoned",
                 "The toll house on the causeway.",
                 "“Shut two hundred years. The Crown gave it up when the road "
                 "sank — you cannot toll a road that is under water half the "
                 "time.” She refills something. “Ask Sarl about the ledger, "
                 "though. Ask him twice.”",
                 "thorn_toll_abandoned", faction=FERRY, base=10)]))
