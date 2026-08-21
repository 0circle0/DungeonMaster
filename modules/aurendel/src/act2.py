"""The Unsealing, Act II — the three wards.

Three routes, four quests each, and you need any two of the three. The third stays open and
unplayed.

Every route has the same spine, so the skeleton is built once here and the writing is per-route
below.

The branch is inside the third quest of each route: restore the ward, or break through it. Both hand
you the route's Ward-Key, because the key is what the ward was made out of. What differs is who saw
you do it, what the Keepers hear within a fortnight, and one fact about the Deeproads that only
breaking through gives you.

`resolved_either_way` makes that completable: the two branch objectives are `optional`, so neither
gates the quest, and one required `custom` objective completes when either flag is set. A quest
whose objectives are all optional can never complete.
"""
from dmkit.quests import (
    quest, stage, arc, reach, kill, flagged, resolved_either_way, set_flag,
    rep, deed, either, node, option, dialogue, npc, shop,
)
from dmkit.prose import pool


def route(key, *, name, ward_name, key_item, approach_area, site_poi,
          site_dungeon, boss_monster, region_faction, level,
          xp=(150, 200, 250, 200), unlocks_from="the_undercroft"):
    """The four quests of one route, in order.

    `unlocks_from` is only for the journal — every quest below also states its own `requires`,
    because `unlocks` marks a quest available and does not gate starting it.

    The ward's tender is reached through `{key}_briefed`, which their conversation sets. The tenders
    are declared in `NPCS` below, one per `approach_area`, and `check_quests.py` §11 is what holds
    the relationship together.
    """
    q1, q2, q3, q4 = (f"{key}_road", f"{key}_site", f"{key}_choice", f"{key}_key")
    broke, restored = f"{key}_broken", f"{key}_restored"

    return [
        quest(
            q1, f"The Road to {name}",
            f"The Wardlist names it {ward_name}. Getting there is most of a "
            f"week and the last day of it is on foot.",
            [reach("arrive", f"Reach {name}.", approach_area),
             flagged("ask_around", "Find somebody who tends it.",
                     f"{key}_briefed")],
            xp=xp[0], tags=["act2", key],
            requires={"quests": [{"quest": "the_undercroft", "status": "complete"}]},
            unlocks=[q2],
        ),

        quest(
            q2, ward_name,
            "Whatever was set here to keep the door shut is still at it, and "
            "it has stopped distinguishing between the door and you.",
            [], xp=xp[1], tags=["act2", key],
            requires={"quests": [{"quest": q1, "status": "complete"}]},
            stages=[
                stage("get_in", "Get inside",
                      "The way down is where the Wardlist says it is.",
                      [reach("enter", "Go down.", site_poi)]),
                stage("clear_it", "What is keeping it",
                      "It was set here. It is still here.",
                      [kill("kill_boss", "Put down what guards the ward.",
                            boss_monster)],
                      on_complete=[set_flag(f"{key}_cleared")]),
            ],
            reputation={region_faction: 8},
            unlocks=[q3],
        ),

        quest(
            q3, f"{ward_name} — Shut or Open",
            "The ward can be put back. It can also be taken the rest of the "
            "way down, which is faster and tells you more.",
            [
                # Both optional, so neither gates completion; the required objective below is
                # satisfied by either.
                flagged("restore", "Put the ward back as it was.", restored,
                        optional=True),
                flagged("break", "Take the ward the rest of the way down.",
                        broke, optional=True),
                resolved_either_way("resolve", "Decide what happens to it.",
                                    [restored, broke]),
            ],
            ordered=False, xp=xp[2], tags=["act2", key, "branch"],
            requires={"quests": [{"quest": q2, "status": "complete"}]},
            unlocks=[q4],
            on_complete=[
                either(broke,
                       # Faster, and it costs you with everybody who tends these. The deed is
                       # emitted here so whoever is standing at the ward witnesses it.
                       [deed("ward_broken"), rep(region_faction, -10),
                        set_flag(f"{key}_open"), set_flag("knows_the_pattern")],
                       [deed("ward_restored"), rep("the_keepers", 12),
                        set_flag(f"{key}_shut")]),
            ],
        ),

        quest(
            q4, key_item.replace("_", " ").title(),
            "The ward was made of something. Whatever you did to it, that "
            "something is now loose and portable.",
            [flagged("take_it", "Take what the ward was made of.",
                     f"{key}_taken")],
            xp=xp[3], tags=["act2", key],
            requires={"quests": [{"quest": q3, "status": "complete"}]},
            items=[(key_item, 1)],
            reputation={region_faction: 5},
            # Every route opens the way below. Three unlockers for one quest, so no single route is
            # load-bearing and any two will do.
            unlocks=["the_way_below"],
            on_complete=[set_flag(f"{key}_done")],
        ),
    ]


# --- the three routes -----------------------------------------------------

NORTH = route(
    "thornward", name="the Thornward", ward_name="The Thornward",
    key_item="grown_key",
    approach_area="duskwood_elderhollow", site_poi="witchwood_under_the_ring",
    site_dungeon="duskwood_under_ring", boss_monster="hollow_walker",
    region_faction="the_keepers", level=4)

EAST = route(
    "sisters", name="the Nine Sisters", ward_name="The Sisters' Ward",
    key_item="cast_key",
    approach_area="moor_barrowgate", site_poi="nine_sisters_under_ring",
    site_dungeon="moor_beneath_sisters", boss_monster="sister_shade",
    region_faction="the_keepers", level=5)

SOUTH = route(
    "kurgan", name="the Kurgan Field", ward_name="The Skull Line",
    key_item="glass_key",
    approach_area="steppe_ilkhet", site_poi="kurgan_field_great_kurgan",
    site_dungeon="steppe_great_kurgan", boss_monster="kurgan_rider",
    region_faction="the_keepers", level=5)

QUESTS = NORTH + EAST + SOUTH

ARCS = [
    arc("act_two", "The Three Wards",
        "Nine were built. Three are already open. You can be at two of the "
        "rest in time, and not at all three.",
        [q["id"] for q in QUESTS]),
]


# --- the people who tend them ---------------------------------------------
# One per route, living in that route's `approach_area`, because the first quest of every route
# sends you there and then asks you to find whoever tends the ward. There must be three.

NPCS = [
    npc("thorn_warden_bel", "Bel of the Thornward",
        "Lays thorn, and has laid it in the same line for thirty-one years.",
        faction="the_keepers", dialogue_id="bel_talk",
        home="elderhollow_moot_oak", disposition=12, gullibility=0.3,
        memory_span=300, cares=["ward_broken", "ward_restored"],
        shop=shop("keeper_stock", buys=("treasure", "ward"), multiplier=1.25)),

    npc("stone_keeper_maun", "Maun of the Nine Sisters",
        "Keeps the ring for Barrowgate, which mostly means keeping people "
        "off it, and has kept a rubbing of the tenth stone for nine years.",
        faction="the_keepers", dialogue_id="maun_talk",
        home="barrowgate_moot_hall", disposition=10, gullibility=0.3,
        memory_span=300, cares=["ward_broken", "ward_restored"]),

    npc("rider_tenkh", "Tenkh of the Skull Line",
        "Rides the line, counts the poles, and replaces the ones that go.",
        faction="the_keepers", dialogue_id="tenkh_talk",
        home="ilkhet_khans_yurt", disposition=8, gullibility=0.35,
        memory_span=300, cares=["ward_broken", "ward_restored"]),
]


# --- conversation ---------------------------------------------------------

def ward_talk(did, greeting, brief, restore_line, break_line, key_flag,
              region_faction, restored_flag, broken_flag, taken_flag,
              cold_line):
    """The conversation every ward-tender has, in their own words.

    Three states, and a redirect picks between them: before you have been in, after you have cleared
    it and have to decide, and afterwards — which for somebody who broke a ward means being met by a
    person who has heard.
    """
    return dialogue(did, "greet", [
        node("greet", greeting, redirects=[
            ({"flags": [{"flag": f"{key_flag}_cleared", "equals": True}],
              "without": {"flags": [{"flag": restored_flag},
                                    {"flag": broken_flag}]}}, "decide"),
            ({"memories": [{"deedKind": "ward_broken", "who": "speaker"}]},
             "cold"),
        ], options=[
            option("brief", "Tell me about the ward.", goto="brief"),
            option("leave", "Nothing."),
        ]),

        node("brief", brief, on_enter=[set_flag(f"{key_flag}_briefed")],
             options=[option("back", "Right.", goto="greet")]),

        node("decide", [
            "\"It's cleared, then.\" A long pause. \"So you've a choice, and "
            "I'll not pretend I don't mind which.\"",
        ], options=[
            option("restore", restore_line, goto="restored", once=True,
                   effects=[set_flag(restored_flag), rep(region_faction, 6)]),
            option("break", break_line, goto="broken", once=True,
                   effects=[set_flag(broken_flag)]),
            option("wait", "We'll think about it.", goto="greet"),
        ]),

        node("restored", [
            "It takes the rest of the day and most of the next, and at the "
            "end of it the ward is what it was.",
        ], remembers="ward_restored", on_enter=[set_flag(taken_flag)],
         options=[option("done", "Done.")]),

        node("broken", [
            "It comes down faster than you expect, and something on the far "
            "side of it stops making the noise it had been making.",
        ], remembers="ward_broken", on_enter=[set_flag(taken_flag)],
         options=[option("done", "Done.")]),

        node("cold", cold_line, options=[
            option("leave", "Nothing.")]),
    ])


DIALOGUES = [
    ward_talk(
        "bel_talk",
        ["Bel is laying thorn and does not stop. \"Elderhollow said somebody "
         "would come. They didn't say you'd be armed.\""],
        ["\"Thorn doesn't grow in a line. Somebody lays it, and somebody's "
         "been laying this one since before the moot kept records.\" She "
         "works a length in. \"Whatever's on the far side has been quiet "
         "about it for six hundred years and is not quiet now.\""],
        "Put it back. We'll help.",
        "Take it down. We need to see what's behind it.",
        "thornward", "the_keepers",
        "thornward_restored", "thornward_broken", "thornward_taken",
        ["She does not look up, and she does not stop working, and she does "
         "not answer."]),

    ward_talk(
        "maun_talk",
        ["Maun has the rubbing out on the Moot Hall table, weighted at the "
         "corners, and does not roll it up. \"You'll have felt it.\""],
        ["\"Nine stones and a gap you can walk and won't.\" She flattens a "
         "curl out of the paper. \"The tenth is lying up there with writing "
         "on the underside, and the writing is the ward. Somebody put her "
         "down on her face on purpose.\""],
        "Set the tenth back up.",
        "Turn her over. We need to read it.",
        "sisters", "the_keepers",
        "sisters_restored", "sisters_broken", "sisters_taken",
        ["\"I heard,\" says Maun, and goes back to her paper."]),

    ward_talk(
        "tenkh_talk",
        ["Tenkh does not dismount. \"You crossed the skull line. Nobody "
         "crosses the skull line.\""],
        ["\"Two hundred mounds and eleven rows, and the rows point at "
         "something that isn't there any more.\" He nods at the poles. \"My "
         "grandfather's grandfather set those. Not to keep people out. To "
         "keep people from being *in* when it opens.\""],
        "Reset the line. Every pole.",
        "We're going into the great mound.",
        "kurgan", "the_keepers",
        "kurgan_restored", "kurgan_broken", "kurgan_taken",
        ["He turns the horse before you finish the first sentence."]),
]


# --- prose ----------------------------------------------------------------

pool("act2_thornward_road",
     "North-west, four days through the Undereaves, and the Moot Road is the "
     "only part of it anybody keeps.",
     "Elderhollow first. Nobody walks into the Witchwood without the moot's "
     "leave, and the moot is inside a tree.",
     "Nine square miles the foresters will not work, and a ring of nine trees "
     "in the middle of it with a stair underneath.")

pool("act2_sisters_road",
     "North-east onto the moor, and Barrowgate is the last roof before the "
     "heather.",
     "Nine stones on the highest ground for twenty miles, and a tenth lying "
     "on her face.",
     "The gap between the two southern stones is empty, and walking it turns "
     "out to be a different question from being able to.")

pool("act2_kurgan_road",
     "South, onto grass that goes to every horizon, and then further south "
     "than that.",
     "Ilkhet, and then the skull line, which nobody crosses and you are going "
     "to have to.",
     "Two hundred mounds in eleven rows, aligned on something that is not the "
     "sun and is not there any more.")
