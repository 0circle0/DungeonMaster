"""The Cut — a Skarnspine side chain, Act II.

The Weirwater goes into the ground at the swallet below the corrie lake and
comes out eleven miles down at the head of the Kingsvale, and it has done that
for as long as anybody has been counting. This spring it came out red for nine
days and then stopped coming out at all for two.

Karn Dolur cares because the Hold's water comes off the same mountain and the
Hold has nine hundred years of ledgers about exactly that. Hulf keeps the pass
ward on the Hold's behalf and has been told to find out without making it the
Hold's problem, which is the sort of instruction that arrives with a purse.

The branch is the Skarnspine argument in miniature: the galleries can be sealed
behind you, or they can be left open as the road under the pass that the
muleteers have wanted for two centuries and the Hold has refused for the same
two centuries.
"""
from questkit import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from sidekit import chain, link, ACT_GATES
from prose import pool

KEY = "thecut"


NPCS = [
    npc("pass_warden_hulf", "Hulf, Warden of the Pass",
        "Keeps the Highpass ward on the Hold's behalf, holds the Hold's "
        "ledger of what the mountain's water has done since the year eleven, "
        "and has been told to sort this out without it becoming the Hold's "
        "problem.",
        faction="karn_dolur", dialogue_id="thecut_hulf_talk",
        home="highpass_ward", disposition=5, gullibility=0.2,
        memory_span=300, cares=["hold_honoured", "deep_door_opened"],
        offers=["thecut_the_red_water"],
        shop=shop("keeper_stock", buys=("treasure", "material"),
                  multiplier=1.3,
                  requires={"factions": [{"faction": "karn_dolur",
                                          "minStanding": 12}]})),
]


POI_TRIGGERS = {
    "weirwater_head_corrie_lake": [{
        "id": "thecut_at_the_lake", "mode": "once", "on": "enter",
        "description": "The colour of it, and how far down the colour goes.",
        "effects": [{"setFlag": {"flag": "thecut_lake_seen", "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("thecut_the_red_water", "The Red Water",
         "Nine days red, then two days of nothing at all, and eleven miles "
         "down the Kingsvale drinks whatever this mountain decides to send "
         "it.",
         [reach("up_to_the_lake", "Climb to the corrie lake.",
                "weirwater_head_corrie_lake"),
          flagged("the_colour", "See how far down the colour goes.",
                  "thecut_lake_seen"),
          talk("tell_hulf", "Take it back to Hulf at the ward.",
               "pass_warden_hulf")],
         xp=55, reputation={"karn_dolur": 10},
         on_complete=[set_flag("thecut_water_seen")]),

    link("thecut_the_galleries", "The Quarry Galleries",
         "The Cut was quarried for the Hold road and the galleries run back "
         "into the mountain further than the road ever needed. Something has "
         "come down them as far as the toll ruin.",
         xp=70,
         stages=[
             stage("get_in", "Into the galleries",
                   "Driven for stone, and driven a great deal further than "
                   "stone accounts for.",
                   [reach("in_the_galleries", "Get into the quarry galleries.",
                          "the_cut_quarry_galleries")],
                   journal="thecut_journal_galleries"),
             stage("clear", "What has come down them",
                   "Grey, slow, and walking a circuit it did not choose.",
                   [kill("the_walkers", "Clear the galleries.",
                         "hollow_walker", count=2)],
                   on_complete=[set_flag("thecut_galleries_cleared")],
                   journal="thecut_journal_walkers"),
         ],
         reputation={"karn_dolur": 8}),

    link("thecut_the_sink", "The Sink",
         "The galleries and the swallet are the same hole approached from two "
         "sides, and the Hold's ledgers have said so since the year eleven "
         "without anybody putting the two pages together.",
         xp=100,
         stages=[
             stage("down_the_sink", "Down the sink",
                   "Where the Weirwater goes in, and where for two days this "
                   "spring it did not.",
                   [reach("in_the_sink", "Get down into the Sink.",
                          "weirwater_head_sink")],
                   journal="thecut_journal_sink"),
             stage("what_is_in_it", "What has never needed to leave",
                   "In goes at the swallet, out eleven miles down. Something "
                   "in between has never had a reason to do either.",
                   [kill("kill_sink", "Put down what is in the Sink.",
                         "sink_thing")],
                   on_complete=[set_flag("thecut_sink_cleared")],
                   journal="thecut_journal_thing"),
         ],
         reputation={"karn_dolur": 12}),

    link("thecut_seal_or_road", "Seal It or Open It",
         "The galleries come out on the far side of the pass, which the "
         "muleteers have wanted for two hundred years and the Hold has "
         "refused for the same two hundred.",
         [flagged("seal_it", "Seal the galleries behind you.",
                  "thecut_sealed", optional=True),
          flagged("open_the_road", "Leave the under-road open.",
                  "thecut_opened", optional=True),
          resolved_either_way("settled", "Settle what happens to the Cut.",
                              ["thecut_sealed", "thecut_opened"])],
         ordered=False, xp=80,
         items=[("hold_hammer", 1)],
         on_complete=[
             either("thecut_opened",
                    [rep("the_crown", 18), rep("karn_dolur", -25),
                     set_flag("thecut_under_road")],
                    [deed("hold_honoured"), rep("karn_dolur", 28),
                     set_flag("thecut_shut")]),
         ]),
], act="act2", region="skarnspine", giver="pass_warden_hulf", level=4)


ARCS = [
    arc("the_cut", "The Cut",
        "Nine days of red water, two days of none, and nine hundred years of "
        "ledgers with the answer on two pages nobody had put together.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("thecut_hulf_talk", "greet", [
        node("greet", [
            "The ward is a wall across the pass with a gate in it and a room "
            "beside the gate, and Hulf is in the room with a ledger open at a "
            "page dated to the year eleven. \"Through, or business?\"",
        ], redirects=[
            ({"quests": [{"quest": "thecut_the_red_water", "status": "active"}],
              "flags": [{"flag": "thecut_lake_seen", "equals": True}]},
             "about_the_lake"),
            ({"flags": [{"flag": "thecut_sink_cleared", "equals": True}],
              "without": {"flags": [{"flag": "thecut_sealed"},
                                    {"flag": "thecut_opened"}]}},
             "seal_or_open"),
        ], options=[
            take_job("business", "Business. What's wrong with your water?",
                     "thecut_the_red_water", "nine_days",
                     requires=ACT_GATES["act2"]),
            option("the_ledger", "What's the ledger?", goto="the_ledger"),
            option("leave", "Through."),
        ]),

        node("the_ledger", [
            "\"Every year the mountain's water has done anything but what it "
            "did the year before, since the year eleven.\" He turns it round "
            "without being asked. \"Nine hundred years of a hold writing down "
            "the weather. You may think that is a waste of ink. I have four "
            "entries here that say a village should be moved and it was.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("nine_days", [
            "\"Red for nine days from the swallet, and then two days of "
            "nothing at all coming out down at the head.\" Hulf closes the "
            "ledger on a finger. \"Red is iron and iron is ordinary. Nothing "
            "at all is not ordinary. Nothing at all means it is *going* "
            "somewhere.\"",
        ], options=[
            option("hold", "And the Hold drinks off this mountain.",
                   goto="quietly"),
        ]),

        node("quietly", [
            "\"The Hold drinks off this mountain,\" Hulf agrees, \"and the "
            "Hold has told me to find out about it without it becoming the "
            "Hold's problem, and gave me a purse to help me understand the "
            "distinction.\" He puts the purse on the ledger. \"Go up to the "
            "corrie lake and look at the colour, and mind how far down the "
            "colour goes.\"",
        ], options=[option("done", "We'll go up.")]),

        node("about_the_lake", [
            "\"You went up.\" He has the ledger open again. \"How far down?\"",
        ], options=[
            option("all_of_it", "All of it. It's red to the bottom.",
                   goto="not_the_lake", once=True),
        ]),

        node("not_the_lake", [
            "\"Then it is not the lake,\" says Hulf, and writes. \"A lake "
            "stains from the top. Red to the bottom means it is coming *up* "
            "into the lake from underneath, which means the swallet is not "
            "draining, which means the swallet is *full*.\"",
            "He stops writing. \"And the quarry galleries in the Cut go into "
            "the same mountain from the other side. There are two pages in "
            "this ledger about that and nobody has ever had cause to read "
            "them together.\"",
        ], remembers="hold_honoured", options=[
            take_job("the_galleries", "Then we'll go in from the Cut.",
                     "thecut_the_galleries", "take_a_lamp",
                     effects=[rep("karn_dolur", 5)]),
        ]),

        node("take_a_lamp", [
            "\"Take two lamps and do not carry them together,\" says Hulf. "
            "\"Hold rule, nine hundred years old, and the reason for it is in "
            "the ledger as well.\"",
        ], options=[option("done", "Two lamps.")]),

        node("seal_or_open", [
            "Hulf has walked down to the gallery mouth himself, which he does "
            "not do. \"It is running clear,\" he says. \"Off the swallet, all "
            "the way down. Two days and it is clear.\"",
            "\"Now the part the purse was actually for,\" he says. \"Those "
            "galleries come out the far side of the pass. The muleteers have "
            "wanted an under-road for two hundred years and the Hold has "
            "refused for two hundred, and the reason the Hold gives is that "
            "an open road under a mountain is a door.\" He looks at you. \"I "
            "can have it sealed by Highsun. Or I can not have seen it.\"",
        ], options=[
            option("seal", "Seal it. The Hold is right about doors.",
                   goto="sealed", once=True,
                   effects=[set_flag("thecut_sealed")]),
            option("leave_open", "Leave it. The muleteers have earned a road.",
                   goto="opened", once=True,
                   effects=[set_flag("thecut_opened"), give("hold_silver", 4)]),
        ]),

        node("sealed", [
            "It takes forty men eleven days and the Hold sends every one of "
            "them without being asked twice, which tells you what the Hold "
            "thinks about doors.",
        ], remembers="hold_honoured", options=[option("done", "Sealed.")]),

        node("opened", [
            "\"I have not seen it,\" says Hulf, and writes nothing at all in "
            "the ledger, which for him is the largest thing he has ever done.",
        ], options=[option("done", "Nobody has.")]),
    ]),
]


pool("thecut_journal_galleries",
     "Driven for stone, and driven a great deal further than stone accounts "
     "for.",
     "Two lamps, carried apart. Hold rule, nine hundred years old, and the "
     "reason is in the ledger.",
     "The Cut and the swallet are the same hole from two sides, and two pages "
     "of a ledger have said so since the year eleven.")

pool("thecut_journal_walkers",
     "Grey, slow, and walking a circuit it did not choose.",
     "They have come down as far as the toll ruin, which is further than "
     "anything comes down.",
     "Something upstream stopped being a wall.")

pool("thecut_journal_sink",
     "Where the Weirwater goes in, and where for two days this spring it did "
     "not.",
     "Red to the bottom of the lake means it is coming up into the lake, "
     "which means the swallet is full.",
     "In at the swallet, out eleven miles down. Nobody has ever been the part "
     "in between.")

pool("thecut_journal_thing",
     "It has never had a reason to leave and has not had one since.",
     "Pallid, folded, and a great deal larger than the passage it is in ought "
     "to allow.",
     "The water goes round it. That is what nine days of red was.")
