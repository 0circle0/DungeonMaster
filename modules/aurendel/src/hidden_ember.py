"""The Ember Reach's hidden threads — four, in five areas nothing else uses.

Slagfoot is a village built on ground that is warm all year, with a forge, a
store, an inn called the Kettle and a cottage somebody named after a reader. The
Ashfall has a village under it. The Burnt March has a treeline that is the wrong
age. The Obsidian Shelf has a sheet of glass a mile across with a stair broken
into it. Four dungeons between them and, until now, one named NPC in the whole
region.

Four threads, and all of them are the same argument the vent-readers have been
losing for a century: **the Reach is not a volcano doing what volcanoes do.**

  * **The Warm Ground** — Slagfoot has never once been cold, and the tube under
    it does not go where a lava tube goes.
  * **Under the Roofs** — the buried village's roofs are the wrong way up.
  * **The New Treeline** — the March grew back in eleven years instead of ninety,
    and the old workings under it were sealed from inside.
  * **The Sheet** — the over-tuned one. Level 8 on level 7 ground, behind a
    stair broken into a mile of glass, and the seal names what it wants.
"""
from dmkit.quests import npc, shop, quest, reach, kill, flagged, arc
from lore import (
    clue, thread, rumour, favour, talk, coldshoulder, finding, rumoured,
    trophy, keepsake, carried, relic, sealed, blocked,
)

REGION = "ember_reach"
READERS = "the_vent_readers"

WARM = [
    clue("ember_warm_never",
         "The ground under the village has never been cold. Not in a winter, "
         "not in the two years the mountain was quiet, not once.",
         "the Kettle's landlord"),
    clue("ember_warm_wrong",
         "A tube burnt out by lava runs downhill, because that is what the "
         "lava was doing. The one under the village runs level for a mile and "
         "then turns up.",
         "a tube-walker"),
    clue("ember_warm_breath",
         "Air comes out of it in the same rhythm all year, and it is not the "
         "mountain's rhythm. The mountain has seasons. This does not.",
         "the vent-readers' cottage"),
    clue("ember_warm_older",
         "There is dressed stone in the tube a quarter-mile in, and the lava "
         "went round it rather than over it.",
         "cut on the forge lintel"),
]

ROOFS = [
    clue("ember_roofs_up",
         "The roofs of the buried village are the wrong way up. Ash does not "
         "lift a roof; it presses one.",
         "an ash-farmer"),
    clue("ember_roofs_empty",
         "They dug two houses out in living memory and found no bodies in "
         "either. A village that had time to leave does not bar its doors.",
         "the Road Station"),
    clue("ember_roofs_one",
         "One fall of ash, one night, and nine feet of it. The Reach has never "
         "done nine feet in a night before or since.",
         "the vent-readers' record"),
    clue("ember_roofs_warm",
         "The drifts over that village are warm to the hand a foot down, and "
         "the rest of the Ashfall is stone cold.",
         "a drift-walker"),
]

TREES = [
    clue("ember_trees_fast",
         "The March burned to bare rock and had a treeline again in eleven "
         "years. Ninety is the number, everywhere, always.",
         "the Ash Farm"),
    clue("ember_trees_ring",
         "The rings in them are wrong. Eleven years of growth and forty rings, "
         "and the rings run the wrong way out from the middle.",
         "a charcoal burner"),
    clue("ember_trees_sealed",
         "Whatever they were mining under the March was shut up, and it was "
         "shut from the inside. There is no way to bar that door from the "
         "adit side.",
         "the Iron Posts"),
    clue("ember_trees_posts",
         "The iron posts along the road are not milestones. They are set at "
         "the corners of something, and the something is under the trees.",
         "a carter on the Smoking Road"),
]

SHEET = [
    clue("ember_sheet_flat",
         "A mile of glass, poured flat. Lava does not pour flat; it pools and "
         "it cracks and it goes where the ground takes it.",
         "the Cutters' Camp"),
    clue("ember_sheet_stair",
         "The stair into it was not melted through. It was cut, and then the "
         "glass came up around the cut.",
         "a shelf-cutter"),
    clue("ember_sheet_reads",
         "There is writing under the sheet, a foot down, and it is legible, "
         "which means the glass went over it gently.",
         "the vent-readers"),
    clue("ember_sheet_heat",
         "Whatever is under it is still hot after nine hundred years, and "
         "nothing on the Reach has held heat that long.",
         "cut into the Sheet's edge"),
]

LORE = WARM + ROOFS + TREES + SHEET

THREADS = [
    thread("ember_warm", "The Warm Ground",
           "A village that has never been cold, over a tube that runs level "
           "for a mile and then turns up.", WARM),
    thread("ember_roofs", "Under the Roofs",
           "Nine feet of ash in one night, no bodies in two dug houses, and "
           "every roof the wrong way up.", ROOFS),
    thread("ember_trees", "The New Treeline",
           "Eleven years of growth with forty rings in it, over workings that "
           "were sealed from the inside.", TREES),
    thread("ember_sheet", "The Sheet",
           "A mile of glass poured flat over writing that is still legible, "
           "and something under it that has been hot for nine hundred years.",
           SHEET),
]

ITEMS = [
    keepsake("readers_rhythm", "The Reader's Rhythm",
             "Forty years of the tube's breathing, marked in soot on wood. It "
             "keeps no season, which is the entire point of it.",
             holder="tube_walker_esk"),
    keepsake("ashfall_deed", "The Ashfall Deed",
             "Title to a village nine feet under, held by a family that has "
             "farmed the ash over it for six generations and never once dug.",
             holder="ash_farmer_borsa"),
    keepsake("burners_core", "The Burner's Core",
             "A hand-span of trunk from the new treeline, bored out. Forty "
             "rings in eleven years of wood, running the wrong way.",
             holder="charcoal_burner_tenn"),
    keepsake("cutters_rule", "The Cutter's Rule",
             "A brass rule the shelf-cutters use to find the true edge of the "
             "sheet. Laid on the glass it will not lie flat, and the way it "
             "lifts is a map.",
             holder="shelf_cutter_ovid"),

    trophy("tube_slag", "Slag from the Turn",
           "It was still moving when it cooled, and it cooled going upward.",
           "ember_warm_wrong"),

    relic("kettle_ring", "The Kettle Ring", "ring",
          "Iron off the tube's dressed stone, which the lava went around. It "
          "has been warm continuously for as long as anybody has held it.",
          value=800, rarity="rare", resist=(("fire", 0.5),),
          skills={"survival": 2}),
    relic("ashfall_hood", "The Hood off the Ashfall", "head",
          "Taken off a body that was not in a house. Nine feet of ash in one "
          "night and this came through it.",
          value=900, rarity="rare", guard=1, resist=(("fire", 0.75),),
          skills={"perception": 2, "resolve": 2}),
    relic("wrong_ring_haft", "Haft of the Wrong Rings", "hand",
          "Cut from the new treeline. Forty rings in eleven years, and it "
          "takes an edge no wood of that age should hold.",
          value=1000, rarity="very_rare",
          damage=("1d8", "slashing", "agility"), properties=["finesse"]),
    relic("sheet_lens", "A Pane out of the Sheet", "cloak",
          "A sheet of the glass, worn across the shoulders, still faintly warm. "
          "The writing under it reads through from either side.",
          value=1400, rarity="very_rare", guard=2,
          resist=(("fire", 0.5), ("radiant", 0.75)), skills={"lore": 3}),
]

LOOT_TABLES = [
    carried("ember_rhythm_carried", "What Esk Kept", "readers_rhythm"),
    carried("ember_deed_carried", "What Borsa Kept", "ashfall_deed"),
    carried("ember_core_carried", "What Tenn Kept", "burners_core"),
    carried("ember_rule_carried", "What Ovid Kept", "cutters_rule"),
]

GATES = [
    sealed("ember_tube_turn", "Where the Tube Turns Up",
           "A mile of level tube, and then it goes up, past dressed stone the "
           "lava went round.",
           blocked("ember_tube_blocked",
                   "The tube breathes past you on its own schedule and the "
                   "schedule is the thing. Somebody has forty years of it "
                   "written down in soot, and going up there without knowing "
                   "when it breathes in is going up there once.",
                   "Dressed stone, and the lava went around it rather than "
                   "over. You would want to be very sure of the rhythm.",
                   "Warm air, in, then out, then in. It has been doing that "
                   "since before the village and it is not the mountain."),
           items=["readers_rhythm"], opens_flag="ember_warm_open"),

    sealed("ember_roofs_door", "A Door Under Nine Feet",
           "The roofs came up. The doors did not, and the doors are barred.",
           blocked("ember_roofs_blocked",
                   "Barred from inside, under nine feet of ash, in a village "
                   "with no bodies in it. Somebody owns this ground on paper "
                   "and has never dug — that deed says who was here.",
                   "The bar is on the inside and the house is empty. Both of "
                   "those can be true and neither of them should be.",
                   "Warm a foot down, and the rest of the Ashfall cold as "
                   "stone. Whatever is under here has not finished."),
           items=["ashfall_deed"], opens_flag="ember_roofs_open"),

    sealed("ember_workings_seal", "Sealed from the Adit Side",
           "There is no way to bar this door from where you are standing, and "
           "it is barred.",
           blocked("ember_workings_blocked",
                   "Somebody shut this from in there and there is no handle "
                   "out here. The trees over it grew forty rings in eleven "
                   "years; whatever counts time down there does not count it "
                   "the way you do.",
                   "It is barred, and the bar is on the far side, and the "
                   "adit is the only way in. Work that one out before you "
                   "start pulling.",
                   "Wood with the rings running the wrong way is what grew "
                   "over this. That is not a coincidence and it is not "
                   "botany."),
           items=["burners_core"], opens_flag="ember_trees_open"),

    sealed("ember_sheet_stair_seal", "The Cut in the Sheet",
           "A stair cut into a mile of poured glass, and the glass came up "
           "around the cut afterwards.",
           blocked("ember_sheet_blocked",
                   "The writing under the glass has ends and the ends are "
                   "down the stair. Reading it wants the cutters' rule — and "
                   "the heat off the treads wants something that has already "
                   "been through a fire and come out.",
                   "Nine hundred years and it is still too hot to put a hand "
                   "flat on. Going down dressed for the Reach is going down "
                   "dressed for somewhere cooler than this.",
                   "Cut, then poured over. Somebody made a way in and "
                   "somebody else made very sure it stayed the only one."),
           items=["cutters_rule", "kettle_ring"], opens_flag="ember_sheet_open"),
]

POI_PATCHES = {
    "slagfoot_lava_tube": {**rumoured("ember_warm", base=20, step=3, entries=4),
                           "gate": "ember_tube_turn"},
    "ashfall_under_the_roofs": {**rumoured("ember_roofs", base=21, step=3, entries=4),
                                "gate": "ember_roofs_door"},
    "burnt_march_old_workings": {**rumoured("ember_trees", base=21, step=3, entries=4,
                                            skill="survival"),
                                 "gate": "ember_workings_seal"},
    "obsidian_shelf_broken_stair": {**rumoured("ember_sheet", base=24, step=4, entries=4,
                                               skill="lore"),
                                    "gate": "ember_sheet_stair_seal"},
}

POI_TRIGGERS = {
    "slagfoot_warm_ground": [finding("ember_found_warm",
                                     "Ground that has never once been cold.",
                                     "ember_warm_never")],
    "ashfall_buried_village": [finding("ember_found_roofs",
                                       "Which way up the roofs are.",
                                       "ember_roofs_up")],
    "burnt_march_the_treeline": [finding("ember_found_trees",
                                         "Eleven years of trees where ninety "
                                         "is the number.", "ember_trees_fast")],
    "obsidian_shelf_the_sheet": [finding("ember_found_sheet",
                                         "A mile of glass, poured flat.",
                                         "ember_sheet_flat")],
    "smoking_road_iron_posts": [finding("ember_found_posts",
                                        "Posts set at the corners of "
                                        "something.", "ember_trees_posts")],

    "slagfoot_lava_tube": [{
        "id": "ember_warm_committed", "mode": "once", "on": "enter",
        "description": "The mouth of it, breathing on its own schedule.",
        "requires": {"custom": {"gte": [{"ref": "threads.ember_warm.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "ember_the_warm_ground"}}}],
    }],
    "ashfall_under_the_roofs": [{
        "id": "ember_roofs_committed", "mode": "once", "on": "enter",
        "description": "Down through nine feet of it.",
        "requires": {"custom": {"gte": [{"ref": "threads.ember_roofs.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "ember_under_the_roofs"}}}],
    }],
    "burnt_march_old_workings": [{
        "id": "ember_trees_committed", "mode": "once", "on": "enter",
        "description": "The adit, and the bar on the wrong side of it.",
        "requires": {"custom": {"gte": [{"ref": "threads.ember_trees.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "ember_the_new_treeline"}}}],
    }],
    "obsidian_shelf_broken_stair": [{
        "id": "ember_sheet_committed", "mode": "once", "on": "enter",
        "description": "The cut, and what the glass did around it.",
        "requires": {"custom": {"gte": [{"ref": "threads.ember_sheet.known"}, 2]}},
        "effects": [{"emit": {"event": "startQuest",
                              "data": {"quest": "ember_the_sheet"}}}],
    }],
}

BOSSES = {
    "ember_lava_tube": "ember_tube_boss",
    "ember_buried_village": "ember_roofs_boss",
    "ember_old_workings": "ember_workings_boss",
    "ember_glass_stair": "ember_sheet_boss",
    "ember_under_cathedral": "ember_cathedral_boss",
}


def _hidden(qid, name, description, objectives, *, xp, items=(), thread_key=None):
    return quest(qid, name, description, objectives, xp=xp, items=items,
                 tags=["hidden", REGION] + ([thread_key] if thread_key else []))


QUESTS = [
    _hidden("ember_the_warm_ground", "The Warm Ground",
            "A village that has never been cold, over a tube that runs level "
            "for a mile and then turns up past stone the lava went round.",
            [reach("in_the_tube", "Get up the turn.", "slagfoot_lava_tube",
                   hidden=True),
             flagged("past_the_stone", "Get past the dressed stone.",
                     "ember_warm_open", hidden=True),
             kill("what_breathes", "Find what has been breathing.",
                  "tube_breather", hidden=True)],
            xp=180, items=[("kettle_ring", 1)], thread_key="ember_warm"),

    _hidden("ember_under_the_roofs", "Under the Roofs",
            "Nine feet of ash in a single night, two houses dug and no bodies "
            "in either, and every door barred from inside.",
            [reach("under_the_ash", "Get under the roofs.",
                   "ashfall_under_the_roofs", hidden=True),
             flagged("through_the_door", "Open a door that was barred from "
                     "inside.", "ember_roofs_open", hidden=True),
             kill("what_stayed", "Find what stayed.", "ashfall_stayer",
                  hidden=True)],
            xp=190, items=[("ashfall_hood", 1)], thread_key="ember_roofs"),

    _hidden("ember_the_new_treeline", "The New Treeline",
            "Eleven years of growth with forty rings in it, over workings "
            "somebody sealed from the inside.",
            [reach("at_the_adit", "Get into the old workings.",
                   "burnt_march_old_workings", hidden=True),
             flagged("past_the_bar", "Get past a bar on the far side.",
                     "ember_trees_open", hidden=True),
             kill("what_counts", "Find what has been counting.",
                  "ring_counter", hidden=True)],
            xp=200, items=[("wrong_ring_haft", 1)], thread_key="ember_trees"),

    _hidden("ember_the_sheet", "The Sheet",
            "A mile of glass poured flat over writing that is still legible, "
            "and something under it hot for nine hundred years.",
            [reach("down_the_cut", "Get down the cut.",
                   "obsidian_shelf_broken_stair", hidden=True),
             flagged("read_it", "Read what the glass went over.",
                     "ember_sheet_open", hidden=True),
             kill("what_holds_heat", "Meet what has held the heat.",
                  "sheet_founder", hidden=True)],
            xp=270, items=[("sheet_lens", 1)], thread_key="ember_sheet"),
]

ARCS = [
    arc("ember_hidden", "The Ember Reach, Unread",
        "Four arguments the vent-readers have been losing for a century, and "
        "the ground agreeing with them the whole time.",
        [q["id"] for q in QUESTS]),
]

NPCS = [
    npc("tube_walker_esk", "Esk, who Walks the Tube",
        "Has been in and out of the lava tube for forty years and has forty "
        "years of its breathing marked in soot on a board.",
        faction=READERS, dialogue_id="ember_esk_talk",
        home="slagfoot_house_a", disposition=4, gullibility=0.25,
        memory_span=300, statblock="ember_walker"),

    npc("ash_farmer_borsa", "Borsa of the Ash Farm",
        "Six generations of farming the ash over a village her family holds "
        "the deed to, and not one of them has ever put a spade in it.",
        faction=READERS, dialogue_id="ember_borsa_talk",
        home="burnt_march_ash_farm", disposition=6, gullibility=0.35,
        memory_span=250, statblock="ember_farmer",
        shop=shop("keeper_stock", buys=("material",), multiplier=1.2)),

    npc("charcoal_burner_tenn", "Tenn, Charcoal Burner",
        "Burns the new treeline for charcoal and has been bothered by the "
        "rings in it for eleven years.",
        faction=READERS, dialogue_id="ember_tenn_talk",
        home="smoking_road_waystation", disposition=2, gullibility=0.4,
        memory_span=150, statblock="ember_burner"),

    npc("shelf_cutter_ovid", "Ovid, Shelf-Cutter",
        "Cuts obsidian off the sheet for the Reach's blades and owns the rule "
        "that finds its true edge, which will not lie flat on it.",
        faction=READERS, dialogue_id="ember_ovid_talk",
        home="obsidian_shelf_cutters_camp", disposition=-2, gullibility=0.2,
        memory_span=200, statblock="ember_cutter",
        shop=shop("keeper_stock", buys=("material", "treasure"),
                  multiplier=1.35)),

    npc("kettle_landlord_vaso", "Vaso, at the Kettle",
        "Keeps the only inn on warm ground in the Reach and has never once "
        "had to light the fire for the floor.",
        faction=READERS, dialogue_id="ember_vaso_talk",
        home="slagfoot_the_kettle", disposition=8, gullibility=0.5,
        memory_span=120,
        shop=shop("hollowdene_stock", buys=("treasure",), multiplier=1.3)),

    npc("drift_walker_iman", "Iman, who Walks the Drifts",
        "Crosses the Ashfall for a living because the road round it is four "
        "days, and knows exactly which drifts are warm.",
        faction=READERS, dialogue_id="ember_iman_talk",
        home="ashfall_the_drifts", disposition=4, gullibility=0.4,
        memory_span=150),
]

from bestiary import creature, A, HALF_UNLESS_SILVER  # noqa: E402
from dmkit.loot import group, encounters  # noqa: E402

_FOLK = dict(creature_type="humanoid", faction="the_vent_readers")

MONSTERS = [
    creature("ember_walker", "Esk, who Walks the Tube", 6, 0,
             A(13, 15, 15, 12, 15, 10), ["strike"],
             "Forty years of crawling up a hot tube builds a particular sort "
             "of person.", descriptors=["a soot-black"],
             loot="ember_rhythm_carried", hp=34, **_FOLK),
    creature("ember_farmer", "Borsa of the Ash Farm", 5, 0,
             A(15, 11, 15, 11, 13, 12), ["strike"],
             "Farms ash, which is heavier work than farming soil.",
             descriptors=["a broad"], loot="ember_deed_carried", hp=32, **_FOLK),
    creature("ember_burner", "Tenn, Charcoal Burner", 5, 0,
             A(14, 12, 14, 11, 13, 10), ["strike"],
             "Stacks and tends a burn for nine days at a stretch.",
             descriptors=["a smoke-cured"], loot="ember_core_carried", hp=30,
             **_FOLK),
    creature("ember_cutter", "Ovid, Shelf-Cutter", 6, 0,
             A(14, 16, 13, 13, 13, 9), ["strike", "cut_and_run"],
             "Works a material that opens a hand if you look away from it.",
             descriptors=["a scarred"], loot="ember_rule_carried", hp=33,
             **_FOLK),

    creature("tube_breather", "What Breathes in the Tube", 8, 800,
             A(16, 13, 18, 12, 16, 13), ["vent_breath", "cinder_lash", "rend"],
             "It has kept the same rhythm for longer than the village, and the "
             "village has never once been cold.",
             behaviour=[{"priority": 20, "use": "vent_breath",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "cinder_lash"}],
             descriptors=["a slow", "a breathing"], loot="ember_tube_hoard",
             immunities=["burning", "frightened"], hp=94),
    creature("ashfall_stayer", "What Stayed", 8, 820,
             A(15, 14, 17, 13, 16, 15), ["grave_chill", "wither", "rend"],
             "Two houses dug and no bodies in either. Somebody stayed, and it "
             "was not a body that did it.",
             behaviour=[{"priority": 15, "use": "wither"},
                        {"priority": 0, "use": "grave_chill"}],
             descriptors=["an ash-grey", "a patient"],
             loot="ember_roofs_hoard", interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned"], hp=90),
    creature("ring_counter", "What Has Been Counting", 8, 850,
             A(17, 12, 17, 14, 15, 12), ["root_and_branch", "stone_fist"],
             "Forty rings in eleven years is not fast growth. It is a count of "
             "something else kept in wood.",
             behaviour=[{"priority": 15, "use": "root_and_branch",
                         "when": {"chance": 0.4}},
                        {"priority": 0, "use": "stone_fist"}],
             descriptors=["a knotted", "a many-ringed"],
             loot="ember_workings_hoard", immunities=["prone", "frightened"],
             hp=100),
    creature("sheet_founder", "What Held the Heat", 10, 1550,
             A(20, 13, 20, 17, 16, 18),
             ["vent_breath", "unmaking_word", "glass_shard", "cinder_lash"],
             "Nine hundred years under a mile of poured glass, and still too "
             "hot to put a hand flat on the treads above it.",
             behaviour=[{"priority": 30, "use": "unmaking_word",
                         "when": {"chance": 0.25}},
                        {"priority": 20, "use": "vent_breath",
                         "when": {"chance": 0.35}},
                        {"priority": 10, "use": "glass_shard"},
                        {"priority": 0, "use": "cinder_lash"}],
             descriptors=["a white", "a founding"], loot="ember_sheet_hoard",
             interactions=HALF_UNLESS_SILVER,
             immunities=["frightened", "poisoned", "burning", "prone"], hp=170),
    creature("cathedral_slag", "The Thing in the Slag Cathedral", 8, 760,
             A(18, 10, 18, 8, 13, 10), ["cinder_lash", "stone_fist"],
             "Cinderhold built a temple over a vent and the vent has opinions.",
             descriptors=["a fused", "a lumbering"], loot="ember_tube_hoard",
             immunities=["burning", "prone", "frightened"], hp=92),
]

ENCOUNTER_TABLES = [
    encounters("ember_tube_boss", [group("b", [("tube_breather", "1", False)])],
               chance=1, empty=0),
    encounters("ember_roofs_boss", [group("b", [("ashfall_stayer", "1d2", True)])],
               chance=1, empty=0),
    encounters("ember_workings_boss", [group("b", [("ring_counter", "1", False)])],
               chance=1, empty=0),
    encounters("ember_sheet_boss", [group("b", [("sheet_founder", "1", False)])],
               chance=1, empty=0),
    encounters("ember_cathedral_boss", [group("b", [("cathedral_slag", "1", False)])],
               chance=1, empty=0),
]

LOOT_TABLES += [
    {"id": "ember_tube_hoard", "name": "Past the Turn", "rolls": "2",
     "emptyChance": 0, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 3, "value": {"item": "old_coin", "quantity": "3d6"}},
                 {"weight": 2, "value": {"item": "iron_ore", "quantity": "1d3"}},
                 {"weight": 1, "value": {"item": "tube_slag", "quantity": "1",
                                         "unique": True}}]},
    {"id": "ember_roofs_hoard", "name": "Behind a Barred Door", "rolls": "2",
     "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "2d6"}},
                 {"weight": 2, "value": {"item": "wight_ash", "quantity": "1d3"}},
                 {"weight": 1, "value": {"item": "warded_coat", "quantity": "1"}}]},
    {"id": "ember_workings_hoard", "name": "Under the New Treeline",
     "rolls": "2", "emptyChance": 0.1, "bonusRollSkill": "perception",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 4, "value": {"item": "old_coin", "quantity": "2d6"}},
                 {"weight": 2, "value": {"item": "iron_ore", "quantity": "1d4"}},
                 {"weight": 1, "value": {"item": "silvered_blade", "quantity": "1"}}]},
    {"id": "ember_sheet_hoard", "name": "Under the Sheet", "rolls": "3",
     "emptyChance": 0, "bonusRollSkill": "lore",
     "bonusRolls": {"onSuccess": 1, "onCritical": 2},
     "entries": [{"weight": 3, "value": {"item": "old_coin", "quantity": "5d6"}},
                 {"weight": 2, "value": {"item": "glass_bead", "quantity": "2d3"}},
                 {"weight": 2, "value": {"item": "amber_lump", "quantity": "1d2"}}]},
]

_esk = [
    rumour("ember_esk_wrong", "Where does that tube actually go?",
           "“Level.” He says it like an accusation. “A mile of it, dead level, "
           "and then it turns *up*. Lava does not go up. Lava has never gone "
           "up in the history of going anywhere.”",
           "ember_warm_wrong", faction=READERS, base=12, skill="insight"),
    rumour("ember_esk_breath", "You have been marking its breathing.",
           "He turns the board round. Forty years of soot marks, and the "
           "spacing does not change anywhere along it. “The mountain has "
           "seasons. Everything on this Reach has seasons.” He taps the board. "
           "“That does not.”",
           "ember_warm_breath", faction=READERS, base=14),
    rumour("ember_esk_older", "Is there anything in there that is not rock?",
           "“Dressed stone, quarter-mile in.” He waits to see whether you have "
           "understood. “The lava went *round* it. Which means the stone was "
           "there first, and the stone is squared, and nobody squares stone a "
           "quarter-mile up a lava tube for fun.”",
           "ember_warm_older", faction=READERS, base=15),
]
_esk.append(rumour(
    "ember_esk_reads", "Is there anything written on this Reach that is not "
    "the readers' own?",
    "“Under the sheet.” He says it quietly, which for Esk is significant. “A "
    "foot down in the glass, and *legible* — which means the glass went over "
    "it gently, and a mile of glass does not go over anything gently. We have "
    "rubbings. We have never been able to reach it.”",
    "ember_sheet_reads", faction=READERS, base=16, skill="lore"))
_esk.append(favour(
    "ember_esk_board",
    "I need the board. All forty years of it.",
    "He lifts it off the pegs and looks at the wall behind it, which is clean "
    "where the board was. “Bring it back,” he says. “Or do not, if what you "
    "find means there is no point.”",
    "readers_rhythm", faction=READERS, base=16, cost=2,
    refused="“No. It is forty years and it is one board.”"))

DIALOGUES = [
    talk("ember_esk_talk", "greet",
         ["A cottage with a soot-marked board the size of a door on the wall, "
          "and a man who has clearly been waiting for somebody to ask about it.",
          "“Reader,” he says, of himself, without much conviction. “Retired. "
          "Nobody reads the tube.”"],
         _esk,
         redirects=[coldshoulder("ember_esk", READERS, -30,
                                 "He takes the board off the wall and puts it "
                                 "face to it.", back="greet")[0]],
         extra_nodes=[coldshoulder("ember_esk", READERS, -30,
                                   "He takes the board off the wall and puts "
                                   "it face to it.", back="greet")[1]]),

    talk("ember_vaso_talk", "greet",
         ["A taproom warm from the floor up, which is the wrong direction for "
          "a room to be warm in.",
          "“Mind the flags, they're hot at the back. Ale's cold, at least.”"],
         [rumour("ember_vaso_never", "Has this floor ever been cold?",
                 "“Never.” No hesitation at all. “Not in the hard winter, not "
                 "in the two years the mountain went quiet and everybody in "
                 "Cinderhold froze. My grandfather's tally is on the beam — he "
                 "started marking cold nights and gave up because there were "
                 "none.”",
                 "ember_warm_never", faction=READERS, base=9),
          rumour("ember_vaso_stone", "Anything odd ever come out of the tube?",
                 "“Esk talks about stone. Squared stone, a quarter-mile in.” He "
                 "wipes the counter. “I have known him forty years and he has "
                 "never once made a thing up, which is why I have stopped "
                 "asking him about it.”",
                 "ember_warm_older", faction=READERS, base=12)]),

    talk("ember_iman_talk", "greet",
         ["A figure crossing the drifts with a pole, testing ahead of every "
          "step, and no apparent interest in stopping.",
          "“Follow my line exactly or do not follow it. The ash does not hold "
          "everywhere.”"],
         [rumour("ember_iman_warm", "Which drifts are warm?",
                 "“The ones over the village.” She does not break stride. “A "
                 "foot down and warm to the hand, and the rest of the Ashfall "
                 "is stone cold. Nine years I have crossed this. It is the "
                 "same ground every time.”",
                 "ember_roofs_warm", faction=READERS, base=11),
          rumour("ember_iman_warmground",
                 "You cross warm ground for a living. Is the village's ground "
                 "the same as Slagfoot's?",
                 "“No.” She is definite. “Slagfoot is warm all the way down "
                 "and always has been — you can stand on it barefoot in "
                 "midwinter and I have. Mine is warm a foot down and cold "
                 "under that.” She moves on. “Different things making it.”",
                 "ember_warm_never", faction=READERS, base=12,
                 skill="insight"),
          rumour("ember_iman_one", "How long did the fall take?",
                 "“One night.” She stops, which from her is a speech. “Nine "
                 "feet, one night. The readers have the record. The Reach has "
                 "never done nine feet in a night before it or since.”",
                 "ember_roofs_one", faction=READERS, base=13)]),
]

_borsa = [
    rumour("ember_borsa_up", "The roofs down there. Which way up are they?",
           "“Up.” She lets that sit. “Ash presses a roof. It does not lift "
           "one. Every roof my family has ever uncovered a corner of has been "
           "the wrong way up, and we stopped uncovering corners.”",
           "ember_roofs_up", faction=READERS, base=11),
    rumour("ember_borsa_empty", "Anybody ever dug a house out?",
           "“Two, in my grandmother's time.” She is not enjoying this. “No "
           "bodies in either. Doors barred and nobody home.” A pause. “A "
           "village that has time to leave does not bar its doors, and a "
           "village that bars its doors is still in them.”",
           "ember_roofs_empty", faction=READERS, base=14, skill="insight"),
    rumour("ember_borsa_fast", "Your treeline came back fast.",
           "“Eleven years. It is ninety, everywhere, always — my father wrote "
           "away to the Library to check and they wrote back ninety.” She "
           "looks at the trees. “I have not been comfortable in that wood "
           "since.”",
           "ember_trees_fast", faction=READERS, base=12),
]
_borsa.append(favour(
    "ember_borsa_deed",
    "The deed to the buried village. I want to know whose it was.",
    "She fetches it without a word and hands it over folded. “Six generations "
    "of paying tithe on nine feet of ash,” she says. “If it turns out we have "
    "been paying tithe on somebody who is still down there, I would rather "
    "know than not.”",
    "ashfall_deed", faction=READERS, base=14, cost=2,
    refused="“It is the farm's,” she says. “I will tell you what is on it. I "
            "will not hand it to somebody I met this morning.”"))

DIALOGUES.append(
    talk("ember_borsa_talk", "greet",
         ["A farm on grey ground, growing something grey, with a woman working "
          "it who does not look up until you are close.",
          "“Ash farm. It grows two things and neither of them is what you are "
          "hoping.”"],
         _borsa))

_tenn = [
    rumour("ember_tenn_ring", "The rings in the new trees.",
           "He fetches a bored core without being asked. “Forty. In eleven "
           "years of wood.” He turns it. “And they run the wrong way out from "
           "the middle, which I have shown to three foresters and one of them "
           "walked off.”",
           "ember_trees_ring", faction=READERS, base=13, skill="insight"),
    rumour("ember_tenn_posts", "The iron posts on the road.",
           "“Not milestones. Wrong spacing, wrong iron.” He draws it in the "
           "dirt with a stick: four posts, and a shape between them. “They are "
           "corners. And the middle of what they are the corners of is under "
           "the new trees.”",
           "ember_trees_posts", faction=READERS, base=14),
    rumour("ember_tenn_sealed", "Anybody been down the old workings?",
           "“Cannot be. It is barred.” He is very clear about this. “Barred "
           "from the inside, and the adit is the only way in, and I would like "
           "somebody cleverer than me to explain how both of those are true.”",
           "ember_trees_sealed", faction=READERS, base=15),
]
_tenn.append(favour(
    "ember_tenn_core",
    "Give me the core.",
    "He hands it over end-first, like a tool. “Count them yourself. I have "
    "counted them eleven times and I would like to be wrong.”",
    "burners_core", faction=READERS, base=12, cost=1,
    refused="“Bore your own,” he says, not unkindly. “The saw is there.”"))

DIALOGUES.append(
    talk("ember_tenn_talk", "greet",
         ["A road station with a burn smoking behind it and a man watching the "
          "smoke the way other people watch a pot.",
          "“Nine days in a burn. Talk if you like, I am not going anywhere.”"],
         _tenn))

_ovid = [
    rumour("ember_ovid_stair", "The stair into the sheet.",
           "“Cut.” He does not elaborate until you wait. “Not melted through — "
           "cut, with tools, and then the glass came up around the cut. You "
           "can see the tool marks in the sides of it under the glass.”",
           "ember_sheet_stair", faction=READERS, base=14, skill="insight"),
    rumour("ember_ovid_flat", "A mile of it, and flat.",
           "“Which is the part nobody will discuss.” He puts the blade down. "
           "“Lava pools. It cracks, it goes where the ground takes it, it is "
           "never flat. That is flat to the width of my rule over a mile.”",
           "ember_sheet_flat", faction=READERS, base=12),
    rumour("ember_ovid_heat", "It is still warm.",
           "“Hot. Say hot.” He shows you his palm, which is a map of old "
           "burns. “Nine hundred years by the readers' count and I cannot put "
           "a hand flat on the treads. Nothing on this Reach holds heat like "
           "that. Not the vents. Not the cathedral. Nothing.”",
           "ember_sheet_heat", faction=READERS, base=15),
]
_ovid.append(favour(
    "ember_ovid_rule",
    "Your rule. The one that will not lie flat.",
    "He hands it over and watches your face rather than the rule. “Lay it on "
    "the sheet. It lifts, and where it lifts is not random, and I have spent "
    "six years pretending that is a flaw in the brass.”",
    "cutters_rule", faction=READERS, base=17, cost=3,
    refused="“It is my rule and it is how I make my living. No.”"))

DIALOGUES.append(
    talk("ember_ovid_talk", "greet",
         ["A camp at the edge of a mile of black glass, and a man dressing a "
          "blade with his back to all of it.",
          "“Obsidian by the pound, and I will not cut to order. Say what you "
          "want and be quick, the light goes off the sheet at noon.”"],
         _ovid,
         redirects=[coldshoulder("ember_ovid", READERS, -25,
                                 "He picks up the blade he was dressing and "
                                 "holds it, which is answer enough.",
                                 back="greet")[0]],
         extra_nodes=[coldshoulder("ember_ovid", READERS, -25,
                                   "He picks up the blade he was dressing and "
                                   "holds it, which is answer enough.",
                                   back="greet")[1]]))
