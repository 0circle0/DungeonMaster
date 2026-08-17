"""The Hermit of the Beeches — a Duskwood side chain, Act II.

Wend has lived in the Hollow Beeches for forty-one years and the moot has let
him, on the understanding that he leaves the thorn alone and tells them if
anything changes. Something has changed. He has been telling them for two
years and Elderhollow has been busy.

This runs beside the Thornward route rather than through it: the same forest,
the same moot, and a problem the moot has not got to. A party that has already
laid or broken the Thornward will find Wend has heard about it — the Keepers
never forget a ward, and the memory rules say so in `factions.py`.

The branch is fire or grafting, and it is a real choice rather than a good
option and a bad one. Fire ends it in an afternoon and takes four hundred
years of the Greenway with it.
"""
from dmkit.quests import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way, set_flag,
    rep, deed, either, node, option, take_job, dialogue, npc,
)
from acts import chain, link, ACT_GATES
from dmkit.prose import pool

KEY = "beeches"


NPCS = [
    npc("hermit_wend", "Wend of the Beeches",
        "Forty-one years in a hollow tree, on the understanding that he "
        "leaves the thorn alone and says if anything changes. It changed two "
        "years ago.",
        faction="the_keepers", dialogue_id="beeches_wend_talk",
        home="hollow_beeches_hermit", disposition=10, gullibility=0.4,
        memory_span=365, cares=["ward_broken", "ward_restored"],
        offers=["beeches_what_wend_has_been_saying"]),
]


POI_TRIGGERS = {
    "hollow_beeches_root_cellar": [{
        "id": "beeches_in_the_cellar", "mode": "once", "on": "enter",
        "description": "Not a cellar. A hole somebody dug, with a tree grown "
                       "into it.",
        "effects": [{"setFlag": {"flag": "beeches_cellar_seen", "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("beeches_what_wend_has_been_saying", "What Wend Has Been Saying",
         "Two years of messages to Elderhollow about the beeches moving, and "
         "two years of the moot having something more pressing on.",
         [reach("to_the_hermit", "Find the hermit in the Hollow Beeches.",
                "hollow_beeches_hermit"),
          talk("hear_wend", "Hear what he has been trying to tell the moot.",
               "hermit_wend"),
          flagged("the_ring_count", "Count the ring with him.",
                  "beeches_counted")],
         xp=55, reputation={"the_keepers": 8},
         on_complete=[set_flag("beeches_wend_heard")]),

    link("beeches_the_root_cellar", "The Root Cellar",
         "There is a cellar under the King, which is the largest of the "
         "beeches, and Wend says it is not a cellar and never was.",
         [reach("in_the_cellar", "Get into the root cellar.",
                "hollow_beeches_root_cellar"),
          flagged("what_it_is", "See what the tree grew around.",
                  "beeches_cellar_seen"),
          talk("tell_wend", "Take it back to Wend.", "hermit_wend")],
         xp=65, reputation={"the_keepers": 8},
         on_complete=[set_flag("beeches_cellar_known")]),

    link("beeches_the_deadfall", "The Deadfall",
         "Whatever was put in that hole was put in it by people who then "
         "planted a wood on top, and the wood has been doing the job since. "
         "One of them has stopped.",
         xp=90,
         stages=[
             stage("the_ride", "Out along the Thornback Ride",
                   "The narrows, and then the deadfall, which is where the "
                   "foresters stopped working and did not write down why.",
                   [reach("at_the_deadfall", "Reach the Deadfall Cave.",
                          "thornback_ride_deadfall_cave")],
                   journal="beeches_journal_ride"),
             stage("the_hollow", "What the beech grew around",
                   "Four hundred years growing round a hole somebody dug, and "
                   "it has taken the shape of what it grew around.",
                   [kill("kill_beech", "Put down the Hollow Beech.",
                         "beech_hollow")],
                   on_complete=[set_flag("beeches_hollow_down")],
                   journal="beeches_journal_hollow"),
         ],
         reputation={"the_keepers": 12}),

    link("beeches_fire_or_graft", "Fire or Graft",
         "It can be burnt out in an afternoon, and the Greenway is four "
         "hundred years old and joined at the root.",
         [flagged("graft_it", "Graft the ring back and let it close slowly.",
                  "beeches_grafted", optional=True),
          flagged("burn_it", "Burn the deadfall out.",
                  "beeches_burnt", optional=True),
          resolved_either_way("settled", "Settle what happens to the ring.",
                              ["beeches_grafted", "beeches_burnt"])],
         ordered=False, xp=70,
         items=[("greenway_charm", 1)],
         on_complete=[
             either("beeches_burnt",
                    [deed("ward_broken"), rep("the_keepers", -18),
                     set_flag("beeches_ring_burnt")],
                    [deed("ward_restored"), rep("the_keepers", 22),
                     set_flag("beeches_ring_grafted")]),
         ]),
], act="act2", region="duskwood", giver="hermit_wend", level=4)


ARCS = [
    arc("the_hermit_of_the_beeches", "The Hermit of the Beeches",
        "Two years of a man in a tree telling the moot that the wood is "
        "moving, and two years of the moot having something more pressing on.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("beeches_wend_talk", "greet", [
        node("greet", [
            "The King is eleven feet through at the base and Wend lives in "
            "the side of it. He does not come out. \"You'll be from the "
            "moot,\" he says, from inside the tree. \"Finally.\"",
        ], redirects=[
            ({"memories": [{"deedKind": "ward_broken", "who": "speaker"}]},
             "he_has_heard"),
            ({"quests": [{"quest": "beeches_the_root_cellar", "status": "active"}],
              "flags": [{"flag": "beeches_cellar_seen", "equals": True}]},
             "about_the_cellar"),
            ({"flags": [{"flag": "beeches_hollow_down", "equals": True}],
              "without": {"flags": [{"flag": "beeches_grafted"},
                                    {"flag": "beeches_burnt"}]}},
             "fire_or_graft"),
        ], options=[
            take_job("not_from_moot", "We're not from the moot.",
                     "beeches_what_wend_has_been_saying", "two_years",
                     requires=ACT_GATES["act2"]),
            option("forty_one", "Forty-one years in a tree?", goto="forty_one"),
            option("leave", "Nothing."),
        ]),

        node("forty_one", [
            "\"Forty-one in this one. Two in a worse one down the ride before "
            "the moot decided I was going to be a fixture and moved me "
            "somewhere with a roof.\" A dry sound that might be a laugh. "
            "\"The tree is the roof.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("two_years", [
            "\"Two years I've been sending word to Elderhollow that the "
            "beeches are moving, and two years they've had something more "
            "pressing on, and I have read about what they've had on and they "
            "are not wrong.\" A pause. \"They are also not here.\"",
        ], options=[
            option("moving_how", "Moving how?", goto="the_ring"),
        ]),

        node("the_ring", [
            "\"There's a ring of them. Nine, if you count the King, and you "
            "should.\" He shifts, and the tree shifts. \"Count them "
            "yourself, from the west. I've done it every spring for forty-one "
            "years and last spring there were eight.\"",
        ], options=[
            option("count", "Then we'll count them.", goto="counted",
                   once=True, effects=[set_flag("beeches_counted")]),
        ]),

        node("counted", [
            "Eight, from the west, and a gap where a ninth stood with the "
            "ground still healed over it. Something did not fall. Something "
            "*left*.",
            "\"Eight,\" says Wend, when you come back. \"And you'll want the "
            "cellar under this one, which is not a cellar and never was.\"",
        ], options=[
            take_job("the_cellar", "Show us the cellar.",
                     "beeches_the_root_cellar", "down_there"),
            option("later", "Later.", goto="greet"),
        ]),

        node("down_there", [
            "\"Down there, and mind the root — it's grown across at head "
            "height and it does not give.\" He is quiet a moment. \"It's not "
            "a cellar. It's a hole somebody dug, and the tree came after.\"",
        ], options=[option("done", "We'll look.")]),

        node("about_the_cellar", [
            "\"You've been down.\" Wend sounds older. \"Say what's cut in "
            "the sill.\"",
        ], options=[
            option("the_nine", "Nine marks. One of them scratched out.",
                   goto="planted", once=True),
        ]),

        node("planted", [
            "\"Nine,\" he says. \"So it was nine holes and nine trees, and "
            "the trees are the lids.\" The tree creaks around him. \"Somebody "
            "planted a wood on top of nine of something and the ninth lid has "
            "walked off down the Thornback Ride.\"",
        ], remembers="ward_restored", options=[
            take_job("go_after_it", "Then we'll go after it.",
                     "beeches_the_deadfall", "the_ride"),
        ]),

        node("the_ride", [
            "\"Past the narrows and out to the deadfall, where the foresters "
            "stopped working in my grandfather's time and did not write down "
            "why.\" A pause. \"I know why. So will you.\"",
        ], options=[option("done", "We'll go.")]),

        node("fire_or_graft", [
            "\"It's down,\" says Wend, and does not sound pleased, exactly. "
            "\"Now the part I have been dreading for two years.\"",
            "\"Burn the deadfall and it is finished this afternoon and the "
            "Greenway goes with it — four hundred years, joined at the root, "
            "all of it one tree that has been pretending to be a hundred. Or "
            "graft the ring back and it closes over in about ninety years, "
            "which is a length of time I am personally not able to offer "
            "you.\"",
        ], options=[
            option("graft", "Graft it. Ninety years is fine.",
                   goto="grafted", once=True,
                   effects=[set_flag("beeches_grafted")]),
            option("burn", "Burn it. We don't have ninety years.",
                   goto="burnt", once=True,
                   effects=[set_flag("beeches_burnt")]),
        ]),

        node("grafted", [
            "It takes eleven days and most of them are spent waiting. At the "
            "end of it the ring is nine again, and the ninth is a whip of "
            "green the thickness of your thumb, and Wend looks at it the way "
            "other men look at a child.",
        ], remembers="ward_restored", options=[option("done", "It'll hold.")]),

        node("burnt", [
            "It goes up in an afternoon and the smoke is visible from "
            "Elderhollow, which is nine miles. Wend watches from the King "
            "until the light goes, and then he goes inside and does not come "
            "out again while you are there.",
        ], remembers="ward_broken", options=[option("done", "It's finished.")]),

        node("he_has_heard", [
            "The tree does not answer for a while. \"I heard about the "
            "ward,\" says Wend, eventually. \"Elderhollow is slow about a "
            "great many things and was not slow about that.\"",
        ], options=[
            option("explain", "It had to come down.", goto="greet",
                   effects=[rep("the_keepers", -3)]),
            option("leave", "Nothing."),
        ]),
    ]),
]


pool("beeches_journal_ride",
     "Past the narrows and out to the deadfall, where the foresters stopped "
     "working and did not write down why.",
     "Eight beeches from the west and a gap where the ninth stood, with the "
     "ground healed over.",
     "Something did not fall. Something left.")

pool("beeches_journal_hollow",
     "Four hundred years growing round a hole somebody dug, and it has taken "
     "the shape of what it grew around.",
     "Nine holes and nine trees, and the trees are the lids.",
     "It is a very long way from the ring and it has been walking the whole "
     "time.")
