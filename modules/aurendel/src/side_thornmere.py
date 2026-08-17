"""The Drowned Bell — a Thornmere side chain, Act II.

The old church at Drowned Bell went under in one night in the year six-eleven,
and the new tower was built four hundred yards inland by people who had learnt
something. The bell went down with it. The bell has been heard since. The
ringers at the new tower will not discuss this and get noticeably worse at not
discussing it the longer you stand there.

Thornmere has no roads. It has a hundred and six pole-ferrymen who know which
channels are where this week, and everything that crosses the marsh crosses
because they said so. Gost is one of them and has lost two poles and a cousin
to the black water since Harvest.

This is the chain that fills `dungeon_drowned` — eleven dungeons across three
regions that were authored, given seven room templates each, and never once
turned on.
"""
from questkit import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from sidekit import chain, link, ACT_GATES
from prose import pool

KEY = "bell"


NPCS = [
    npc("ferryman_gost", "Gost of the Channels",
        "Knows which channels are where this week, which is the whole "
        "profession. Has lost two poles and a cousin to the black water since "
        "Harvest and mentions the poles.",
        faction="the_ferrymen", dialogue_id="bell_gost_talk",
        home="stiltmarket_the_pole", disposition=8, gullibility=0.35,
        memory_span=250, cares=["channel_kept", "bell_rung"],
        offers=["bell_the_new_tower"],
        shop=shop("salvors_stock", buys=("treasure", "material"),
                  multiplier=1.25,
                  requires={"factions": [{"faction": "the_ferrymen",
                                          "minStanding": 10}]})),
]


POI_TRIGGERS = {
    "black_water_sunken_hall": [{
        "id": "bell_in_the_sunken_hall", "mode": "once", "on": "enter",
        "description": "A hall with its roof above the water and its floor a "
                       "long way under it.",
        "effects": [{"setFlag": {"flag": "bell_hall_found", "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("bell_the_new_tower", "The New Tower",
         "Gost has lost two poles and a cousin since Harvest, all three in "
         "the same reach, and all three on nights the ringers say nothing at "
         "all was rung.",
         [reach("to_the_tower", "Get up to the new tower at Drowned Bell.",
                "drowned_bell_new_tower"),
          talk("ask_gost", "Ask Gost what the ringers will not discuss.",
               "ferryman_gost"),
          flagged("the_ringers", "Hear what the ringers deny.",
                  "bell_ringers_asked")],
         xp=55, reputation={"the_ferrymen": 10},
         on_complete=[set_flag("bell_tower_asked")]),

    link("bell_the_black_water", "The Black Water",
         "Everything Gost has lost went in the same reach, and the reach has "
         "a hall in it with its roof out of the water, which nobody built "
         "there.",
         [reach("into_the_black", "Get out into the Black Water.",
                "black_water_sunken_hall"),
          flagged("the_hall", "See what is standing in the reach.",
                  "bell_hall_found"),
          talk("tell_gost", "Take it back to Gost.", "ferryman_gost")],
         xp=70, reputation={"the_ferrymen": 8},
         on_complete=[set_flag("bell_hall_known")]),

    link("bell_the_old_church", "The Old Church",
         "The hall in the black water is four hundred yards from where the "
         "old church went down, and the marsh has been quietly moving one of "
         "them towards the other.",
         xp=105,
         stages=[
             stage("go_out", "Out to the old church",
                   "Roof above, floor a long way under, and the tower still "
                   "standing because it was built to.",
                   [reach("at_the_church", "Reach the old church.",
                          "drowned_bell_the_old_church")],
                   journal="bell_journal_church"),
             stage("the_bell", "What has been ringing it",
                   "One note, under the water, and it is in your chest before "
                   "it is in your ears.",
                   [kill("kill_bell", "Silence what rings the bell.",
                         "bell_shade")],
                   on_complete=[set_flag("bell_shade_down")],
                   journal="bell_journal_shade"),
         ],
         reputation={"the_ferrymen": 14}),

    link("bell_raise_or_sink", "Raise It or Sink It",
         "The bell is still down there and it is still bell-bronze, and there "
         "are two entirely reasonable things to do about that.",
         [flagged("sink_it", "Sink it properly and mark the reach.",
                  "bell_sunk", optional=True),
          flagged("raise_it", "Raise it for the new tower.",
                  "bell_raised", optional=True),
          resolved_either_way("settled", "Settle what happens to the bell.",
                              ["bell_sunk", "bell_raised"])],
         ordered=False, xp=80,
         items=[("bell_bronze_mace", 1)],
         on_complete=[
             either("bell_raised",
                    [deed("bell_rung"), rep("the_ferrymen", -20),
                     rep("the_crown", 12), set_flag("bell_in_the_new_tower")],
                    [deed("channel_kept"), rep("the_ferrymen", 28),
                     set_flag("bell_marked_the_reach")]),
         ]),
], act="act2", region="thornmere", giver="ferryman_gost", level=4)


ARCS = [
    arc("the_drowned_bell", "The Drowned Bell",
        "A church that went under in one night in the year six-eleven, a "
        "tower built four hundred yards inland by people who had learnt "
        "something, and a bell that has been heard since.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("bell_gost_talk", "greet", [
        node("greet", [
            "The Pole is a stilt-house with one room and forty poles in it, "
            "racked by length. Gost is whipping the end of a new one and does "
            "not stop. \"Crossing, or asking?\"",
        ], redirects=[
            ({"quests": [{"quest": "bell_the_black_water", "status": "active"}],
              "flags": [{"flag": "bell_hall_found", "equals": True}]},
             "about_the_hall"),
            ({"flags": [{"flag": "bell_shade_down", "equals": True}],
              "without": {"flags": [{"flag": "bell_sunk"},
                                    {"flag": "bell_raised"}]}},
             "raise_or_sink"),
        ], options=[
            take_job("asking", "Asking. You've lost people.",
                     "bell_the_new_tower", "two_poles",
                     requires=ACT_GATES["act2"]),
            option("the_channels", "How does anybody live out here?",
                   goto="the_channels"),
            option("leave", "Crossing."),
        ]),

        node("the_channels", [
            "\"By knowing where the channels are this week,\" says Gost, "
            "\"and they are not where they were last week, and there is no "
            "map because a map would be a lie by Highsun.\" He tests the "
            "whipping. \"A hundred and six of us. Everything that crosses "
            "this marsh crosses because one of us said so.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("two_poles", [
            "\"Two poles and a cousin since Harvest.\" He says it evenly and "
            "the evenness is the tell. \"Same reach all three times. Off the "
            "black water, north of the causeway, where there is nothing to be "
            "lost to.\"",
        ], options=[
            option("what_night", "What did the three nights have in common?",
                   goto="the_bell"),
        ]),

        node("the_bell", [
            "Gost puts the pole down. \"They heard the bell,\" he says. \"All "
            "three. My cousin said so to my face at noon and was gone by "
            "morning.\"",
            "\"And the ringers at the new tower will tell you nothing was "
            "rung on any of those three nights, and they will be telling the "
            "truth, and they will get worse at telling it the longer you "
            "stand there.\"",
        ], options=[
            option("go_ask", "We'll go and stand there.", goto="go_ask",
                   once=True, effects=[set_flag("bell_ringers_asked")]),
        ]),

        node("go_ask", [
            "The ringers are three brothers and a widow and they answer for "
            "eleven minutes without once saying the word bell, which takes a "
            "kind of skill. Then the widow says: \"It is not ours. Ours is in "
            "the tower. The one they hear is the old one and it is four "
            "hundred yards out under the water.\"",
        ], options=[
            take_job("out_there", "Then we're going out there.",
                     "bell_the_black_water", "the_reach"),
        ]),

        node("the_reach", [
            "\"North of the causeway, and take a pole even if you cannot use "
            "one,\" says Gost. \"There is a hall out there with its roof "
            "above the water and nobody built a hall in the black water. It "
            "has *arrived*.\"",
        ], options=[option("done", "We'll take a pole.")]),

        node("about_the_hall", [
            "\"You got to it.\" Gost has the good grace to look surprised. "
            "\"How far off the church is it?\"",
        ], options=[
            option("four_hundred", "Four hundred yards. And closing.",
                   goto="closing", once=True),
        ]),

        node("closing", [
            "\"Closing,\" Gost repeats. \"A hall does not close on a church.\" "
            "He is quiet for a moment. \"Unless the marsh is moving one of "
            "them, and the marsh moves what it is told to and it is not told "
            "by me.\"",
        ], remembers="channel_kept", options=[
            take_job("the_church", "Then we go to the church.",
                     "bell_the_old_church", "at_the_low",
                     effects=[rep("the_ferrymen", 5)]),
        ]),

        node("at_the_low", [
            "\"Go at the low and go quiet,\" says Gost. \"The tower is still "
            "up. It was built to be still up. Whatever is in it has had four "
            "hundred years of nobody coming.\"",
        ], options=[option("done", "Quiet, then.")]),

        node("raise_or_sink", [
            "Gost has poled out himself, which the hundred and six do not do "
            "for anybody, and is sitting in the flat looking at the tower. "
            "\"Quiet,\" he says. \"First time in my life.\"",
            "\"The bell's still down there and it is still bell-bronze, which "
            "is worth more than this whole village.\" He does not sound "
            "tempted. \"The new tower would take it, and Aurenhal would pay "
            "for the raising, and there would be a bell in a tower again, "
            "which is a thing people want.\"",
            "\"Or we sink her properly, in the deep channel, and I hang "
            "markers off her, and there is a bell on the bottom of the black "
            "water that tolls when the tide runs — and every ferryman for a "
            "hundred years knows exactly where he is in the dark.\"",
        ], options=[
            option("sink", "Sink her. Mark the reach.", goto="sunk",
                   once=True, effects=[set_flag("bell_sunk")]),
            option("raise", "Raise her. A tower should have a bell.",
                   goto="raised", once=True,
                   effects=[set_flag("bell_raised"), give("old_coin", 35)]),
        ]),

        node("sunk", [
            "It takes eleven of them two days and the markers go on at the "
            "end of the second, and that night, on the run of the tide, "
            "something under the black water makes one low note and Gost "
            "stops poling to listen to it like a man hearing his own name.",
        ], remembers="channel_kept", options=[option("done", "There she is.")]),

        node("raised", [
            "She comes up on the third day, green to the crown and perfectly "
            "sound, and goes into the new tower before Highsun. Gost is not "
            "at the hanging. Nor are the other hundred and five.",
        ], remembers="bell_rung", options=[option("done", "...")]),
    ]),
]


pool("bell_journal_church",
     "Roof above the water and floor a long way under it, and the tower still "
     "standing because it was built to be.",
     "Four hundred yards from a hall that nobody built out here, and the two "
     "of them are closing.",
     "Go at the low and go quiet. It has had four hundred years of nobody "
     "coming.")

pool("bell_journal_shade",
     "One note, under the water, and it is in your chest before it is in your "
     "ears.",
     "Two poles and a cousin since Harvest, all three in this reach, all "
     "three on nights nothing was rung.",
     "The ringers were telling the truth. Theirs is in the tower.")
