"""The Ninth Well — a Glasslands side chain, Act III.

Bone Wells has nine shafts. Eight were sunk for water and reached it. The
ninth was sunk in the same season by the same crew and the diggers' camp has
been arranged so that nobody has to look at it for four hundred years.

Vashta Qal's water wardens decide how much of one spring four thousand people
are allowed, which makes them the only people on the continent professionally
qualified to be curious about a well that nobody uses. Sefa is the one who has
been curious out loud, which is why she is at Bone Wells and not at the spring.

The Fulgurite Lens is the best skill item in the module — two ranks of lore and
one of arcana, ground over nine years by a man at the Glass Quarter who would
not say what he was grinding it for. He knew.
"""
from questkit import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way, set_flag,
    rep, deed, either, node, option, take_job, dialogue, npc, shop,
)
from sidekit import chain, link, ACT_GATES
from prose import pool

KEY = "ninthwell"


NPCS = [
    npc("water_warden_sefa", "Sefa of the Spring",
        "Measures out one spring between four thousand people, and has been "
        "posted to Bone Wells for asking, in writing, why the ninth shaft is "
        "on the survey and not on the roster.",
        faction="the_water_wardens", dialogue_id="ninthwell_sefa_talk",
        home="bone_wells_diggers_camp", disposition=5, gullibility=0.25,
        memory_span=280, cares=["spring_served", "water_stolen"],
        offers=["ninthwell_eight_and_one"],
        shop=shop("countinghouse_stock", buys=("treasure", "material"),
                  multiplier=1.35,
                  requires={"factions": [{"faction": "the_water_wardens",
                                          "minStanding": 12}]})),
]


POI_TRIGGERS = {
    "sunken_road_milepost_vault": [{
        "id": "ninthwell_at_the_milepost", "mode": "once", "on": "enter",
        "description": "A vault under a milepost, and what the survey in it "
                       "counts.",
        "effects": [{"setFlag": {"flag": "ninthwell_survey_read",
                                 "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("ninthwell_eight_and_one", "Eight and One",
         "Nine shafts at Bone Wells. Eight are on the roster and drawn from "
         "daily. The ninth is on the survey, has never been on the roster, "
         "and the camp is laid out so that nobody faces it.",
         [reach("to_the_camp", "Reach the diggers' camp at Bone Wells.",
                "bone_wells_diggers_camp"),
          talk("hear_sefa", "Hear why Sefa was posted out here.",
               "water_warden_sefa"),
          flagged("the_roster", "See the roster and the survey side by side.",
                  "ninthwell_roster_seen")],
         xp=90, reputation={"the_water_wardens": 12},
         on_complete=[set_flag("ninthwell_asked")]),

    link("ninthwell_the_milepost_vault", "The Milepost Vault",
         "The crew that sank the nine came up the Sunken Road, and the Sunken "
         "Road has vaults under its mileposts that the caravanserai has been "
         "storing barley in for two hundred years.",
         [reach("at_the_vault", "Find the vault under the milepost.",
                "sunken_road_milepost_vault"),
          flagged("the_survey", "Read what the original survey counts.",
                  "ninthwell_survey_read"),
          talk("tell_sefa", "Take the survey back to Sefa.",
               "water_warden_sefa")],
         xp=110, reputation={"the_water_wardens": 10, "the_library": 8},
         on_complete=[set_flag("ninthwell_survey_known")]),

    link("ninthwell_down_the_ninth", "Down the Ninth",
         "The survey does not say the ninth failed to find water. It says the "
         "ninth was sunk to a depth, which is a different kind of sentence, "
         "and it gives the depth.",
         xp=170,
         stages=[
             stage("go_down", "Down the ninth shaft",
                   "Four hundred feet of dressed stone in a desert, sunk by "
                   "people who knew exactly how far down they were going.",
                   [reach("in_the_well", "Get down the ninth well.",
                          "bone_wells_the_ninth")],
                   journal="ninthwell_journal_down"),
             stage("the_bottom", "What is at the depth",
                   "Eight wells were sunk for water. This one was sunk for "
                   "something else.",
                   [kill("kill_salt", "Put down what is at the bottom.",
                         "salt_thing")],
                   on_complete=[set_flag("ninthwell_thing_down")],
                   journal="ninthwell_journal_bottom"),
         ],
         reputation={"the_water_wardens": 15}),

    link("ninthwell_cap_it_or_open_it", "Cap It or Open It",
         "There is water at the bottom of the ninth after all — a great deal "
         "of it, under everything, and Vashta Qal has been rationing one "
         "spring for four hundred years.",
         [flagged("open_it", "Put the ninth on the roster.",
                  "ninthwell_opened", optional=True),
          flagged("cap_it", "Cap the ninth and say nothing.",
                  "ninthwell_capped", optional=True),
          resolved_either_way("settled", "Settle what happens to the water.",
                              ["ninthwell_opened", "ninthwell_capped"])],
         ordered=False, xp=130,
         items=[("fulgurite_lens", 1)],
         on_complete=[
             either("ninthwell_opened",
                    [deed("spring_served"), rep("the_water_wardens", 28),
                     rep("the_library", 10), set_flag("ninthwell_on_roster")],
                    [rep("the_water_wardens", 12), rep("the_keepers", 15),
                     set_flag("ninthwell_capped_quietly")]),
         ]),
], act="act3", region="glasslands", giver="water_warden_sefa", level=6)


ARCS = [
    arc("the_ninth_well", "The Ninth Well",
        "Nine shafts sunk in one season by one crew, eight of them on the "
        "roster, and a camp laid out for four hundred years so that nobody "
        "faces the other one.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("ninthwell_sefa_talk", "greet", [
        node("greet", [
            "The camp is eleven tents arranged in a crescent, and the open "
            "side of the crescent faces east, away from a ninth wellhead that "
            "nobody has mentioned. Sefa is sitting in the open side of it "
            "facing the wrong way. \"You came from the road.\"",
        ], redirects=[
            ({"quests": [{"quest": "ninthwell_the_milepost_vault",
                          "status": "active"}],
              "flags": [{"flag": "ninthwell_survey_read", "equals": True}]},
             "about_the_survey"),
            ({"flags": [{"flag": "ninthwell_thing_down", "equals": True}],
              "without": {"flags": [{"flag": "ninthwell_opened"},
                                    {"flag": "ninthwell_capped"}]}},
             "cap_or_open"),
        ], options=[
            take_job("nine_shafts", "There are nine shafts and eight ropes.",
                     "ninthwell_eight_and_one", "the_roster_and_the_survey",
                     requires=ACT_GATES["act3"]),
            option("posted", "Why is a water warden out here?",
                   goto="posted"),
            option("leave", "Nothing."),
        ]),

        node("posted", [
            "\"I asked a question in writing,\" says Sefa. \"That is the "
            "whole of it. In Vashta Qal a question in writing goes into the "
            "record and the record is read, which is the finest thing about "
            "the office and the reason I am four days into a desert.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_roster_and_the_survey", [
            "She has them both out before you have finished asking, which "
            "tells you how long she has been waiting for somebody to ask.",
            "\"The survey, from the sinking: nine shafts, one crew, one "
            "season.\" She sets the other beside it. \"The roster, from the "
            "season after and every season since: eight. Not eight and a "
            "failure. Eight.\"",
        ], on_enter=[set_flag("ninthwell_roster_seen")],
         options=[
            option("dry", "Perhaps it came up dry.", goto="not_dry"),
        ]),

        node("not_dry", [
            "\"A dry shaft is written down as dry,\" says Sefa. \"There are "
            "four dry shafts on this survey at other sites and every one of "
            "them says *dry*, because a dry shaft is four hundred marks of "
            "somebody's money and money gets written down.\"",
            "\"This one says a depth,\" she says. \"That is all it says. And "
            "the camp has been laid out facing away from it for four hundred "
            "years, which is not something anybody decided. It is something "
            "everybody kept doing.\"",
        ], options=[
            take_job("the_original", "Where's the original survey?",
                     "ninthwell_the_milepost_vault", "the_mileposts"),
        ]),

        node("the_mileposts", [
            "\"The crew came up the Sunken Road, and the Sunken Road has "
            "vaults under its mileposts.\" A dry look. \"The caravanserai has "
            "been storing barley in them for two hundred years and will not "
            "have moved anything it did not have to.\"",
        ], options=[option("done", "We'll go and shift some barley.")]),

        node("about_the_survey", [
            "\"You got into the vault.\" Sefa is standing. \"What does the "
            "original say that the copy does not?\"",
        ], options=[
            option("sunk_to", "The ninth was 'sunk to' the depth. Not "
                   "'sunk for' water.", goto="sunk_to", once=True),
        ]),

        node("sunk_to", [
            "Sefa sits back down, slowly. \"*Sunk to*,\" she repeats. \"Then "
            "they were not looking for water and finding none. They were "
            "going to a depth somebody had given them, and they got there, "
            "and they wrote down that they got there.\"",
            "\"And then eight wells fed a town for four hundred years and "
            "nobody put a rope on the ninth.\"",
        ], remembers="spring_served", options=[
            take_job("go_down", "Then we'll go to the depth.",
                     "ninthwell_down_the_ninth", "four_hundred_feet",
                     effects=[rep("the_water_wardens", 8)]),
        ]),

        node("four_hundred_feet", [
            "\"Four hundred feet, dressed the whole way, in a desert.\" Sefa "
            "shakes her head slightly. \"I have spent my life measuring water "
            "out in cupfuls. Somebody spent a season and four hundred marks "
            "going *past* it.\"",
        ], options=[option("done", "Four hundred feet.")]),

        node("cap_or_open", [
            "Sefa has been at the wellhead since you came up and has not "
            "looked away from it. \"There is water,\" she says. \"Under "
            "everything. It was under everything the whole time.\"",
            "\"I can put the ninth on the roster,\" she says. \"Vashta Qal "
            "stops rationing inside a year, the Glass Quarter doubles, and "
            "the wardens' office becomes an office about *distribution* "
            "rather than about scarcity, which is a thing I would like to see "
            "before I die.\"",
            "\"Or I cap it,\" she says. \"Because eight wells were enough for "
            "four hundred years, and the crew that sank nine went to a depth "
            "somebody gave them, and I have spent four days looking at what "
            "was down there and I am no longer certain the roster was an "
            "accident.\"",
        ], options=[
            option("open", "Put it on the roster.", goto="opened", once=True,
                   effects=[set_flag("ninthwell_opened")]),
            option("cap", "Cap it. Eight was enough.", goto="capped",
                   once=True, effects=[set_flag("ninthwell_capped")]),
        ]),

        node("opened", [
            "The rope goes on in the spring and the first draw is clear and "
            "cold and tastes of nothing at all. Sefa writes the ninth onto the "
            "roster in her own hand and the entry is the ninth line on a page "
            "that has had eight for four hundred years.",
        ], remembers="spring_served", options=[option("done", "Nine.")]),

        node("capped", [
            "They cap it with four feet of dressed stone and a course of "
            "brick, and Sefa has the camp turned to face it, which she says "
            "is the only part of this anybody will remember to keep doing.",
        ], options=[option("done", "Facing it.")]),
    ]),
]


pool("ninthwell_journal_down",
     "Four hundred feet of dressed stone in a desert, sunk by people who knew "
     "how far down they were going.",
     "A dry shaft is written down as dry. This one is written down as a "
     "depth.",
     "Eleven tents in a crescent with the open side facing east for four "
     "hundred years.")

pool("ninthwell_journal_bottom",
     "Eight wells were sunk for water. This one was sunk to a number.",
     "Nine hundred years of pan salt, and it takes the water out of whatever "
     "it is on.",
     "They got to the depth, and they wrote down that they got there, and "
     "then they went home.")
