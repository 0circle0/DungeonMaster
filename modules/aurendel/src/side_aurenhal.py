"""Bone Alley — an Aurenhal side chain, Act I.

The Ratcatchers' Guild has a charter, a livery, and the only complete map of
what is under the capital. It also has three members who went down at Kettle
Yard in Lastmonth and did not come up, and it would like that dealt with
without the Watch being told, because the Watch would want to see the map.

What is actually happening is that somebody is paying men without a charter to
dig under the Warrens, and the men have gone further than they were paid to. It
is not a mystery for very long. The question the chain is actually about is who
you tell — and the Library, which buys grave ash and will not say why, has a
copyist in a pawnbroker's back room with a purse and a preference.

Both endings close the gaol. One of them puts the guild's map in a place the
guild cannot get it back from.
"""
from questkit import (
    arc, stage, reach, kill, talk, flagged, resolved_either_way,
    set_flag, rep, give, deed, either, node, option, take_job, dialogue, npc,
    shop,
)
from sidekit import chain, link, ACT_GATES
from prose import pool

KEY = "bonealley"


NPCS = [
    npc("ratcatcher_dree", "Dree, Warden of the Under",
        "Forty-one people under her and a charter older than the dynasty. "
        "Three of the forty-one are unaccounted for and she has stopped "
        "pretending otherwise.",
        faction="the_ratcatchers", dialogue_id="bonealley_dree_talk",
        home="warrens_ratcatchers_guild", disposition=5, gullibility=0.2,
        memory_span=200, cares=["under_kept", "under_sold", "crown_served"],
        offers=["bonealley_unlicensed"],
        shop=shop("ratcatchers_stock", buys=("treasure", "material"),
                  multiplier=1.15,
                  requires={"factions": [{"faction": "the_ratcatchers",
                                          "minStanding": 10}]})),

    npc("copyist_ilv", "Ilv, a Copyist",
        "Keeps a room behind a pawnbroker's on Anchor Lane, which is a long "
        "way from the fourth gallery and is the point.",
        faction="the_library", dialogue_id="bonealley_ilv_talk",
        home="warrens_pawnbroker", disposition=0, gullibility=0.3,
        memory_span=200, cares=["library_served", "record_stolen", "under_sold"]),
]


POI_TRIGGERS = {
    "warrens_old_gaol": [{
        "id": "bonealley_at_the_gaol", "mode": "once", "on": "enter",
        "description": "The brickwork in the west range, and how new it is.",
        "effects": [{"setFlag": {"flag": "bonealley_brickwork_seen",
                                 "value": True}}],
    }],
}


QUESTS = chain(KEY, [
    link("bonealley_unlicensed", "Unlicensed",
         "Three of the guild went down at Kettle Yard in Lastmonth. Dree "
         "wants to know who else is under her city, and she does not want to "
         "ask the Watch.",
         xp=30,
         stages=[
             stage("get_down", "Find the way down",
                   "Behind a wine-shop that is not a wine-shop. You will not "
                   "find it by being told where it is.",
                   [reach("the_stair", "Get down the Cellar Stair.",
                          "warrens_cellar_stair")],
                   journal="bonealley_journal_stair"),
             stage("meet_them", "Whoever is down there",
                   "They are not guild. Guild wear the hood.",
                   [kill("the_diggers", "Deal with the men in the cellars.",
                         "cellar_thief", count=2)],
                   on_complete=[set_flag("bonealley_diggers_met")],
                   journal="bonealley_journal_diggers"),
             stage("tell_dree", "Tell Dree",
                   "She will want to know what they were carrying, not what "
                   "they were carrying it in.",
                   [talk("report", "Report to the guild.", "ratcatcher_dree")],
                   journal="bonealley_journal_report"),
         ],
         reputation={"the_ratcatchers": 8},
         on_complete=[set_flag("bonealley_unlicensed_known")]),

    link("bonealley_the_old_gaol", "The Old Gaol",
         "They were digging *towards* something, and the direction is the "
         "only evidence anybody needs: the west range of the gaol, which was "
         "emptied after the fire and bricked up in a hurry.",
         [reach("at_the_gaol", "Get into the Old Gaol.", "warrens_old_gaol"),
          flagged("the_brickwork", "Find what the brickwork is hiding.",
                  "bonealley_brickwork_seen"),
          talk("ask_dree", "Ask Dree what was bricked up after the fire.",
               "ratcatcher_dree")],
         xp=35, reputation={"the_ratcatchers": 6},
         on_complete=[set_flag("bonealley_gaol_known")]),

    link("bonealley_what_was_bricked_up", "What Was Bricked Up",
         "The register was left on the desk with a name still on it. The "
         "guild has been walking round that corner of the under for sixty "
         "years and telling itself it was the damp.",
         xp=50,
         stages=[
             stage("go_through", "Through the west range",
                   "Sixty years of brick, and it comes down in an afternoon.",
                   [reach("in_the_cellars", "Get into the Warren Cellars.",
                          "warrens_cellar_stair")],
                   journal="bonealley_journal_through"),
             stage("the_gaoler", "The man still on the book",
                   "He was not left the keys. He was left with them.",
                   [kill("kill_gaoler", "Put down the Gaoler.", "the_gaoler")],
                   on_complete=[set_flag("bonealley_gaoler_down")],
                   journal="bonealley_journal_gaoler"),
         ],
         reputation={"the_ratcatchers": 10}),

    link("bonealley_the_charter", "The Charter",
         "It is finished, and there is a map of it in your hand that two "
         "different people would like very much.",
         [flagged("keep_it_under", "Give the guild back its own map.",
                  "bonealley_kept_under", optional=True),
          flagged("sell_the_map", "Sell the copyist what he came for.",
                  "bonealley_sold_under", optional=True),
          resolved_either_way("decide", "Decide where the map ends up.",
                              ["bonealley_kept_under", "bonealley_sold_under"])],
         ordered=False, xp=40,
         items=[("tallow_hood", 1)],
         on_complete=[
             either("bonealley_sold_under",
                    [rep("the_library", 20), rep("the_ratcatchers", -25),
                     rep("the_crown", -5), set_flag("bonealley_map_copied")],
                    [rep("the_ratcatchers", 22), rep("the_library", -8),
                     set_flag("bonealley_map_kept")]),
         ]),
], act="act1", region="kingsvale", giver="ratcatcher_dree")


ARCS = [
    arc("bone_alley", "Bone Alley",
        "Three of the guild went down at Kettle Yard and did not come up, and "
        "the reason had been bricked up in the west range for sixty years.",
        [q["id"] for q in QUESTS]),
]


DIALOGUES = [
    dialogue("bonealley_dree_talk", "greet", [
        node("greet", [
            "Dree is going through a ledger of who is where, and there are "
            "three lines in it with nothing written after them. \"You're not "
            "guild. State it quickly.\"",
        ], redirects=[
            ({"flags": [{"flag": "bonealley_diggers_met", "equals": True}]},
             "about_the_diggers"),
            ({"quests": [{"quest": "bonealley_the_old_gaol", "status": "active"}],
              "flags": [{"flag": "bonealley_brickwork_seen", "equals": True}]},
             "about_the_gaol"),
        ], options=[
            take_job("ask_job", "You're three short.", "bonealley_unlicensed",
                     "the_three", gives=[("bandages", 2)],
                     requires=ACT_GATES["act1"]),
            option("ask_guild", "A guild of ratcatchers?", goto="the_guild"),
            option("leave", "Nothing."),
        ]),

        node("the_guild", [
            "\"Chartered under the third Aurel, and the charter says vermin, "
            "and vermin is a broad word in a city built on three older "
            "cities.\" She does not smile. \"We have the map. Nobody else has "
            "the map. That is the guild.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_three", [
            "\"Kettle Yard, down the stair behind the wine-shop, Lastmonth "
            "the ninth. Three went, none came back, and the rope came back "
            "cut.\" She closes the ledger. \"Cut, not frayed. So it is people, "
            "and if it is people they are in my under without a charter.\"",
        ], options=[
            option("why_not_watch", "Why not the Watch?", goto="not_the_watch"),
            option("go", "We'll go down.", goto="go_down"),
        ]),

        node("not_the_watch", [
            "\"Because the Watch would want the map, and the Watch reports to "
            "a man in the Kingshold who would want the map, and then it is "
            "not the guild's map.\" A shrug. \"Three of mine against four "
            "hundred years. I am aware of how that sounds.\"",
        ], options=[option("go", "We'll go down.", goto="go_down")]),

        node("go_down", [
            "\"Take the hood if you find one. Ours are waxed black and cut "
            "clear of the ear, and anybody down there not wearing one is not "
            "mine.\"",
        ], options=[option("done", "Understood.")]),

        node("about_the_diggers", [
            "\"Not guild,\" she says, before you have said anything. \"I can "
            "see it on you.\" She sits. \"What were they carrying?\"",
        ], options=[
            option("ash", "Ash. Bagged, weighed, and labelled.",
                   goto="the_ash", once=True),
        ]),

        node("the_ash", [
            "\"Labelled,\" Dree repeats, and something goes out of her face. "
            "\"Grave ash, bagged and *labelled*, which means somebody is "
            "buying it by weight and writing down where it came from.\" She "
            "looks at the ledger. \"They were going west. There is nothing "
            "west but the gaol.\"",
        ], options=[
            take_job("the_gaol", "What's in the gaol?", "bonealley_the_old_gaol",
                     "the_west_range"),
        ]),

        node("the_west_range", [
            "\"Emptied after the fire, and the west range bricked up in a "
            "hurry with the register still on the desk.\" She meets your eye. "
            "\"We walk round that corner. We have walked round it for sixty "
            "years and told ourselves it was the damp.\"",
        ], options=[option("done", "We'll look at the brickwork.")]),

        node("about_the_gaol", [
            "\"You've seen it.\" Dree does not ask. \"New mortar on sixty-year "
            "brick, and a hole in it somebody else made first.\"",
        ], options=[
            take_job("go_through", "We're going through.",
                     "bonealley_what_was_bricked_up", "the_register"),
        ]),

        node("the_register", [
            "\"There was a name still on the book when they bricked it,\" she "
            "says. \"That is the part nobody says out loud. They did not empty "
            "the west range. They *closed* it.\"",
        ], remembers="under_kept", options=[
            option("done", "Then we'll open it.",
                   effects=[rep("the_ratcatchers", 5)]),
        ]),
    ]),

    dialogue("bonealley_ilv_talk", "greet", [
        node("greet", [
            "The room behind the pawnbroker's is very clean and smells of "
            "nothing at all, which in the Warrens takes work. \"You are not "
            "here to pawn something,\" says Ilv, without putting down the pen.",
        ], redirects=[
            ({"flags": [{"flag": "bonealley_gaoler_down", "equals": True}],
              "without": {"flags": [{"flag": "bonealley_sold_under"},
                                    {"flag": "bonealley_kept_under"}]}},
             "the_offer"),
        ], options=[
            option("who_are_you", "Who do you copy for?", goto="who"),
            option("leave", "Nothing."),
        ]),

        node("who", [
            "\"A gallery,\" he says. \"Not the fourth. I am told the fourth "
            "does not exist and I have never had cause to check.\"",
        ], options=[option("back", "Hm.", goto="greet")]),

        node("the_offer", [
            "He puts the pen down and folds his hands, which he has clearly "
            "practised. \"You have been under the gaol. You will have the "
            "guild's map or enough of it to redraw. I am authorised to be "
            "generous and I would rather not have to explain how generous.\"",
            "\"Understand what you would be selling,\" he adds. \"Not a map. "
            "Four hundred years of somebody else's only advantage.\"",
        ], options=[
            option("sell", "Name the figure.", goto="sold", once=True,
                   effects=[set_flag("bonealley_sold_under"),
                            deed("under_sold"), give("old_coin", 25)]),
            option("refuse", "It isn't mine to sell.", goto="refused",
                   once=True, effects=[set_flag("bonealley_kept_under"),
                                       deed("under_kept")]),
        ]),

        node("sold", [
            "He counts it out in old coin, which is what you use when you do "
            "not want a mint mark on the transaction, and he does not look up "
            "once while he does it.",
        ], remembers="under_sold", options=[option("leave", "Done.")]),

        node("refused", [
            "\"No,\" he agrees, and picks the pen back up. \"It is hers. I "
            "did say that part out loud, and you will notice I did not have "
            "to.\"",
        ], remembers="under_kept", options=[option("leave", "Goodbye.")]),
    ]),
]


pool("bonealley_journal_stair",
     "Behind a wine-shop that is not a wine-shop, in a yard that is nobody's "
     "job.",
     "Kettle Yard. Six families, one pump, and a stair down into what the "
     "Warrens were built on top of.",
     "Three went down here on the ninth and the rope came back cut.")

pool("bonealley_journal_diggers",
     "Guild hoods are waxed black and cut clear of the ear. Nobody down here "
     "is wearing one.",
     "Working by lamp, quietly, and towards something rather than at it.",
     "Bagged, weighed, labelled. Somebody is buying by the pound and writing "
     "down where it came from.")

pool("bonealley_journal_report",
     "Back up to the guild, and Dree will want to know what they were "
     "carrying rather than who they were.",
     "Forty-one on the ledger and three lines with nothing after them.",
     "She will not take it to the Watch. She has explained why and the reason "
     "is four hundred years old.")

pool("bonealley_journal_through",
     "New mortar on sixty-year brick, and a hole in it that somebody else "
     "made first.",
     "They did not empty the west range. They closed it.",
     "Sixty years of brick, and it comes down in an afternoon.")

pool("bonealley_journal_gaoler",
     "The register was left on the desk with a name still on it.",
     "He was not left the keys. He was left with them.",
     "The guild has walked round this corner since before anybody now living "
     "was in it.")
