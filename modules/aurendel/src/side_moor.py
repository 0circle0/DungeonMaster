"""The Diggers' Camp — a Weeping Moor side chain, Act II."""
from dmkit.quests import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from acts import chain, link, ACT_GATES
from dmkit.prose import pool

KEY = "diggers"


NPCS = [
    npc("antiquary_pell", "Pell, Fellow of the Library",
        "A fellow's warrant, a purse, eleven diggers on day rates, and two "
        "letters from the Elderhollow moot that she has filed rather than "
        "answered.",
        faction="the_library", dialogue_id="diggers_pell_talk",
        home="long_barrow_diggers_camp", disposition=5, gullibility=0.3,
        memory_span=250, cares=["library_served", "record_stolen",
                                "barrow_robbed"],
        offers=["diggers_the_west_end"],
        shop=shop("keeper_stock", buys=("treasure",), multiplier=1.35,
                  requires={"factions": [{"faction": "the_library",
                                          "minStanding": 15}]})),
]


POI_TRIGGERS = {
    "long_barrow_the_ridge": [{
        "id": "diggers_on_the_ridge", "mode": "once", "on": "enter",
        "description": "Four hundred feet of it, and the alignment of the "
                       "whole thing.",
        "effects": [{"setFlag": {"flag": "diggers_ridge_walked", "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("diggers_the_west_end", "The West End",
         "Pell has eleven diggers, a fellow's warrant, and a west end that "
         "has started giving things back that were not put in it.",
         xp=55,
         stages=[
             stage("the_camp", "The camp on the ridge",
                   "Eleven on day rates and four of them not turning up.",
                   [reach("at_the_camp", "Reach the diggers' camp.",
                          "long_barrow_diggers_camp")],
                   journal="diggers_journal_camp"),
             stage("clear_it", "What is coming up the cutting",
                   "The spoil heap is on the wrong side of the trench and "
                   "something has been walking it at night.",
                   [kill("the_walkers", "Clear the west cutting.",
                         "hollow_walker", count=2)],
                   on_complete=[set_flag("diggers_west_cleared")],
                   journal="diggers_journal_west"),
             stage("tell_pell", "Tell Pell",
                   "She will want it described rather than summarised.",
                   [talk("report", "Report to Pell.", "antiquary_pell")],
                   journal="diggers_journal_report"),
         ],
         reputation={"the_library": 10},
         on_complete=[set_flag("diggers_west_known")]),

    link("diggers_the_ridge", "The Ridge",
         "Four hundred feet of barrow with two ends, and everything anybody "
         "has ever dug has been at the western one. Pell wants the reason "
         "walked rather than read.",
         [reach("walk_it", "Walk the length of the ridge.",
                "long_barrow_the_ridge"),
          flagged("the_alignment", "See what the barrow is pointed at.",
                  "diggers_ridge_walked"),
          talk("ask_pell", "Ask Pell what lines up with the east end.",
               "antiquary_pell")],
         xp=65, reputation={"the_library": 8},
         on_complete=[set_flag("diggers_alignment_known")]),

    link("diggers_the_east_end", "The East End",
         "The east end was never dug, and it was never dug on purpose, and "
         "the moot has written twice to say which of those two facts is "
         "load-bearing.",
         xp=95,
         stages=[
             stage("open_it", "Open the east end",
                   "Two days with eleven men and it is open in an afternoon "
                   "once they find the kerb.",
                   [reach("into_the_east", "Get into the east end.",
                          "long_barrow_east_end")],
                   journal="diggers_journal_east"),
             stage("what_is_in_it", "Whoever is in it",
                   "Buried facing the other way from everybody else, and "
                   "crowned, which nobody in this parish has ever been.",
                   [kill("kill_wight", "Put down what is in the east end.",
                         "long_barrow_wight")],
                   on_complete=[set_flag("diggers_east_opened")],
                   journal="diggers_journal_wight"),
         ],
         reputation={"the_library": 10}),

    link("diggers_record_or_rebury", "Record or Rebury",
         "It is open, and it can be written down or it can be closed, and "
         "there is not time before the weather to do both properly.",
         [flagged("record_it", "Let the Library have its record.",
                  "diggers_recorded", optional=True),
          flagged("rebury_it", "Close the east end the way the moot asked.",
                  "diggers_reburied", optional=True),
          resolved_either_way("decided", "Decide what the east end becomes.",
                              ["diggers_recorded", "diggers_reburied"])],
         ordered=False, xp=75,
         items=[("torc_of_the_ridge", 1)],
         on_complete=[
             either("diggers_recorded",
                    [deed("library_served"), rep("the_library", 25),
                     rep("the_keepers", -20), set_flag("diggers_on_the_shelf")],
                    [deed("ward_restored"), rep("the_keepers", 25),
                     rep("the_library", -12), set_flag("diggers_closed")]),
         ]),
], act="act2", region="weeping_moor", giver="antiquary_pell", level=4)


ARCS = [
    arc("the_diggers_camp", "The Diggers' Camp",
        "Four hundred feet of barrow with two ends, and four hundred years of "
        "everybody agreeing to dig the same one.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("diggers_pell_talk", "greet", [
        node("greet", [
            "The camp is eleven tents and a trestle with the finds laid out "
            "on it in rows, labelled, in a hand you have seen before on the "
            "fourth gallery. \"Do not touch the trestle,\" says Pell, without "
            "turning round.",
        ], redirects=[
            ({"quests": [{"quest": "diggers_the_ridge", "status": "active"}],
              "flags": [{"flag": "diggers_ridge_walked", "equals": True}]},
             "the_alignment"),
            ({"flags": [{"flag": "diggers_east_opened", "equals": True}],
              "without": {"flags": [{"flag": "diggers_recorded"},
                                    {"flag": "diggers_reburied"}]}},
             "record_or_rebury"),
            ({"memories": [{"deedKind": "record_stolen", "who": "speaker"}]},
             "she_has_heard"),
        ], options=[
            take_job("what_is_this", "What is this dig?",
                     "diggers_the_west_end", "eleven_men",
                     requires=ACT_GATES["act2"]),
            option("the_letters", "The moot has written to you.",
                   goto="the_letters"),
            option("leave", "Nothing."),
        ]),

        node("the_letters", [
            "\"Twice,\" says Pell. \"Politely, both times, and I have filed "
            "both, and I would like it noted that filing is not the same as "
            "ignoring.\" She straightens a label that did not need it. \"They "
            "say the east end is shut for a reason. They do not say the "
            "reason. That is rather the difficulty with the moot.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("eleven_men", [
            "\"Eleven diggers on day rates, a fellow's warrant, and the "
            "largest long barrow west of the Kurgan field.\" She finally "
            "turns round. \"And four of the eleven did not come to work this "
            "morning, which is the part I would like dealt with before I "
            "explain the rest.\"",
        ], options=[
            option("why_not", "Why not?", goto="the_spoil"),
        ]),

        node("the_spoil", [
            "\"Because the spoil heap is on the wrong side of the trench,\" "
            "says Pell, \"and I did not put it there, and neither did they.\" "
            "A precise pause. \"Something has been walking the west cutting "
            "at night and it has been *tidying*.\"",
        ], options=[option("go", "We'll clear the cutting.", goto="go")]),

        node("go", [
            "\"Take the plank road, not the heather. The heather is peat and "
            "the peat is nine feet deep in places and I have lost a barrow in "
            "it already this season.\"",
        ], options=[option("done", "The plank road.")]),

        node("the_alignment", [
            "\"You walked it.\" She has the plan out before you have "
            "answered. \"Then say what the east end is pointed at.\"",
        ], options=[
            option("nine_sisters", "The Nine Sisters. Dead on.",
                   goto="dead_on", once=True),
        ]),

        node("dead_on", [
            "Pell puts a finger on the plan and does not move it for some "
            "time. \"Dead on,\" she agrees. \"Eleven miles, over a rise, to a "
            "stone ring that the Keepers will not discuss either.\" She looks "
            "up. \"Everything anybody has ever dug in this barrow has been at "
            "the *west* end. Four hundred years of us all politely digging "
            "the wrong one.\"",
        ], remembers="library_served", options=[
            take_job("open_it", "Then open the east end.",
                     "diggers_the_east_end", "two_days"),
            option("no", "The moot said no. Twice.", goto="the_letters"),
        ]),

        node("two_days", [
            "\"Two days to find the kerb and an afternoon to be through it,\" "
            "says Pell, already writing. \"I will have the men out. You will "
            "go in first, and I am not pretending that is generosity.\"",
        ], options=[option("done", "We'll go in first.")]),

        node("record_or_rebury", [
            "Pell is sitting on the spoil heap with the plan on her knees and "
            "has not written anything on it. \"Crowned,\" she says. \"Facing "
            "east, when every other body in four hundred feet of this thing "
            "faces west. Do you know what that is worth written down?\"",
            "\"And do you know what it costs,\" she adds, \"because I find I "
            "do. The moot asked twice. If I record it, the fourth gallery has "
            "it by Highsun and every barrow on this moor gets opened by "
            "somebody with a warrant and no manners. If I close it, nobody "
            "ever knows, including me.\"",
        ], options=[
            option("record", "Record it. That's what it's for.",
                   goto="recorded", once=True,
                   effects=[set_flag("diggers_recorded"),
                            give("old_coin", 20)]),
            option("rebury", "Close it. The moot asked twice.",
                   goto="reburied", once=True,
                   effects=[set_flag("diggers_reburied")]),
        ]),

        node("recorded", [
            "She writes for two days and the men fill in behind her as she "
            "goes, which is not the order it is supposed to be done in and is "
            "the only way it gets done before the weather.",
        ], remembers="library_served", options=[option("leave", "It's down.")]),

        node("reburied", [
            "It takes eleven men four days to put back what took them an "
            "afternoon to open, and Pell works the last of it herself with "
            "the plan folded in her coat, unmarked.",
        ], remembers="ward_restored", options=[option("leave", "It's closed.")]),

        node("she_has_heard", [
            "\"You are the one who took something off the fourth gallery,\" "
            "says Pell, and turns a label face down. \"I have eleven men and "
            "a trestle. Do not.\"",
        ], options=[option("leave", "...")]),
    ]),
]


pool("diggers_journal_camp",
     "Eleven tents, a trestle of finds in labelled rows, and four men who did "
     "not come to work this morning.",
     "The plank road, not the heather. The peat is nine feet deep in places.",
     "A fellow's warrant and two letters from the moot, filed rather than "
     "answered.")

pool("diggers_journal_west",
     "The spoil heap is on the wrong side of the trench and nobody put it "
     "there.",
     "Something has been walking the west cutting at night, and it has been "
     "tidying.",
     "Four hundred years of digging the same end of the same barrow.")

pool("diggers_journal_report",
     "Back to the trestle. She will want it described rather than "
     "summarised.",
     "Pell files things. It is not the same as ignoring them and she will say "
     "so.",
     "There are two ends to this barrow and only one of them is on the plan.")

pool("diggers_journal_east",
     "Two days to find the kerb, and an afternoon to be through it.",
     "Never dug, and never dug on purpose, which the moot has written twice "
     "to point out.",
     "Eleven miles east over a rise, and the Nine Sisters standing at the end "
     "of the line.")

pool("diggers_journal_wight",
     "Crowned, and facing east, when every other body in four hundred feet of "
     "this faces west.",
     "Nobody in this parish has ever been crowned. That is rather the point "
     "of the parish.",
     "It has been waiting on the alignment, and the alignment has not moved.")
