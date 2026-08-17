"""The Deeproads' hidden threads — three, at the top of the ladder.

The spine ends down here and uses five of the ten areas. The other five — the
Deep Market Road, the Sunless River, the Black Bridge, the Broken Stair and the
Weeping Vault — carry four dungeons, a toll post, a set of lamps that are still
lit, a chasm and a shaft, and nothing has ever mentioned any of it.

Three threads, and they are all the same suspicion the Wayfinders have never
written down: **the Deeproads were not dug. They were finished.**

  * **The Lamps That Are Still Lit** — nobody has oiled the market road in four
    hundred years and the lamps are lit.
  * **What the Bridge Was Built Over** — the Black Bridge has footings on both
    sides and the chasm has no bottom, so the footings stand on something.
  * **The Weeping Vault** — the columns weep, the water is warm, and the shaft
    above them goes up into rock with no surface at the end of it.

The Broken Stair is the over-tuned one. Level 10 ground at the bottom of level
10 ground, which in the Deeproads means it is worse than the finale, and the
seal says so.
"""
from questkit import npc, shop, quest, reach, kill, flagged, arc
from lorekit import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "deeproads"
WAY = "the_wayfinders"

LAMPS = [
    clue("deep_lamps_lit",
         "Nobody has oiled the market road in four hundred years. The lamps "
         "along it are lit.",
         "a waystation keeper"),
    clue("deep_lamps_spacing",
         "They are set at a spacing no lamp needs. Twice as far apart as you "
         "would light a road, and exactly as far apart as each other.",
         "the Wayfinders' rule"),
    clue("deep_lamps_out",
         "Three of them are out, and the three that are out are the three "
         "nearest the toll post.",
         "the old toll"),
    clue("deep_lamps_reading",
         "They do not light the road evenly. Stand in the dark between two and "
         "the floor has marks on it that you cannot see under a lamp.",
         "a wayfinder"),
]

BRIDGE = [
    clue("deep_bridge_bottom",
         "The chasm has no bottom that anybody has found, and the Wayfinders "
         "have dropped lights down it for four hundred years.",
         "a bridge-walker"),
    clue("deep_bridge_footings",
         "A bridge over a bottomless chasm has abutments, which lean on the "
         "cliff. The Black Bridge does not have abutments. It has piers, and "
         "a pier stands on something.",
         "the Wayfinders' rule"),
    clue("deep_bridge_older",
         "The span is dwarf work and what it rests on is not. The lower "
         "stonework is older, and the span was laid onto it.",
         "the deep market"),
    clue("deep_bridge_hum",
         "The bridge hums in a wind there is no wind for. It has done since "
         "before Karn Dolur, and the dwarves will not discuss it.",
         "cut on the span's kerb"),
]

VAULT = [
    clue("deep_vault_warm",
         "The vault weeps, and what runs off its stonework is warm. Nothing "
         "else this deep is warm.",
         "a picker"),
    clue("deep_vault_shaft",
         "There is a shaft up out of the vault, and it goes up further than "
         "there is rock above it before you reach the sky.",
         "the Wayfinders' survey"),
    clue("deep_vault_count",
         "Nine pillars in the vault. Every hall in the Deeproads is built in "
         "eights, and the wayfinders' survey has that hall in eights too.",
         "a wayfinder"),
    clue("deep_vault_taste",
         "The water weeping out of the vault's stonework is salt, and there is "
         "no sea within four hundred miles of straight down.",
         "the fungus market"),
]

LORE = LAMPS + BRIDGE + VAULT

THREADS = [
    thread("deep_lamps", "The Lamps That Are Still Lit",
           "Four hundred years unoiled, burning, at a spacing no road needs, "
           "and three of them out at the toll post.", LAMPS),
    thread("deep_bridge", "What the Bridge Was Built Over",
           "Footings, not abutments, on a chasm with no bottom, older than the "
           "span laid onto them.", BRIDGE),
    thread("deep_vault", "The Weeping Vault",
           "Nine columns in a world built in eights, weeping salt water that "
           "is warm, under a shaft with too much rock above it.", VAULT),
]

ITEMS = [
    keepsake("wayfinders_rule", "The Wayfinders' Rule",
             "Four hundred years of the Deeproads measured and set down, "
             "including the two pages the guild reads aloud to nobody.",
             holder="wayfinder_ost"),
    keepsake("toll_tally", "The Old Toll's Tally",
             "What was taken on the market road, by whom, and in what — and "
             "the three years the column is in a different ink.",
             holder="toll_keeper_bruk"),
    keepsake("survey_plate", "The Survey Plate",
             "Brass, scribed with the vault's section. The shaft on it runs "
             "off the top of the plate and somebody has written a number "
             "beside it and then scratched it out.",
             holder="surveyor_ilde"),

    trophy("lamp_glass", "Glass out of a Lamp",
           "It has been burning without oil for four hundred years and it is "
           "cold to the touch.", "deep_lamps_lit"),

    relic("lampwrights_lens", "The Lampwright's Lens", "head",
          "Ground from the glass of a lamp that needs no oil. Worn, the marks "
          "between the lamps are legible, and so is a great deal else.",
          value=1500, rarity="very_rare",
          skills={"perception": 4, "lore": 3}),
    relic("footing_maul", "The Footing Maul", "hand",
          "Off the older stonework under the span. It is heavier than it is "
          "and it rings on nothing.",
          value=1600, rarity="very_rare",
          damage=("2d6", "bludgeoning", "might"), properties=["heavy"]),
    relic("ninth_column_coat", "The Ninth Column's Coat", "cloak",
          "Salt-stiffened, off a body at the foot of the column that should "
          "not be there. It is still warm.",
          value=1700, rarity="artifact", guard=3,
          resist=(("necrotic", 0.5), ("cold", 0.5)),
          skills={"resolve": 3, "arcana": 2}),
]

LOOT_TABLES = [
    carried("deep_rule_carried", "What Ost Kept", "wayfinders_rule"),
    carried("deep_tally_carried", "What Bruk Kept", "toll_tally"),
    carried("deep_plate_carried", "What Ilde Kept", "survey_plate"),
]

GATES = [
    sealed("deep_stair_under", "Beneath the Treads",
           "The stair is broken at the ninth landing and the break is not "
           "damage. Something was taken out of it.",
           blocked("deep_stair_blocked",
                   "The break in the stair is a *removal*: a course of treads "
                   "lifted out clean, from below. Reading what is cut on the "
                   "risers wants the guild's rule — and going down after it "
                   "wants whatever the ninth column had on when it stopped.",
                   "Nine landings and the ninth is gone, and the ones above "
                   "and below it are sound. Nobody breaks a stair in the "
                   "middle.",
                   "Cold comes up through the gap that is colder than the "
                   "Deeproads, and the Deeproads are the coldest inhabited "
                   "place on the continent."),
           items=["wayfinders_rule", "ninth_column_coat"],
           opens_flag="deep_stair_open"),

    sealed("deep_footing_way", "Into the Footings",
           "There is a way into the footings and it was made from inside "
           "them.",
           blocked("deep_footing_blocked",
                   "The footings are hollow and the way in is barred, and the "
                   "bar is on the far side. The toll post kept a tally of "
                   "everything that crossed this bridge, and three of its "
                   "years are in a different ink.",
                   "A bridge over nothing, standing on footings, and the "
                   "footings ring hollow the whole way round.",
                   "The hum comes up through the stone here rather than down "
                   "off the span. It has been coming up the whole time."),
           items=["toll_tally"], opens_flag="deep_bridge_open"),

    sealed("deep_vault_ninth", "The Ninth Column",
           "Eight columns hold the roof. The ninth holds nothing and it is the "
           "only one that weeps.",
           blocked("deep_vault_blocked",
                   "Eight columns, evenly set, holding a roof. And a ninth, "
                   "off the pattern, holding nothing, weeping warm salt water "
                   "in a place four hundred miles from any sea. The guild's "
                   "own section of this hall is on a brass plate and it has "
                   "eight.",
                   "It is warm. Everything else down here takes the warmth out "
                   "of you and this gives it back, which is worse.",
                   "The shaft above goes up further than there is rock to go "
                   "up through. Somebody worked that out once and scratched "
                   "out the number."),
           items=["survey_plate"], opens_flag="deep_vault_open"),
]

POI_PATCHES = {
    "broken_stair_beneath_the_treads": {
        **rumoured("deep_lamps", base=25, step=4, entries=4, skill="lore"),
        "gate": "deep_stair_under"},
    "black_bridge_the_footings": {**rumoured("deep_bridge", base=22, step=3,
                                             entries=4),
                                  "gate": "deep_footing_way"},
    "weeping_vault_the_columns": {**rumoured("deep_vault", base=23, step=3,
                                             entries=4, skill="arcana"),
                                  "gate": "deep_vault_ninth"},
}

POI_TRIGGERS = {
    "market_road_the_lamps": [finding("deep_found_lamps",
                                      "Lit, and nobody has carried oil down "
                                      "here in four hundred years.",
                                      "deep_lamps_lit")],
    "market_road_old_toll": [finding("deep_found_toll",
                                     "Which three lamps are out.",
                                     "deep_lamps_out")],
    "black_bridge_the_chasm": [finding("deep_found_chasm",
                                       "Four hundred years of dropped lights "
                                       "and no bottom.", "deep_bridge_bottom")],
    "weeping_vault_the_roof": [finding("deep_found_roof",
                                       "How many columns are holding it, and "
                                       "how many there are.",
                                       "deep_vault_count")],
    "sunless_river_the_water": [finding("deep_found_water",
                                        "Salt, four hundred miles from any "
                                        "sea.", "deep_vault_taste")],

    "broken_stair_beneath_the_treads": [{
        "id": "deep_lamps_committed", "mode": "once", "on": "enter",
        "description": "At the ninth landing, where a course was lifted out.",
        "requires": {"custom": {"gte": [{"ref": "threads.deep_lamps.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "deep_the_lamps"}}}],
    }],
    "black_bridge_the_footings": [{
        "id": "deep_bridge_committed", "mode": "once", "on": "enter",
        "description": "Down at the footings, with the hum coming up.",
        "requires": {"custom": {"gte": [{"ref": "threads.deep_bridge.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "deep_what_it_stands_on"}}}],
    }],
    "weeping_vault_the_columns": [{
        "id": "deep_vault_committed", "mode": "once", "on": "enter",
        "description": "At the foot of a column that holds nothing.",
        "requires": {"custom": {"gte": [{"ref": "threads.deep_vault.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "deep_the_ninth_column"}}}],
    }],
}

BOSSES = {
    "deeproads_beneath_treads": "deep_stair_boss",
    "deeproads_footings": "deep_footing_boss",
    "deeproads_the_columns": "deep_vault_boss",
    "deeproads_downstream": "deep_river_boss",
    "deeproads_lower_workings": "deep_workings_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("deep_what_it_stands_on", "What the Bridge Was Built Over",
            "Footings rather than abutments, on a chasm four hundred years of "
            "dropped lights have not found the bottom of, older than the span "
            "laid onto them.",
            [reach("at_the_footings", "Get down into the footings.",
                   "black_bridge_the_footings", hidden=True),
             flagged("past_the_bar", "Get past a bar on the far side.",
                     "deep_bridge_open", hidden=True),
             kill("what_hums", "Find what has been humming.", "footing_hum",
                  hidden=True)],
            xp=300, items=[("footing_maul", 1)], thread_key="deep_bridge"),

    _hidden("deep_the_ninth_column", "The Ninth Column",
            "Eight columns holding a roof and a ninth holding nothing, weeping "
            "warm salt water four hundred miles from any sea.",
            [reach("at_the_columns", "Get to the columns.",
                   "weeping_vault_the_columns", hidden=True),
             flagged("open_the_ninth", "Open what the ninth column is.",
                     "deep_vault_open", hidden=True),
             kill("what_weeps", "Find what has been weeping.", "column_weeper",
                  hidden=True)],
            xp=330, items=[("ninth_column_coat", 1)], thread_key="deep_vault"),

    _hidden("deep_the_lamps", "The Lamps That Are Still Lit",
            "Four hundred unoiled years of light, at a spacing no road needs, "
            "over marks on the floor you can only read in the dark between "
            "them — and a stair with a course lifted out from below.",
            [reach("at_the_break", "Get to the ninth landing.",
                   "broken_stair_beneath_the_treads", hidden=True),
             flagged("read_the_risers", "Read what is cut on the risers.",
                     "deep_stair_open", hidden=True),
             kill("what_lifted_it", "Meet what lifted the course out.",
                  "tread_lifter", hidden=True)],
            xp=400, items=[("lampwrights_lens", 1)], thread_key="deep_lamps"),
]

ARCS = [
    arc("deep_hidden", "The Deeproads, Unsurveyed",
        "Three things the Wayfinders have measured for four hundred years and "
        "never once written down.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("wayfinder_ost", "Ost of the Wayfinders",
        "Keeps the guild's rule, which is four hundred years of the Deeproads "
        "measured, and two pages of it he has never read aloud.",
        faction=WAY, dialogue_id="deep_ost_talk",
        home="market_road_waystation", disposition=2, gullibility=0.2,
        memory_span=365, statblock="deep_wayfinder",
        shop=shop("deep_stock", buys=("treasure",), multiplier=1.3)),

    npc("toll_keeper_bruk", "Bruk, at the Old Toll",
        "Sits at a toll post on a road the guild stopped tolling, because "
        "somebody has to, and keeps the tally because his father did.",
        faction=WAY, dialogue_id="deep_bruk_talk",
        home="market_road_old_toll", disposition=0, gullibility=0.25,
        memory_span=300, statblock="deep_tollkeeper"),

    npc("surveyor_ilde", "Ilde, Surveyor",
        "Scribes the guild's sections onto brass and once put a number beside "
        "a shaft and then scratched it out.",
        faction=WAY, dialogue_id="deep_ilde_talk",
        home="sunless_river_the_crossing", disposition=4, gullibility=0.2,
        memory_span=300, statblock="deep_surveyor"),

    npc("bridge_walker_hral", "Hral, who Walks the Span",
        "Crosses the Black Bridge twice a day with a load and has dropped more "
        "lights down that chasm than the guild has.",
        faction="karn_dolur", dialogue_id="deep_hral_talk",
        home="black_bridge_the_span", disposition=4, gullibility=0.35,
        memory_span=200),

    npc("lamp_keeper_vess", "Vess, who Keeps the Lamps",
        "Holds an office that has nothing to do, since the lamps have not "
        "needed anything for four hundred years, and walks the road anyway.",
        faction=WAY, dialogue_id="deep_vess_talk",
        home="market_road_the_lamps", disposition=6, gullibility=0.4,
        memory_span=250),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from loot import group, encounters  # noqa: E402

_GUILD = dict(creature_type="humanoid", faction="the_wayfinders")

MONSTERS = [
    creature("deep_wayfinder", "Ost of the Wayfinders", 8, 0,
             A(14, 15, 16, 16, 17, 13), ["strike", "guarded_stance"],
             "Forty years of walking the Deeproads under load.",
             descriptors=["a lamp-lit"], loot="deep_rule_carried", hp=52,
             **_GUILD),
    creature("deep_tollkeeper", "Bruk, at the Old Toll", 7, 0,
             A(16, 12, 17, 12, 14, 11), ["strike"],
             "Sits at a post nobody pays at, and has for thirty years.",
             descriptors=["a stolid"], loot="deep_tally_carried", hp=48,
             **_GUILD),
    creature("deep_surveyor", "Ilde, Surveyor", 7, 0,
             A(12, 16, 14, 17, 16, 12), ["strike", "quick_shot"],
             "Carries a plate, a rule and a light into places nobody has "
             "measured.", descriptors=["a careful"],
             loot="deep_plate_carried", hp=42, **_GUILD),

    creature("footing_hum", "What Hums in the Footings", 10, 1600,
             A(19, 12, 20, 15, 16, 16), ["unmaking_word", "stone_fist",
                                          "grave_chill"],
             "A bridge over nothing, standing on footings, and the hum comes "
             "up through the stone rather than down off the span.",
             behaviour=[{"priority": 25, "use": "unmaking_word",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "grave_chill"},
                        {"priority": 0, "use": "stone_fist"}],
             descriptors=["a sounding", "a rooted"], loot="deep_footing_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["prone", "frightened", "poisoned"], hp=175),
    creature("column_weeper", "What Weeps", 10, 1700,
             A(18, 14, 20, 17, 18, 19), ["wither", "drag_under",
                                          "unmaking_word", "grave_chill"],
             "Eight columns hold the roof. This one has been holding something "
             "else, and it is warm, and it is salt.",
             behaviour=[{"priority": 30, "use": "unmaking_word",
                         "when": {"chance": 0.25}},
                        {"priority": 20, "use": "drag_under",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "wither"},
                        {"priority": 0, "use": "grave_chill"}],
             descriptors=["a weeping", "a warm"], loot="deep_vault_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "prone", "bleeding"],
             hp=190),
    creature("tread_lifter", "What Lifted the Course Out", 11, 2000,
             A(21, 15, 21, 18, 18, 20),
             ["unmaking_word", "call_the_shut", "grave_chill", "stone_fist"],
             "A course of treads taken out of the middle of a stair, cleanly, "
             "from below. Nine landings, and the ninth is where it stopped.",
             behaviour=[{"priority": 35, "use": "unmaking_word",
                         "when": {"chance": 0.3}},
                        {"priority": 25, "use": "call_the_shut",
                         "when": {"chance": 0.3}},
                        {"priority": 10, "use": "grave_chill"},
                        {"priority": 0, "use": "stone_fist"}],
             descriptors=["a patient", "an unhurried"],
             loot="deep_stair_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "prone", "stunned"],
             hp=215),
    creature("river_thing", "What Goes Downstream", 10, 1400,
             A(18, 16, 18, 10, 16, 12), ["drag_under", "latch", "bleed_white"],
             "The Sunless River goes somewhere and nobody has followed it "
             "there.", descriptors=["a pale", "a long"],
             loot="deep_footing_hoard",
             immunities=["prone", "frightened"], hp=150),
    creature("workings_thing", "What Is in the Lower Workings", 9, 1100,
             A(18, 13, 18, 9, 14, 10), ["stone_fist", "rend"],
             "Lantern Deep dug down and stopped, and did not say why.",
             descriptors=["a hunched", "a rock-pale"], loot="deep_vault_hoard",
             immunities=["prone", "frightened"], hp=130),
]

ENCOUNTER_TABLES = [
    encounters("deep_footing_boss", [group("b", [("footing_hum", "1", False)])],
               chance=1, empty=0),
    encounters("deep_vault_boss", [group("b", [("column_weeper", "1", False)])],
               chance=1, empty=0),
    encounters("deep_stair_boss", [group("b", [("tread_lifter", "1", False)])],
               chance=1, empty=0),
    encounters("deep_river_boss", [group("b", [("river_thing", "1d2", True)])],
               chance=1, empty=0),
    encounters("deep_workings_boss", [group("b", [("workings_thing", "1d2", True)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "deep_footing_hoard", "name": "Inside the Footings", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "lore",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 3, "value": {"item": "old_coin", "quantity": "6d6"}},
                 {"weight": 2, "value": {"item": "hold_silver", "quantity": "2d4"}},
                 {"weight": 2, "value": {"item": "warded_coat", "quantity": "1"}}]},
    {"id": "deep_vault_hoard", "name": "At the Ninth Column", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "lore",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 3, "value": {"item": "old_coin", "quantity": "6d6"}},
                 {"weight": 2, "value": {"item": "barrow_torc", "quantity": "1"}},
                 {"weight": 2, "value": {"item": "silvered_blade", "quantity": "1"}}]},
    {"id": "deep_stair_hoard", "name": "Beneath the Treads", "rolls": "4",
     "emptyChance": 0, "bonusRollSkill": "lore",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 3, "value": {"item": "old_coin", "quantity": "8d6"}},
                 {"weight": 2, "value": {"item": "lamp_glass", "quantity": "1",
                                         "unique": True}},
                 {"weight": 2, "value": {"item": "hold_silver", "quantity": "3d4"}},
                 {"weight": 1, "value": {"item": "warded_coat", "quantity": "1"}}]},
]

_ost = [
    rumour("deep_ost_spacing", "How are the market road's lamps set?",
           "“Twice the interval you would light a road at, and exact to the "
           "inch between one and the next.” He does not need the rule for "
           "this. “You do not light a road that way. You *mark* something that "
           "way.”",
           "deep_lamps_spacing", faction=WAY, base=15, skill="insight"),
    rumour("deep_ost_footings", "The Black Bridge. Abutments or footings?",
           "“Piers.” He waits to see whether you know the difference, and "
           "is pleased when you do. “An abutment leans on the cliff. A pier "
           "*stands on something*. That bridge has piers, over a chasm four "
           "hundred years of dropped lights have not found the bottom of.”",
           "deep_bridge_footings", faction=WAY, base=16),
    rumour("deep_ost_count", "How many columns in the Weeping Vault?",
           "“Eight.” He says it, and then does not say anything else for a "
           "moment. “Our section has eight pillars. Every hall down here is "
           "built in eights.” He looks at the lamp. “Go and count them.”",
           "deep_vault_count", faction=WAY, base=17, skill="insight"),
]
_ost.append(favour(
    "deep_ost_rule",
    "The guild's rule. Including the two pages.",
    "He is a long time deciding, and what decides him is not you. “Four "
    "hundred years of measuring and two pages we do not read out.” He hands it "
    "over. “I have read them. I would rather somebody else had.”",
    "wayfinders_rule", faction=WAY, base=19, cost=3,
    refused="“It is the guild's, and the guild is eleven people, and I am the "
            "one who has it,” he says. “No.”"))

DIALOGUES = [
    talk("deep_ost_talk", "greet",
         ["A waystation on the market road, lit by lamps nobody carries oil "
          "for, and a man with a bound rule open on the table.",
          "“Wayfinders. Guiding is by the stage and I will not guide past the "
          "Black Bridge after the third bell.”"],
         _ost,
         redirects=[coldshoulder("deep_ost", WAY, -30,
                                 "He shuts the rule, and the sound it makes in "
                                 "here goes a long way.", back="greet")[0]],
         extra_nodes=[coldshoulder("deep_ost", WAY, -30,
                                   "He shuts the rule, and the sound it makes "
                                   "in here goes a long way.",
                                   back="greet")[1]]),

    talk("deep_vess_talk", "greet",
         ["A woman walking a lit road with a pole she has never once used, "
          "checking lamps that have not needed checking in four hundred years.",
          "“Lamp-keeper,” she says, and shrugs at the obvious. “Somebody has "
          "the office. It may as well be somebody who walks it.”"],
         [rumour("deep_vess_lit",
                 "Who oils these?",
                 "“Nobody.” She is cheerful about it in a way that takes a "
                 "moment to land. “Not in four hundred years. There is no oil "
                 "in them — I have had one down. There is no wick. They are "
                 "lit.”",
                 "deep_lamps_lit", faction=WAY, base=11),
          rumour("deep_vess_reading",
                 "Do they light the road evenly?",
                 "“No, and that is the thing I would tell somebody if anybody "
                 "asked.” She stops walking. “Stand in the dark *between* two "
                 "of them and look at the floor. There are marks. Under a lamp "
                 "you cannot see them at all.”",
                 "deep_lamps_reading", faction=WAY, base=13,
                 skill="perception"),
          rumour("deep_vess_out",
                 "Are any of them out?",
                 "“Three.” No hesitation. “And the three are the three nearest "
                 "the old toll, which I have mentioned to the guild twice.”",
                 "deep_lamps_out", faction=WAY, base=12)]),

    talk("deep_hral_talk", "greet",
         ["A dwarf with a carrying frame, halfway across a span over nothing, "
          "entirely unbothered.",
          "“Mind the kerb. It is not the drop that gets people, it is the "
          "kerb.”"],
         [rumour("deep_hral_bottom",
                 "Has anyone found the bottom of this?",
                 "“No.” He shifts the frame. “Guild drops a light every year "
                 "on the anniversary. Four hundred lights. I have dropped a "
                 "few of my own out of curiosity and I have stopped, because "
                 "you keep watching, and there is a point where you notice you "
                 "are still watching.”",
                 "deep_bridge_bottom", faction="karn_dolur", base=12),
          rumour("deep_hral_hum",
                 "It hums.",
                 "He goes quiet, which for Hral is out of character. “It does. "
                 "In a wind there is no wind for.” He starts walking again. "
                 "“Karn Dolur laid that span. The hold will tell you the span "
                 "is dwarf work, which it is, and will not discuss what it was "
                 "laid *on*, which it did not make.”",
                 "deep_bridge_older", faction="karn_dolur", base=15,
                 skill="persuasion"),
          rumour("deep_hral_hum2", "How long has it been humming?",
                 "“Before the hold, and the hold is old.” He does not slow "
                 "down. “There is no wind down here. There has never been a "
                 "wind down here. It hums in one anyway, and Karn Dolur will "
                 "tell you that is the span settling, and the span has been "
                 "settling for nine hundred years.”",
                 "deep_bridge_hum", faction="karn_dolur", base=16,
                 skill="insight")]),
]

_bruk = [
    rumour("deep_bruk_out", "Three lamps out, all by you.",
           "“All three, and I have sat under them for thirty years.” He does "
           "not look up. “They went out one after another, a year apart, and "
           "they went out in order going away from me.”",
           "deep_lamps_out", faction=WAY, base=13),
    rumour("deep_bruk_hollow", "You are the only person who sits on this road. "
           "Does the bridge sound right to you?",
           "“It sounds hollow at the ends.” He says it as a fact about "
           "masonry, which is how he has kept it bearable. “Ring what it "
           "stands on and it answers. Ring the cliff and it does not. There is "
           "a room in each pier and there has been the whole time.”",
           "deep_bridge_footings", faction=WAY, base=15, skill="insight"),
]
_bruk.append(favour(
    "deep_bruk_tally",
    "The tally. Every year of it.",
    "He hands it over without looking at it. “Three years in a different ink,” "
    "he says. “Not my father's hand and not mine. I have never worked out "
    "whose, and I have had thirty years of sitting here to work it out in.”",
    "toll_tally", faction=WAY, base=15, cost=2,
    refused="“It is the post's,” he says. “I am the post.”"))

DIALOGUES.append(
    talk("deep_bruk_talk", "greet",
         ["A toll post on a road the guild stopped tolling, three dark lamps "
          "above it, and a man sitting under them with a book.",
          "“No toll,” he says. “Has not been for two hundred years. I sit "
          "here.”"],
         _bruk))

_ilde = [
    rumour("deep_ilde_shaft", "The shaft above the Weeping Vault.",
           "She puts the scriber down. “It goes up further than there is rock "
           "above it.” She lets you have that. “I sectioned it. I took the "
           "depth from the surface and I took the height of the shaft and the "
           "second is bigger. I wrote the number down and then I scratched it "
           "out, because a number like that gets a surveyor retired.”",
           "deep_vault_shaft", faction=WAY, base=17, skill="persuasion"),
    rumour("deep_ilde_warm", "The columns weep warm.",
           "“Warm and salt.” She is precise. “There is no sea within four "
           "hundred miles of straight down from that hall. I have tasted it "
           "and I have had it tasted by somebody who did not know where it "
           "came from, and they said seawater.”",
           "deep_vault_warm", faction=WAY, base=14),
]
_ilde.append(rumour(
    "deep_ilde_spacing",
    "You measure things. What is the interval on the market road's lamps?",
    "“Twice what you would light a road at, and exact between one and the "
    "next.” She does not have to check. “I took it as a young surveyor because "
    "it looked wrong. It is wrong, and it is *consistent*, which is worse. A "
    "lamp interval drifts. That does not.”",
    "deep_lamps_spacing", faction=WAY, base=15, skill="insight"))
_ilde.append(favour(
    "deep_ilde_plate",
    "The plate. The one with the number scratched out.",
    "She fetches it and turns it so the scratched-out corner is toward you "
    "first, which is either honesty or relief. “Eight pillars on it,” she "
    "says. “Go and count them, and then come back and tell me I sectioned it "
    "wrong.”",
    "survey_plate", faction=WAY, base=16, cost=2,
    refused="“It is scribed for the guild,” she says, and does not look at the "
            "corner. “Ask me the measurements.”"))

DIALOGUES.append(
    talk("deep_ilde_talk", "greet",
         ["A crossing over the Sunless River, a lamp on a tripod, and a woman "
          "scribing onto brass with the river going past under her.",
          "“Do not stand in the light. I am taking an angle off the far "
          "bank.”"],
         _ilde))
