"""The Dry River — a Sunward Steppe side chain, Act II.

Three Wells has two. The third went in a season, in a place where the horse
road exists because the wells do, and the Ilkhet lines have been watering at
Tallgrass ever since and losing a day each way for it.

The chain runs beside the Kurgan route without touching it: same grass, same
riders, and a problem about water rather than about wards. What it establishes
is the Ilkhet lines as a power in their own right — nine families, eleven
thousand horses, and a grazing right older than the Crown that has never been
written down anywhere the Crown could read it.

The branch is about that last part. The Crown would pay well for a surveyed
route to a working well, and the lines have spent four hundred years making
sure nobody has one.
"""
from questkit import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from sidekit import chain, link, ACT_GATES
from prose import pool

KEY = "dryriver"


NPCS = [
    npc("well_keeper_saray", "Saray of the Wells",
        "Keeps three wells, two of which have water, and has kept the third "
        "swept for nine years on the grounds that it might come back.",
        faction="the_horse_lords", dialogue_id="dryriver_saray_talk",
        home="three_wells_the_wells", disposition=8, gullibility=0.35,
        memory_span=250, cares=["line_ridden", "horse_taken"],
        offers=["dryriver_the_third_well"],
        shop=shop("ratcatchers_stock", buys=("treasure", "material"),
                  multiplier=1.25,
                  requires={"factions": [{"faction": "the_horse_lords",
                                          "minStanding": 10}]})),
]


POI_TRIGGERS = {
    "long_grass_lost_wagons": [{
        "id": "dryriver_at_the_wagons", "mode": "once", "on": "enter",
        "description": "Eleven wagons in a line, and what line they are in.",
        "effects": [{"setFlag": {"flag": "dryriver_wagons_found",
                                 "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("dryriver_the_third_well", "The Third Well",
         "Three Wells has two. The third went in a season nine years ago and "
         "Saray has swept it every month since on the grounds that it might "
         "come back.",
         [reach("at_the_wells", "Reach the wells at Three Wells.",
                "three_wells_the_wells"),
          talk("hear_saray", "Hear what Saray thinks happened to the third.",
               "well_keeper_saray"),
          flagged("the_sweeping", "Look down the dry one.",
                  "dryriver_looked_down")],
         xp=55, reputation={"the_horse_lords": 10},
         on_complete=[set_flag("dryriver_well_seen")]),

    link("dryriver_the_lost_wagons", "The Lost Wagons",
         "Water does not stop. It goes somewhere else. Saray says find where, "
         "and says it in the tone of somebody who already knows and would "
         "rather be told by a stranger.",
         [reach("into_the_grass", "Get out into the Long Grass.",
                "long_grass_lost_wagons"),
          flagged("the_line", "See what line the wagons are in.",
                  "dryriver_wagons_found"),
          talk("tell_saray", "Take the line back to Saray.",
               "well_keeper_saray")],
         xp=65, reputation={"the_horse_lords": 8},
         on_complete=[set_flag("dryriver_line_known")]),

    link("dryriver_down_the_dry_well", "Down the Dry Well",
         "Eleven wagons in a line, pointed at a well that stopped in the same "
         "season, and nothing between the two but grass that grows a "
         "different colour.",
         xp=95,
         stages=[
             stage("go_down", "Down the third well",
                   "Ninety feet of dressed stone, dry to the bottom and dry a "
                   "good way past it.",
                   [reach("in_the_well", "Get down the dry well.",
                          "three_wells_the_dry_well")],
                   journal="dryriver_journal_well"),
             stage("the_bed", "What is in the bed",
                   "The river went somewhere else in somebody's "
                   "great-grandfather's time and something stayed in the bed "
                   "waiting for it.",
                   [kill("kill_shade", "Put down what is holding the water.",
                         "dust_shade")],
                   on_complete=[set_flag("dryriver_shade_down")],
                   journal="dryriver_journal_shade"),
         ],
         reputation={"the_horse_lords": 12}),

    link("dryriver_a_road_or_a_right", "A Road or a Right",
         "The well is coming back, and there is a surveyed route to it in "
         "your hand that the Crown has wanted for four hundred years.",
         [flagged("keep_the_right", "Give the route to the lines.",
                  "dryriver_kept", optional=True),
          flagged("sell_the_road", "Sell the survey to the Crown.",
                  "dryriver_sold", optional=True),
          resolved_either_way("settled", "Settle who has the road.",
                              ["dryriver_kept", "dryriver_sold"])],
         ordered=False, xp=75,
         items=[("horn_bow", 1)],
         on_complete=[
             either("dryriver_sold",
                    [deed("horse_taken"), rep("the_crown", 25),
                     rep("the_horse_lords", -30),
                     set_flag("dryriver_surveyed")],
                    [deed("line_ridden"), rep("the_horse_lords", 28),
                     rep("the_crown", -8), set_flag("dryriver_unwritten")]),
         ]),
], act="act2", region="sunward_steppe", giver="well_keeper_saray", level=4)


ARCS = [
    arc("the_dry_river", "The Dry River",
        "A well that stopped in a season, eleven wagons pointed at it, and "
        "four hundred years of a grazing right that nobody has written down.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("dryriver_saray_talk", "greet", [
        node("greet", [
            "Two of the three wellheads have a rope and a bucket. The third "
            "has a lid, swept clean, with nothing on it. Saray is sitting on "
            "the lid. \"You'll want the two on the left.\"",
        ], redirects=[
            ({"quests": [{"quest": "dryriver_the_lost_wagons", "status": "active"}],
              "flags": [{"flag": "dryriver_wagons_found", "equals": True}]},
             "about_the_wagons"),
            ({"flags": [{"flag": "dryriver_shade_down", "equals": True}],
              "without": {"flags": [{"flag": "dryriver_kept"},
                                    {"flag": "dryriver_sold"}]}},
             "road_or_right"),
        ], options=[
            take_job("the_third", "Why is there a lid on that one?",
                     "dryriver_the_third_well", "nine_years",
                     requires=ACT_GATES["act2"]),
            option("the_lines", "Tell me about the lines.", goto="the_lines"),
            option("leave", "Nothing."),
        ]),

        node("the_lines", [
            "\"Nine families and eleven thousand horses, and a right to the "
            "grass that is older than the man in Aurenhal who keeps asking to "
            "see it.\" She does not get off the lid. \"It has never been "
            "written down. That is not carelessness.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("nine_years", [
            "\"Because it is dry and I would rather nobody fell down it.\" A "
            "pause that goes on a beat too long. \"Nine years. Went in a "
            "season — full in Highsun, mud by Harvest, dust by the spring. "
            "Wells do not do that.\"",
        ], options=[
            option("what_do_they_do", "What do they do?", goto="what_wells_do"),
        ]),

        node("what_wells_do", [
            "\"They go slowly, over a lifetime, and you know a year in "
            "advance and you dig another one.\" She gets off the lid. \"This "
            "one was *taken*. And the lines have watered at Tallgrass since, "
            "which is a day each way, which over nine years is a great deal "
            "of somebody's life.\"",
        ], options=[
            option("look", "We'll look down it.", goto="look_down", once=True,
                   effects=[set_flag("dryriver_looked_down")]),
        ]),

        node("look_down", [
            "Ninety feet of dressed stone, dry to the bottom, and the "
            "bottom is not the bottom — there is a cut in the side of the "
            "shaft at about eighty, going east, and it was not made by "
            "anybody sinking a well.",
            "\"East,\" says Saray, when you tell her. \"Everything about this "
            "is east.\"",
        ], options=[
            take_job("follow_east", "What's east?", "dryriver_the_lost_wagons",
                     "the_grass"),
        ]),

        node("the_grass", [
            "\"Out in the Long Grass there are wagons. Eleven of them, in a "
            "line, and they have been there since before the wells.\" She "
            "looks east, which from here is a great deal of nothing. \"Nobody "
            "goes and looks at them because there is nothing out there to go "
            "and look at them *for*.\"",
        ], options=[option("done", "There is now.")]),

        node("about_the_wagons", [
            "\"You found them.\" Saray is already unrolling a hide with a map "
            "scratched on it that she has clearly had for years. \"What line "
            "are they in?\"",
        ], options=[
            option("the_line", "Straight at the dry well. All eleven.",
                   goto="the_bed", once=True),
        ]),

        node("the_bed", [
            "\"Then that is a river,\" says Saray. \"That is a river bed with "
            "wagons stopped in it where the ford was, and it ran west into my "
            "well until something sat down in it.\" She rolls the hide back "
            "up. \"Nine years I have swept that lid.\"",
        ], remembers="line_ridden", options=[
            take_job("go_down", "We'll go down and see what's sitting in it.",
                     "dryriver_down_the_dry_well", "at_eighty",
                     effects=[rep("the_horse_lords", 5)]),
        ]),

        node("at_eighty", [
            "\"The cut at eighty feet, going east. Take rope and take more "
            "than you think.\" A flat look. \"And take water. I am aware of "
            "how that sounds.\"",
        ], options=[option("done", "Rope and water.")]),

        node("road_or_right", [
            "There is an inch of water in the bottom of the third well and "
            "Saray has been looking at it for some time. \"It will be back by "
            "Highsun,\" she says. \"Which is the good news, and you are about "
            "to hear the rest.\"",
            "\"You walked that bed. You have the line of it — where the ford "
            "was, where the wagons stopped, where the water goes.\" She looks "
            "up. \"That is a surveyed road to a working well across grass the "
            "Crown has wanted a road across since before there was a Crown. "
            "They will pay you properly for it. I am not going to pretend "
            "they will not.\"",
        ], options=[
            option("keep", "It's yours. It stays unwritten.",
                   goto="kept", once=True,
                   effects=[set_flag("dryriver_kept")]),
            option("sell", "Aurenhal will pay for this.",
                   goto="sold", once=True,
                   effects=[set_flag("dryriver_sold"), give("old_coin", 40)]),
        ]),

        node("kept", [
            "She burns the tracing in the well-head fire, which takes a long "
            "time because you drew it carefully, and neither of you says "
            "anything while it goes.",
        ], remembers="line_ridden", options=[option("done", "Unwritten.")]),

        node("sold", [
            "Saray does not argue and does not stop you, and that is worse "
            "than either. \"They will make it a post road,\" she says, "
            "\"and the post road will have a toll on it, and the toll will be "
            "on us.\" She sits back down on the lid.",
        ], remembers="horse_taken", options=[option("done", "...")]),
    ]),
]


pool("dryriver_journal_well",
     "Ninety feet of dressed stone, dry to the bottom and dry a good way past "
     "it.",
     "There is a cut in the side of the shaft at about eighty, going east, "
     "and no well-sinker made it.",
     "Nine years of sweeping a lid on the grounds that it might come back.")

pool("dryriver_journal_shade",
     "A river bed with eleven wagons stopped in it where the ford used to be.",
     "It went somewhere else in somebody's great-grandfather's time, and "
     "something stayed in the bed waiting for it.",
     "Grit off two hundred miles of open grass, at the speed the grass grew "
     "used to.")
