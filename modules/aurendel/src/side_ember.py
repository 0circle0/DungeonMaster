"""The Throat — an Ember Reach side chain, Act II.

The Great Vent has gone quiet. Cinderhold has eleven people whose entire office
is knowing what that means, and they are believed, because the two times they
were not there is a village under the ash.

Ilka is the youngest of the eleven and the only one prepared to say the word
out loud, which is that a vent that goes quiet is not a vent that has finished.
The foundry has forty tons of ore in the shed and a contract with Karn Dolur,
and the Reach runs on the foundry.

The branch is that, exactly: heed the reading and stop the works, or keep the
ore moving and hope the eleven are wrong for the third time in nine hundred
years. Neither faction is villainous. One of them is going to be wrong.
"""
from questkit import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from sidekit import chain, link, ACT_GATES
from prose import pool

KEY = "throat"


NPCS = [
    npc("vent_reader_ilka", "Ilka of the Eleven",
        "Youngest of the vent-readers by nineteen years, and the only one of "
        "them willing to say out loud what the chain is doing.",
        faction="the_vent_readers", dialogue_id="throat_ilka_talk",
        home="cinderhold_vent_readers", disposition=8, gullibility=0.25,
        memory_span=280, cares=["vent_heeded", "warning_ignored"],
        offers=["throat_gone_quiet"],
        shop=shop("keeper_stock", buys=("treasure", "material"),
                  multiplier=1.3,
                  requires={"factions": [{"faction": "the_vent_readers",
                                          "minStanding": 12}]})),
]


POI_TRIGGERS = {
    "firewatch_ridge_signal_deep": [{
        "id": "throat_in_the_signal_deep", "mode": "once", "on": "enter",
        "description": "Nine hundred years of readings, cut into the wall in "
                       "order.",
        "effects": [{"setFlag": {"flag": "throat_readings_found",
                                 "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("throat_gone_quiet", "Gone Quiet",
         "The chain over the Great Vent has hung still for eleven days. It "
         "has never hung still for more than two.",
         [reach("to_the_chain", "Get out to the chain over the Great Vent.",
                "vent_fields_the_chain"),
          talk("hear_ilka", "Hear what the eleven make of it.",
               "vent_reader_ilka"),
          flagged("the_still_chain", "See the chain for yourself.",
                  "throat_chain_seen")],
         xp=55, reputation={"the_vent_readers": 10},
         on_complete=[set_flag("throat_quiet_known")]),

    link("throat_the_signal_deep", "The Signal Deep",
         "The readers have kept every reading since the hold was cut, and "
         "they kept them in the one place nobody would think to burn: a "
         "gallery under the firewatch towers, with the numbers on the wall.",
         [reach("under_the_towers", "Find the Signal Deep under Firewatch "
                "Ridge.", "firewatch_ridge_signal_deep"),
          flagged("the_readings", "Read what the wall has been saying.",
                  "throat_readings_found"),
          talk("tell_ilka", "Take the two matching years back to Ilka.",
               "vent_reader_ilka")],
         xp=70, reputation={"the_vent_readers": 10},
         on_complete=[set_flag("throat_readings_known")]),

    link("throat_down_the_throat", "Down the Throat",
         "Twice in nine hundred years the chain has hung still, and both "
         "times the wall says the same thing was in the throat, and both "
         "times somebody went down and stopped it.",
         xp=105,
         stages=[
             stage("go_down", "Into the Throat",
                   "Nobody has been down the Throat in four hundred years and "
                   "the last one who did left the rope.",
                   [reach("in_the_throat", "Get down into the Throat.",
                          "vent_fields_the_throat")],
                   journal="throat_journal_down"),
             stage("the_thing", "What has been keeping it quiet",
                   "Nine hundred years of the vent going gently, and the "
                   "reason it went gently.",
                   [kill("kill_wyrm", "Put down what is in the Throat.",
                         "vent_wyrm")],
                   on_complete=[set_flag("throat_wyrm_down")],
                   journal="throat_journal_wyrm"),
         ],
         reputation={"the_vent_readers": 14}),

    link("throat_heed_or_haul", "Heed It or Haul It",
         "The chain is moving again and the reading is worse than it was. "
         "There are forty tons of ore in the foundry shed and a contract with "
         "Karn Dolur under them.",
         [flagged("sound_it", "Sound the reading and stop the works.",
                  "throat_heeded", optional=True),
          flagged("keep_hauling", "Let the foundry finish the contract.",
                  "throat_hauled", optional=True),
          resolved_either_way("called", "Make the call.",
                              ["throat_heeded", "throat_hauled"])],
         ordered=False, xp=80,
         items=[("cinder_cloak", 1)],
         on_complete=[
             either("throat_hauled",
                    [deed("warning_ignored"), rep("the_vent_readers", -22),
                     rep("karn_dolur", 18), set_flag("throat_ore_moved")],
                    [deed("vent_heeded"), rep("the_vent_readers", 28),
                     rep("karn_dolur", -10), set_flag("throat_works_stopped")]),
         ]),
], act="act2", region="ember_reach", giver="vent_reader_ilka", level=5)


ARCS = [
    arc("the_throat", "The Throat",
        "Eleven days of a chain hanging still that has never hung still for "
        "more than two, and eleven people whose whole office is knowing what "
        "that means.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("throat_ilka_talk", "greet", [
        node("greet", [
            "The readers' room has one window, facing the vent fields, and a "
            "board under it with eleven days of nothing written on it. Ilka "
            "is looking at the board rather than the window. \"You have come "
            "about the chain.\"",
        ], redirects=[
            ({"quests": [{"quest": "throat_the_signal_deep", "status": "active"}],
              "flags": [{"flag": "throat_readings_found", "equals": True}]},
             "about_the_readings"),
            ({"flags": [{"flag": "throat_wyrm_down", "equals": True}],
              "without": {"flags": [{"flag": "throat_heeded"},
                                    {"flag": "throat_hauled"}]}},
             "heed_or_haul"),
        ], options=[
            take_job("the_chain", "What chain?", "throat_gone_quiet",
                     "eleven_days",
                     requires=ACT_GATES["act2"]),
            option("the_eleven", "Who are the eleven?", goto="the_eleven"),
            option("leave", "Nothing."),
        ]),

        node("the_eleven", [
            "\"We watch what the ground is doing and we are believed,\" says "
            "Ilka, \"which is a strange thing to be paid for and I would not "
            "swap it.\" She does not look away from the board. \"We are "
            "believed because twice we were not, and both times there is a "
            "village under the ash. You can walk on the roofs of one of them "
            "at Ashfall.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("eleven_days", [
            "\"There is a chain across the Great Vent. Iron, two hundred "
            "feet, hung in the year the hold was cut.\" She taps the board. "
            "\"It moves. It has moved every day for nine hundred years, "
            "because the vent breathes and the chain hangs in the breath.\"",
            "\"It has hung still for eleven days,\" says Ilka. \"The longest "
            "before this was two.\"",
        ], options=[
            option("and_that_means", "And that means?", goto="not_finished"),
        ]),

        node("not_finished", [
            "\"That it has stopped breathing out,\" she says. \"Which is not "
            "the same as having finished. The other nine will not put that in "
            "writing and I will.\" She finally turns round. \"Go and look at "
            "it. I want somebody who is not one of the eleven to have stood "
            "under it.\"",
        ], options=[
            option("go", "We'll stand under it.", goto="go_out", once=True,
                   effects=[set_flag("throat_chain_seen")]),
        ]),

        node("go_out", [
            "Two hundred feet of iron across a hole with no bottom in it, and "
            "not one link of it is moving. The air over the vent is cold, "
            "which on the Ember Reach is the wrong way round for everything.",
            "\"Cold,\" says Ilka, when you tell her. \"Then it is drawing in. "
            "And there are two years on the wall at the Signal Deep where "
            "somebody wrote exactly that.\"",
        ], options=[
            take_job("the_deep", "Where's the Signal Deep?",
                     "throat_the_signal_deep", "under_the_towers"),
        ]),

        node("under_the_towers", [
            "\"Under the firewatch towers, and you will not find it from the "
            "ridge path — it is behind the fallen tower and it is meant to be "
            "difficult.\" A thin smile. \"Nine hundred years of readings cut "
            "into a wall, in the one place on the Reach that will not burn.\"",
        ], options=[option("done", "Behind the fallen tower.")]),

        node("about_the_readings", [
            "\"You found the wall.\" Ilka is standing now. \"Which two "
            "years?\"",
        ], options=[
            option("two_years", "Year one-ninety, and year six-forty. Both "
                   "say cold, and both say still.", goto="both_times", once=True),
        ]),

        node("both_times", [
            "\"Both times somebody went down the Throat,\" says Ilka, \"and "
            "both times the chain moved again inside a month, and neither of "
            "them wrote down what was down there.\" She is very still. "
            "\"Which I have always taken as a courtesy to whoever went next.\"",
        ], remembers="vent_heeded", options=[
            take_job("go_down", "Then we're whoever goes next.",
                     "throat_down_the_throat", "the_rope",
                     effects=[rep("the_vent_readers", 6)]),
        ]),

        node("the_rope", [
            "\"The last one left the rope,\" says Ilka. \"Four hundred years "
            "ago. Do not use the rope.\"",
        ], options=[option("done", "We'll bring our own.")]),

        node("heed_or_haul", [
            "The board has a figure on it again, and Ilka has been standing in "
            "front of it long enough that somebody has brought her a chair she "
            "has not sat in. \"It is breathing,\" she says. \"Harder than the "
            "wall has ever recorded, and I would rather it were still.\"",
            "\"I can sound it,\" she says. \"The bell goes, the works stop, "
            "Cinderhold empties down the smoking road inside a day, and if I "
            "am wrong the eleven are ten by Highsun and nobody believes the "
            "ten again.\" A pause. \"Or the foundry finishes the Karn Dolur "
            "contract. Forty tons. Eleven days. And the Reach runs on the "
            "foundry, which is a fact and not an argument.\"",
        ], options=[
            option("sound_it", "Sound it. You've been right twice.",
                   goto="sounded", once=True,
                   effects=[set_flag("throat_heeded")]),
            option("haul", "Let them finish the contract.",
                   goto="hauled", once=True,
                   effects=[set_flag("throat_hauled"),
                            give("hold_silver", 5)]),
        ]),

        node("sounded", [
            "The bell goes at first light and Cinderhold is on the smoking "
            "road by noon with what it can carry, complaining the whole way, "
            "which Ilka says is the sound of it working.",
        ], remembers="vent_heeded", options=[option("done", "Sounded.")]),

        node("hauled", [
            "The ore moves. Ilka writes the reading on the board in full, "
            "signs it, and puts the date on it, which is what a vent-reader "
            "does instead of arguing.",
        ], remembers="warning_ignored", options=[option("done", "...")]),
    ]),
]


pool("throat_journal_down",
     "Nobody has been down the Throat in four hundred years, and the last one "
     "who did left the rope.",
     "The air over the vent is cold, which on the Ember Reach is the wrong "
     "way round for everything.",
     "Two hundred feet of iron across a hole with no bottom, and not one link "
     "moving.")

pool("throat_journal_wyrm",
     "Nine hundred years of the vent going gently, and the reason it went "
     "gently.",
     "Year one-ninety and year six-forty, and neither of them wrote down what "
     "was down here.",
     "Ilka takes that as a courtesy to whoever went next.")
