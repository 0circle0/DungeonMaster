"""The Last Cairn — a Frostmere side chain, Act III.

The Ice Moot keeps eleven hundred cairns across the White Reach and counts
them from one: the Last Cairn, out past the wind-scoured flats, which is the
oldest and the largest and the one every other cairn is measured against. It
has been counted from for nine hundred years and opened by nobody.

This spring the glacier gave back a body with a moot-mark on it, forty miles
from where a moot-marked body ought to be, and Ottir has stopped sleeping.

It is the Keepers' habit kept eleven hundred miles from anybody who would call
it that — `the_ice_moot` relates to `the_keepers` at 0.4, so a party that has
been restoring wards all game arrives here already trusted, and a party that
has been breaking them arrives to a very short conversation.
"""
from dmkit.quests import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way, set_flag,
    rep, deed, either, node, option, take_job, dialogue, npc, shop,
)
from acts import chain, link, ACT_GATES
from dmkit.prose import pool

KEY = "lastcairn"


NPCS = [
    npc("moot_stone_ottir", "Ottir, Stone-Setter",
        "Knows which stone goes where across eleven hundred cairns and has "
        "not slept properly since the glacier gave one back.",
        faction="the_ice_moot", dialogue_id="lastcairn_ottir_talk",
        home="cairnhold_the_cairns", disposition=10, gullibility=0.3,
        memory_span=365, cares=["cairn_set", "ice_broken", "ward_broken",
                                "ward_restored"],
        offers=["lastcairn_what_the_ice_gave_back"],
        shop=shop("keeper_stock", buys=("treasure", "ward"), multiplier=1.3,
                  requires={"factions": [{"faction": "the_ice_moot",
                                          "minStanding": 15}]})),
]


POI_TRIGGERS = {
    "white_reach_frozen_ship": [{
        "id": "lastcairn_at_the_ship", "mode": "once", "on": "enter",
        "description": "A ship in the middle of the ice, and which way it is "
                       "pointed.",
        "effects": [{"setFlag": {"flag": "lastcairn_ship_found",
                                 "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("lastcairn_what_the_ice_gave_back", "What the Ice Gave Back",
         "The glacier gave back a body this spring with a moot-mark cut into "
         "the shoulder, forty miles from anywhere a moot-marked body has any "
         "business being.",
         [reach("to_the_cairns", "Reach the cairns at Cairnhold.",
                "cairnhold_the_cairns"),
          talk("hear_ottir", "Hear what the ice gave back.",
               "moot_stone_ottir"),
          flagged("the_mark", "See the mark on the shoulder.",
                  "lastcairn_mark_seen")],
         xp=90, reputation={"the_ice_moot": 12},
         on_complete=[set_flag("lastcairn_body_seen")]),

    link("lastcairn_the_frozen_ship", "The Frozen Ship",
         "A body in a glacier came off the top of it, and the top of the "
         "White Reach has one thing on it that anybody has ever found: a ship, "
         "in the middle of the ice, forty miles from water.",
         [reach("out_on_the_ice", "Find the frozen ship on the White Reach.",
                "white_reach_frozen_ship"),
          flagged("which_way", "See which way she is pointed.",
                  "lastcairn_ship_found"),
          talk("tell_ottir", "Take the bearing back to Ottir.",
               "moot_stone_ottir")],
         xp=110, reputation={"the_ice_moot": 10},
         on_complete=[set_flag("lastcairn_bearing_known")]),

    link("lastcairn_under_the_last_cairn", "Under the Last Cairn",
         "Eleven hundred cairns, counted from one, and the ship is pointed "
         "straight at it. The Ice Moot has been measuring nine hundred years "
         "of work against a thing it has never once opened.",
         xp=175,
         stages=[
             stage("out_past_the_flats", "Out past the flats",
                   "Four days from the last roof, and the last day of it "
                   "into the wind.",
                   [reach("at_the_cairn", "Reach the Last Cairn.",
                          "last_cairn_the_hollow")],
                   journal="lastcairn_journal_out"),
             stage("what_it_held", "What it has been holding",
                   "Nine hundred years of counting from a thing nobody has "
                   "opened, and one very good reason for that.",
                   [kill("kill_cairn", "Put down what the Last Cairn held.",
                         "cairn_thing")],
                   on_complete=[set_flag("lastcairn_thing_down")],
                   journal="lastcairn_journal_thing"),
         ],
         reputation={"the_ice_moot": 15, "the_keepers": 10}),

    link("lastcairn_set_it_or_move_it", "Set It or Move It",
         "The cairn can be set back exactly as it was, which is nine hundred "
         "years of practice. It can also be moved, which the moot has never "
         "done and has a word for.",
         [flagged("set_it", "Set the Last Cairn back as it was.",
                  "lastcairn_set", optional=True),
          flagged("move_it", "Move the count to a new first cairn.",
                  "lastcairn_moved", optional=True),
          resolved_either_way("settled", "Settle what the moot counts from.",
                              ["lastcairn_set", "lastcairn_moved"])],
         ordered=False, xp=135,
         items=[("rimeward_coat", 1)],
         on_complete=[
             either("lastcairn_moved",
                    [deed("ice_broken"), rep("the_ice_moot", -18),
                     rep("the_library", 15), set_flag("lastcairn_recounted")],
                    [deed("cairn_set"), rep("the_ice_moot", 30),
                     rep("the_keepers", 12), set_flag("lastcairn_stands")]),
         ]),
], act="act3", region="frostmere", giver="moot_stone_ottir", level=6)


ARCS = [
    arc("the_last_cairn", "The Last Cairn",
        "Eleven hundred cairns counted from one, for nine hundred years, by "
        "people who have never once opened it.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("lastcairn_ottir_talk", "greet", [
        node("greet", [
            "The cairns run up the slope above Cairnhold in an order that is "
            "not the order they were built in. Ottir is at the lowest of "
            "them, holding a stone he has not set. \"You've come a long "
            "way.\"",
        ], redirects=[
            ({"memories": [{"deedKind": "ward_broken", "who": "speaker"}]},
             "he_has_heard"),
            ({"quests": [{"quest": "lastcairn_the_frozen_ship",
                          "status": "active"}],
              "flags": [{"flag": "lastcairn_ship_found", "equals": True}]},
             "about_the_ship"),
            ({"flags": [{"flag": "lastcairn_thing_down", "equals": True}],
              "without": {"flags": [{"flag": "lastcairn_set"},
                                    {"flag": "lastcairn_moved"}]}},
             "set_or_move"),
        ], options=[
            take_job("the_stone", "You've been holding that stone a while.",
                     "lastcairn_what_the_ice_gave_back", "the_body",
                     requires=ACT_GATES["act3"]),
            option("the_moot", "What is the Ice Moot?", goto="the_moot"),
            option("leave", "Nothing."),
        ]),

        node("the_moot", [
            "\"Eleven hundred cairns from here to the Last, and somebody has "
            "to know which stone goes where.\" He turns the stone over. "
            "\"Down south they call it the Keepers and make it sound like an "
            "order. Up here it is four families and a great deal of walking.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_body", [
            "\"The ice gave one back in the spring,\" says Ottir. \"They do "
            "that. It takes what it takes and gives it back forty years "
            "later a mile downhill and we set a cairn and that is the whole "
            "of the arrangement.\"",
            "\"This one had a moot-mark cut in the shoulder,\" he says. \"Ours. "
            "Cut by us. And it came out of the ice forty miles from anywhere a "
            "marked man has any business being.\"",
        ], options=[
            option("see_it", "Show us the mark.", goto="the_mark", once=True,
                   effects=[set_flag("lastcairn_mark_seen")]),
        ]),

        node("the_mark", [
            "The mark is a stone-setter's, four strokes, and Ottir reads it "
            "the way you would read a signature. \"Nine hundred years old, "
            "near enough. And he was going *up*.\"",
            "\"There is one thing on the top of the White Reach anybody has "
            "ever found,\" he says. \"A ship. In the middle of the ice, forty "
            "miles from water, and nobody has ever been able to say a useful "
            "thing about it.\"",
        ], options=[
            take_job("go_up", "We'll go and look at your ship.",
                     "lastcairn_the_frozen_ship", "which_way"),
        ]),

        node("which_way", [
            "\"Look at which way she is pointed,\" says Ottir. \"That is the "
            "only question I have ever wanted answered about her and I am "
            "sixty-one and I am not walking it again.\"",
        ], options=[option("done", "Which way she's pointed.")]),

        node("about_the_ship", [
            "Ottir sets the stone down, finally, on the wrong cairn. \"Which "
            "way?\"",
        ], options=[
            option("the_bearing", "South-west. Straight at the Last Cairn.",
                   goto="the_bearing", once=True),
        ]),

        node("the_bearing", [
            "\"At the Last,\" says Ottir, and does not say anything else for "
            "a while.",
            "\"We count from the Last. Eleven hundred cairns and every one of "
            "them set by measure from that one, for nine hundred years.\" He "
            "picks the stone back up. \"And in nine hundred years not one of "
            "us has opened it, and I have never once heard anybody say why "
            "not, and I have realised this spring that I never asked.\"",
        ], remembers="cairn_set", options=[
            take_job("open_it", "Then we'll ask it.",
                     "lastcairn_under_the_last_cairn", "four_days",
                     effects=[rep("the_ice_moot", 8)]),
        ]),

        node("four_days", [
            "\"Four days from the last roof and the last day into the wind,\" "
            "says Ottir. \"Take the coats. Not yours — ours. I will not have "
            "somebody die of the walk on my account and then be given back in "
            "forty years for somebody else to set.\"",
        ], options=[option("done", "We'll take the coats.")]),

        node("set_or_move", [
            "Ottir has walked the four days after all. He is standing at the "
            "hollow with his hands in his sleeves looking at what is left of "
            "the biggest cairn on the continent. \"So that is why,\" he says.",
            "\"I can set it back,\" he says. \"Exactly as it was, and I am "
            "the only man alive who can, and eleven hundred cairns go on "
            "meaning what they have always meant.\"",
            "\"Or we move the count. Make the first cairn the first cairn — "
            "Cairnhold, where the people are — and re-measure eleven hundred "
            "of them over about forty years, and write down what was actually "
            "in this one so nobody has to find out like this again.\" A long "
            "breath. \"The moot has a word for moving the count and it is not "
            "a kind one.\"",
        ], options=[
            option("set", "Set it back. You're the only one who can.",
                   goto="set_back", once=True,
                   effects=[set_flag("lastcairn_set")]),
            option("move", "Move the count. Write it down.",
                   goto="moved", once=True,
                   effects=[set_flag("lastcairn_moved")]),
        ]),

        node("set_back", [
            "It takes him nine days and he will not let anybody hand him a "
            "stone. At the end of it the Last Cairn is the Last Cairn, and "
            "you would not know, and that is the entire point of him.",
        ], remembers="cairn_set", options=[option("done", "It stands.")]),

        node("moved", [
            "He writes it out that night in a hand that has set stones for "
            "forty years and held a pen for very few of them, and in the "
            "spring the moot begins re-measuring eleven hundred cairns from "
            "the wrong end, complaining, for the next forty years.",
        ], remembers="ice_broken", options=[option("done", "From the people.")]),

        node("he_has_heard", [
            "Ottir does not stop what he is doing. \"Word came up the ice "
            "road about a ward,\" he says. \"It takes a season to get here "
            "and it got here.\"",
        ], options=[
            option("explain", "It had to come down.", goto="greet",
                   effects=[rep("the_ice_moot", -5)]),
            option("leave", "Nothing."),
        ]),
    ]),
]


pool("lastcairn_journal_out",
     "Four days from the last roof, and the last day of it into the wind.",
     "Eleven hundred cairns, and every one of them measured from this.",
     "In nine hundred years nobody has opened it and nobody has written down "
     "why not.")

pool("lastcairn_journal_thing",
     "The biggest cairn on the continent, and the one thing under it that the "
     "count was keeping in.",
     "A ship in the middle of the ice, forty miles from water, pointed "
     "straight at this.",
     "He was going up, nine hundred years ago, with a stone-setter's mark on "
     "his shoulder.")
