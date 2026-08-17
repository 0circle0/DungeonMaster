"""The Unsealing, Act III — the Deeproads, and how it ends.

Five quests under the whole continent, finishing at the ninth door of the Long
Hall — the one that is open, out of two hundred and eleven that are not.

**Nothing here is gated on reputation or on any Act II choice.** The Eleventh
Chamber wants two Ward-Keys and every route yields one however you resolved it,
so a party that antagonised every faction on the continent, broke every ward,
and stole from the Library can still walk to the end. What those choices buy is
which endings *read* differently, who is standing beside you, and what the
epilogue says — never whether you get there.

The three endings are one quest with a `resolved_either_way` objective and an
`if` chain in `onComplete`, because the engine has no branch primitive and this
is what one is built out of.
"""
from dmkit.quests import (
    quest, stage, reach, kill, flagged, resolved_either_way, set_flag, rep,
    deed, either, node, option, take_job, dialogue, npc, shop,
)
from dmkit.prose import pool

# Two of the three, in any combination. `anyOf` is one level deep, which is
# exactly deep enough for this and not deep enough for anything cleverer.
TWO_KEYS = {
    "description": "two of the three ward-keys",
    "anyOf": [
        {"items": [{"item": "grown_key"}, {"item": "cast_key"}]},
        {"items": [{"item": "grown_key"}, {"item": "glass_key"}]},
        {"items": [{"item": "cast_key"}, {"item": "glass_key"}]},
    ],
}


NPCS = [
    npc("wayfinder_sull", "Sull of the Wayfinders",
        "Forty people can get you from Lantern Deep to Karn Dolur and back. "
        "She is the one who will.",
        faction="the_wayfinders", dialogue_id="sull_talk",
        home="lantern_deep_fungus_market", disposition=5, gullibility=0.4,
        memory_span=200, cares=["lantern_lit", "deep_door_opened"],
        offers=["lantern_deep"],
        # Gated, like every other shop in the world: forty people can get you
        # from here to Karn Dolur and the number is not going up, so they do
        # not sell the deep stores to somebody they have not led. `lantern_deep`
        # pays 15, so her own job opens her shelves — which is the shape the
        # rest of the module already uses and the only faction that was missing
        # it.
        shop=shop("deep_stock", multiplier=1.4,
                  requires={"factions": [{"faction": "the_wayfinders",
                                          "minStanding": 10}]})),

    npc("hold_speaker_dath", "Dath, Speaker of the Gate",
        "Nine hundred years of not opening the Deep Door, and he has the "
        "ledger to prove every one of them.",
        faction="karn_dolur", dialogue_id="dath_talk",
        home="gatehall_wardens_hall", disposition=0, gullibility=0.15,
        memory_span=365, cares=["deep_door_opened", "hold_honoured"]),
]


QUESTS = [
    quest(
        "the_way_below", "The Way Below",
        "Every ward on the list is a door in the same wall, and the wall has "
        "a corridor behind it.",
        [resolved_either_way(
            "get_down", "Find a way into the Deeproads.",
            ["down_by_karn_dolur", "down_by_the_tarn", "down_by_the_crater"])],
        xp=300, tags=["act3"],
        # Two routes done, whichever two. Nothing here asks which.
        requires=TWO_KEYS,
        unlocks=["lantern_deep"],
        on_complete=[set_flag("in_the_deeproads")],
    ),

    quest(
        "lantern_deep", "Lantern Deep",
        "Nine hundred people in a cavern, and a lamp hanging over them on a "
        "chain nobody can account for.",
        [reach("reach_the_deep", "Reach Lantern Deep.", "deeproads_lantern_deep"),
         flagged("hear_sull", "Hear what the Wayfinders know about the Lantern.",
                 "lantern_explained")],
        giver="wayfinder_sull", xp=350, tags=["act3"],
        requires={"quests": [{"quest": "the_way_below", "status": "complete"}]},
        reputation={"the_wayfinders": 15},
        unlocks=["the_eleventh_chamber"],
    ),

    quest(
        "the_eleventh_chamber", "The Eleventh Chamber",
        "Ten chambers give a word back four times. The eleventh does not give "
        "it back at all, and the far door does not open until something is "
        "said correctly.",
        [], xp=450, tags=["act3"],
        requires={"quests": [{"quest": "lantern_deep", "status": "complete"}],
                  **TWO_KEYS},
        stages=[
            stage("the_ten", "The ten that answer",
                  "You stop talking somewhere around the second.",
                  [reach("reach_echo", "Reach the Echo Halls.",
                         "deeproads_echo_halls")]),
            stage("the_eleventh", "The one that does not",
                  "Two keys, and the phrase cut over the tenth door.",
                  [reach("open_the_ward", "Open the Echo Ward.",
                         "deeproads_echo_ward")],
                  on_complete=[set_flag("echo_ward_open")]),
        ],
        unlocks=["behind_the_ninth_door"],
    ),

    quest(
        "behind_the_ninth_door", "Behind the Ninth Door",
        "Two hundred and eleven doors down the Long Hall, and nine of them "
        "stand open. This is the ninth.",
        [], xp=900, tags=["act3"],
        requires={"quests": [{"quest": "the_eleventh_chamber", "status": "complete"}]},
        stages=[
            stage("the_hall", "Down the Long Hall",
                  "Four miles, dead straight, and the ceiling is not in your "
                  "lamplight at any point.",
                  [reach("the_ninth", "Reach the ninth door.",
                         "long_hall_behind_the_ninth")]),
            stage("the_keeper", "What has been on the other side",
                  "It has been there as long as there has been a door.",
                  [kill("kill_keeper", "Face the Keeper of the Ninth.",
                        "door_keeper")],
                  on_complete=[set_flag("the_keeper_is_down")]),
        ],
        items=[("warden_blade", 1)],
        unlocks=["the_unsealing"],
    ),

    # --- the ending -------------------------------------------------------
    quest(
        "the_unsealing", "The Unsealing",
        "The wards were shut by something, once. It is still hanging over "
        "Lantern Deep on a chain, unlit.",
        [
            flagged("light_it", "Light the Great Lantern and shut all nine.",
                    "ending_lantern", optional=True),
            flagged("go_through", "Go through the ninth door and finish it "
                    "from the other side.", "ending_through", optional=True),
            flagged("hold_seals", "Let Karn Dolur seal the Deeproads behind "
                    "you.", "ending_hold", optional=True),
            resolved_either_way(
                "an_end", "Decide how this ends.",
                ["ending_lantern", "ending_through", "ending_hold"]),
        ],
        ordered=False, xp=1200, tags=["act3", "ending"],
        requires={"quests": [{"quest": "behind_the_ninth_door",
                              "status": "complete"}]},
        on_complete=[
            either("ending_lantern",
                   [deed("lantern_lit"), rep("the_wayfinders", 25),
                    rep("the_keepers", 20),
                    # Lighting it shuts every door, and the Deeproads are a
                    # door. Lantern Deep loses its road and keeps its light.
                    set_flag("deeproads_sealed")],
                   []),
            either("ending_through",
                   [rep("the_keepers", 10), rep("the_library", 20),
                    set_flag("ninth_door_crossed")],
                   []),
            either("ending_hold",
                   [deed("hold_honoured"), rep("karn_dolur", 30),
                    set_flag("hold_holds_the_line")],
                   []),
            set_flag("aurendel_finished"),
        ],
    ),
]

ARCS = []  # The ending arc is assembled in story.py, from the spine.


# --- conversation ---------------------------------------------------------

DIALOGUES = [
    dialogue("sull_talk", "greet", [
        node("greet", [
            "Sull is checking a lamp she has already checked. \"You came down "
            "the wrong way. Everybody does, the first time.\"",
        ], redirects=[
            ({"flags": [{"flag": "the_keeper_is_down", "equals": True}]},
             "the_choice"),
            ({"quests": [{"quest": "lantern_deep", "status": "active"}]},
             "the_lantern"),
        ], options=[
            take_job("ask", "What is that hanging over the town?",
                     "lantern_deep", "the_lantern"),
            option("leave", "Nothing."),
        ]),

        node("the_lantern", [
            "\"The Great Lantern.\" She does not look up at it, which takes "
            "effort. \"On a chain that goes into the dark and is not fixed to "
            "anything. It has never been lit by anybody living.\"",
        ], options=[
            option("what_for", "What is it for?", goto="what_for"),
        ]),

        node("what_for", [
            "\"There's a shrine down the second gallery that says it'll be "
            "lit one day and they've kept a lamp going for four hundred years "
            "on the strength of it.\" She finally looks up. \"What they don't "
            "say in the shrine is what lighting it *does*. It shuts things. "
            "All of them. Every door on your list, and this one, and we live "
            "at the bottom of this one.\"",
        ], on_enter=[set_flag("lantern_explained")], options=[
            option("thanks", "That is worth knowing.",
                   effects=[rep("the_wayfinders", 5)]),
        ]),

        node("the_choice", [
            "\"It's down, then.\" She sits, which she has not done in the "
            "whole time you have known her. \"So now there's the Lantern, and "
            "there's the door you came out of, and I'd not tell you which.\"",
        ], options=[
            option("light_it", "Light the Lantern.", goto="the_lantern_lit",
                   once=True, effects=[set_flag("ending_lantern")]),
            option("go_back", "We're going back through the door.",
                   goto="through_the_door", once=True,
                   effects=[set_flag("ending_through")]),
            option("the_hold", "Karn Dolur can seal it.", goto="the_hold_seals",
                   once=True,
                   requires={"factions": [{"faction": "karn_dolur",
                                           "minStanding": 25}]},
                   locked_hint="The hold has no reason to do you a favour "
                               "of that size.",
                   effects=[set_flag("ending_hold")]),
            option("wait", "Not yet.", goto="greet"),
        ]),

        node("the_lantern_lit", [
            "It takes eleven of them on the chain and the better part of a "
            "day, and when it catches, the light goes up rather than down — "
            "up the chain, into the dark it was hanging out of, and does not "
            "come back.\n\nEvery door on the list shuts at once. So does the "
            "Long Hall. So does the road to Karn Dolur, and the shaft to the "
            "moor, and the stair to the Ember Reach.\n\nLantern Deep is lit "
            "for the first time in four hundred years, and it is alone.",
        ], remembers="lantern_lit", options=[
            option("done", "It is done.")]),

        node("through_the_door", [
            "You go back down the Long Hall with the ninth door standing "
            "open, and this time you do not stop at it.\n\nWhat is on the "
            "other side is not a room. It is the rest of the corridor, and it "
            "goes on, and somewhere along it are the eight doors that were "
            "never opened at all.\n\nNobody in Aurendel will ever be able to "
            "prove what happened next. The doors stop opening. That much is "
            "in every record.",
        ], options=[option("done", "Go.")]),

        node("the_hold_seals", [
            "Karn Dolur has been not-opening the Deep Door for nine hundred "
            "years, and it turns out they have spent a good part of that time "
            "working out how to shut everything else.\n\nIt costs the hold "
            "eleven months and a tier of the Forgetiers. Dath signs the "
            "ledger himself, which nobody has seen before.\n\nThe Deeproads "
            "are shut from the top. It is not elegant and it will hold.",
        ], remembers="hold_honoured", options=[
            option("done", "Then it holds.")]),
    ]),

    dialogue("dath_talk", "greet", [
        node("greet", [
            "Dath does not rise. \"You want the Deep Gate. Everybody who "
            "comes to this hall wants the Deep Gate.\"",
        ], redirects=[
            ({"memories": [{"deedKind": "deep_door_opened", "who": "speaker"}]},
             "he_has_heard"),
            ({"factions": [{"faction": "karn_dolur", "minRank": "hold_friend"}]},
             "hold_friend"),
        ], options=[
            option("ask", "We want the Deep Gate.", goto="the_fee"),
            option("why_shut", "Why has it never been opened?",
                   goto="why_shut"),
            option("leave", "Nothing."),
        ]),

        node("why_shut", [
            "\"Because it was shut.\" He turns a page. \"That is the whole of "
            "the reasoning and it has held for nine hundred years. Every "
            "generation that has asked for a better one has been shown the "
            "ledger and has gone away.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_fee", [
            "\"Twenty to go down. The hold would rather you did not, and "
            "charges accordingly.\" He does not look up. \"You may also earn "
            "it, which is slower and which I would respect more.\"",
        ], options=[
            option("pay", "We'll pay.", goto="greet",
                   effects=[set_flag("down_by_karn_dolur")]),
            option("earn", "How is it earned?", goto="earned",
                   requires={"factions": [{"faction": "karn_dolur",
                                           "minStanding": 15}]},
                   locked_hint="The hold does not know you well enough to "
                               "have that conversation."),
        ]),

        node("earned", [
            "\"By having been useful to the hold, which the ledger says you "
            "have been.\" He writes something. \"Warrant's yours. Do not make "
            "me regret the entry.\"",
        ], remembers="hold_honoured",
         on_enter=[set_flag("down_by_karn_dolur"), rep("karn_dolur", 10)],
         options=[option("thanks", "We won't.")]),

        node("hold_friend", [
            "\"Hold-friend,\" says Dath, and closes the ledger, which is the "
            "single most surprising thing that has happened to you in "
            "Aurendel. \"Say what you need.\"",
        ], options=[
            option("the_gate", "The Deep Gate.", goto="earned"),
            option("leave", "Only passing."),
        ]),

        node("he_has_heard", [
            "The ledger is already open at a page with your name on it. "
            "\"You opened a door of ours,\" says Dath. \"I have written it "
            "down. That is all I intend to do about it, and it is more than "
            "you think.\"",
        ], options=[option("leave", "...")]),
    ]),
]


# --- prose ----------------------------------------------------------------

pool("act3_journal_below",
     "Three ways down that anybody knows of: the Deep Gate at Karn Dolur, the "
     "shaft beside the Black Tarn, and the shaft at the middle of the crater.",
     "Whichever way you came, the Deeproads run under all of it, and the wards "
     "are doors in the same wall.",
     "Two of the three you have already stood at. The third is somebody "
     "else's problem now, and may stay one.")

pool("act3_journal_lantern",
     "A lamp on a chain that is not fixed to anything, over a town that has "
     "kept a shrine going on the strength of it for four hundred years.",
     "Sull will say what lighting it does. Nobody at the shrine will.",
     "Eleven kinds of light in the market underneath it, and not one of them "
     "is the one that matters.")

pool("act3_journal_eleventh",
     "Ten chambers give a word back four times. The eleventh gives nothing "
     "back at all.",
     "Two keys and the phrase cut over the tenth door, and the phrase is not "
     "in a language anybody at Lantern Deep reads.",
     "You stop talking somewhere around the second chamber. Everybody does.")

pool("act3_journal_ninth",
     "Four miles of dressed corridor, two hundred and eleven doors, and the "
     "ninth of them stands open.",
     "Whatever has been on the other side has been there as long as there has "
     "been a door.",
     "Nine of the two hundred and eleven stand open, and they were opened in "
     "order.")
