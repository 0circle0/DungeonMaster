"""The Old Seams — a Karn Dolur side chain, Act III."""
from dmkit.quests import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way, set_flag,
    rep, deed, either, node, option, take_job, dialogue, npc, shop,
)
from acts import chain, link, ACT_GATES
from dmkit.prose import pool

KEY = "seams"


NPCS = [
    npc("measurer_vare", "Vare of the Hall of Measures",
        "Keeps the Hold's standards — the yard, the mark, the fee — and by "
        "extension every decision the Hold has ever declined to revisit.",
        faction="karn_dolur", dialogue_id="seams_vare_talk",
        home="deep_market_hall_of_measures", disposition=5, gullibility=0.15,
        memory_span=365, cares=["hold_honoured", "deep_door_opened"],
        offers=["seams_the_missing_year"],
        shop=shop("deep_stock", buys=("treasure", "material"), multiplier=1.2,
                  requires={"factions": [{"faction": "karn_dolur",
                                          "minStanding": 20}]})),
]


POI_TRIGGERS = {
    "gatehall_the_ledger_stone": [{
        "id": "seams_at_the_ledger_stone", "mode": "once", "on": "enter",
        "description": "Nine hundred years of fees, and the gap in them.",
        "effects": [{"setFlag": {"flag": "seams_gap_found", "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("seams_the_missing_year", "The Missing Year",
         "The Hold writes down the weather. It has not written down which "
         "year it stopped working the old seams, and Vare has spent eleven "
         "years being professionally troubled by that.",
         [reach("to_the_hall", "Reach the Hall of Measures.",
                "deep_market_hall_of_measures"),
          talk("hear_vare", "Hear what Vare cannot find.", "measurer_vare"),
          flagged("the_omission", "Understand what an omission means here.",
                  "seams_omission_known")],
         xp=90, reputation={"karn_dolur": 12},
         on_complete=[set_flag("seams_asked")]),

    link("seams_the_ledger_stone", "The Ledger Stone",
         "Every fee the Hold has ever charged is cut into the stone at the "
         "gatehall, in order, and a fee is charged every year without "
         "exception, and Vare would like somebody who is not of the Hold to "
         "go and read it.",
         [reach("at_the_stone", "Get to the ledger stone at the gatehall.",
                "gatehall_the_ledger_stone"),
          flagged("the_gap", "Find the gap in the fees.", "seams_gap_found"),
          talk("tell_vare", "Take the years back to Vare.", "measurer_vare")],
         xp=110, reputation={"karn_dolur": 10},
         on_complete=[set_flag("seams_years_known")]),

    link("seams_into_the_old_workings", "Into the Old Workings",
         "Four years with no fee cut, four hundred years ago, in the middle "
         "of an unbroken run of nine hundred. The Hold did not charge because "
         "the Hold did not open the gate, and it did not open the gate "
         "because of what was in the seams behind it.",
         xp=160,
         stages=[
             stage("get_in", "Into the old seams",
                   "Sealed at the ninth level and not sealed well, which for "
                   "Karn Dolur is the loudest thing in the chain.",
                   [reach("in_the_seams", "Get into the Old Seams.",
                          "forgetiers_old_seams")],
                   journal="seams_journal_in"),
             stage("what_is_in_them", "What stopped the working",
                   "Karn Dolur stopped working these in the year four hundred "
                   "and has never written down which year it stopped for.",
                   [kill("kill_seam", "Put down what is in the old seams.",
                         "seam_thing")],
                   on_complete=[set_flag("seams_thing_down")],
                   journal="seams_journal_thing"),
         ],
         reputation={"karn_dolur": 15}),

    link("seams_cut_it_or_close_it", "Cut It or Close It",
         "Four years are missing from the stone and there is room to cut them "
         "in, and a hold that has been right for nine hundred years has an "
         "opinion about being publicly wrong for four of them.",
         [flagged("cut_the_years", "Cut the four missing years into the "
                  "stone.", "seams_cut", optional=True),
          flagged("close_it_again", "Seal the seams and leave the stone as it "
                  "is.", "seams_closed", optional=True),
          resolved_either_way("settled", "Settle what the Hold admits to.",
                              ["seams_cut", "seams_closed"])],
         ordered=False, xp=120,
         items=[("hold_plate", 1), ("hold_warrant", 1)],
         on_complete=[
             either("seams_cut",
                    [deed("hold_honoured"), rep("karn_dolur", 30),
                     rep("the_library", 12), set_flag("seams_on_the_stone")],
                    [rep("karn_dolur", 20), rep("the_library", -10),
                     set_flag("seams_sealed")]),
         ]),
], act="act3", region="skarnspine", giver="measurer_vare", level=6)


ARCS = [
    arc("the_old_seams", "The Old Seams",
        "Nine hundred years of a hold writing everything down, and four years "
        "in the middle of it that nobody wrote anything about at all.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("seams_vare_talk", "greet", [
        node("greet", [
            "The Hall of Measures is one room with a yard-bar on one wall, a "
            "mark-weight under glass, and eleven hundred fee-tables in "
            "presses. Vare is at the presses. \"You are not here to have "
            "anything measured.\"",
        ], redirects=[
            ({"quests": [{"quest": "seams_the_ledger_stone", "status": "active"}],
              "flags": [{"flag": "seams_gap_found", "equals": True}]},
             "about_the_gap"),
            ({"flags": [{"flag": "seams_thing_down", "equals": True}],
              "without": {"flags": [{"flag": "seams_cut"},
                                    {"flag": "seams_closed"}]}},
             "cut_or_close"),
        ], options=[
            take_job("what_troubles_you", "What are you looking for?",
                     "seams_the_missing_year", "eleven_years",
                     requires=ACT_GATES["act3"]),
            option("the_hall", "What is the Hall of Measures for?",
                   goto="the_hall"),
            option("leave", "Nothing."),
        ]),

        node("the_hall", [
            "\"The yard, the mark, and the fee,\" says Vare. \"Everything the "
            "Hold has decided and does not intend to decide again.\" She "
            "closes a press. \"Which is most things. We are nine hundred "
            "years old and we are principally a list.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("eleven_years", [
            "\"The old seams were worked out and abandoned in the year four "
            "hundred,\" says Vare. \"That is in every account. What is in no "
            "account is which year it stopped *for*.\"",
            "\"We write down the weather,\" she says. \"We have four hundred "
            "entries about a stream. There is no entry about closing a "
            "working that employed nine hundred people. That is not an "
            "omission. Somebody made it.\"",
        ], options=[
            option("so_ask", "So ask the Speaker.", goto="cannot_ask"),
        ]),

        node("cannot_ask", [
            "\"I have asked the Speaker,\" says Vare, \"and the Speaker has "
            "told me, correctly, that the Hall of Measures records decisions "
            "and does not make them.\" A very small pause. \"I am not "
            "permitted to open anything. You are not of the Hold, so there is "
            "nothing you are not permitted to do.\"",
        ], on_enter=[set_flag("seams_omission_known")],
         options=[
            option("where", "Where do we start?", goto="the_stone"),
        ]),

        node("the_stone", [
            "\"The ledger stone, at the gatehall. Every fee the Hold has "
            "charged for the Deep Door, cut in order, one a year for nine "
            "hundred years without exception.\" She looks up. \"Go and read "
            "the four hundreds. Count them.\"",
        ], options=[
            take_job("go", "We'll count them.", "seams_the_ledger_stone",
                     "count_them"),
        ]),

        node("count_them", [
            "\"Count them,\" Vare repeats, \"rather than read what is written "
            "beside them. Everybody reads. Nobody counts.\"",
        ], options=[option("done", "We'll count.")]),

        node("about_the_gap", [
            "Vare has stopped working, which in eleven years the Deep Market "
            "has not seen her do. \"How many?\"",
        ], options=[
            option("four", "Four years. No fee cut at all.",
                   goto="four_years", once=True),
        ]),

        node("four_years", [
            "\"Four,\" says Vare. \"Then for four years the Hold charged "
            "nobody, which means for four years the Hold let nobody through, "
            "which means for four years the gate did not open.\"",
            "She sits down on the press. \"And the old seams run behind that "
            "gate. We did not stop working them because they were worked out. "
            "We stopped because we shut the gate on them, and then we wrote "
            "down that they were worked out.\"",
        ], remembers="hold_honoured", options=[
            take_job("go_in", "Then we'll go and look at what you shut in.",
                     "seams_into_the_old_workings", "ninth_level",
                     effects=[rep("karn_dolur", 8)]),
        ]),

        node("ninth_level", [
            "\"The seals are at the ninth level and they are not good "
            "seals,\" says Vare. \"Which is the loudest thing anybody has "
            "said to me in eleven years. We seal well. Unless we are in a "
            "hurry.\"",
        ], options=[option("done", "The ninth level.")]),

        node("cut_or_close", [
            "\"It is down,\" says Vare, and writes it, because she is who she "
            "is. \"Now the Hold has a choice it has avoided for four hundred "
            "years, and it will not thank either of us for putting it in "
            "front of them.\"",
            "\"There is room on the stone for four years. I can cut them, and "
            "the Hold is publicly wrong about one thing for the first time "
            "since it was founded, and everything else on that stone becomes "
            "worth trusting.\" She looks at the wall. \"Or we seal the seams "
            "properly this time, and the stone says what it has always said, "
            "and I go back to the presses.\"",
        ], options=[
            option("cut", "Cut the years. A list is only worth its worst "
                   "entry.", goto="cut", once=True,
                   effects=[set_flag("seams_cut")]),
            option("close", "Seal it. Nine hundred years is worth "
                   "something too.", goto="closed", once=True,
                   effects=[set_flag("seams_closed")]),
        ]),

        node("cut", [
            "It takes a mason eleven days and the Speaker comes down on the "
            "ninth to watch and says nothing at all. Vare cuts the last "
            "figure herself, badly, and nobody suggests correcting it.",
        ], remembers="hold_honoured", options=[option("done", "It's cut.")]),

        node("closed", [
            "Forty of the Hold seal the ninth level properly this time, which "
            "takes a season, and the stone says what it has always said. Vare "
            "goes back to the presses and is, as far as anybody can tell, "
            "content.",
        ], options=[option("done", "Sealed.")]),
    ]),
]


pool("seams_journal_in",
     "Sealed at the ninth level, and not sealed well, which for Karn Dolur is "
     "shouting.",
     "Nine hundred people worked these and not one entry says why they "
     "stopped.",
     "We seal well. Unless we are in a hurry.")

pool("seams_journal_thing",
     "Four years with no fee cut, in an unbroken run of nine hundred.",
     "For four years the gate did not open, and the old seams run behind the "
     "gate.",
     "It has had four hundred years to get used to the arrangement.")
