"""The Unsealing, Act I — the Kingsvale.

A door that has always been open changes, and the only people who notice are
the ones who walk past it every day. Four quests, ending with the first real
fight and the first real choice.

The choice is the Crown or the Library, and it is a genuine fork: each has a
quest the other locks out, each moves two factions in opposite directions, and
**both end with the Wardlist in your pack**. One is handed it. One copies it
off a shelf it was not shown. The critical path does not care which.
"""
from dmkit.quests import (
    quest, stage, arc, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from dmkit.prose import pool

# --- the people -----------------------------------------------------------

NPCS = [
    npc("hedda_ploughshare", "Hedda of the Ploughshare",
        "Keeps the inn, the village's memory, and a ledger of who owes whom.",
        faction="the_keepers", dialogue_id="hedda_talk",
        home="hollowdene_the_ploughshare", disposition=15, gullibility=0.35,
        memory_span=120, cares=["ward_broken", "ward_restored", "barrow_robbed"],
        offers=["the_open_door"],
        shop=shop("hollowdene_stock", multiplier=1.1)),

    npc("steward_vail", "Under-Steward Vail",
        "Runs the part of the Crown's business that does not get written down, "
        "and would like it to stay that way.",
        faction="the_crown", dialogue_id="vail_talk",
        home="aurenhal_kingshold", disposition=0, gullibility=0.2,
        memory_span=180, cares=["crown_served", "crown_defied", "ward_broken"],
        offers=["the_crowns_commission"]),

    npc("librarian_orrin", "Orrin, Keyholder of the Fourth",
        "Four floors of shelving in his charge and a locked door on the fourth "
        "that he has never once explained.",
        faction="the_library", dialogue_id="orrin_talk",
        home="aurenhal_grand_library", disposition=5, gullibility=0.4,
        memory_span=180, cares=["library_served", "record_stolen"],
        offers=["the_librarians_errand"]),

    npc("moot_warden_hesk", "Hesk of the Moot",
        "Elderhollow sends him where a ward needs looking at. He has been "
        "busy.",
        faction="the_keepers", dialogue_id="hesk_talk",
        home="aurenhal_high_temple", disposition=10, gullibility=0.3,
        memory_span=365, cares=["ward_broken", "ward_restored"],
        shop=shop("keeper_stock", buys=("treasure", "ward"), multiplier=1.3,
                  requires={"factions": [{"faction": "the_keepers",
                                          "minStanding": 10}]})),

    npc("cairn_keeper_ulla", "Ulla of Cairnhold",
        "Eleven years' training to know which stone goes where, and she is "
        "a long way from her cairns.",
        faction="the_keepers", dialogue_id="ulla_talk",
        home="hollowdene_chapel", disposition=10,
        gullibility=0.25, memory_span=365,
        cares=["ward_broken", "ward_restored", "barrow_robbed"]),
]


# --- the quests -----------------------------------------------------------

QUESTS = [
    quest(
        "the_open_door", "The Open Door",
        "The Dene Barrow's door has stood open for six hundred years and never "
        "once mattered. Something about that has changed.",
        [], auto=True, xp=60, tags=["act1"],
        stages=[
            stage("look", "Go and look",
                  "Hedda says the draught has turned. Air used to go in.",
                  [reach("at_the_barrow", "Climb the sheep field to the barrow.",
                         "hollowdene_old_barrow")]),
            stage("clear", "Whatever came out",
                  "It has been down to the village twice.",
                  [kill("the_pack", "Put down what has come out of the mound.",
                        "grave_hound", count=2)]),
            stage("report", "Tell somebody who will listen",
                  "Hedda will know who that is.",
                  [talk("tell_hedda", "Tell Hedda what is in the barrow.",
                        "hedda_ploughshare")]),
        ],
        reputation={"the_keepers": 8},
        unlocks=["word_to_aurenhal"],
        on_complete=[set_flag("barrow_seen")],
    ),

    quest(
        "word_to_aurenhal", "Word to Aurenhal",
        "A barrow-door is a parish matter. Nine of them is not.",
        [reach("reach_the_city", "Take the road east to Aurenhal.",
               "aurenhal_highgate"),
         resolved_either_way(
             "find_an_ear", "Find somebody in the capital who will hear it.",
             ["heard_by_crown", "heard_by_library"])],
        ordered=True, xp=70, tags=["act1"],
        requires={"quests": [{"quest": "the_open_door", "status": "complete"}]},
        unlocks=["the_crowns_commission", "the_librarians_errand"],
    ),

    # --- branch one: the same document, two ways to hold it ---------------
    quest(
        "the_crowns_commission", "The Crown's Commission",
        "Vail will give you the run of the undercroft and a seal that opens "
        "gates, on the condition that none of this is discussed.",
        [talk("take_the_seal", "Take Vail's commission.", "steward_vail"),
         flagged("read_the_list", "Read the Wardlist in the Kingshold.",
                 "wardlist_read")],
        giver="steward_vail", xp=90, tags=["act1", "branch"],
        # Mutually exclusive with the Library's errand, and expressed as
        # "not already active or done" rather than as a flag, because the
        # flags are only set on completion and the lockout has to bite the
        # moment the other side is taken.
        requires={"quests": [{"quest": "word_to_aurenhal", "status": "complete"}],
                  "without": {"quests": [
                      {"quest": "the_librarians_errand", "status": "active"},
                      {"quest": "the_librarians_errand", "status": "complete"}]}},
        items=[("the_wardlist", 1), ("undercroft_key", 1)],
        reputation={"the_crown": 20, "the_library": -10},
        unlocks=["the_undercroft"],
        on_complete=[set_flag("sided_with_crown")],
    ),

    quest(
        "the_librarians_errand", "The Librarian's Errand",
        "Orrin will not give you the Wardlist. He will leave you alone on the "
        "fourth floor for an hour, which he considers a different thing.",
        [talk("hear_orrin", "Hear what Orrin wants in exchange.",
              "librarian_orrin"),
         flagged("copy_the_list", "Get the Wardlist off the fourth floor.",
                 "wardlist_read")],
        giver="librarian_orrin", xp=90, tags=["act1", "branch"],
        requires={"quests": [{"quest": "word_to_aurenhal", "status": "complete"}],
                  "without": {"quests": [
                      {"quest": "the_crowns_commission", "status": "active"},
                      {"quest": "the_crowns_commission", "status": "complete"}]}},
        items=[("the_wardlist", 1)],
        reputation={"the_library": 20, "the_crown": -10},
        unlocks=["the_undercroft"],
        on_complete=[set_flag("sided_with_library")],
    ),

    quest(
        "the_undercroft", "The Kingshold Undercroft",
        "The Wardlist names nine. Three are crossed through in newer ink, and "
        "the first of the three is under this castle.",
        [], xp=120, tags=["act1"],
        requires={"items": [{"item": "the_wardlist"}]},
        stages=[
            stage("get_below", "Get below",
                  "The stair is behind the storerooms and nobody sweeps it.",
                  [reach("enter_undercroft", "Go down into the undercroft.",
                         "aurenhal_kingshold_undercroft")]),
            stage("the_warden", "What was set to keep it shut",
                  "It is still doing its job. That is the problem.",
                  [kill("kill_warden", "Put down the Door-Warden.",
                        "door_warden")],
                  on_complete=[set_flag("first_ward_seen"), deed("crown_served")]),
        ],
        reputation={"the_keepers": 10},
        unlocks=["thornward_road", "sisters_road", "kurgan_road"],
        on_complete=[
            set_flag("act_two_open"),
            # Which side you took decides who is pleased about what you found.
            either("sided_with_crown",
                   [rep("the_crown", 10)],
                   [rep("the_library", 10)]),
        ],
    ),
]

ARCS = [
    # Both sides of the branch belong here too. `journalByArc` files a quest
    # that no arc claims at the bottom of the journal under no heading, so
    # leaving them out put Act I's one real choice below Act III.
    arc("act_one", "The Open Door",
        "A parish matter that turns out not to be one.",
        ["the_open_door", "word_to_aurenhal",
         "the_crowns_commission", "the_librarians_errand",
         "the_undercroft"]),
]


# --- conversation ---------------------------------------------------------

DIALOGUES = [
    dialogue("hedda_talk", "greet", [
        node("greet", [
            "Hedda looks up, and keeps drying the same cup. \"You'll have "
            "heard about the barrow, then.\"",
            "\"Sit down or don't,\" says Hedda. \"But if you're going up the "
            "sheep field, hear me first.\"",
        ], redirects=[
            ({"quests": [{"quest": "the_open_door", "status": "active"}],
              "flags": [{"flag": "barrow_cleared", "equals": True}]}, "well_done"),
        ], options=[
            take_job("ask_barrow", "What about the barrow?", "the_open_door",
                     "the_draught", gives=[("bandages", 2)]),
            option("ask_village", "Tell me about Hollowdene.", goto="the_village"),
            option("leave", "Later."),
        ]),

        node("the_draught", [
            "\"Six hundred years that door's stood open and it's never once "
            "mattered. Air went *in*. My grandmother knew that, her "
            "grandmother knew it.\" She sets the cup down. \"Fortnight since, "
            "it turned. Air comes out now. And two nights after that we lost "
            "a dog.\"",
        ], options=[
            option("what_out", "What came out?", goto="what_out"),
            option("go_now", "We'll go and look.", goto="go_now"),
        ]),

        node("what_out", [
            "\"If I knew that I'd not be asking strangers.\" A pause. \"It "
            "was a dog once. That much I'll say.\"",
        ], options=[option("go_now", "We'll go and look.", goto="go_now")]),

        node("go_now", [
            "\"Take the bandages. Take the sheep track, not the lane — the "
            "lane goes round.\" She almost smiles. \"And come back.\"",
        ], options=[option("done", "We will.")]),

        node("well_done", [
            "\"You came back,\" says Hedda, and means it.",
        ], remembers="ward_restored", options=[
            option("tell_her", "It was a ward. Somebody opened it.",
                   goto="she_goes_quiet", once=True,
                   effects=[set_flag("hedda_told")]),
            option("say_nothing", "It's dealt with.", goto="she_goes_quiet"),
        ]),

        node("she_goes_quiet", [
            "\"A ward,\" she says, slowly. \"Then you'll want Aurenhal, and "
            "you'll want to be quick about it. There's a woman at the chapel "
            "who'll tell you what a ward is. Ulla. She came down from the ice "
            "and she's not said why.\"",
        ], options=[
            option("thanks", "Thank you.", effects=[rep("the_keepers", 4)]),
        ]),

        node("the_village", [
            "\"Eleven roofs, a well, and a road that goes through rather than "
            "to us. It suits everybody.\"",
        ], options=[option("back", "Right.", goto="greet")]),
    ]),

    dialogue("ulla_talk", "greet", [
        node("greet", [
            "She is stacking stones by the chapel wall, in an order that is "
            "not the order they came out of the cart. \"You've been in the "
            "mound.\"",
        ], redirects=[
            ({"memories": [{"deedKind": "ward_broken", "who": "speaker"}]},
             "she_knows"),
        ], options=[
            option("what_is_a_ward", "What is a ward?", goto="what_is_a_ward"),
            option("nine", "Hedda said there were nine.", goto="nine",
                   requires={"flags": [{"flag": "hedda_told", "equals": True}]},
                   locked_hint="You have nothing to ask her about yet."),
            option("leave", "Nothing."),
        ]),

        node("what_is_a_ward", [
            "\"A door that was shut on purpose, and a thing put by it to keep "
            "it shut.\" She sets a stone. \"Cairns are wards. The Thornward's "
            "a ward. Your barrow was a ward and now it isn't.\"",
        ], options=[
            option("who_built", "Who built them?", goto="who_built"),
            option("back", "Hm.", goto="greet"),
        ]),

        node("who_built", [
            "\"People who could count to nine and didn't write anything down "
            "where you'd find it.\" She looks at you properly for the first "
            "time. \"There's a list. The Library has it and won't say so, and "
            "the Crown has a copy and won't admit it.\"",
        ], options=[
            option("thanks", "That's useful.", goto="greet",
                   effects=[set_flag("knows_about_wardlist")]),
        ]),

        node("nine", [
            "\"Nine,\" she agrees. \"And three of them have gone in a year. "
            "Whatever's doing it is going in order and it is not slowing "
            "down.\"",
        ], options=[option("back", "Right.", goto="greet")]),

        node("she_knows", [
            "She does not stop stacking. \"I heard what you did to the ward.\" "
            "A stone goes down harder than it needs to. \"Say what you came "
            "to say.\"",
        ], options=[
            option("apologise", "It had to come down.", goto="greet",
                   effects=[rep("the_keepers", -3)]),
            option("leave", "Nothing."),
        ]),
    ]),

    dialogue("vail_talk", "greet", [
        node("greet", [
            "Vail does not put the pen down. \"You are the ones from the "
            "village. Say it briefly.\"",
        ], redirects=[
            ({"quests": [{"quest": "the_crowns_commission", "status": "active"}]},
             "the_undercroft_stair"),
        ], options=[
            option("report", "A ward at Hollowdene has been opened.",
                   goto="he_puts_the_pen_down", once=True,
                   effects=[set_flag("heard_by_crown"), rep("the_crown", 5)]),
            option("leave", "Nothing yet."),
        ]),

        node("he_puts_the_pen_down", [
            "He puts the pen down. That is the whole of his reaction and it "
            "is quite enough. \"Who else have you told?\"",
        ], options=[
            option("nobody", "Nobody.", goto="the_offer"),
            option("the_library", "We were going to try the Library.",
                   goto="the_offer", effects=[rep("the_crown", -3)]),
        ]),

        node("the_offer", [
            "\"Then here is what I will do, and here is what it costs you. I "
            "will give you the undercroft key and a seal that opens any gate "
            "between here and the ice. In return this stays between the four "
            "of us and the room.\" A thin pause. \"The Library is not the "
            "four of us.\"",
        ], options=[
            take_job("accept", "Agreed.", "the_crowns_commission",
                     "the_undercroft_stair"),
            option("refuse", "We'll think about it.", goto="greet"),
        ]),

        node("the_undercroft_stair", [
            "\"The stair is behind the third storeroom. The list is on the "
            "table at the bottom, and you will find it says nine.\" He picks "
            "the pen back up. \"Three are crossed through. Not by me.\"",
        ], remembers="crown_served", options=[
            option("read_it", "We'll read it.", once=True,
                   effects=[set_flag("wardlist_read")]),
            option("leave", "Right."),
        ]),
    ]),

    dialogue("orrin_talk", "greet", [
        node("greet", [
            "Orrin is on the third gallery and does not come down. \"You may "
            "come up. Nothing above the third, please.\"",
        ], redirects=[
            ({"quests": [{"quest": "the_librarians_errand", "status": "active"}]},
             "an_hour_alone"),
            ({"memories": [{"deedKind": "record_stolen", "who": "speaker"}]},
             "he_remembers"),
        ], options=[
            option("report", "A ward at Hollowdene has been opened.",
                   goto="he_comes_down", once=True,
                   effects=[set_flag("heard_by_library"), rep("the_library", 5)]),
            option("leave", "Nothing."),
        ]),

        node("he_comes_down", [
            "He comes down. \"Which one? — no. Describe the door.\" You do. "
            "He listens with his eyes shut. \"That is the fourth. Not the "
            "first. The fourth.\"",
        ], options=[
            option("how_many", "How many are there?", goto="the_offer"),
        ]),

        node("the_offer", [
            "\"Nine, and I am not permitted to say so, and I have just said "
            "so.\" He glances up the well of the building. \"I will not hand "
            "you the list. I will be on the second gallery for an hour with "
            "my back to the stair, and what happens on the fourth floor in "
            "that hour is a matter I will have no view on.\"",
        ], options=[
            take_job("accept", "An hour is plenty.", "the_librarians_errand",
                     "an_hour_alone"),
            option("refuse", "That's a fine distinction.", goto="greet"),
        ]),

        node("an_hour_alone", [
            "The fourth floor is one room and one case, and the case is not "
            "locked, which tells you what he thinks of locks.",
        ], remembers="library_served", options=[
            option("copy", "Copy it out.", once=True,
                   check=("lore", 12, "copied_clean", "copied_rough"),
                   requires={"skills": [{"skill": "lore", "minRank": 1}]},
                   locked_hint="Nobody here reads a hand four centuries dead."),
            option("take_it", "Take the whole thing.", once=True,
                   goto="he_notices",
                   effects=[set_flag("wardlist_read"), set_flag("wardlist_stolen"),
                            deed("record_stolen"), rep("the_library", -25)]),
        ]),

        node("copied_clean", [
            "An hour, and you have every one of the nine, in order, with the "
            "three that are crossed through and the ink they were crossed "
            "through with.",
        ], on_enter=[set_flag("wardlist_read"), set_flag("copied_clean"),
                     rep("the_library", 5)],
         options=[option("done", "Go down.")]),

        node("copied_rough", [
            "An hour, and you have seven of the nine and a guess at the "
            "eighth. It will have to do.",
        ], on_enter=[set_flag("wardlist_read")],
         options=[option("done", "Go down.")]),

        node("he_notices", [
            "He is at the foot of the stair when you come down, and he looks "
            "at the shape of your pack rather than at your face. He says "
            "nothing at all, which is worse.",
        ], remembers="record_stolen", options=[
            option("leave", "Go.")]),

        node("he_remembers", [
            "\"You are not to come above the second gallery,\" Orrin says, "
            "without looking up. \"Nor the second, on reflection.\"",
        ], options=[option("leave", "...")]),
    ]),

    dialogue("hesk_talk", "greet", [
        node("greet", [
            "Hesk is sitting on the temple steps with a pack he has not put "
            "down. \"Moot sent me. Which one have you been to?\"",
        ], redirects=[
            ({"memories": [{"deedKind": "ward_broken", "who": "speaker",
                            "withinDays": 90}]}, "he_has_heard"),
        ], options=[
            option("the_barrow", "The Dene Barrow.", goto="the_barrow",
                   requires={"flags": [{"flag": "barrow_seen", "equals": True}]},
                   locked_hint="You have not been to a ward yet."),
            option("what_moot", "What moot?", goto="what_moot"),
            option("leave", "Nothing."),
        ]),

        node("what_moot", [
            "\"Elderhollow's. We keep the Thornward and a few other things, "
            "and we have kept them a long time without anybody thanking us "
            "for it.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_barrow", [
            "\"Then you've seen one open.\" He rubs his face. \"That's four. "
            "Moot knows of three and I've just learned a fourth from a "
            "stranger on a step.\"",
        ], options=[
            option("help", "What do you need?", goto="what_he_needs"),
        ]),

        node("what_he_needs", [
            "\"Somebody at each of the others before whatever's doing this "
            "gets there. Thornward, the Sisters, the Kurgan field.\" He looks "
            "up. \"I can be at one. You could be at another.\"",
        ], options=[
            option("agreed", "We'll go.", goto="greet",
                   effects=[rep("the_keepers", 6), set_flag("hesk_briefed")]),
        ]),

        node("he_has_heard", [
            "He stands up when he sees you, which is not a welcome. \"Word "
            "came up from the moot. You broke one.\"",
        ], options=[
            option("explain", "It was already going.", goto="greet",
                   effects=[rep("the_keepers", -4)]),
            option("say_nothing", "Nothing."),
        ]),
    ]),
]


# --- prose ----------------------------------------------------------------

pool("act1_journal_look",
     "Up the sheep field, then. Hedda says the draught turned a fortnight "
     "since and the village lost a dog two nights after.",
     "The barrow first. Everything else in this is downstream of what is in "
     "the barrow.",
     "Ten minutes' walk, and every soul in Hollowdene has found a reason not "
     "to make it since the fortnight turned.")

pool("act1_journal_clear",
     "Something is using the mound as a door and it is not staying in.",
     "Two of them, at least, by the tracks in the sheep field.",
     "It was a dog once. Hedda would not say more than that and did not need "
     "to.")

pool("act1_journal_report",
     "Hedda will want telling, and Hedda will know who else does.",
     "Back down the hill. Somebody in Hollowdene needs to hear the word ward "
     "said out loud.",
     "There is a woman at the chapel who came down from the ice and has not "
     "said why.")

pool("act1_journal_below",
     "Behind the third storeroom, down a stair nobody sweeps.",
     "The Kingshold is standing on a river-fort, and the fort is standing on "
     "something with a door in it.",
     "The list is on a table at the bottom. Nobody will say who crossed three "
     "of them through, or when.")

pool("act1_journal_warden",
     "It was set here to keep the door shut. It is still doing that, and it "
     "does not distinguish.",
     "Whatever the wards were built against, this was built to sit in front "
     "of it.",
     "Six hundred years at one post, and it has not once been relieved.")
