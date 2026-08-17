"""Region 5 — The Frostmere Waste.

North of the Skarnspine, past the Ice Road. A glacier with a coastline, one
whaling town, one village of cairn-keepers, and six stretches of ice that do
not much care about any of it. The hardest overland country on the continent.
"""
from place import (
    area, poi, gate, house, inn, smithy, store, workshop, temple, warehouse,
    landmark, ruin, delve,
)
from dungeonkit import dungeon
from prose import pool

WILD, TIMBER = "glacier", "urban_timber"
TAGS = ["frostmere"]

AREAS = [
    area("frostmere_whalebone_landing", "Whalebone Landing", TIMBER, "town", 2, 8,
         "Four hundred people, a harbour that freezes, and a meadhall built "
         "out of a jaw.", tags=TAGS + ["town"]),
    area("frostmere_cairnhold", "Cairnhold", TIMBER, "village", 3, 8,
         "Sixteen houses under one long roof, and eleven hundred cairns on the "
         "hill behind them.", tags=TAGS + ["village"]),

    area("frostmere_rimewatch_shore", "The Rimewatch Shore", WILD, "wild", 6, 8,
         "Where the ice meets the sea and neither gives ground. Bergs calve "
         "off it all summer with a noise like artillery.", tags=TAGS),
    area("frostmere_the_white_reach", "The White Reach", WILD, "wild", 8, 9,
         "Forty miles of level ice with nothing on it, in any direction, at "
         "all.", tags=TAGS),
    area("frostmere_bone_strand", "The Bone Strand", WILD, "wild", 6, 8,
         "A beach of shingle and whale bone, where the whales have been coming "
         "ashore to die since before anyone watched.", tags=TAGS),
    area("frostmere_glass_ice", "The Glass Ice", WILD, "wild", 8, 9,
         "Blue-black, swept bare by wind, and clear enough to see forty feet "
         "down into it.", tags=TAGS),
    area("frostmere_wind_scoured_flats", "The Wind-Scoured Flats", WILD, "wild", 7, 9,
         "Where the wind has taken the snow away entirely and left the ice "
         "polished and the ground under it visible.", tags=TAGS),
    area("frostmere_the_last_cairn", "The Last Cairn", WILD, "wild", 8, 10,
         "The furthest north anybody has built anything, and it is a heap of "
         "stones with a name.", tags=TAGS),
]

EDGES = [
    ("frostmere_rimewatch_shore", "frostmere_whalebone_landing", 40),
    ("frostmere_whalebone_landing", "frostmere_bone_strand", 45),
    ("frostmere_bone_strand", "frostmere_the_white_reach", 60),
    ("frostmere_the_white_reach", "frostmere_glass_ice", 55),
    ("frostmere_glass_ice", "frostmere_the_last_cairn", 50),
    ("frostmere_the_last_cairn", "frostmere_wind_scoured_flats", 60),
    ("frostmere_wind_scoured_flats", "frostmere_cairnhold", 40),
    ("frostmere_cairnhold", "frostmere_rimewatch_shore", 45),
    ("frostmere_whalebone_landing", "frostmere_the_white_reach", 70),
]

GATES = [
    gate("frostmere_north_passage", "The North Passage", "hazard",
         "The sea road round the top of the continent, open for about nine "
         "weeks a year and not always those.",
         bypass=("survival", 17),
         requires={"description": "a hull and a crew that have done it before",
                   "minLevel": 7},
         blocked_key="frostmere_north_passage_blocked"),
    gate("frostmere_cairn_ward", "The Cairn Ward", "ward",
         "Eleven hundred cairns, and a gap through them that is not the "
         "shortest way and is the only way anybody walks.",
         bypass=("lore", 16), blocked_key="frostmere_cairn_ward_blocked"),
]

POIS = [
    # ===== Whalebone Landing =====
    poi("whalebone_meadhall", "The Jawbone", "frostmere_whalebone_landing",
        "landmark",
        "A meadhall roofed on the jaw of something that came ashore in "
        "somebody's great-grandmother's time.", minutes=5,
        static="whalebone_meadhall", services=["inn", "guild"],
        tags=["landmark", "inn"]),
    landmark("whalebone_the_landing", "The Landing", "frostmere_whalebone_landing",
             "Not a harbour. A shelving beach, a capstan, and eight months a "
             "year of ice.", minutes=3),
    warehouse("whalebone_oil_store", "The Oil Store", "frostmere_whalebone_landing",
              "Whale oil in butts, stacked four high, and the whole building "
              "is worth more than the town.", size="hall"),
    workshop("whalebone_flensing_yard", "The Flensing Yard",
             "frostmere_whalebone_landing",
             "Where a whale becomes oil, bone, and a smell you will not "
             "forget.", size="hall"),
    smithy("whalebone_smithy", "The Landing Forge", "frostmere_whalebone_landing",
           "Harpoon irons, flensing knives, and everything else sharp.",
           size="large"),
    store("whalebone_store", "The Landing Stores", "frostmere_whalebone_landing",
          "Furs, fat, iron, and rope, and no fresh anything at any price.",
          size="large"),
    store("whalebone_bone_carver", "The Bone Carver", "frostmere_whalebone_landing",
          "Scrimshaw, buttons, combs, and one very large chess set."),
    temple("whalebone_chapel", "The Ice Chapel", "frostmere_whalebone_landing",
           "Thick-walled, low-doored, and warmer than the meadhall."),
    inn("whalebone_the_blubber", "The Blubber", "frostmere_whalebone_landing",
        "Nobody remembers its real name. Everybody knows what it smells of."),
    house("whalebone_house_a", "Harpooner's Row", "frostmere_whalebone_landing",
          "Turf over timber over turf, and warm as a burrow."),
    house("whalebone_house_b", "The Factor's House", "frostmere_whalebone_landing",
          "The only two-storey building. It buys the oil and sells the "
          "everything."),

    # ===== Cairnhold =====
    landmark("cairnhold_the_cairns", "The Cairn Field", "frostmere_cairnhold",
             "Eleven hundred of them on the hill behind the village, and "
             "somebody knows what every one is for.", minutes=5),
    poi("cairnhold_long_roof", "The Long Roof", "frostmere_cairnhold", "settlement",
        "Sixteen households under one roof, because sixteen roofs would be "
        "sixteen roofs to keep clear.", minutes=3, trade="house",
        size="hall", desc_key="int_house", services=["inn"], tags=["house"]),
    store("cairnhold_store", "The Hold Store", "frostmere_cairnhold",
          "Held in common, drawn against by the winter, and audited furiously.",
          size="small"),
    smithy("cairnhold_forge", "The Cairn Forge", "frostmere_cairnhold",
           "One fire, run for two hours a day, because fuel comes by sled.",
           size="small"),
    temple("cairnhold_cairn_shrine", "The Keeper's Shrine", "frostmere_cairnhold",
           "Where the cairn-keepers are trained, which takes eleven years.",
           size="small"),
    delve("cairnhold_first_cairn", "Under the First Cairn", "frostmere_cairnhold",
          "The oldest one, and the only one anybody has ever opened, and they "
          "stopped.", "frostmere_first_cairn", minutes=12,
          gate="frostmere_cairn_ward"),

    # ===== the ice =====
    landmark("rimewatch_calving_face", "The Calving Face",
             "frostmere_rimewatch_shore",
             "Two hundred feet of ice cliff going into the sea, and it lets go "
             "twice a day all summer with a noise like a siege.", minutes=8),
    poi("rimewatch_watch_hut", "The Rimewatch Hut", "frostmere_rimewatch_shore",
        "camp",
        "Somebody sits here and counts the bergs going out, for reasons that "
        "made sense to whoever started it.", minutes=6,
        trade="house", size="small", desc_key="int_house"),
    delve("rimewatch_blue_caves", "The Blue Caves", "frostmere_rimewatch_shore",
          "Melt channels in the face, open at the bottom of the cliff, and "
          "they go somewhere different every year.",
          "frostmere_blue_caves", minutes=14),

    landmark("white_reach_the_middle", "The Middle of the Reach",
             "frostmere_the_white_reach",
             "Forty miles of level ice, and this is the point equidistant "
             "from every edge of it, and it is marked.", minutes=12),
    poi("white_reach_depot", "The Depot", "frostmere_the_white_reach", "camp",
        "A sledge-load of fuel and food buried under a flag, restocked by "
        "whoever passes and used by whoever needs it.", minutes=8,
        trade="cave", size="small"),
    ruin("white_reach_frozen_ship", "The Frozen Ship", "frostmere_the_white_reach",
         "Thirty miles from open water, upright, with her masts still "
         "standing.", minutes=15, trade="hull", size="large",
         hidden=True, discover=("survival", 15), tags=["secret"]),

    landmark("bone_strand_the_boneyard", "The Boneyard", "frostmere_bone_strand",
             "Where the whales have come ashore to die since before there was "
             "anybody to watch, and the shingle is more bone than stone.",
             minutes=8),
    poi("bone_strand_camp", "The Strand Camp", "frostmere_bone_strand", "camp",
        "Used in the two months the ice lets anybody work here.", minutes=5,
        trade="house", size="small", desc_key="int_house"),
    delve("bone_strand_ribcage", "The Ribcage", "frostmere_bone_strand",
          "Somebody has built into the ribs of the largest of them, and then "
          "gone on building downward.", "frostmere_ribcage", minutes=12),

    landmark("glass_ice_the_clear", "The Clear", "frostmere_glass_ice",
             "Swept bare by wind and transparent for forty feet down, and "
             "there are things at thirty.", minutes=10),
    delve("glass_ice_the_moulin", "The Moulin", "frostmere_glass_ice",
          "A shaft the meltwater has drilled straight down through the "
          "glacier, and in winter it is dry.", "frostmere_moulin", minutes=15),
    poi("glass_ice_marker", "The Bearing Marker", "frostmere_glass_ice", "landmark",
        "A pole in the ice with four arms, and three of them point at nothing "
        "you can see.", minutes=8, interior=False),

    landmark("wind_flats_pavement", "The Pavement", "frostmere_wind_scoured_flats",
             "Polished ice over bare rock, and you can see the rock, and it "
             "has been quarried.", minutes=8),
    ruin("wind_flats_stone_rows", "The Stone Rows", "frostmere_wind_scoured_flats",
         "Rows of set stones under the ice, visible and unreachable, going on "
         "for half a mile.", minutes=10),
    delve("wind_flats_under_pavement", "Under the Pavement",
          "frostmere_wind_scoured_flats",
          "The wind has taken enough ice off to open a way into whatever was "
          "quarried here.", "frostmere_under_pavement", minutes=14),

    landmark("last_cairn_the_cairn", "The Last Cairn", "frostmere_the_last_cairn",
             "A heap of stones, chest high, and the furthest north anybody has "
             "built anything.", minutes=6),
    poi("last_cairn_shelter", "The North Shelter", "frostmere_the_last_cairn",
        "camp",
        "Three walls, a roof, and a door that opens inward because of the "
        "drifts.", minutes=6, trade="cave", size="small"),
    delve("last_cairn_the_hollow", "The Hollow", "frostmere_the_last_cairn",
          "The cairn is on top of something and the something has a way in.",
          "frostmere_the_hollow", minutes=16),
]

DUNGEONS = [
    dungeon("frostmere_first_cairn", "Under the First Cairn", "dungeon_barrow",
            "The oldest cairn on the hill, opened once, and the keepers have "
            "not opened another since.",
            rooms="8", depth="2", roomSize="2d2+3"),
    dungeon("frostmere_blue_caves", "The Blue Caves", "dungeon_ice",
            "Melt channels in the calving face, which are a different shape "
            "every year and connect to different things.",
            rooms="11", depth="2", algorithm="caverns", caverns={"fill": 0.43, "smoothingPasses": 5, "birthThreshold": 5}),
    dungeon("frostmere_ribcage", "The Ribcage", "dungeon_ice",
            "Built into the ribs of the largest whale on the strand, and then "
            "downward from there, by somebody with a plan.",
            rooms="9", depth="2",),
    dungeon("frostmere_moulin", "The Moulin", "dungeon_ice",
            "A shaft drilled straight down through the glacier by meltwater, "
            "and dry from Rimewatch to Turning.",
            rooms="12", depth="4", branchiness=0.25,
            corridorLength="4d3"),
    dungeon("frostmere_under_pavement", "Under the Pavement", "dungeon_delved",
            "Whatever was quarried out from under the flats, opened again by "
            "wind taking the ice off the top of it.",
            rooms="13", depth="3", algorithm="bsp", bsp={"minLeaf": 6}),
    dungeon("frostmere_the_hollow", "The Hollow", "dungeon_ice",
            "The Last Cairn is standing on something, and the something is "
            "considerably larger than the cairn.",
            rooms="14", depth="4", algorithm="caverns", caverns={"fill": 0.46, "smoothingPasses": 4, "birthThreshold": 5}),
]

# --- prose ------------------------------------------------------------------

pool("frostmere_whalebone_landing_desc",
     "Turf roofs, oil butts, and a meadhall roofed on a jawbone. Four hundred "
     "people, all of them here for one reason.",
     "Whalebone Landing. It smells of oil, and there is no part of the town "
     "that does not.",
     "The harbour is ice for eight months and a beach for four, and the town "
     "is arranged entirely around the four.",
     "Smoke from every roof going flat sideways before it clears the ridge.")

pool("frostmere_cairnhold_desc",
     "Sixteen households under one long roof, and eleven hundred cairns on "
     "the hill behind.",
     "Cairnhold. Everything here is about the cairns and nobody will start "
     "the conversation.",
     "One doorway, one chimney line, one roof, and warmth you can feel from "
     "the path.",
     "The hill above is covered in stone heaps in rows, and the rows mean "
     "something.")

pool("frostmere_rimewatch_shore_desc",
     "Two hundred feet of ice cliff going straight into grey water, and it "
     "lets go twice a day.",
     "The Rimewatch Shore. Bergs going out past you in a slow procession, and "
     "the noise behind them.",
     "Where the ice meets the sea, and neither has given an inch in recorded "
     "memory.",
     "A crack goes off somewhere along the face like a siege engine and you "
     "have already flinched.")

pool("frostmere_the_white_reach_desc",
     "Forty miles of level ice with nothing on it in any direction "
     "whatsoever.",
     "The White Reach. Your own tracks are the only feature and they are "
     "behind you.",
     "The horizon is a line and the sky is a slightly different white, and "
     "that is the entire view.",
     "No shelter. No landmarks. Wind from one quarter, all day.")

pool("frostmere_bone_strand_desc",
     "A beach where the shingle is more bone than stone, and some of the bone "
     "is standing.",
     "The Bone Strand. Whales have been coming ashore here to die since "
     "before anybody was watching them do it.",
     "Ribs the height of a house, in rows, going into the surf.",
     "The tide comes up through the bones and goes out again through them.")

pool("frostmere_glass_ice_desc",
     "Blue-black, swept bare by the wind, and clear enough to see forty feet "
     "down into it.",
     "The Glass Ice. You can see things at thirty feet. You will look at them "
     "for some time.",
     "No snow at all, and your boots find no grip anywhere.",
     "It is the most beautiful place on the continent and you are anxious to "
     "be off it.")

pool("frostmere_wind_scoured_flats_desc",
     "The wind has taken the snow away entirely and polished what was under "
     "it, and what was under it is rock.",
     "You can see the ground through the ice, and the ground has been "
     "quarried.",
     "The Wind-Scoured Flats. The wind is the only thing here and it does not "
     "stop.",
     "Rows of set stone under three feet of clear ice, going on for half a "
     "mile.")

pool("frostmere_the_last_cairn_desc",
     "The furthest north anybody has built anything, and what they built is a "
     "heap of stones chest high.",
     "The Last Cairn. Past it there is more of the same, indefinitely, and no "
     "reason to go.",
     "Somebody comes out here to maintain this. Nobody will say who or how "
     "often.",
     "There is a shelter. The door opens inward, which tells you about the "
     "drifts.")

pool("whalebone_meadhall_desc",
     "Roofed on the jaw of something that came ashore four generations back, "
     "and the jaw is eighty feet long.",
     "The Jawbone. One fire down the middle, benches down both sides, and no "
     "windows at all.",
     "Warm, dark, and loud, and it is the only building in the Waste that is "
     "any of those things.")

pool("rimewatch_calving_face_desc",
     "Two hundred feet of ice going straight down into the sea, blue at the "
     "bottom and white at the top.",
     "It lets go twice a day in summer, and you feel it before you hear it.",
     "The face is a mile and a half long and there is no safe distance that "
     "is also a useful one.")

pool("bone_strand_the_boneyard_desc",
     "Ribs the height of a house, in rows, going into the surf and out of "
     "it.",
     "You can walk a quarter mile here without touching stone.",
     "Some of the bones have been worked. Not recently. Not by anybody from "
     "the Landing.")

pool("glass_ice_the_clear_desc",
     "Clear ice for forty feet down, and at thirty there is something with a "
     "shape.",
     "You can lie on your front and look into it, and people do, and they "
     "stop after a while.",
     "The ice is perfectly transparent and perfectly solid and both facts are "
     "difficult to hold at once.")

pool("white_reach_frozen_ship_desc",
     "Thirty miles from the nearest open water, upright, masts standing, rigged.",
     "There is no route by which this could have arrived here.",
     "She is in good order. That is the part that stays with you.")

pool("wind_flats_stone_rows_desc",
     "Rows of set stone under three feet of clear ice, running arrow-straight "
     "for half a mile.",
     "You can see them perfectly and you cannot reach them at all.",
     "They are set, and dressed, and spaced, and they are under a glacier.")

pool("last_cairn_the_cairn_desc",
     "Chest high, dry-stacked, and the furthest north anybody has ever "
     "bothered to build anything.",
     "Somebody maintains it. The stones on top are not weathered like the "
     "stones underneath.",
     "It is not a marker for a route. There is no route.")

pool("cairnhold_the_cairns_desc",
     "Eleven hundred stone heaps on the hill, in rows, and the rows are not "
     "chronological.",
     "The keepers know what every one is for. They will not tell you and they "
     "will not be rude about it.",
     "You are asked to walk the marked way. The marked way is not the short "
     "way.")

pool("frostmere_north_passage_blocked",
     "The passage is closed. It is closed for forty-three weeks of the year "
     "and this is one of them.",
     "Fast ice from the shore to the horizon. Nothing is going round the top "
     "of anything.",
     "\"Nine weeks,\" says the factor, \"and it was eleven when I was young. "
     "Not this month.\"")

pool("frostmere_cairn_ward_blocked",
     "The way through the cairns is marked, and the marked way does not go "
     "where you want to go.",
     "A keeper is standing at the gap with both hands visible and no weapon, "
     "which is somehow worse.",
     "\"Not that one,\" she says. \"Any of the others. Not that one.\"")
