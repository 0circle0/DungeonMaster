"""The Glasslands' hidden threads — four, and one of them is a city.

Vashta Qal is the module's second city: two districts, fifty-five points of interest, a spring, a
glass market, a lens maker, a sunken bath behind a door that already had a lock on it, and until now
not one person in either district.

The other four empty areas are a salt town, a dry cistern with a village around it, a ruined town
coming out of a dune, and a field of fulgurite. Five dungeons between them, none named by anything.

The four threads are the same question asked four ways: the water left, and the leaving was not
weather.

  * The Ninth Course — the salt pans are cut in eight courses and the weighing house counts nine.
  * What the Cistern Was For — a cistern the size of a market, dry since before the village, and the
    village is named after it.
  * The Bath That Is Still Full — every well in Vashta Qal is metered and the bath under the Glass
    Quarter has never once been metered.
  * The Town That Came Back — the dune moved off a town in one season, and the town is the wrong age
    for the dune.

The Crater Stair is the over-tuned one: level 7 ground at the bottom of a level 6 district, sealed
on a lens the cutters will not sell and something that turns heat.
"""
from dmkit.quests import npc, shop, quest, reach, kill, flagged, arc
from lore import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "glasslands"
WARDENS = "the_water_wardens"


# --- what there is to know ------------------------------------------------

COURSES = [
    clue("glass_courses_eight",
         "The pans are cut in eight courses. Every salt town on this coast "
         "cuts eight, because eight is what one season of sun will draw.",
         "a pan-cutter"),
    clue("glass_courses_nine",
         "The weighing house has counted nine courses out of these pans every "
         "year for two hundred years, and nobody has ever cut a ninth.",
         "the weigher's ledger"),
    clue("glass_courses_taste",
         "The ninth is heavier and it does not taste of this sea. The weigher "
         "keeps a jar of it and will not sell any.",
         "the salt market"),
    clue("glass_courses_night",
         "Whatever the ninth course is, it arrives between one evening and the "
         "next morning, and no water runs into the pans in the night.",
         "the chapel's night-keeper"),
]

CISTERN = [
    clue("glass_cistern_size",
         "The cistern is bigger than the market it sits under and has been dry "
         "since before anybody's grandmother. The village is named after it "
         "anyway.",
         "the Drop's landlord"),
    clue("glass_cistern_cut",
         "It was cut, not built. One rock, hollowed, and the tool marks run "
         "the wrong way for anyone standing on the floor of it.",
         "a stone-cutter at the Drop"),
    clue("glass_cistern_feed",
         "There is a channel out of it and no channel into it, which is a "
         "thing a cistern does not have.",
         "the keeper's house"),
    clue("glass_cistern_wet",
         "The channel out is damp forty feet down, in a place that has not had "
         "rain in nine years.",
         "a well-digger"),
]

BATH = [
    clue("glass_bath_metered",
         "Every well in the city is metered by the wardens, to the cup. The "
         "bath under the Glass Quarter has never once been metered.",
         "a water warden"),
    clue("glass_bath_warm",
         "It is warm, and nothing else in the Glasslands is warm. Warm water "
         "in a desert means it came from somewhere with a fire under it.",
         "the Green Room's cellarman"),
    clue("glass_bath_lens",
         "The cutters make one lens they will not sell and will not explain, "
         "and they have made it every year for longer than the guild has "
         "minutes for.",
         "an apprentice at the Cutters' Hall"),
    clue("glass_bath_down",
         "The crater is not a crater. There is stonework under the glass on "
         "the lip and it goes down further than anybody has measured.",
         "cut into the shrine on the lip"),
]

TOWN = [
    clue("glass_town_season",
         "The dune moved off that town in a single season. Dunes here move a "
         "pace a year and that one moved a mile.",
         "a collector at the Fulgurite"),
    clue("glass_town_age",
         "The town is the wrong age for the dune. It should have been under it "
         "for nine hundred years and it has been under it for two hundred.",
         "the glass market"),
    clue("glass_town_doors",
         "Every door in it is barred from the outside, and they were barred "
         "before the sand came.",
         "a dune-walker"),
    clue("glass_town_glass",
         "There is glass in the streets that was not made in a kiln and did "
         "not come from lightning. It runs in lines, and the lines lead "
         "somewhere.",
         "the Cutters' Hall"),
]

LORE = COURSES + CISTERN + BATH + TOWN

THREADS = [
    thread("glass_courses", "The Ninth Course",
           "Eight courses cut, nine weighed, every year for two hundred years, "
           "and the ninth does not taste of this sea.", COURSES),
    thread("glass_cistern", "What the Cistern Was For",
           "A hollowed rock the size of a market, a channel out and no channel "
           "in, and forty feet down it is damp.", CISTERN),
    thread("glass_bath", "The Bath That Is Still Full",
           "One warm bath in a desert, unmetered in a city that meters "
           "everything, and a lens the cutters make every year and will not "
           "sell.", BATH),
    thread("glass_town", "The Town That Came Back",
           "A dune moved a mile in one season and gave back a town two hundred "
           "years too young, with every door barred from outside.", TOWN),
]


# --- things ---------------------------------------------------------------

ITEMS = [
    keepsake("weighers_jar", "The Weigher's Jar",
             "A stoppered jar of the ninth course. Heavier than salt has any "
             "business being, and it does not taste of this sea.",
             holder="weigher_qasim"),
    keepsake("cistern_key", "The Cistern Keeper's Key",
             "For a channel that runs out of a cistern nothing runs into. The "
             "office of keeper outlived the water by three hundred years.",
             holder="cistern_keeper_havva"),
    keepsake("unsold_lens", "The Lens They Do Not Sell",
             "Ground every year by the Cutters' Hall since before the guild "
             "kept minutes. Looked through, the glass on the crater lip is not "
             "glass.",
             holder="lens_cutter_naim"),
    keepsake("dune_walkers_chart", "The Dune-Walker's Chart",
             "Where the dunes were, year by year, in four hands over ninety "
             "years. One line on it goes a mile in a season.",
             holder="dune_walker_sela"),

    trophy("ninth_course_salt", "A Measure of the Ninth",
           "It draws water out of the air in a place that has none.",
           "glass_courses_taste"),

    relic("weighers_scale", "The Weigher's Scale", "belt",
          "Brass, and older than the pans. What is set on it reads its true "
          "weight, which is not always the weight it has.",
          value=850, rarity="rare", skills={"insight": 3, "craft": 2}),
    relic("cistern_keepers_ring", "The Cistern Keeper's Ring", "ring",
          "Three hundred years of an office with nothing to do. The stone in "
          "it is always cold and always slightly wet.",
          value=800, rarity="rare", skills={"survival": 3},
          resist=(("fire", 0.5),)),
    relic("unsold_lens_mounted", "The Ground Lens, Mounted", "head",
          "The one the cutters make and do not sell, in a frame somebody made "
          "for it a very long time after. Worn, the lines in the glass have "
          "ends.",
          value=1300, rarity="very_rare",
          skills={"perception": 3, "arcana": 3}),
    relic("barred_door_iron", "Iron off a Barred Door", "hand",
          "The bar off a door in the uncovered town, straightened and hafted. "
          "It was on the outside, and whoever put it there meant it.",
          value=950, rarity="very_rare", damage=("1d10", "bludgeoning", "might"),
          properties=["heavy"]),
]

LOOT_TABLES = [
    carried("glass_jar_carried", "What Qasim Kept", "weighers_jar"),
    carried("glass_key_carried", "What Havva Kept", "cistern_key"),
    carried("glass_lens_carried", "What Naim Kept", "unsold_lens"),
    carried("glass_chart_carried", "What Sela Kept", "dune_walkers_chart"),
]


# --- doors ----------------------------------------------------------------

GATES = [
    sealed("glass_pan_floor", "Under the Eighth Course",
           "The floor of the last pan is not pan-floor. It rings.",
           blocked("glass_pan_blocked",
                   "The eighth pan sounds hollow along its whole length and "
                   "there is no seam in it anywhere. Something has been "
                   "coming up through this, and it has not been coming up "
                   "through a door you can see.",
                   "It rings under your heel for forty feet. You would want "
                   "the weigher's jar in your hand before you went looking "
                   "for the way down — the ninth course knows the way and you "
                   "do not.",
                   "Salt, and under the salt something that is not salt. The "
                   "weighing house has been measuring the answer to this for "
                   "two hundred years without once asking the question."),
           items=["weighers_jar"], opens_flag="glass_courses_open"),

    sealed("glass_feeder_channel", "The Channel Out",
           "A cistern with a way out and no way in, and the way out is barred "
           "at the far end by somebody who had a key.",
           blocked("glass_feeder_blocked",
                   "The grating at the end of the channel was made to be "
                   "opened, and the office that opened it has outlived the "
                   "water by three hundred years. Somebody in the village is "
                   "still called the keeper.",
                   "Forty feet down and damp, in a country with no rain. The "
                   "grating is sound and the lock in it has been oiled more "
                   "recently than anything else down here.",
                   "It is a lock, and it is not an old lock, which is the "
                   "part worth thinking about."),
           items=["cistern_key"], opens_flag="glass_cistern_open"),

    # The over-tuned one: level 7 under a level 6 district, and the seal names both the lens and
    # something that turns heat.
    sealed("glass_crater_seal", "The Stonework Under the Lip",
           "There is masonry under the glass, and the glass was poured over it "
           "rather than the other way round.",
           blocked("glass_crater_blocked",
                   "The lines in the glass have ends, and the ends are down "
                   "there. Reading them would want the lens the cutters will "
                   "not sell — and going down after them would want something "
                   "that does not mind heat, going by what comes up.",
                   "Air comes up off the stair that dries your mouth in one "
                   "breath. Whatever is at the bottom of this has a fire "
                   "under it, and the city has been drinking the runoff for "
                   "two hundred years without asking.",
                   "Masonry under poured glass. Somebody sealed this from "
                   "above, in a hurry, with the most permanent thing they "
                   "had to hand."),
           items=["unsold_lens", "cistern_keepers_ring"],
           opens_flag="glass_bath_open"),

    sealed("glass_town_bar", "The Doors Barred from Outside",
           "Every door in the uncovered town is barred, and every bar is on "
           "the street side.",
           blocked("glass_town_blocked",
                   "The bars are on the outside and they were shut before the "
                   "sand came. You could lift one — but you would want to know "
                   "what the dune did first, and there is exactly one record "
                   "of where these dunes have been.",
                   "Barred from the street, every one, and the sand piled "
                   "against them afterwards. Somebody shut this town and then "
                   "the desert agreed with them.",
                   "A town two hundred years too young for the dune that had "
                   "it. You would want the chart before you started lifting "
                   "bars."),
           items=["dune_walkers_chart"], opens_flag="glass_town_open"),
]


# --- the places themselves ------------------------------------------------

POI_PATCHES = {
    "saltrun_deep_pan": {**rumoured("glass_courses", base=20, step=3, entries=4),
                         "gate": "glass_pan_floor"},
    "dry_cistern_the_feeder": {**rumoured("glass_cistern", base=21, step=3, entries=4),
                               "gate": "glass_feeder_channel"},
    "glass_quarter_crater_stair": {**rumoured("glass_bath", base=24, step=4, entries=4,
                                              skill="arcana"),
                                   "gate": "glass_crater_seal"},
    "shifting_dunes_under_town": {**rumoured("glass_town", base=22, step=3, entries=4,
                                             skill="survival"),
                                  "gate": "glass_town_bar"},
}

POI_TRIGGERS = {
    "saltrun_the_pans": [finding("glass_found_pans",
                                 "Eight courses cut, and the weighing house "
                                 "counting nine.", "glass_courses_eight")],
    "dry_cistern_the_cistern": [finding("glass_found_cistern",
                                        "A channel out, and no channel in.",
                                        "glass_cistern_feed")],
    "glass_quarter_the_lip": [finding("glass_found_lip",
                                      "Stonework under the glass, and the "
                                      "glass poured over it.",
                                      "glass_bath_down")],
    "shifting_dunes_uncovered_town": [finding("glass_found_town",
                                              "Which side of each door the "
                                              "bar is on.", "glass_town_doors")],
    "fulgurite_the_grove": [finding("glass_found_grove",
                                    "Glass in lines, and the lines going "
                                    "somewhere.", "glass_town_glass")],

    "saltrun_deep_pan": [{
        "id": "glass_courses_committed", "mode": "once", "on": "enter",
        "description": "Standing on the pan floor, knowing what it rings like.",
        "requires": {"custom": {"gte": [{"ref": "threads.glass_courses.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "glass_the_ninth_course"}}}],
    }],
    "dry_cistern_the_feeder": [{
        "id": "glass_cistern_committed", "mode": "once", "on": "enter",
        "description": "The channel out, from the inside.",
        "requires": {"custom": {"gte": [{"ref": "threads.glass_cistern.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "glass_what_it_was_for"}}}],
    }],
    "glass_quarter_crater_stair": [{
        "id": "glass_bath_committed", "mode": "once", "on": "enter",
        "description": "The head of a stair the city does not admit to.",
        "requires": {"custom": {"gte": [{"ref": "threads.glass_bath.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "glass_still_full"}}}],
    }],
    "shifting_dunes_under_town": [{
        "id": "glass_town_committed", "mode": "once", "on": "enter",
        "description": "A street of barred doors, with the bars on your side.",
        "requires": {"custom": {"gte": [{"ref": "threads.glass_town.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "glass_the_town_that_came_back"}}}],
    }],
}

BOSSES = {
    "glasslands_deep_pan": "glass_pan_boss",
    "glasslands_the_feeder": "glass_feeder_boss",
    "glasslands_crater_deep": "glass_crater_boss",
    "glasslands_uncovered_town": "glass_town_boss",
    "glasslands_the_root": "glass_root_boss",
}


# --- the quests, which nobody gives you -----------------------------------

def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("glass_the_ninth_course", "The Ninth Course",
            "Eight courses cut and nine weighed, every year for two hundred "
            "years, and the ninth arrives in the night out of a pan floor that "
            "rings.",
            [reach("at_the_pan", "Get under the eighth pan.",
                   "saltrun_deep_pan", hidden=True),
             flagged("through_the_floor", "Find the way the ninth course comes "
                     "up.", "glass_courses_open", hidden=True),
             kill("the_drawer", "Find what has been drawing.",
                  "salt_drawer", hidden=True)],
            xp=170, items=[("weighers_scale", 1)], thread_key="glass_courses"),

    _hidden("glass_what_it_was_for", "What the Cistern Was For",
            "A hollowed rock the size of a market with a channel out of it and "
            "no channel in, and forty feet down the channel is damp.",
            [reach("at_the_feeder", "Get into the channel.",
                   "dry_cistern_the_feeder", hidden=True),
             flagged("past_the_grating", "Open what the keeper's office was "
                     "for.", "glass_cistern_open", hidden=True),
             kill("what_drinks", "Find what has been drinking.",
                  "cistern_drinker", hidden=True)],
            xp=180, items=[("cistern_keepers_ring", 1)],
            thread_key="glass_cistern"),

    _hidden("glass_still_full", "The Bath That Is Still Full",
            "One warm bath in a desert, never metered by a city that meters to "
            "the cup, and masonry under poured glass on the crater lip.",
            [reach("at_the_stair", "Get down the crater stair.",
                   "glass_quarter_crater_stair", hidden=True),
             flagged("read_the_lines", "Read the lines in the glass from the "
                     "side they were cut for.", "glass_bath_open", hidden=True),
             kill("what_heats_it", "Find what has the fire under it.",
                  "crater_founder", hidden=True)],
            xp=260, items=[("unsold_lens_mounted", 1)], thread_key="glass_bath"),

    _hidden("glass_the_town_that_came_back", "The Town That Came Back",
            "A dune that moved a mile in one season, off a town two hundred "
            "years too young for it, with every door barred from the street.",
            [reach("in_the_streets", "Get into the uncovered town.",
                   "shifting_dunes_under_town", hidden=True),
             flagged("lift_a_bar", "Lift one of the bars.",
                     "glass_town_open", hidden=True),
             kill("what_was_shut_in_town", "Meet what the bars were on the "
                  "outside for.", "barred_thing", hidden=True)],
            xp=200, items=[("barred_door_iron", 1)], thread_key="glass_town"),
]

ARCS = [
    arc("glass_hidden", "The Glasslands, Unmetered",
        "Four ways of noticing that the water did not leave on its own.",
        [q["id"] for q in QUESTS]),
]


# --- the people who know ---------------------------------------------------

NPCS = [
    npc("weigher_qasim", "Qasim, of the Weighing House",
        "Weighs every course out of the pans and has weighed one more each "
        "year than anybody cut, since he was an apprentice.",
        faction=WARDENS, dialogue_id="glass_qasim_talk",
        home="saltrun_house_b", disposition=2, gullibility=0.2,
        memory_span=300, statblock="glass_weigher",
        shop=shop("keeper_stock", buys=("treasure", "material"), multiplier=1.2)),

    npc("cistern_keeper_havva", "Havva, Keeper of the Cistern",
        "Holds an office three hundred years older than the last water in it, "
        "and keeps the key oiled.",
        faction=WARDENS, dialogue_id="glass_havva_talk",
        home="dry_cistern_house_a", disposition=6, gullibility=0.3,
        memory_span=365, statblock="glass_keeper"),

    npc("lens_cutter_naim", "Naim, at the Cutters' Hall",
        "Grinds one lens a year that the Hall does not sell, does not "
        "display, and does not have minutes for.",
        faction="the_library", dialogue_id="glass_naim_talk",
        home="glass_quarter_cutters", disposition=0, gullibility=0.15,
        memory_span=250, statblock="glass_cutter",
        shop=shop("aurenhal_stock", buys=("treasure", "material"),
                  multiplier=1.5)),

    npc("dune_walker_sela", "Sela, who Walks the Dunes",
        "Has ninety years of where the sand was, in four hands, and only one "
        "line on it that she cannot explain.",
        faction=WARDENS, dialogue_id="glass_sela_talk",
        home="fulgurite_collectors_camp", disposition=8, gullibility=0.4,
        memory_span=200, statblock="glass_walker"),

    npc("night_keeper_ilyas", "Ilyas, at the White Chapel",
        "Keeps the chapel at night because somebody has to, and has therefore "
        "been the only person awake for two hundred pan-seasons' worth of "
        "arrivals.",
        faction="the_keepers", dialogue_id="glass_ilyas_talk",
        home="saltrun_chapel", disposition=10, gullibility=0.5,
        memory_span=180, cares=["ward_restored", "ward_broken"]),

    npc("cellarman_dov", "Dov, at the Green Room",
        "Runs the cellar under the Green Room and has been down there long "
        "enough to know exactly which wall is warm.",
        faction="the_countinghouse", dialogue_id="glass_dov_talk",
        home="glass_quarter_the_green_room", disposition=6, gullibility=0.45,
        memory_span=120,
        shop=shop("aurenhal_stock", buys=("treasure",), multiplier=1.3)),

    npc("water_warden_taj", "Taj of the Wardens",
        "Meters every well in Vashta Qal to the cup and is professionally "
        "unable to stop thinking about the one that is not metered.",
        faction=WARDENS, dialogue_id="glass_taj_talk",
        home="vashta_qal_water_wardens", disposition=4, gullibility=0.2,
        memory_span=300),

    npc("pan_cutter_reyhan", "Reyhan, Pan-Cutter",
        "Cuts eight courses a year, as her mother did, and is very clear that "
        "eight is what the sun will draw.",
        faction=WARDENS, dialogue_id="glass_reyhan_talk",
        home="saltrun_salt_market", disposition=6, gullibility=0.4,
        memory_span=150),

    npc("well_digger_ferruh", "Ferruh, Well-Digger",
        "Digs dry holes for a living in a country that has nothing else to "
        "offer, and knows to the foot where the damp starts.",
        faction=WARDENS, dialogue_id="glass_ferruh_talk",
        home="dry_cistern_the_drop", disposition=4, gullibility=0.35,
        memory_span=120),
]


# --- what is down there ----------------------------------------------------

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from dmkit.loot import group, encounters  # noqa: E402

_TOWN = dict(creature_type="humanoid", faction="the_water_wardens")

MONSTERS = [
    creature("glass_weigher", "Qasim, of the Weighing House", 5, 0,
             A(11, 11, 12, 15, 13, 12), ["strike"],
             "A lifetime of lifting counterweights, which is more lifting than "
             "it sounds.", descriptors=["a deliberate"],
             loot="glass_jar_carried", hp=28, **_TOWN),
    creature("glass_keeper", "Havva, Keeper of the Cistern", 5, 0,
             A(12, 13, 13, 12, 14, 13), ["strike"],
             "Three hundred years of an office and every one of them spent on "
             "ladders.", descriptors=["a wiry"],
             loot="glass_key_carried", hp=30, **_TOWN),
    creature("glass_cutter", "Naim, at the Cutters' Hall", 5, 0,
             A(12, 15, 12, 15, 12, 11), ["strike", "cut_and_run"],
             "Hands steady enough to grind a lens nobody is allowed to buy.",
             descriptors=["a precise"], loot="glass_lens_carried", hp=27,
             creature_type="humanoid", faction="the_library"),
    creature("glass_walker", "Sela, who Walks the Dunes", 6, 0,
             A(13, 16, 15, 12, 17, 12), ["strike", "quick_shot"],
             "Ninety years of chart and the legs that made the last thirty of "
             "it.", descriptors=["a sun-dark"],
             loot="glass_chart_carried", hp=36, **_TOWN),

    creature("salt_drawer", "What Draws the Ninth", 8, 780,
             A(15, 14, 17, 11, 15, 12), ["salt_burn", "wither", "rend"],
             "It has been putting a ninth course into those pans every year "
             "for two hundred years, and nobody has ever asked what it wants "
             "the eight for.",
             behaviour=[{"priority": 15, "use": "salt_burn",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a crusted", "a patient"],
             loot="glass_pan_hoard", immunities=["poisoned", "frightened"],
             hp=90),
    creature("cistern_drinker", "What Has Been Drinking", 8, 820,
             A(16, 15, 16, 10, 16, 11), ["drag_under", "latch", "rend"],
             "A channel out of a cistern with nothing running into it is not a "
             "drain. It is a throat.",
             behaviour=[{"priority": 20, "use": "drag_under",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "latch"},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a sodden", "a swollen"],
             loot="glass_feeder_hoard", immunities=["prone", "frightened"],
             hp=95),
    creature("crater_founder", "What Has the Fire Under It", 10, 1500,
             A(20, 12, 20, 17, 16, 18),
             ["vent_breath", "cinder_lash", "unmaking_word", "glass_shard"],
             "Masonry under poured glass, and something below the masonry that "
             "the glass was poured to keep in. The city has been drinking the "
             "runoff for two hundred years.",
             behaviour=[{"priority": 30, "use": "unmaking_word",
                         "when": {"chance": 0.25}},
                        {"priority": 20, "use": "vent_breath",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "glass_shard"},
                        {"priority": 0, "use": "cinder_lash"}],
             descriptors=["a molten", "a founding"],
             loot="glass_crater_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "prone", "burning"], hp=165),
    creature("barred_thing", "What the Bars Were For", 7, 700,
             A(17, 16, 14, 9, 15, 10), ["rend", "gore", "cut_and_run"],
             "Every door barred from the street, before the sand. They did not "
             "get it out; they got everything else out.",
             behaviour=[{"priority": 15, "use": "cut_and_run",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "rend"}],
             descriptors=["a hunched", "a sand-scoured"],
             loot="glass_town_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened"], hp=84),
    creature("root_glass", "The Root", 7, 650,
             A(16, 10, 18, 8, 12, 9), ["glass_shard", "stone_fist"],
             "Fulgurite goes down as far as the strike went, and this one went "
             "a long way down.",
             descriptors=["a branching", "a bright"],
             loot="glass_town_hoard", immunities=["prone", "frightened",
                                                  "bleeding"], hp=88),
]

ENCOUNTER_TABLES = [
    encounters("glass_pan_boss", [group("drawer", [("salt_drawer", "1", False)])],
               chance=1, empty=0),
    encounters("glass_feeder_boss",
               [group("drinker", [("cistern_drinker", "1", False)])],
               chance=1, empty=0),
    encounters("glass_crater_boss",
               [group("founder", [("crater_founder", "1", False)])],
               chance=1, empty=0),
    encounters("glass_town_boss", [group("thing", [("barred_thing", "1d2", True)])],
               chance=1, empty=0),
    encounters("glass_root_boss", [group("root", [("root_glass", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "glass_pan_hoard", "name": "Under the Eighth Course", "rolls": "2",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [
         {"weight": 3, "value": {"item": "old_coin", "quantity": "3d6"}},
         {"weight": 2, "value": {"item": "glass_bead", "quantity": "1d3"}},
         {"weight": 1, "value": {"item": "ninth_course_salt", "quantity": "1",
                                 "unique": True}},
     ]},
    {"id": "glass_feeder_hoard", "name": "The Far End of the Channel",
     "rolls": "2", "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [
         {"weight": 4, "value": {"item": "old_coin", "quantity": "2d6"}},
         {"weight": 2, "value": {"item": "ward_salt", "quantity": "1d2"}},
         {"weight": 1, "value": {"item": "antidote", "quantity": "1d2"}},
     ]},
    {"id": "glass_crater_hoard", "name": "Under the Poured Glass", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "lore",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [
         {"weight": 3, "value": {"item": "old_coin", "quantity": "5d6"}},
         {"weight": 2, "value": {"item": "glass_bead", "quantity": "2d3"}},
         {"weight": 2, "value": {"item": "warded_coat", "quantity": "1"}},
     ]},
    {"id": "glass_town_hoard", "name": "Behind a Barred Door", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [
         {"weight": 4, "value": {"item": "old_coin", "quantity": "2d6"}},
         {"weight": 2, "value": {"item": "amber_lump", "quantity": "1"}},
         {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}},
     ]},
]


# --- conversation ----------------------------------------------------------

_qasim = [
    rumour("glass_qasim_nine",
           "How many courses come out of these pans in a year?",
           "“Nine.” He does not look up from the beam. “Eight cut, nine "
           "weighed. Two hundred years of ledgers say nine and I have added "
           "every one of them twice.” He sets a weight. “Nobody has ever cut "
           "a ninth.”",
           "glass_courses_nine", faction=WARDENS, base=13, skill="insight"),
    rumour("glass_qasim_taste",
           "What is the ninth like?",
           "He goes and gets the jar without being asked, which tells you how "
           "long he has wanted to show somebody. “Heavier. And it does not "
           "taste of this sea — I have tasted this sea for forty years.” He "
           "stoppers it again. “I do not sell any of it.”",
           "glass_courses_taste", faction=WARDENS, base=15),
]
_qasim.append(favour(
    "glass_qasim_jar",
    "Let me take the jar.",
    "He hands it over with both hands and does not let go for a moment. “If "
    "you find out where it comes from, come back and tell me before you tell "
    "the wardens. Forty years is a long time to be the only one adding up.”",
    "weighers_jar", faction=WARDENS, base=15, cost=2,
    refused="“No.” He puts it back on the shelf, behind the counterweights. "
            "“It is the only evidence I have that I am not senile.”"))

DIALOGUES = [
    talk("glass_qasim_talk", "greet",
         ["A weighing house with the shutters half down against the glare, and "
          "a man setting brass weights on a beam by feel.",
          "“Salt is by the measure and the measure is on the wall. If you are "
          "arguing about the measure, argue outside.”"],
         _qasim,
         redirects=[coldshoulder("glass_qasim", WARDENS, -30,
                                 "He turns the beam away from you and waits, "
                                 "with the patience of a man who has all day "
                                 "and no intention of spending any of it on "
                                 "you.", back="greet")[0]],
         extra_nodes=[coldshoulder("glass_qasim", WARDENS, -30,
                                   "He turns the beam away from you and waits, "
                                   "with the patience of a man who has all day "
                                   "and no intention of spending any of it on "
                                   "you.", back="greet")[1]]),

    talk("glass_reyhan_talk", "greet",
         ["A salt market at the hot end of the day, which means one stall open "
          "and everybody else asleep under it.",
          "“Coarse or fine. If you want the fine you are two months early.”"],
         [rumour("glass_reyhan_eight",
                 "How many courses do you cut?",
                 "“Eight.” She says it the way you answer a question about "
                 "which way is up. “Eight is what one season of sun will "
                 "draw. Every pan on this coast is cut in eight, ask anyone, "
                 "ask my mother if you can wake her.”",
                 "glass_courses_eight", faction=WARDENS, base=9),
          rumour("glass_reyhan_taste",
                 "Qasim keeps a jar of something he will not sell.",
                 "Her face closes slightly. “That is the ninth, and it is not "
                 "ours, and I will thank you not to say I said so.” A pause. "
                 "“It is heavier. And it does not taste of this sea, and I "
                 "have licked my fingers in these pans since I was four.”",
                 "glass_courses_taste", faction=WARDENS, base=14)]),

    talk("glass_ilyas_talk", "greet",
         ["A white chapel, cool for the first time all day, and a man awake in "
          "it at an hour when nobody is.",
          "“You are the second person awake in Saltrun,” he says, pleased "
          "about it. “Sit down.”"],
         [rumour("glass_ilyas_night",
                 "You are up all night. When does the ninth course arrive?",
                 "“Between one evening and the next morning, and no water runs "
                 "in the night.” He says it without any drama at all, which "
                 "makes it worse. “I have watched the channels. They are dry "
                 "from dusk. And in the morning there is more salt than there "
                 "was.”",
                 "glass_courses_night", faction="the_keepers", base=10),
          rumour("glass_ilyas_lip",
                 "There is stonework under the glass on the crater lip.",
                 "“Cut into our own shrine, that,” he says. “By somebody with "
                 "a chisel and a grievance, a long time ago. It says the "
                 "crater is not a crater and the stone goes further down than "
                 "anybody has measured, and the Hall has never once sent "
                 "anybody to measure it.”",
                 "glass_bath_down", faction="the_keepers", base=13,
                 skill="insight")]),
]

_havva = [
    rumour("glass_havva_cut",
           "The cistern — was it built or cut?",
           "“Cut.” She is definite. “One rock, hollowed. And the tool marks "
           "run the wrong way for anyone standing on the floor of it, which I "
           "have pointed out to four generations of people who did not want "
           "to hear it.”",
           "glass_cistern_cut", faction=WARDENS, base=12, skill="insight"),
    rumour("glass_havva_feed",
           "Where does the water come in?",
           "“It does not.” She lets that sit. “There is a channel out and no "
           "channel in. I have been down there with a lamp more times than "
           "anybody and I am telling you there is no way in.” A shrug. "
           "“Which does raise the question of what was going out.”",
           "glass_cistern_feed", faction=WARDENS, base=13),
]
_havva.append(favour(
    "glass_havva_key",
    "The key to the grating. I want the far end of that channel.",
    "She takes it off the ring at once, which is startling. “Three hundred "
    "years of keepers and not one of us has had a reason. Go on. If it is "
    "nothing I would like to be told it is nothing.”",
    "cistern_key", faction=WARDENS, base=12, cost=1,
    refused="“Not while I am the keeper,” she says, and her hand is on the "
            "ring. “Come back when you can tell me what is at the far end.”"))

DIALOGUES.append(
    talk("glass_havva_talk", "greet",
         ["A house built against the lip of a hole the size of a market. She "
          "is oiling a key that has nothing to open.",
          "“Keeper of the Cistern,” she says, before you ask. “There has been "
          "no water in it since my great-grandmother. There is still a "
          "keeper.”"],
         _havva))

DIALOGUES.append(
    talk("glass_ferruh_talk", "greet",
         ["The taproom of the Drop, and a man with sand in every crease of him "
          "drinking something he has clearly earned.",
          "“Dry,” he says, meaning the hole and possibly the drink. “Nine "
          "holes this season and all of them dry.”"],
         [rumour("glass_ferruh_size",
                 "That cistern is enormous for a village this size.",
                 "“Bigger than the market, and it was dry before anybody's "
                 "grandmother.” He drinks. “And they named the village after "
                 "it anyway, which tells you they thought it was coming back.”",
                 "glass_cistern_size", faction=WARDENS, base=10),
          rumour("glass_ferruh_wet",
                 "You would know where the damp starts. How deep?",
                 "He puts the cup down. “Forty feet, in the channel out of the "
                 "cistern. Not the rock — the channel.” He looks at you "
                 "properly for the first time. “It has not rained here in nine "
                 "years. You tell me what is damp at forty feet.”",
                 "glass_cistern_wet", faction=WARDENS, base=13,
                 skill="persuasion")]))

_naim = [
    rumour("glass_naim_lens",
           "The Hall grinds a lens it does not sell.",
           "The wheel stops. “Who told you that.” It is not a question, and he "
           "does not wait for an answer. “One a year. Since before the guild "
           "kept minutes, which is four hundred years of a thing nobody has "
           "written down the reason for.” He starts the wheel again. “We grind "
           "it because we grind it.”",
           "glass_bath_lens", faction="the_library", base=17,
           skill="persuasion"),
    rumour("glass_naim_glass",
           "There is glass in the uncovered town that was not made in a kiln.",
           "“Nor by lightning. I have looked.” He is interested despite "
           "himself. “It runs in lines. Kiln glass pools and lightning glass "
           "branches, and that runs in *lines*, which means it was poured "
           "along something.”",
           "glass_town_glass", faction="the_library", base=14, skill="insight"),
]
_naim.append(favour(
    "glass_naim_take",
    "Give me this year's lens.",
    "He is quiet for a long moment with his hand flat on the bench. “Four "
    "hundred years,” he says. “And every one of us assumed the last one knew "
    "why.” He wraps it in felt. “Look through it on the lip. Not at the "
    "market — on the lip.”",
    "unsold_lens", faction="the_library", base=18, cost=3,
    refused="“No,” he says, and puts a cloth over it. “It is the Hall's, and "
            "the Hall has been very consistent about that.”"))

DIALOGUES.append(
    talk("glass_naim_talk", "greet",
         ["A hall of wheels and grit and very good light, and one bench at the "
          "back with a cloth over it.",
          "“Spectacles are the third door. Lenses for instruments, I will "
          "want to know the instrument.”"],
         _naim,
         redirects=[coldshoulder("glass_naim", "the_library", -25,
                                 "He puts the cloth over the bench and stands "
                                 "in front of it.", back="greet")[0]],
         extra_nodes=[coldshoulder("glass_naim", "the_library", -25,
                                   "He puts the cloth over the bench and "
                                   "stands in front of it.", back="greet")[1]]))

DIALOGUES.append(
    talk("glass_taj_talk", "greet",
         ["A room of tally-boards, one per well, each with a number chalked on "
          "it and a smaller number under that.",
          "“Every well in the city, to the cup,” he says, with the flat pride "
          "of a man who has never once been thanked for it.”"],
         [rumour("glass_taj_metered",
                 "Is every well on those boards?",
                 "“Every well.” A beat, and then, because he cannot help it: "
                 "“There is one that is not a well. The bath under the Glass "
                 "Quarter has never been metered, not once, not in the whole "
                 "run of the boards.” He straightens a board that did not need "
                 "it. “It is not a well, so it is not mine. That is the "
                 "position.”",
                 "glass_bath_metered", faction=WARDENS, base=13,
                 skill="insight"),
          # A Saltrun matter, told in Vashta Qal on purpose: a thread whose tellers all live in one
          # town ends with one missed conversation, and `check_quests.py` counts the areas.
          rumour("glass_taj_nine",
                 "You take the pans' returns. How many courses do they yield?",
                 "“Nine.” He does not have to look it up. “Which has been "
                 "irritating me since I took the boards, because Saltrun cuts "
                 "eight and everyone on that coast cuts eight, and the "
                 "returns have said nine for two hundred years.” He shrugs, "
                 "very slightly. “It is salt, not water. Not mine.”",
                 "glass_courses_nine", faction=WARDENS, base=14,
                 skill="insight"),
          rumour("glass_taj_cistern",
                 "The cistern out at the Dry Cistern — what fed it?",
                 "“Nothing on any chart of mine.” He is put out by it. “I have "
                 "the whole watershed. There is no watershed. It has an outlet "
                 "and no inlet, and I have three hundred years of wardens "
                 "before me who all wrote *see previous* in that column.”",
                 "glass_cistern_feed", faction=WARDENS, base=14)]))

DIALOGUES.append(
    talk("glass_dov_talk", "greet",
         ["A cellar under the Green Room, cool the way a cellar should be "
          "except along one wall.",
          "“Mind the step. And mind the west wall, it's warm and it stains "
          "your coat.”"],
         [rumour("glass_dov_warm",
                 "Why is that wall warm?",
                 "“Bath's behind it.” He says it like a man discussing "
                 "plumbing. Then, less like that: “It's warm all year. Nothing "
                 "in the Glasslands is warm — the desert's cold at night, "
                 "everything's cold at night. Warm water means a fire under "
                 "it, and there's no fire under my cellar.”",
                 "glass_bath_warm", faction="the_countinghouse", base=11),
          rumour("glass_dov_metered",
                 "Do the wardens meter the bath?",
                 "He laughs. “The wardens meter my washing-up. They have never "
                 "put a stick in that bath in my life and I have asked twice.”",
                 "glass_bath_metered", faction="the_countinghouse", base=12)]))

_sela = [
    rumour("glass_sela_season",
           "Has a dune here ever moved fast?",
           "“A pace a year, all of them, all my life and my father's.” She "
           "unrolls the chart far enough for you to see the lines. “Except "
           "this one. One season. A mile.” Her finger stops on it. “I have "
           "walked that ground since and there is no reason for it.”",
           "glass_town_season", faction=WARDENS, base=12, skill="persuasion"),
    rumour("glass_sela_age",
           "How old is the town it uncovered?",
           "“Two hundred years, near enough — you can date the brick.” She "
           "rolls the chart back up. “It should have been under that dune for "
           "nine hundred. Either the dune is young or the town is, and the "
           "dune is not young.”",
           "glass_town_age", faction=WARDENS, base=14, skill="insight"),
]
_sela.append(favour(
    "glass_sela_chart",
    "I need the chart. All ninety years of it.",
    "She hands it over rolled, and holds onto the end of it a second longer. "
    "“Four hands. My great-grandfather started it.” She lets go. “The line "
    "that goes a mile is in mine. I would like somebody to tell me I drew it "
    "wrong.”",
    "dune_walkers_chart", faction=WARDENS, base=14, cost=2,
    refused="“Not the chart,” she says. “Ask me anything off it and I will "
            "tell you. The chart stays.”"))

DIALOGUES.append(
    talk("glass_sela_talk", "greet",
         ["A camp among glass trees, and a woman with ninety years of chart "
          "spread on a board and stones on the corners.",
          "“Do not step on the grove,” she says. “It cuts through a boot and "
          "then it cuts through the foot.”"],
         _sela))
