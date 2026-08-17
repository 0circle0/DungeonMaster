"""The Drowned Fort — a Sundered Isles side chain, Act III.

There is a fort on the Narrows that went down in one night with its guns run
out and its magazine dry, which are two facts that do not belong in the same
sentence. The Isles have salvaged everything in these waters that can be got
at, twice, and have never once been into the fort.

Runa is Wreckmaster at Blackrigging and will say plainly that this is not
superstition and not sentiment: four crews have gone in and one man has come
out of the four, and he came out through the chimney at Gullstone, which is a
mile and a half away and eighty feet up.

If the Silver Coast chain has already been run, the salvors' standing arrives
with you — informing on the Strand is severity -22 and travels, and the Isles
are where it travels to.
"""
from dmkit.quests import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way, set_flag,
    rep, deed, either, node, option, take_job, dialogue, npc, shop,
)
from acts import chain, link, ACT_GATES
from dmkit.prose import pool

KEY = "drownedfort"


NPCS = [
    npc("wreckmaster_runa", "Runa, Wreckmaster of Blackrigging",
        "Has salvaged everything in these waters that can be got at, twice, "
        "and keeps a list of the four crews that went into the fort.",
        faction="the_salvors", dialogue_id="drownedfort_runa_talk",
        home="blackrigging_the_hulks", disposition=0, gullibility=0.25,
        memory_span=300, cares=["share_honoured", "wreck_informed"],
        offers=["drownedfort_four_crews"],
        shop=shop("salvors_stock", buys=("treasure", "material"),
                  multiplier=1.2,
                  requires={"factions": [{"faction": "the_salvors",
                                          "minStanding": 15}]})),
]


POI_TRIGGERS = {
    "gullstone_the_chimney": [{
        "id": "drownedfort_at_the_chimney", "mode": "once", "on": "enter",
        "description": "Eighty feet of chimney, and what is at the bottom of "
                       "it.",
        "effects": [{"setFlag": {"flag": "drownedfort_chimney_seen",
                                 "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("drownedfort_four_crews", "Four Crews",
         "Guns run out and a dry magazine, in one night, and four crews since "
         "who went to find out which of those two things happened first.",
         [reach("to_the_hulks", "Reach the hulks at Blackrigging.",
                "blackrigging_the_hulks"),
          talk("hear_runa", "Hear Runa's list.", "wreckmaster_runa"),
          flagged("the_survivor", "Hear what the one who came out said.",
                  "drownedfort_survivor_heard")],
         xp=90, reputation={"the_salvors": 12},
         on_complete=[set_flag("drownedfort_asked")]),

    link("drownedfort_the_chimney", "The Chimney",
         "He came out at Gullstone, which is a mile and a half from the fort "
         "and eighty feet above it, and no salvor in four generations has "
         "been able to say how.",
         [reach("up_the_chimney", "Get to the bottom of the Gullstone "
                "chimney.", "gullstone_the_chimney"),
          flagged("the_bottom", "See what the chimney is connected to.",
                  "drownedfort_chimney_seen"),
          talk("tell_runa", "Take it back to Runa.", "wreckmaster_runa")],
         xp=115, reputation={"the_salvors": 10},
         on_complete=[set_flag("drownedfort_route_known")]),

    link("drownedfort_the_battery", "The Battery",
         "The chimney is a chimney because something under the Narrows needed "
         "a draught, and the fort was built on top of it by people who did "
         "not know that and worked it out on the last night.",
         xp=175,
         stages=[
             stage("in_the_hatch", "In at the hatch",
                   "Dry inside, which after four hundred years under the "
                   "passage is the part nobody has ever been able to "
                   "explain.",
                   [reach("in_the_fort", "Get into the Drowned Fort.",
                          "drowned_fort_the_hatch")],
                   journal="drownedfort_journal_hatch"),
             stage("the_guns", "The battery floor",
                   "The guns are still run out and still pointed at the "
                   "passage, and something down there is still minding them.",
                   [kill("kill_battery", "Clear the battery floor.",
                         "reef_thing")],
                   on_complete=[set_flag("drownedfort_battery_cleared")],
                   journal="drownedfort_journal_battery"),
         ],
         reputation={"the_salvors": 15}),

    link("drownedfort_salvage_or_seal", "Salvage It or Seal It",
         "Four hundred years of a fort nobody has been into, dry, with its "
         "armoury intact — and a chimney at the far end of it that goes "
         "somewhere the Isles would rather not have a road to.",
         [flagged("salvage_it", "Open the fort to the salvors.",
                  "drownedfort_salvaged", optional=True),
          flagged("seal_it", "Seal the chimney and leave the fort.",
                  "drownedfort_sealed", optional=True),
          resolved_either_way("settled", "Settle what happens to the fort.",
                              ["drownedfort_salvaged", "drownedfort_sealed"])],
         ordered=False, xp=135,
         items=[("drowned_blade", 1)],
         on_complete=[
             either("drownedfort_salvaged",
                    [deed("share_honoured"), rep("the_salvors", 30),
                     rep("the_countinghouse", -15),
                     set_flag("drownedfort_open")],
                    [rep("the_salvors", 10), rep("the_keepers", 18),
                     rep("karn_dolur", 10), set_flag("drownedfort_shut")]),
         ]),
], act="act3", region="sundered_isles", giver="wreckmaster_runa", level=6)


ARCS = [
    arc("the_drowned_fort", "The Drowned Fort",
        "Guns run out and a dry magazine on the same night, and four crews "
        "since who went to find out which came first.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("drownedfort_runa_talk", "greet", [
        node("greet", [
            "The hulks are eleven dead ships moored together into a street, "
            "and Runa's is the one in the middle with the list nailed inside "
            "the door. \"You'll have come about the fort. Everybody who comes "
            "here on purpose has.\"",
        ], redirects=[
            ({"memories": [{"deedKind": "wreck_informed", "who": "speaker"}]},
             "she_has_heard"),
            ({"quests": [{"quest": "drownedfort_the_chimney",
                          "status": "active"}],
              "flags": [{"flag": "drownedfort_chimney_seen", "equals": True}]},
             "about_the_chimney"),
            ({"flags": [{"flag": "drownedfort_battery_cleared", "equals": True}],
              "without": {"flags": [{"flag": "drownedfort_salvaged"},
                                    {"flag": "drownedfort_sealed"}]}},
             "salvage_or_seal"),
        ], options=[
            take_job("the_list", "What's the list on the door?",
                     "drownedfort_four_crews", "four_crews",
                     requires=ACT_GATES["act3"]),
            option("why_not", "Why has nobody salvaged it?", goto="why_not"),
            option("leave", "Nothing."),
        ]),

        node("why_not", [
            "\"Not superstition and not sentiment,\" says Runa. \"We have "
            "taken the copper off a plague ship and slept aboard her after. "
            "It is the list.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("four_crews", [
            "\"Four crews into the drowned fort in four generations,\" says "
            "Runa. \"Nineteen people. One came out.\"",
            "\"And the fort went down in one night with her guns run out and "
            "her magazine dry,\" she adds. \"Which are two things that do not "
            "belong in the same sentence. Guns run out means they saw "
            "something coming. Magazine dry means they had already fired "
            "everything they had.\"",
        ], options=[
            option("the_one", "What did the one who came out say?",
                   goto="the_survivor", once=True,
                   effects=[set_flag("drownedfort_survivor_heard")]),
        ]),

        node("the_survivor", [
            "\"He came out at Gullstone,\" says Runa. \"Which is a mile and a "
            "half from the fort and eighty feet above it, up a chimney in the "
            "rock that goes down into the island and has no bottom anybody "
            "has found.\"",
            "\"He was in the water three days and he was not in the water at "
            "all,\" she says. \"He was dry. That is the part of it my "
            "grandmother wrote down and underlined.\"",
        ], options=[
            take_job("the_chimney", "Then we start at the chimney.",
                     "drownedfort_the_chimney", "eighty_feet"),
        ]),

        node("eighty_feet", [
            "\"Eighty feet down and take a line you trust,\" says Runa. "
            "\"Nobody has been to the bottom of it because nobody has ever "
            "had a reason that outweighed eighty feet.\"",
        ], options=[option("done", "A line we trust.")]),

        node("about_the_chimney", [
            "Runa has the list off the door and flat on the table. \"What's "
            "at the bottom?\"",
        ], options=[
            option("the_draught", "Air. Moving. Coming up from the direction "
                   "of the fort.", goto="a_draught", once=True),
        ]),

        node("a_draught", [
            "\"A draught,\" says Runa. \"Out of a hole a mile and a half from "
            "a fort that has been under the passage for four hundred years.\"",
            "She sits down. \"Then the fort is dry inside. Which is how he "
            "walked out of it, and it is also why four crews did not — "
            "because they went in expecting to swim, and whatever is in there "
            "has been *breathing* since before the fort was built. They didn't "
            "put the fort on top of a chimney. Somebody put a chimney under "
            "the fort, and the garrison worked that out on the last night.\"",
        ], remembers="share_honoured", options=[
            take_job("go_in", "Then we go in at the hatch.",
                     "drownedfort_the_battery", "the_hatch",
                     effects=[rep("the_salvors", 8)]),
        ]),

        node("the_hatch", [
            "\"The hatch on the north wall, at slack water, and you will have "
            "about four hours,\" says Runa. \"I will put my own boat on it and "
            "I will not come in with you, and I would like that said out loud "
            "so neither of us has to pretend later.\"",
        ], options=[option("done", "Said out loud.")]),

        node("salvage_or_seal", [
            "Runa has come in as far as the stair head, which she said she "
            "would not, and is looking down the battery floor at eleven guns "
            "still run out. \"Four hundred years,\" she says. \"Dry. And an "
            "armoury behind that door.\"",
            "\"I can open her to the Isles,\" she says. \"Every hull in "
            "Blackrigging works for a season and nobody's hungry for five "
            "years, and the chimney stays where it is, at the far end, with a "
            "draught coming up it.\"",
            "\"Or we seal the chimney,\" says Runa, \"and the fort floods "
            "properly for the first time in four hundred years, and it is a "
            "wreck like any other wreck, and nineteen people are still on that "
            "list.\"",
        ], options=[
            option("salvage", "Open her. Five years is five years.",
                   goto="salvaged", once=True,
                   effects=[set_flag("drownedfort_salvaged")]),
            option("seal", "Seal the chimney.", goto="sealed", once=True,
                   effects=[set_flag("drownedfort_sealed")]),
        ]),

        node("salvaged", [
            "Every hull in Blackrigging is on her inside a fortnight and the "
            "free market has brass in it that nobody can account for and "
            "nobody asks about. Runa takes the list down off the door and "
            "does not throw it away.",
        ], remembers="share_honoured", options=[option("done", "Five years.")]),

        node("sealed", [
            "It takes four days to bring the chimney down onto itself, and "
            "the fort takes the water at the turn of the tide on the fifth, "
            "all at once, the way it should have four hundred years ago.",
        ], options=[option("done", "Like any other wreck.")]),

        node("she_has_heard", [
            "Runa does not get up. \"There is a hut on the Strand,\" she "
            "says, \"that had a name given to the Hall. Word came down the "
            "passage inside the month.\" She looks at the list rather than at "
            "you. \"State your business and then go and state it somewhere "
            "else.\"",
        ], options=[
            option("explain", "It was owed.", goto="greet",
                   effects=[rep("the_salvors", -5)]),
            option("leave", "Nothing."),
        ]),
    ]),
]


pool("drownedfort_journal_hatch",
     "The hatch on the north wall, at slack water, and about four hours.",
     "Dry inside, after four hundred years under the passage, which is the "
     "part nobody has ever explained.",
     "They did not put the fort on top of a chimney. Somebody put a chimney "
     "under the fort.")

pool("drownedfort_journal_battery",
     "Eleven guns still run out and still pointed at the passage.",
     "Guns run out means they saw it coming. A dry magazine means they had "
     "already fired everything.",
     "Nineteen people went in over four generations and one came out, a mile "
     "and a half away and eighty feet up.")
