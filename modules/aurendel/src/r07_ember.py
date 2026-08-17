"""Region 7 — The Ember Reach.

Volcanic badlands on the eastern edge, where the weather comes from below. One
town built on slag, one village at the foot of a vent field, and six stretches
of ash. The most dangerous overland country south of the ice, and the richest
in obsidian, iron, and things worth digging up.
"""
from place import (
    area, poi, gate, house, inn, smithy, store, warehouse, guild, square,
    landmark, ruin, delve,
)
from dungeonkit import dungeon
from prose import pool

WILD, STONE, TIMBER = "volcanic", "urban_stone", "urban_timber"
TAGS = ["ember_reach"]

AREAS = [
    area("ember_cinderhold", "Cinderhold", STONE, "town", 2, 7,
         "Built on its own slag heaps, walled in basalt, and hot enough that "
         "nobody lights a fire for warmth.", tags=TAGS + ["town"]),
    area("ember_slagfoot", "Slagfoot", TIMBER, "village", 4, 7,
         "At the foot of the vent fields, and the ground under the village is "
         "warm to the hand all year.", tags=TAGS + ["village"]),

    area("ember_the_ashfall", "The Ashfall", WILD, "wild", 7, 7,
         "Grey drift eight feet deep in the hollows, and it takes a footprint "
         "and keeps it for a season.", tags=TAGS),
    area("ember_obsidian_shelf", "The Obsidian Shelf", WILD, "wild", 7, 8,
         "Black glass in sheets a mile across, and every edge of it is an "
         "edge.", tags=TAGS),
    area("ember_smoking_road", "The Smoking Road", WILD, "wild", 6, 7,
         "The only route across the reach that anybody keeps, marked by iron "
         "posts because nothing else survives being a marker.", tags=TAGS),
    area("ember_the_burnt_march", "The Burnt March", WILD, "wild", 6, 7,
         "The western edge, where the ash thins and things start growing "
         "again, badly.", tags=TAGS),
    area("ember_vent_fields", "The Vent Fields", WILD, "wild", 8, 8,
         "Four hundred acres of ground that breathes out, on schedules nobody "
         "has managed to write down.", tags=TAGS),
    area("ember_firewatch_ridge", "Firewatch Ridge", WILD, "wild", 6, 7,
         "The high ground on the northern side, with a chain of towers along "
         "it that were built to watch the mountain rather than the road.",
         tags=TAGS),
]

EDGES = [
    ("ember_firewatch_ridge", "ember_cinderhold", 35),
    ("ember_cinderhold", "ember_the_ashfall", 40),
    ("ember_the_ashfall", "ember_obsidian_shelf", 45),
    ("ember_obsidian_shelf", "ember_vent_fields", 40),
    ("ember_vent_fields", "ember_slagfoot", 35),
    ("ember_slagfoot", "ember_smoking_road", 40),
    ("ember_smoking_road", "ember_the_burnt_march", 50),
    ("ember_the_burnt_march", "ember_firewatch_ridge", 45),
    ("ember_cinderhold", "ember_smoking_road", 55),
]

GATES = [
    gate("ember_vent_ward", "The Vent Ward", "hazard",
         "A line of iron posts across the vent fields with a chain between "
         "them, and past the chain the ground is on its own schedule.",
         bypass=("survival", 16),
         requires={"description": "a vent-reader's word on the day",
                   "minLevel": 6},
         blocked_key="ember_vent_ward_blocked"),
    gate("cinderhold_slag_door", "The Slag Door", "lock",
         "Cast in one piece, in place, by pouring it — which means it has "
         "never been opened and was never meant to be.",
         bypass=("craft", 17), opens_with=["arcane_bolt"],
         blocked_key="cinderhold_slag_door_blocked"),
]

POIS = [
    # ===== Cinderhold =====
    poi("cinderhold_slag_temple", "The Slag Cathedral", "ember_cinderhold",
        "shrine",
        "Cast rather than built: they poured it, over eleven years, and it "
        "has no joints anywhere.", minutes=6, static="slag_temple",
        services=["temple"], tags=["landmark", "shrine"]),
    poi("cinderhold_the_black_wall", "The Black Wall", "ember_cinderhold",
        "landmark",
        "Basalt, forty feet, and it is not there to keep people out.",
        minutes=4, interior=False, tags=["landmark"]),
    square("cinderhold_glass_market", "The Glass Market", "ember_cinderhold",
           "Obsidian by the sheet, by the flake, and by the finished edge."),
    smithy("cinderhold_foundry", "The Great Foundry", "ember_cinderhold",
           "Uses the ground for half its heat, which is why the town is "
           "here.", size="hall"),
    smithy("cinderhold_edge_shop", "The Edge Shop", "ember_cinderhold",
           "Obsidian blades: sharper than steel, and they last about nine "
           "minutes.", size="large"),
    warehouse("cinderhold_ore_yard", "The Ore Yard", "ember_cinderhold",
              "Iron out of the reach, graded and stacked and waiting for a "
              "cart brave enough.", size="hall"),
    store("cinderhold_store", "The Reach Stores", "ember_cinderhold",
          "Water, mostly. Water is the expensive thing here.", size="large"),
    store("cinderhold_apothecary", "The Ash Apothecary", "ember_cinderhold",
          "Burns, lungs, and the specific things the reach does to people.",
          trade="apothecary", size="large"),
    inn("cinderhold_the_cold_room", "The Cold Room", "ember_cinderhold",
        "Dug down rather than built up, and it is the only cool building in "
        "the town, and it is not cool.", size="large"),
    guild("cinderhold_vent_readers", "The Vent Readers' Hall", "ember_cinderhold",
          "Forty people who can tell you what the ground will do tomorrow, "
          "and are right about four days in five."),
    house("cinderhold_house_a", "Basalt Row", "ember_cinderhold",
          "Walls three feet thick, one window, and it stays at the same "
          "temperature all year."),
    house("cinderhold_house_b", "The Founder's House", "ember_cinderhold",
          "Cast, like the cathedral, by somebody proving a point."),
    poi("cinderhold_slag_door", "The Slag Door", "ember_cinderhold",
        "dungeonEntrance",
        "In the floor of the cathedral, cast shut in one piece, and the "
        "cathedral was built to have it there.", minutes=10,
        dungeon="ember_under_cathedral", gate="cinderhold_slag_door",
        tags=["dungeon"]),

    # ===== Slagfoot =====
    landmark("slagfoot_warm_ground", "The Warm Ground", "ember_slagfoot",
             "You can lie on it in Deepdark and be comfortable, and people "
             "do, and occasionally it goes wrong.", minutes=3),
    inn("slagfoot_the_kettle", "The Kettle", "ember_slagfoot",
        "Boils its water by standing the pot on the floor.", size="small"),
    store("slagfoot_store", "The Foot Store", "ember_slagfoot",
          "Water, boots, and the good kind of gloves.", size="small"),
    smithy("slagfoot_forge", "The Ground Forge", "ember_slagfoot",
           "Has no fire of its own. Does not need one.", size="small"),
    house("slagfoot_house_a", "The Reader's Cottage", "ember_slagfoot",
          "Whoever reads the vents lives here, at the front, closest to "
          "them."),
    house("slagfoot_house_b", "Sulphur Row", "ember_slagfoot",
          "Three cottages built out of the same cooled flow they stand on."),
    delve("slagfoot_lava_tube", "The Lava Tube", "ember_slagfoot",
          "A flow drained out from under its own crust and left a tunnel "
          "twenty feet across going into the mountain.",
          "ember_lava_tube", minutes=12),

    # ===== the reach =====
    landmark("ashfall_the_drifts", "The Drifts", "ember_the_ashfall",
             "Eight feet deep in the hollows, and it takes a footprint and "
             "keeps it until the next fall.", minutes=8),
    ruin("ashfall_buried_village", "The Buried Village", "ember_the_ashfall",
         "Roofs showing above the ash in a line, and everything below the "
         "roofs is exactly as it was left.", minutes=10, trade="house",
         size="large"),
    delve("ashfall_under_the_roofs", "Under the Roofs", "ember_the_ashfall",
          "You go in through a chimney and down into a street.",
          "ember_buried_village", minutes=14),

    landmark("obsidian_shelf_the_sheet", "The Sheet", "ember_obsidian_shelf",
             "A mile of black glass, flat, and it reflects the sky in a way "
             "that stops being pleasant after a while.", minutes=8),
    poi("obsidian_shelf_cutters_camp", "The Cutters' Camp",
        "ember_obsidian_shelf", "camp",
        "Where the glass is quarried, by people who work in leather from neck "
        "to ankle in that heat.", minutes=6, trade="cave", size="medium"),
    poi("obsidian_shelf_broken_stair", "The Broken Stair",
        "ember_obsidian_shelf", "dungeonEntrance",
        "A stair going down through the glass, cut before the glass was "
        "there, which is not a thing that can be true.", minutes=12,
        dungeon="ember_glass_stair", tags=["dungeon"]),

    landmark("smoking_road_iron_posts", "The Iron Posts", "ember_smoking_road",
             "A hundred paces apart, all the way across, because nothing else "
             "survives being a marker here.", minutes=6),
    poi("smoking_road_waystation", "The Road Station", "ember_smoking_road",
        "settlement",
        "Stone, thick, with a water cistern under it and a bell on top.",
        minutes=5, trade="hall", size="medium", services=["inn"],
        tags=["inn"]),
    ruin("smoking_road_lost_cart", "The Lost Cart", "ember_smoking_road",
         "Off the line of posts by forty yards, and it has been there since "
         "before the posts.", minutes=8, trade="cave", size="small"),

    landmark("burnt_march_the_treeline", "The New Treeline",
             "ember_the_burnt_march",
             "Where things start growing again, badly, and the line has moved "
             "east twice in living memory.", minutes=6),
    poi("burnt_march_ash_farm", "The Ash Farm", "ember_the_burnt_march",
        "settlement",
        "Somebody is farming the ash, which is extraordinarily fertile once "
        "it has had thirty years.", minutes=5, trade="farm", size="medium",
        desc_key="int_house"),
    delve("burnt_march_old_workings", "The Old Workings", "ember_the_burnt_march",
          "Iron was got here before the reach caught fire, and the workings "
          "were left in the middle of a shift.",
          "ember_old_workings", minutes=12),

    poi("vent_fields_the_chain", "The Chain", "ember_vent_fields", "crossing",
        "Iron posts and a chain, and past the chain the ground breathes on "
        "its own schedule.", minutes=5, interior=False,
        gate="ember_vent_ward", tags=["crossing"]),
    landmark("vent_fields_the_great_vent", "The Great Vent", "ember_vent_fields",
             "Forty feet across, and it goes off about every nine hours, and "
             "you can set a watch by it if you are willing to stand there.",
             minutes=10),
    delve("vent_fields_the_throat", "The Throat", "ember_vent_fields",
          "Down the side of the Great Vent, on ledges, between eruptions.",
          "ember_the_throat", minutes=16, gate="ember_vent_ward"),

    landmark("firewatch_ridge_towers", "The Firewatch Towers",
             "ember_firewatch_ridge",
             "Nine of them along the ridge, built to watch the mountain "
             "rather than the road, and four are still manned.", minutes=6),
    ruin("firewatch_ridge_fallen_tower", "The Fallen Tower",
         "ember_firewatch_ridge",
         "The fifth. It went over in the year of the ashfall and the "
         "garrison went with it.", minutes=8, trade="keep", size="medium"),
    delve("firewatch_ridge_signal_deep", "The Signal Deep",
          "ember_firewatch_ridge",
          "Under the seventh tower there is a shaft, and it was there before "
          "the tower, and the tower was put on top of it deliberately.",
          "ember_signal_deep", minutes=13, hidden=True,
          discover=("lore", 14), tags=["secret"]),
]

DUNGEONS = [
    dungeon("ember_under_cathedral", "Under the Slag Cathedral", "dungeon_ember",
            "The cathedral was cast on top of this, in one piece, over eleven "
            "years, with the door already shut.",
            rooms="13", depth="3", branchiness=0.3),
    dungeon("ember_lava_tube", "The Lava Tube", "dungeon_ember",
            "A flow drained out from under its own crust: twenty feet across, "
            "round, and going a long way in.",
            rooms="10", depth="2", branchiness=0.15,
            corridorLength="5d3", corridor={"style": "winding", "width": 2}),
    dungeon("ember_buried_village", "The Buried Village", "dungeon_ember",
            "A street under eight feet of ash, entered through a chimney, "
            "with every door on it still shut.",
            rooms="12", depth="2", algorithm="bsp", bsp={"minLeaf": 5}),
    dungeon("ember_glass_stair", "The Glass Stair", "dungeon_ember",
            "A cut stair going down through a mile of obsidian, and the "
            "cutting is older than the glass.",
            rooms="14", depth="4", branchiness=0.25),
    dungeon("ember_old_workings", "The Old Workings", "dungeon_delved",
            "Iron got here before the reach caught fire, and abandoned in the "
            "middle of a shift with the tools where they fell.",
            rooms="11", depth="2", branchiness=0.5),
    dungeon("ember_the_throat", "The Throat", "dungeon_ember",
            "Down the inside of the Great Vent on ledges, in the nine hours "
            "between one eruption and the next.",
            rooms="12", depth="4", algorithm="caverns", caverns={"fill": 0.46, "smoothingPasses": 4, "birthThreshold": 5}),
    dungeon("ember_signal_deep", "The Signal Deep", "dungeon_delved",
            "A shaft under the seventh tower that the tower was put on top of "
            "on purpose, and it goes considerably further than the ridge.",
            rooms="13", depth="4", algorithm="bsp", bsp={"minLeaf": 6}),
]

# --- prose ------------------------------------------------------------------

pool("ember_cinderhold_desc",
     "A town on its own slag heaps, walled in basalt, and nobody here lights "
     "a fire for warmth.",
     "Cinderhold. Everything is black, including the mortar, including the "
     "roofs, including the people's hands.",
     "The ground is warm through the street. In the foundry quarter it is "
     "more than warm.",
     "Ash on the sills, swept twice a day, and the sweeping is somebody's "
     "whole job.")

pool("ember_slagfoot_desc",
     "Nine buildings at the foot of the vent fields, and the ground under "
     "them is warm to the hand in every month.",
     "Slagfoot. They boil water by standing the pot on the floor and they are "
     "not being funny.",
     "Sulphur in the air, faint, all the time, and you stop smelling it and "
     "then you notice you have stopped.",
     "Somebody is watching the vents. Somebody is always watching the vents.")

pool("ember_the_ashfall_desc",
     "Grey drift eight feet deep in the hollows, and it takes a footprint and "
     "keeps it for a season.",
     "The Ashfall. Nothing grows and nothing has for two hundred years.",
     "It falls like snow if snow were grey and tasted of iron, and it falls "
     "most days.",
     "Roofs showing above the drift in a line, which used to be a village.")

pool("ember_obsidian_shelf_desc",
     "A mile of black glass, flat, reflecting the sky in a way that stops "
     "being pleasant after about ten minutes.",
     "The Obsidian Shelf. Every edge here is an edge and there are a great "
     "many edges.",
     "It rings underfoot, faintly, in a note that changes with the "
     "thickness.",
     "Where it has cracked, the cracks are conchoidal and about as sharp as "
     "anything gets.")

pool("ember_smoking_road_desc",
     "Iron posts a hundred paces apart, all the way across, because nothing "
     "else survives being a marker here.",
     "The Smoking Road. Between the posts there is ash, and under the ash "
     "there is a road, in theory.",
     "Ground smoking in three places within sight, none of them alarming, all "
     "of them worth going round.",
     "The next post is visible. The one after it usually is not.")

pool("ember_the_burnt_march_desc",
     "The western edge, where things start growing again, badly, and grudgingly.",
     "The Burnt March. The treeline has moved east twice in living memory, "
     "which is the good direction.",
     "Ash-fed soil, extraordinarily fertile once it has had thirty years, and "
     "somebody is trying it.",
     "Green, of a sort, and grey underneath all of it.")

pool("ember_vent_fields_desc",
     "Four hundred acres of ground that breathes out, on schedules nobody has "
     "managed to write down.",
     "The Vent Fields. Steam in a dozen places, and the dozen is not the same "
     "dozen as yesterday.",
     "A vent lets go forty paces off with a noise like a kettle the size of a "
     "house.",
     "Iron posts and a chain mark the edge of what is considered reasonable.")

pool("ember_firewatch_ridge_desc",
     "High ground on the northern side with nine towers strung along it, "
     "built to watch the mountain rather than the road.",
     "Firewatch Ridge. Four towers are still manned. The fifth is on its "
     "side.",
     "From up here you can see the whole reach smoking gently in about "
     "fifteen places.",
     "Cooler, marginally, and the wind takes the ash the other way.")

pool("cinderhold_slag_temple_desc",
     "Cast, not built. They poured it over eleven years and it has no joints "
     "anywhere in it.",
     "The Slag Cathedral. The walls are one piece and so is the roof and so, "
     "unfortunately, is the door in the floor.",
     "Black, seamless, and warm to the touch on the north side for reasons "
     "nobody has satisfactorily explained.")

pool("obsidian_shelf_broken_stair_desc",
     "A stair going down through the glass, and the stair was cut before the "
     "glass was there.",
     "The treads are worn. Under a mile of obsidian that flowed over them.",
     "This cannot be the case, and it is, and the cutters have stopped "
     "quarrying within two hundred yards of it.")

pool("vent_fields_the_great_vent_desc",
     "Forty feet across, and it goes off about every nine hours, and you "
     "could set a watch by it if you were prepared to stand there.",
     "The Great Vent. Between eruptions you can see ledges going down inside "
     "it, and they are cut ledges.",
     "The noise builds for about ninety seconds first. That is the whole of "
     "your warning and it is generous.")

pool("ashfall_buried_village_desc",
     "Roofs above the ash in a line, and everything below the roofs exactly "
     "as it was left in a hurry.",
     "You go in through a chimney. There is a street down there.",
     "The ash arrived over about four hours. There was time. Most of them "
     "took it.")

pool("firewatch_ridge_towers_desc",
     "Nine along the ridge, a mile apart, built to watch the mountain rather "
     "than the road.",
     "Four are manned. One is on its side. The rest are open and swept, which "
     "is odd.",
     "The seventh has a shaft under it, and the tower was put on top of the "
     "shaft rather than the other way round.")

pool("obsidian_shelf_the_sheet_desc",
     "A mile of flat black glass reflecting the whole sky, and the reflection "
     "is very slightly wrong.",
     "It rings when you walk on it, and the note goes up as the sheet gets "
     "thinner, which is the only warning you get.",
     "Cutters work it in leather from neck to ankle in that heat, which tells "
     "you what it does to people who do not.")

pool("smoking_road_iron_posts_desc",
     "A hundred paces apart, driven six feet, and replaced whenever one goes "
     "soft.",
     "Numbered. Somebody walks the line and repaints the numbers.",
     "You can usually see the next one. You can rarely see the one after "
     "that.")

pool("ember_vent_ward_blocked",
     "The chain is up, which means the readers say no, and the readers are "
     "right four days in five.",
     "\"Not today,\" says the woman at the post, without elaborating, and "
     "behind her the ground says something.",
     "Iron posts, a chain, and forty people whose entire profession is "
     "knowing when this chain comes down.")

pool("cinderhold_slag_door_blocked",
     "It was cast in place, shut, in one pour. There is no keyhole because "
     "there was never a key.",
     "The Slag Door has no seam, no hinge, and no handle, and the cathedral "
     "was built over it afterwards.",
     "Whatever this was meant to keep in, it was meant to keep in "
     "permanently.")
