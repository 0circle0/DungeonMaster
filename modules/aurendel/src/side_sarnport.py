"""The Ledger and the Light — a Sarnport side chain, Act I.

The Insurers' Hall makes a living being right about how dangerous the sea is,
and for nine years it has been wrong about one headland in a way that is
costing it money. Maun has the losses written down. What she does not have is
anybody willing to go and stand under the Saltcliff Light on a night it is not
lit and find out what is shining.

This is the other half of the coast's argument, told from the room with the
ledger in it, and the two chains can be run in either order or not at all. What
they share is a fact: something has been showing a light off Gannet Head for
ninety years, and the Strand has been blamed for all ninety of them.

The reward is the Pilot's Glass, ground at Vashta Qal and worth more than the
boat it is usually in — two ranks of perception, which is the difference
between finding the fourteen hidden places on this continent and walking past
them.
"""
from questkit import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from sidekit import chain, link, ACT_GATES
from prose import pool

KEY = "saltcliff"


NPCS = [
    npc("underwriter_maun", "Maun, Underwriter",
        "Nine years of losses off one headland, written down in a hand that "
        "gets smaller as the column gets longer.",
        faction="the_countinghouse", dialogue_id="saltcliff_maun_talk",
        home="counting_insurers_hall", disposition=0, gullibility=0.2,
        memory_span=250, cares=["ledger_squared", "ledger_cooked",
                                "wreck_informed"],
        offers=["saltcliff_the_wrong_light"],
        shop=shop("countinghouse_stock", buys=("treasure", "material"),
                  multiplier=1.2,
                  requires={"factions": [{"faction": "the_countinghouse",
                                          "minStanding": 10}]})),

    npc("light_keeper_bry", "Bry, Keeper of the Light",
        "A hundred and ten feet of stair, twice a night, and a logbook he "
        "has stopped showing to the Pilots' Hall.",
        faction="the_countinghouse", dialogue_id="saltcliff_bry_talk",
        home="saltcliff_lighthouse", disposition=8, gullibility=0.35,
        memory_span=200, cares=["ledger_squared", "ledger_cooked"]),
]


POI_TRIGGERS = {
    "counting_harbour_court": [{
        "id": "saltcliff_in_the_court", "mode": "once", "on": "enter",
        "description": "Nine years of findings, and what they have in common.",
        "effects": [{"setFlag": {"flag": "saltcliff_pattern_seen",
                                 "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("saltcliff_the_wrong_light", "The Wrong Light",
         "Four hulls in nine years, all of them insured at the Hall, all of "
         "them certain they had the Saltcliff Light fine on the bow when they "
         "struck. Maun would like somebody to go and ask the keeper.",
         [reach("up_the_rise", "Climb to the Saltcliff Light.",
                "saltcliff_lighthouse"),
          talk("ask_bry", "Ask Bry what his logbook says.", "light_keeper_bry"),
          flagged("the_logbook", "Hear what he has stopped reporting.",
                  "saltcliff_log_read")],
         xp=30, reputation={"the_countinghouse": 8},
         on_complete=[set_flag("saltcliff_light_asked")]),

    link("saltcliff_the_ledger", "The Ledger",
         "Bry's logbook says the light was out on two of the four nights, "
         "which is worse than saying it was lit. The findings of the Harbour "
         "Court will say what the Hall paid and to whom.",
         [reach("in_the_court", "Get into the Harbour Court.",
                "counting_harbour_court"),
          flagged("the_pattern", "Find what the four findings have in common.",
                  "saltcliff_pattern_seen"),
          talk("tell_maun", "Take the pattern back to Maun.",
               "underwriter_maun")],
         xp=35, reputation={"the_countinghouse": 6},
         on_complete=[set_flag("saltcliff_pattern_known")]),

    link("saltcliff_under_the_light", "Under the Light",
         "All four struck within an hour of the low, and the low is when the "
         "chalk workings under the Rise are dry to the back. Something is "
         "getting up to the head from underneath.",
         xp=55,
         stages=[
             stage("go_down", "Into the workings",
                   "Pillar and stall, quarried out to build the town, and the "
                   "town is now standing on the hole.",
                   [reach("in_the_workings", "Get into the Chalk Workings.",
                          "saltcliff_chalk_workings")],
                   journal="saltcliff_journal_workings"),
             stage("the_light", "What has been showing",
                   "Ninety years off one headland, and the lighthouse is not "
                   "it.",
                   [kill("kill_shade", "Put out the light on the point.",
                         "wreck_shade")],
                   on_complete=[set_flag("saltcliff_shade_down")],
                   journal="saltcliff_journal_shade"),
         ],
         reputation={"the_countinghouse": 10}),

    link("saltcliff_the_finding", "The Finding",
         "There is a finding to be written, and what it says decides whether "
         "the Strand has been paying for ninety years of something it did not "
         "do.",
         [flagged("file_it", "File the finding as it stands.",
                  "saltcliff_filed", optional=True),
          flagged("bury_it", "Let the old findings stand.",
                  "saltcliff_buried", optional=True),
          resolved_either_way("written", "See the finding written.",
                              ["saltcliff_filed", "saltcliff_buried"])],
         ordered=False, xp=40,
         items=[("pilots_glass", 1)],
         on_complete=[
             either("saltcliff_buried",
                    # The Hall keeps ninety years of recoveries it should not
                    # have had, and knows it.
                    [rep("the_countinghouse", 15), rep("the_salvors", -20),
                     rep("the_crown", -6), set_flag("saltcliff_stands")],
                    [rep("the_countinghouse", 10), rep("the_salvors", 20),
                     rep("the_crown", 8), set_flag("saltcliff_corrected")]),
         ]),
], act="act1", region="silver_coast", giver="underwriter_maun")


ARCS = [
    arc("the_ledger_and_the_light", "The Ledger and the Light",
        "Four hulls in nine years off one headland, and a hall full of men "
        "who make a living being right about exactly this.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("saltcliff_maun_talk", "greet", [
        node("greet", [
            "The Insurers' Hall is quieter than a temple and better lit. Maun "
            "has a column open in front of her with four entries in it and "
            "does not close it. \"You are not a name on my book.\"",
        ], redirects=[
            ({"quests": [{"quest": "saltcliff_the_ledger", "status": "active"}],
              "flags": [{"flag": "saltcliff_pattern_seen", "equals": True}]},
             "the_hour_of_the_low"),
            ({"flags": [{"flag": "saltcliff_shade_down", "equals": True}],
              "without": {"flags": [{"flag": "saltcliff_filed"},
                                    {"flag": "saltcliff_buried"}]}},
             "the_finding"),
        ], options=[
            take_job("the_column", "What's the column?",
                     "saltcliff_the_wrong_light", "four_hulls",
                     requires=ACT_GATES["act1"]),
            option("the_hall", "What does the Hall do, exactly?",
                   goto="the_hall"),
            option("leave", "Nothing."),
        ]),

        node("the_hall", [
            "\"We are right about how dangerous the sea is, and we are paid "
            "the difference between how dangerous it is and how dangerous "
            "everybody thinks it is.\" She turns a page. \"For nine years I "
            "have been wrong about one headland and it is costing me a great "
            "deal of money.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("four_hulls", [
            "\"Four hulls, nine years, all off Gannet Head, all insured "
            "here.\" She turns the book round. \"And every master off every "
            "one of them swore at the Court that he had the Saltcliff Light "
            "fine on the bow when he struck.\"",
        ], options=[
            option("so_it_was_lit", "Then the light was lit.",
                   goto="that_is_the_trouble"),
        ]),

        node("that_is_the_trouble", [
            "\"That is the trouble,\" says Maun. \"If it was lit, four masters "
            "cannot steer. If it was not lit, the keeper is a liar and the "
            "Hall has been paying out on his word.\" She closes the book. "
            "\"And if it was neither, then I do not know what the fourth "
            "possibility is, and I have been paid nine years to know that "
            "sort of thing.\"",
        ], options=[
            option("go", "We'll go up and ask him.", goto="go_up"),
        ]),

        node("go_up", [
            "\"His name is Bry. He has stopped showing his logbook to the "
            "Pilots' Hall, which they have told me and he has not.\"",
        ], options=[option("done", "We'll climb the stair.")]),

        node("the_hour_of_the_low", [
            "\"You have been in the Court.\" She is already reaching for the "
            "book. \"Say it.\"",
        ], options=[
            option("the_low", "All four struck within an hour of the low "
                   "water.", goto="the_workings", once=True),
        ]),

        node("the_workings", [
            "Maun does not answer for long enough that you can hear the "
            "clock. \"The chalk workings under the Rise are dry to the back "
            "at the low,\" she says. \"They come out on the head. I have "
            "walked past that fact four times in nine years with it written "
            "in my own hand.\"",
        ], remembers="ledger_squared", options=[
            take_job("go_down", "Then we'll go in at the low.",
                     "saltcliff_under_the_light", "at_the_low",
                     effects=[rep("the_countinghouse", 5)]),
        ]),

        node("at_the_low", [
            "\"At the low, and out before the flood,\" says Maun. \"I will "
            "not be underwriting this. I want that understood and I want it "
            "understood kindly.\"",
        ], options=[option("done", "Understood.")]),

        node("the_finding", [
            "\"Then it was not the keeper and it was not the masters.\" Maun "
            "has the pen in her hand and has not written anything. \"Which "
            "means the four findings this Court handed down were wrong, and "
            "every one of them found against the Strand.\"",
            "\"I can file what you found,\" she says. \"The Hall repays "
            "ninety years of recoveries it took off men who did not do it, "
            "and I explain to the Court why I am the one telling them. Or "
            "the findings stand, and nobody is ever told, and the column "
            "closes.\"",
        ], options=[
            option("file", "File it. All of it.", goto="filed", once=True,
                   effects=[set_flag("saltcliff_filed"), deed("ledger_squared"),
                            give("wreck_brass", 2)]),
            option("bury", "Let them stand.", goto="buried", once=True,
                   effects=[set_flag("saltcliff_buried"), deed("ledger_cooked"),
                            give("old_coin", 30)]),
        ]),

        node("filed", [
            "She writes for a long time. At the end of it she blots the page, "
            "reads it back, and says, to nobody: \"Nine years.\"",
        ], remembers="ledger_squared", options=[option("leave", "It's done.")]),

        node("buried", [
            "She closes the column, and pays you out of a drawer rather than "
            "off the book, which is the whole of what she thinks about it.",
        ], remembers="ledger_cooked", options=[option("leave", "Right.")]),
    ]),

    dialogue("saltcliff_bry_talk", "greet", [
        node("greet", [
            "A hundred and ten feet of stair, and Bry is at the top of it "
            "with the fire drawing well and a logbook shut under his elbow. "
            "\"You came up. Most don't.\"",
        ], redirects=[
            ({"quests": [{"quest": "saltcliff_the_wrong_light",
                          "status": "active"}]}, "the_logbook"),
        ], options=[
            option("the_light", "Tell me about the light.", goto="the_light"),
            option("leave", "Nothing."),
        ]),

        node("the_light", [
            "\"Coal, and a following wind, and a stair I go up twice a night "
            "whatever the weather is doing.\" He nods at the fire. \"She has "
            "not been out on my watch in eleven years. Write that down "
            "somewhere the Hall will read it.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_logbook", [
            "\"You're from Maun.\" He takes his elbow off the book, which "
            "takes him a moment. \"Then here it is and I'll not be asked "
            "twice.\"",
            "\"Two of those four nights she was *out*,\" says Bry. \"Coal "
            "wet, wind wrong, out for three hours, and I logged it because I "
            "log it. And on both those nights a ship went onto Gannet Head "
            "steering by a light.\"",
        ], on_enter=[set_flag("saltcliff_log_read")],
         remembers="ledger_squared", options=[
            option("what_light", "Then what were they steering by?",
                   goto="not_mine"),
        ]),

        node("not_mine", [
            "\"Not mine,\" he says, and looks out west at the head, which is "
            "black. \"There is something shows off that point and it is not "
            "mine, and I have stopped saying so at the Pilots' Hall because "
            "of how they look at me.\"",
        ], options=[
            option("thanks", "We believe you.", goto="greet",
                   effects=[rep("the_countinghouse", 4)]),
        ]),
    ]),
]


pool("saltcliff_journal_workings",
     "Pillar and stall, quarried out to build the town, and the town is now "
     "standing on the hole.",
     "Dry to the back at the low and not for long. Out before the flood.",
     "The pillars are not all still there. That is in the Court's findings "
     "too, and nobody read it.")

pool("saltcliff_journal_shade",
     "Ninety years off one headland, and the lighthouse is not it.",
     "Four masters who could steer, and all four of them steering by "
     "something.",
     "Bry has stopped saying so at the Pilots' Hall because of how they look "
     "at him.")
