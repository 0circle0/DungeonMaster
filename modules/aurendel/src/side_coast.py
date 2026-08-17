"""What the Strand Keeps — a Silver Coast side chain, Act I.

The *Portion of Grace* went onto the bar at Wreckers' Strand in the Lastmonth
blow with a cargo the Countinghouse had written down to the barrel. The Strand
says weather. The Insurers' Hall says a light was shown. Both of them are
telling the truth about the part they can see.

The chain is short and it is a moral one rather than a mysterious one: you find
out what happened in the second quest, and the remaining two are about what you
intend to do with knowing. Orl will not lie to you and does not expect you to
lie for him — he expects you to understand the difference between a wreck and a
cargo, which is an argument the Strand has never once lost in front of a
magistrate because no magistrate has ever come.

Informing is worth more coin and costs the Salvors a standing they do not give
back: `wreck_informed` is severity -22 and travels, which on this coast means
every hut between here and the Narrows by the end of the month.
"""
from questkit import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from sidekit import chain, link, ACT_GATES
from prose import pool

KEY = "strand"


NPCS = [
    npc("wreck_master_orl", "Orl, Wreckmaster",
        "Decides who goes out to what, and takes the share nobody argues "
        "with. Has buried more sailors than he has salvaged, and mentions it "
        "when the Hall is listening.",
        faction="the_salvors", dialogue_id="strand_orl_talk",
        home="wreckers_strand_wreckers_hut", disposition=-5, gullibility=0.3,
        memory_span=250, cares=["share_honoured", "wreck_informed"],
        offers=["strand_what_came_ashore"],
        shop=shop("salvors_stock", buys=("treasure", "material"),
                  multiplier=1.3,
                  requires={"factions": [{"faction": "the_salvors",
                                          "minStanding": 10}]})),

    npc("lime_burner_cass", "Cass of the Kiln",
        "Burnt chalk for sixty years until the kiln went cold, and has stayed "
        "on in the burner's hut because there is nowhere she would rather be "
        "cold.",
        faction="the_salvors", dialogue_id="strand_cass_talk",
        home="wreckers_strand_lime_kiln", disposition=5, gullibility=0.45,
        memory_span=300, cares=["share_honoured", "wreck_informed"]),
]


POI_TRIGGERS = {
    "wreckers_strand_lime_kiln": [{
        "id": "strand_at_the_kiln", "mode": "once", "on": "enter",
        "description": "Cold sixty years, and the draw-hole scraped clean.",
        "effects": [{"setFlag": {"flag": "strand_kiln_seen", "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("strand_what_came_ashore", "What Came Ashore",
         "The Portion of Grace went onto the bar in the Lastmonth blow. Most "
         "of her is on the Bone Beach and some of what came off her has not "
         "settled.",
         xp=30,
         stages=[
             stage("the_beach", "Walk the Bone Beach",
                   "Four hundred years of ribs and stem-posts at every angle, "
                   "and a new one among them still wet.",
                   [reach("at_the_beach", "Walk out to the Bone Beach.",
                          "wreckers_strand_bone_beach")],
                   journal="strand_journal_beach"),
             stage("the_crew", "What is still coming up the shingle",
                   "They came off the reef with the cargo and did not stop at "
                   "the tide line.",
                   [kill("the_hands", "Put down what came ashore with her.",
                         "drowned_hand", count=2)],
                   on_complete=[set_flag("strand_beach_cleared")],
                   journal="strand_journal_hands"),
             stage("tell_orl", "Tell the Wreckmaster",
                   "He sent you out. He will want it said to his face.",
                   [talk("report", "Report to Orl.", "wreck_master_orl")],
                   journal="strand_journal_orl"),
         ],
         reputation={"the_salvors": 8},
         on_complete=[set_flag("strand_grace_seen")]),

    link("strand_the_lime_kiln", "The Lime Kiln",
         "Cass keeps the burner's hut and the kiln has been cold for sixty "
         "years, and on the night of the blow it was not.",
         [reach("at_the_kiln", "Get up to the lime kiln.",
                "wreckers_strand_lime_kiln"),
          flagged("the_draw_hole", "See what the draw-hole was used for.",
                  "strand_kiln_seen"),
          talk("ask_cass", "Ask Cass who lit her kiln.", "lime_burner_cass")],
         xp=35, reputation={"the_salvors": 5},
         on_complete=[set_flag("strand_light_known")]),

    link("strand_the_run", "The Run Under the Strand",
         "A fire on the kiln at four miles reads as a harbour light, and "
         "whatever came off the Grace before she broke did not go up the "
         "beach. It went under it.",
         xp=50,
         stages=[
             stage("find_the_run", "Find the run",
                   "It goes in at the back of the beach and comes out "
                   "somewhere up on the downs, which is the whole point of it.",
                   [reach("in_the_run", "Get into the Smugglers' Cave.",
                          "wreckers_strand_smugglers_cave")],
                   journal="strand_journal_run"),
             stage("the_far_end", "Who is holding it",
                   "Two men who did not expect the far end to be walked from "
                   "this direction, and one thing that was already down here.",
                   [kill("the_holders", "Clear the far end of the run.",
                         "strand_wrecker", count=2)],
                   on_complete=[set_flag("strand_run_cleared")],
                   journal="strand_journal_far_end"),
         ],
         reputation={"the_salvors": 6}),

    link("strand_a_share_or_a_name", "A Share or a Name",
         "The cargo is under the downs, the kiln was lit on purpose, and two "
         "people would like to hear about it in two very different rooms.",
         [flagged("take_a_share", "Take the Strand's share and say nothing.",
                  "strand_took_share", optional=True),
          flagged("give_a_name", "Give the Insurers' Hall a name.",
                  "strand_informed", optional=True),
          resolved_either_way("settle", "Settle what happens to the cargo.",
                              ["strand_took_share", "strand_informed"])],
         ordered=False, xp=40,
         items=[("wreckers_lantern", 1)],
         on_complete=[
             either("strand_informed",
                    [rep("the_countinghouse", 25), rep("the_crown", 8),
                     rep("the_salvors", -30), set_flag("strand_named")],
                    [rep("the_salvors", 25), rep("the_countinghouse", -15),
                     set_flag("strand_shared")]),
         ]),
], act="act1", region="silver_coast", giver="wreck_master_orl")


ARCS = [
    arc("what_the_strand_keeps", "What the Strand Keeps",
        "A ship on the bar, a kiln that was cold for sixty years and not on "
        "the night that mattered, and an argument about the difference "
        "between a wreck and a cargo.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("strand_orl_talk", "greet", [
        node("greet", [
            "There is a very good fire in the hut and a very good view of the "
            "bar from the window beside it, and Orl is sitting where he can "
            "use both. \"You'll be from the Hall.\"",
        ], redirects=[
            ({"flags": [{"flag": "strand_beach_cleared", "equals": True}]},
             "about_the_beach"),
            ({"flags": [{"flag": "strand_run_cleared", "equals": True}],
              "without": {"flags": [{"flag": "strand_took_share"},
                                    {"flag": "strand_informed"}]}},
             "the_share"),
        ], options=[
            take_job("not_from_the_hall", "We're not from the Hall.",
                     "strand_what_came_ashore", "the_grace",
                     requires=ACT_GATES["act1"]),
            option("wreckers", "They call this Wreckers' Strand.",
                   goto="the_name"),
            option("leave", "Nothing."),
        ]),

        node("the_name", [
            "\"They do,\" says Orl. \"Down at Sarnport they do. Up here it is "
            "the Strand, and what we do on it is take what the sea has "
            "finished with.\" He looks at the window. \"The sea finishes with "
            "a great deal.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_grace", [
            "\"Portion of Grace, out of Sarnport, seventy tons, on the bar on "
            "the ninth in as much weather as I have seen.\" He says it like a "
            "man who has said it to an official already. \"Eleven off her "
            "alive, which is eleven more than the Hall is giving me credit "
            "for.\"",
        ], options=[
            option("the_rest", "And the rest of them?", goto="the_rest"),
            option("go", "We'll walk the beach.", goto="walk_it"),
        ]),

        node("the_rest", [
            "\"On the Bone Beach with four hundred years of company.\" A "
            "pause, and he means the pause. \"Some of them have not settled. "
            "I would take that seriously and I would take a blade.\"",
        ], options=[option("go", "We'll walk the beach.", goto="walk_it")]),

        node("walk_it", [
            "\"Low water, and go along the shingle rather than the sand. The "
            "sand off the bar is not sand.\"",
        ], options=[option("done", "Along the shingle.")]),

        node("about_the_beach", [
            "Orl looks at the state of you and pours two, which for the "
            "Strand is a formal apology. \"How many?\"",
        ], remembers="share_honoured", options=[
            option("two", "Two. Both of them off the Grace.",
                   goto="the_kiln_question", once=True),
        ]),

        node("the_kiln_question", [
            "\"Then you have earned a thing I would rather not say.\" He puts "
            "his cup down. \"Cass keeps the burner's hut up at the kiln. That "
            "kiln has been cold sixty years.\" He looks at the window again. "
            "\"On the ninth it was not cold. I saw it from this chair and I "
            "have not slept properly since.\"",
        ], options=[
            take_job("go_up", "We'll go and ask her.", "strand_the_lime_kiln",
                     "go_gently"),
        ]),

        node("go_gently", [
            "\"Gently,\" says Orl. \"She is eighty and she is not the one who "
            "lit it. But somebody carried the fuel up past her door and she "
            "will have heard them do it.\"",
        ], options=[option("done", "Gently.")]),

        node("the_share", [
            "\"You have been in the run,\" says Orl. There is no fire in the "
            "question at all. \"So you know what is under the downs and you "
            "know what it is worth, and you know the Hall would like a name "
            "rather than a cargo.\"",
            "\"I will not talk you out of it,\" he says. \"I will tell you "
            "what it costs, which is that there is not a hut on this coast "
            "that will have you in it after, and that includes the ones you "
            "will need.\"",
        ], options=[
            option("take_share", "We'll take a share and leave it at that.",
                   goto="shared", once=True,
                   effects=[set_flag("strand_took_share"),
                            deed("share_honoured"), give("wreck_brass", 3)]),
            option("think", "We'll think about it.", goto="greet"),
        ]),

        node("shared", [
            "He counts it out in brass off the fittings, which is what the "
            "Strand pays in when it is paying somebody it intends to see "
            "again.",
        ], remembers="share_honoured", options=[option("leave", "Right.")]),
    ]),

    dialogue("strand_cass_talk", "greet", [
        node("greet", [
            "The burner's hut is colder inside than out and Cass is sitting "
            "in it in three coats. \"You've come up the kiln path. Nobody "
            "comes up the kiln path.\"",
        ], redirects=[
            ({"quests": [{"quest": "strand_the_lime_kiln", "status": "active"}]},
             "the_ninth"),
        ], options=[
            option("the_kiln", "Tell me about the kiln.", goto="the_kiln"),
            option("leave", "Nothing."),
        ]),

        node("the_kiln", [
            "\"Burnt the chalk that built Sarnport, and when Sarnport was "
            "built it stopped needing us.\" She does not sound bitter about "
            "it. \"Sixty years cold. I have stayed on because there is "
            "nowhere I would rather be cold.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_ninth", [
            "\"You will be here about the ninth.\" She has clearly been "
            "waiting for somebody to be. \"There was a fire in my kiln on the "
            "ninth and I did not light it, and I did not go out, because I am "
            "eighty and there was a man on the path with a barrow.\"",
        ], options=[
            option("who", "Did you know him?", goto="the_barrow", once=True),
        ]),

        node("the_barrow", [
            "\"Furze and tar, two loads,\" says Cass. \"You do not carry "
            "furze and tar up a kiln path in a blow unless you want a light "
            "seen a long way off.\" She pulls the coats in. \"And you do not "
            "come back down empty, and he did not. He went on over the top "
            "and down the far side, where there is nothing but the beach.\"",
        ], on_enter=[set_flag("strand_kiln_seen")],
         options=[
            option("thank", "Thank you.", goto="greet",
                   effects=[rep("the_salvors", 4)]),
        ]),
    ]),
]


pool("strand_journal_beach",
     "Four hundred years of ribs and stem-posts standing out of the shingle "
     "at every angle, and one of them still wet.",
     "Along the shingle rather than the sand. The sand off the bar is not "
     "sand.",
     "Seventy tons on the bar on the ninth, and eleven off her alive.")

pool("strand_journal_hands",
     "They came off the reef with the cargo and did not stop at the tide "
     "line.",
     "Weed-hung, and the weed is the only part of them still moving with the "
     "water.",
     "Orl said take it seriously and take a blade, in that order.")

pool("strand_journal_orl",
     "Back to the hut with the good fire and the very good view of the bar.",
     "He will want it said to his face and he will pour two if the number is "
     "bad.",
     "He has buried more than he has salvaged and mentions it when the Hall "
     "is listening.")

pool("strand_journal_run",
     "In at the back of the beach and out somewhere up on the downs, which is "
     "the whole point of it.",
     "Furze and tar went up the kiln path and did not come back down.",
     "A fire on a cold kiln at four miles, in rain, reads as a harbour.")

pool("strand_journal_far_end",
     "Two men who did not expect the far end to be walked from this "
     "direction.",
     "And one thing that was already down here before either of them.",
     "Whatever came off the Grace did not go up the beach. It went under it.")
