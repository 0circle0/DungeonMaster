"""The Eel-Weir — a Kingsvale side chain, Act I."""
from dmkit.quests import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
)
from acts import chain, link, ACT_GATES
from dmkit.prose import pool

KEY = "eelweir"


# --- the people -----------------------------------------------------------

NPCS = [
    npc("eelwife_nesh", "Nesh of the Eel Camp",
        "Runs six huts, eleven traps and a season that ended two months ago. "
        "She has not gone home and will not say what she is waiting for.",
        faction="the_keepers", dialogue_id="eelweir_nesh_talk",
        home="weirwater_eel_camp", disposition=8, gullibility=0.3,
        memory_span=120, cares=["ward_restored", "ward_broken"],
        offers=["eelweir_out_of_season"]),

    npc("toll_clerk_gadd", "Gadd, of the Bridge Fund",
        "Collects for the Crown with one hand and for the bridge with the "
        "other, and is scrupulous about which hand.",
        faction="the_crown", dialogue_id="eelweir_gadd_talk",
        home="weirwater_toll_house", disposition=0, gullibility=0.25,
        memory_span=150, cares=["crown_served", "crown_defied"]),
]


# --- arriving somewhere is the event: the point of interest carries the fact ---

POI_TRIGGERS = {
    "oxbow_sunken_boat": [{
        "id": "eelweir_found_the_barge", "mode": "once", "on": "enter",
        "description": "The ribs at low water, and what is still under them.",
        "effects": [{"setFlag": {"flag": "eelweir_barge_found", "value": True}}],
    }],
}


# --- the chain ------------------------------------------------------------

QUESTS = chain(KEY, [
    link("eelweir_out_of_season", "Out of Season",
         "The eels stopped running past the drowned chapel in Harvest. Nesh "
         "has kept six huts standing through two months of weather to find "
         "out why.",
         xp=25,
         stages=[
             stage("look", "Go and look at the chapel",
                   "It stands in the water at anything above summer level, and "
                   "it is a long way above summer level.",
                   [reach("at_the_chapel", "Walk out to the Drowned Chapel.",
                          "weirwater_drowned_chapel")],
                   journal="eelweir_journal_look"),
             stage("clear", "What is in the nave",
                   "Something has been in the flooded nave long enough to have "
                   "cleared the reach of everything else.",
                   [kill("the_lampreys", "Deal with what is in the chapel.",
                         "weir_lamprey", count=2)],
                   on_complete=[set_flag("eelweir_chapel_cleared")],
                   journal="eelweir_journal_clear"),
             stage("tell_her", "Tell Nesh",
                   "She has been waiting two months to be told something.",
                   [talk("report", "Bring word back to the eel camp.",
                         "eelwife_nesh")],
                   journal="eelweir_journal_tell"),
         ],
         reputation={"the_keepers": 5}),

    link("eelweir_the_barge", "What the Barge Was Carrying",
         "Nesh says the lampreys came up the reach, and things come up a "
         "reach from somewhere. There is a barge on its side in the Oxbow "
         "that went down loaded and was never got out.",
         [reach("find_the_barge", "Find the sunken barge in the Oxbow Meadows.",
                "oxbow_sunken_boat"),
          flagged("read_the_hold", "See what is still in the hold.",
                  "eelweir_barge_found"),
          talk("ask_nesh", "Ask Nesh what a barge was doing carrying that.",
               "eelwife_nesh")],
         xp=30, reputation={"the_keepers": 5},
         on_complete=[set_flag("eelweir_cargo_known")]),

    link("eelweir_the_badger_hole", "The Badger Hole",
         "The barge was carrying stone out of the hedge country, and it was "
         "carrying it *away* from something. A terrier went into a hole under "
         "a hedge bank last spring and came out the far side of the field.",
         xp=45,
         stages=[
             stage("find_it", "Find the hole",
                   "A longer set than a badger digs, and the spoil outside it "
                   "is fresh.",
                   [reach("at_the_setts", "Get into the Hedge Setts.",
                          "hedge_country_badger_hole")],
                   journal="eelweir_journal_setts"),
             stage("the_far_end", "The far end, where the walls are cut",
                   "It is a badger hole for about eight feet.",
                   [kill("kill_delver", "Put down what has been digging.",
                         "sett_delver")],
                   on_complete=[set_flag("eelweir_delver_down")],
                   journal="eelweir_journal_delver"),
         ],
         reputation={"the_keepers": 8}),

    link("eelweir_what_came_up", "What Came Up the Weir",
         "It is dealt with, and now somebody has to be told — which is a "
         "different question from whether anybody wants to hear it.",
         [flagged("tell_the_moot", "Have the chapel closed the old way.",
                  "eelweir_told_keepers", optional=True),
          flagged("tell_the_crown", "Have the chapel closed by warrant.",
                  "eelweir_told_crown", optional=True),
          resolved_either_way("closed", "See the chapel closed.",
                              ["eelweir_told_keepers", "eelweir_told_crown"])],
         ordered=False, xp=35,
         items=[("poachers_lamp", 1)],
         on_complete=[
             either("eelweir_told_crown",
                    [rep("the_crown", 12), rep("the_keepers", -4),
                     set_flag("eelweir_in_the_ledger")],
                    [rep("the_keepers", 15), set_flag("eelweir_shut_quietly")]),
         ]),
], act="act1", region="kingsvale", giver="eelwife_nesh")


# An arc of its own, so the journal groups the four.
ARCS = [
    arc("the_eel_weir", "The Eel-Weir",
        "A fish turned round in Harvest, and the reason it turned round has "
        "been under the hedge country for rather longer than that.",
        [q["id"] for q in QUESTS]),
]


# --- conversation ---------------------------------------------------------

DIALOGUES = [
    dialogue("eelweir_nesh_talk", "greet", [
        node("greet", [
            "She is mending a trap that does not need mending. \"You'll be "
            "going over the bridge. Everyone's going over the bridge.\"",
            "Six huts, and smoke from one of them. \"If you've come for eels "
            "you're two months late and so am I.\"",
        ], redirects=[
            ({"flags": [{"flag": "eelweir_chapel_cleared", "equals": True}]},
             "after_the_chapel"),
            ({"quests": [{"quest": "eelweir_the_barge", "status": "active"}],
              "flags": [{"flag": "eelweir_barge_found", "equals": True}]},
             "about_the_barge"),
        ], options=[
            take_job("ask_why", "Why are you still here in Frostfall?",
                     "eelweir_out_of_season", "the_reach",
                     requires=ACT_GATES["act1"]),
            option("ask_eels", "Tell me about the eels.", goto="the_eels"),
            option("leave", "Nothing."),
        ]),

        node("the_reach", [
            "\"Eels run this reach every Harvest and have done since there "
            "was a bridge to run under. This Harvest they came up to the "
            "chapel and turned round.\" She sets the trap down. \"Eels do not "
            "turn round.\"",
        ], options=[
            option("what_is_there", "What's in the chapel?", goto="what_is_there"),
            option("go", "We'll walk out and see.", goto="go_and_see"),
        ]),

        node("what_is_there", [
            "\"Water to the sill and something in it that is not eels.\" She "
            "looks at the river rather than at you. \"I put a light in there "
            "in Lastmonth and it went out from underneath.\"",
        ], options=[option("go", "We'll walk out and see.", goto="go_and_see")]),

        node("go_and_see", [
            "\"Go at the low. It's a wade either way but at the high it's a "
            "swim, and I'd not swim it.\"",
        ], options=[option("done", "We'll go at the low.")]),

        node("the_eels", [
            "\"Silver in Harvest, and worth a mark the pound in Aurenhal "
            "because the Kingshold will not eat river fish that hasn't come "
            "up past a chapel.\" A dry look. \"Do not ask me why. I take the "
            "mark.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("after_the_chapel", [
            "\"You've been out.\" She reads your boots. \"And you came back, "
            "which is more than the light did.\"",
        ], remembers="ward_restored", options=[
            option("what_they_were", "There were three of them.",
                   goto="up_the_reach", once=True),
            option("leave", "It's dealt with."),
        ]),

        node("up_the_reach", [
            "\"Three,\" she says. \"And they came up the reach, and a thing "
            "that comes up a reach came from somewhere further down it.\" She "
            "wipes her hands. \"There's a barge on its side in the Oxbow. "
            "Went down loaded in my grandfather's time and nobody ever got "
            "the cargo out. I have wondered about that barge for thirty "
            "years.\"",
        ], options=[
            take_job("take_it", "We'll go and look at your barge.",
                     "eelweir_the_barge", "the_oxbow"),
            option("later", "Later, maybe.", goto="greet"),
        ]),

        node("the_oxbow", [
            "\"Low water, west bank, under the willow that went through the "
            "deck.\" She almost smiles. \"You will not find it from the "
            "path. Nobody ever does.\"",
        ], options=[option("done", "We'll find it.")]),

        node("about_the_barge", [
            "\"You found her, then.\" Nesh does not sound pleased about it. "
            "\"And?\"",
        ], options=[
            option("the_stone", "It was carrying cut stone. Away from the "
                   "hedge country.", goto="the_stone", once=True),
        ]),

        node("the_stone", [
            "\"Cut stone,\" she repeats. \"Out of the hedges. Nobody quarries "
            "the hedges, there's nothing there but clay and badgers.\" She is "
            "quiet for a moment. \"Somebody was taking something *out*. And "
            "they sank rather than land it.\"",
        ], options=[
            take_job("the_hole", "Where would it have come from?",
                     "eelweir_the_badger_hole", "the_hedge_bank"),
        ]),

        node("the_hedge_bank", [
            "\"There's a hole under a hedge bank in the four-lane country. "
            "Tam's terrier went in after a badger last spring and came out "
            "the far side of the field.\" She looks up. \"That is a very long "
            "way for a badger to have dug.\"",
        ], remembers="ward_restored", options=[
            option("done", "We'll follow it in.",
                   effects=[rep("the_keepers", 4)]),
        ]),
    ]),

    dialogue("eelweir_gadd_talk", "greet", [
        node("greet", [
            "Gadd has the ledger open at a page with four entries on it and "
            "is ruling a line under the fourth. \"Foot, horse, or cart?\"",
        ], redirects=[
            ({"flags": [{"flag": "eelweir_delver_down", "equals": True}],
              "without": {"flags": [{"flag": "eelweir_told_crown"},
                                    {"flag": "eelweir_told_keepers"}]}},
             "the_matter_of_the_chapel"),
        ], options=[
            option("the_bridge", "Tell me about the bridge.", goto="the_bridge"),
            # The Crown's own standing finally buys something.
            option("what_does_the_crown_say", "What does Aurenhal say about "
                   "the chapel?", goto="the_crowns_view",
                   requires={"factions": [{"faction": "the_crown",
                                           "minStanding": 10}]},
                   locked_hint="He does not discuss the Crown's business with "
                               "people the Crown has no opinion about."),
            option("leave", "Foot. Nothing else."),
        ]),

        node("the_bridge", [
            "\"Nine arches, two of them rebuilt after the flood and the "
            "rebuilt two do not match.\" He does not look up. \"Everybody "
            "mentions it. I have stopped minding.\"",
        ], options=[option("back", "Right.", goto="greet")]),

        node("the_crowns_view", [
            "He puts the pen down, which for Gadd is a speech. \"Aurenhal "
            "says the chapel is a parish matter and the parish has no "
            "priest. Aurenhal has said that for sixty years.\" A pause. "
            "\"Aurenhal has also never sent anybody to look.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_matter_of_the_chapel", [
            "\"You have been in the setts,\" says Gadd, \"and you have been "
            "in the chapel, and you have the look of somebody who wants a "
            "thing written down.\" He turns the ledger round. \"I can write "
            "it down. Understand what that means: it becomes the Crown's, and "
            "the Crown will send a man with a warrant and a mason, and the "
            "chapel will be filled in.\"",
        ], options=[
            option("write_it", "Write it down.", goto="written", once=True,
                   effects=[set_flag("eelweir_told_crown"), deed("crown_served"),
                            give("old_coin", 6)]),
            option("not_yet", "Not yet. Nesh should hear it first.",
                   goto="greet"),
        ]),

        node("written", [
            "He writes for a long time in a very small hand, and at the end "
            "of it he blots the page and turns it back round. \"It is the "
            "Crown's now. You will not be asked about it again, and neither "
            "will I.\"",
        ], remembers="crown_served", options=[option("leave", "Good.")]),
    ]),
]


# --- prose ----------------------------------------------------------------

pool("eelweir_journal_look",
     "Out to the chapel, then, and Nesh says go at the low because at the "
     "high it is a swim.",
     "Two months of weather and six huts kept standing, to find out why a "
     "fish turned round.",
     "The altar has never been moved. Everything else in that building has.")

pool("eelweir_journal_clear",
     "Something in the flooded nave has cleared the whole reach of everything "
     "else.",
     "She put a light in there in Lastmonth and it went out from underneath.",
     "Wading, in a building, in Frostfall. The things a mark the pound will "
     "buy.")

pool("eelweir_journal_tell",
     "Back to the camp. She has waited two months to be told something.",
     "Nesh will want the number, and Nesh will know what the number means.",
     "Six huts and smoke from one of them, and somebody in it who has not "
     "gone home.")

pool("eelweir_journal_setts",
     "A hole under a hedge bank, and a terrier that came out the far side of "
     "the field.",
     "It is a badger hole for about eight feet. After that somebody used "
     "tools.",
     "Whatever was being carried out on that barge was being carried away "
     "from here.")

pool("eelweir_journal_delver",
     "The far end of the setts, where the walls stop being clay.",
     "It has been digging a long while and has stopped needing to come up.",
     "Blind, and it has not needed eyes for longer than the barge has been "
     "on its side.")
