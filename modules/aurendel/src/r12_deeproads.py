"""Region 12 — The Deeproads.

The underworld layer, running beneath the whole continent and surfacing in four
places: Karn Dolur, the Black Tarn on the moor, the Ember Reach, and the crater
in the Glasslands. Halls cut by hands and caverns cut by water, with no clean
line between them. One town, one village, eight stretches of dark.
"""
from place import (area, poi, gate, toll, house, inn, smithy, store, workshop,
                   temple, stable, warehouse, guild, square, landmark, ruin,
                   delve)
from dungeonkit import dungeon
from prose import pool

WILD, DELVED = "underdeep", "urban_delved"
TAGS = ["deeproads"]
UNDER = {"layer": "underworld"}

AREAS = [
    area("deeproads_lantern_deep", "Lantern Deep", DELVED, "town", 2, 9,
         "Nine hundred people in a cavern, lit entirely by fungus and by what "
         "they can afford to burn.", tags=TAGS + ["town"], **UNDER),
    area("deeproads_mycelt", "Mycelt", DELVED, "village", 3, 9,
         "A fungus farm with a village attached, and the village is very much "
         "the smaller half.", tags=TAGS + ["village"], **UNDER),

    area("deeproads_the_long_hall", "The Long Hall", WILD, "wild", 7, 9,
         "Four miles of dressed corridor forty feet wide, running dead "
         "straight, with a ceiling nobody has surveyed.",
         tags=TAGS, **UNDER),
    area("deeproads_the_deep_market_road", "The Deep Market Road", WILD, "wild", 6, 9,
         "The one stretch that is genuinely a road, kept up by Lantern Deep "
         "and lit at intervals.", tags=TAGS, **UNDER),
    area("deeproads_fungus_gallery", "The Fungus Gallery", WILD, "wild", 6, 9,
         "A cavern a mile across with a canopy of fungus forty feet up, and "
         "it is bright enough down here to read by.", tags=TAGS, **UNDER),
    area("deeproads_the_sunless_river", "The Sunless River", WILD, "wild", 8, 10,
         "Sixty feet wide, no sound at all, and it has been going the same "
         "way for a very long time.", tags=TAGS, **UNDER),
    area("deeproads_black_bridge", "The Black Bridge", WILD, "wild", 8, 10,
         "A single span over a chasm of no measured depth, with no parapet "
         "and no supports anybody can see.", tags=TAGS, **UNDER),
    area("deeproads_echo_halls", "The Echo Halls", WILD, "wild", 8, 10,
         "Eleven chambers where a word comes back four times, each from a "
         "different direction.", tags=TAGS, **UNDER),
    area("deeproads_broken_stair", "The Broken Stair", WILD, "wild", 7, 10,
         "A stair a hundred feet wide going up towards the Ember Reach, with "
         "about a third of it missing.", tags=TAGS, **UNDER),
    area("deeproads_the_weeping_vault", "The Weeping Vault", WILD, "wild", 8, 10,
         "Water comes through the roof here in ten thousand places and has "
         "been doing so long enough to build the floor up to meet it.",
         tags=TAGS, **UNDER),
]

EDGES = [
    ("deeproads_the_long_hall", "deeproads_the_deep_market_road", 30),
    ("deeproads_the_deep_market_road", "deeproads_lantern_deep", 25),
    ("deeproads_lantern_deep", "deeproads_fungus_gallery", 30),
    ("deeproads_fungus_gallery", "deeproads_mycelt", 25),
    ("deeproads_mycelt", "deeproads_the_sunless_river", 40),
    ("deeproads_the_sunless_river", "deeproads_black_bridge", 35,
     {"gate": "deeproads_river_crossing"}),
    ("deeproads_black_bridge", "deeproads_echo_halls", 40),
    ("deeproads_echo_halls", "deeproads_broken_stair", 45),
    ("deeproads_broken_stair", "deeproads_the_weeping_vault", 40),
    ("deeproads_the_weeping_vault", "deeproads_the_long_hall", 50),
    ("deeproads_lantern_deep", "deeproads_black_bridge", 55),
]

GATES = [
    toll("deeproads_deep_gate", "The Deep Gate", 20,
         "Karn Dolur's door onto the Deeproads, and the hold charges more to "
         "go down than it does to come in.",
         bypass=("stealth", 17), blocked_key="deeproads_deep_gate_blocked"),
    gate("deeproads_river_crossing", "The Ferry of the Sunless River", "hazard",
         "There is a boat. There is a rope. There is nobody to work either "
         "and there has not been for some time.",
         bypass=("athletics", 16),
         blocked_key="deeproads_river_crossing_blocked"),
    gate("deeproads_echo_ward", "The Echo Ward", "puzzle",
         "The eleventh chamber will not let a word through, and until "
         "something is said correctly the far door does not open.",
         bypass=("lore", 18),
         requires={"description": "the phrase cut over the tenth door",
                   "minLevel": 8},
         blocked_key="deeproads_echo_ward_blocked"),
]

POIS = [
    # ===== Lantern Deep =====
    poi("lantern_deep_fungus_market", "The Fungus Market",
        "deeproads_lantern_deep", "market",
        "Eleven kinds of light, forty kinds of food, and all of it grown "
        "within two miles of here.", minutes=5, static="fungus_market",
        services=["market", "guild"], tags=["landmark", "shop"]),
    poi("lantern_deep_the_lantern", "The Great Lantern", "deeproads_lantern_deep",
        "landmark",
        "Hung from the roof of the cavern on a chain nobody can account for, "
        "and it has never been lit by anybody living.", minutes=5,
        interior=False, tags=["landmark"]),
    store("lantern_deep_lamp_shop", "The Lamp Shop", "deeproads_lantern_deep",
          "Oil, wick, flint, and the only thing anybody here actually needs.",
          size="large"),
    store("lantern_deep_store", "The Deep Stores", "deeproads_lantern_deep",
          "Everything from above, at the price of having carried it down.",
          size="large"),
    smithy("lantern_deep_forge", "The Deep Forge", "deeproads_lantern_deep",
           "Vented up a shaft that somebody found rather than cut.",
           size="large"),
    workshop("lantern_deep_rope_walk", "The Rope Walk", "deeproads_lantern_deep",
             "In a gallery a quarter of a mile long, which is exactly why the "
             "gallery was chosen.", size="hall"),
    guild("lantern_deep_wayfinders", "The Wayfinders' Hall",
          "deeproads_lantern_deep",
          "Forty people who can get you from here to Karn Dolur and back, and "
          "the number who can is not increasing.", size="hall"),
    temple("lantern_deep_shrine", "The Shrine of the Second Light",
           "deeproads_lantern_deep",
           "A lamp kept burning against the day the Great Lantern is lit, "
           "which the shrine maintains is coming.", size="large"),
    inn("lantern_deep_the_wick", "The Wick", "deeproads_lantern_deep",
        "Beds, food, and a lamp on every table because the alternative is "
        "unbearable.", size="large"),
    house("lantern_deep_house_a", "The Second Terrace", "deeproads_lantern_deep",
          "Cut into the cavern wall, forty feet up, reached by a stair "
          "everybody complains about."),
    house("lantern_deep_house_b", "The Fungus Row", "deeproads_lantern_deep",
          "Roofed in living fungus, which glows, which the residents say is "
          "free light and everybody else says is a fire risk in reverse."),
    delve("lantern_deep_lower_workings", "The Lower Workings",
          "deeproads_lantern_deep",
          "The town has been quarrying its own cavern larger for four hundred "
          "years and the workings go further than the plan admits.",
          "deeproads_lower_workings", minutes=12),

    # ===== Mycelt =====
    landmark("mycelt_the_beds", "The Growing Beds", "deeproads_mycelt",
             "Eleven acres of fungus in terraces, fed on what Lantern Deep "
             "produces, which is a subject nobody dwells on.", minutes=4),
    inn("mycelt_the_cap", "The Cap", "deeproads_mycelt",
        "One room, and everything on the menu was grown within a hundred "
        "yards.", size="small"),
    store("mycelt_store", "The Spore Store", "deeproads_mycelt",
          "Cultures, spawn, and the tools for handling both.", size="small"),
    workshop("mycelt_drying_house", "The Drying House", "deeproads_mycelt",
             "Warm, dry, and it is the only place in the Deeproads that is "
             "either.", size="medium"),
    house("mycelt_house_a", "The Grower's House", "deeproads_mycelt",
          "Built into the terrace wall, and it is warmer than it should be."),
    house("mycelt_house_b", "The Spore Rooms", "deeproads_mycelt",
          "Lodging for the growers, and everything in it is very slightly "
          "luminous."),

    # ===== the roads =====
    landmark("long_hall_the_span", "The Long Hall", "deeproads_the_long_hall",
             "Four miles of dressed corridor forty feet wide, dead straight, "
             "with a ceiling nobody has surveyed.", minutes=10),
    ruin("long_hall_the_side_doors", "The Side Doors",
         "deeproads_the_long_hall",
         "Two hundred and eleven of them down both walls, all the same size, "
         "and about nine of them open.", minutes=8, trade="delved",
         size="medium"),
    delve("long_hall_behind_the_ninth", "Behind the Ninth Door",
          "deeproads_the_long_hall",
          "The ninth door on the left is open, and everything behind it is "
          "laid out on the same plan as everything behind the other two "
          "hundred and ten.", "deeproads_ninth_door", minutes=14),

    landmark("market_road_the_lamps", "The Road Lamps",
             "deeproads_the_deep_market_road",
             "Every two hundred paces, filled by somebody from Lantern Deep, "
             "and the filling is a job with a rota and a salary.", minutes=6),
    poi("market_road_waystation", "The Road Station",
        "deeproads_the_deep_market_road", "settlement",
        "Halfway to the Long Hall, staffed, and the only reliably safe place "
        "on the road.", minutes=5, trade="delved", size="medium",
        desc_key="int_store", services=["inn"], tags=["inn"]),
    ruin("market_road_old_toll", "The Old Toll", "deeproads_the_deep_market_road",
         "Somebody charged for this road once, and the arch is still standing "
         "and the gate is not.", minutes=6, trade="delved", size="small"),

    landmark("fungus_gallery_the_canopy", "The Canopy",
             "deeproads_fungus_gallery",
             "Forty feet up, a mile across, and bright enough underneath it to "
             "read by.", minutes=8),
    poi("fungus_gallery_pickers_camp", "The Pickers' Camp",
        "deeproads_fungus_gallery", "camp",
        "Wild-picked rather than farmed, which is worth more and is "
        "considerably worse for you.", minutes=5, trade="cave", size="small"),
    delve("fungus_gallery_the_rot", "The Rot", "deeproads_fungus_gallery",
          "Where the canopy has come down and the floor beneath it has been "
          "eaten out from underneath.", "deeproads_the_rot", minutes=14),

    poi("sunless_river_the_crossing", "The Crossing",
        "deeproads_the_sunless_river", "crossing",
        "A boat, a rope, and nobody to work either, and there has not been "
        "for some time.", minutes=8, interior=False,
        gate="deeproads_river_crossing", tags=["crossing"]),
    landmark("sunless_river_the_water", "The Sunless River",
             "deeproads_the_sunless_river",
             "Sixty feet wide, no sound whatsoever, and it has been going the "
             "same way for a very long time.", minutes=8),
    delve("sunless_river_downstream", "Downstream", "deeproads_the_sunless_river",
          "It goes somewhere. Following it is the only way to find out and "
          "nobody has come back to say.", "deeproads_downstream", minutes=16),

    poi("black_bridge_the_span", "The Black Bridge", "deeproads_black_bridge",
        "crossing",
        "A single span over a chasm of no measured depth, with no parapet and "
        "no supports anybody can see.", minutes=8, interior=False,
        tags=["crossing", "landmark"]),
    landmark("black_bridge_the_chasm", "The Chasm", "deeproads_black_bridge",
             "You can drop a lamp down it and watch it for a very long time.",
             minutes=6),
    delve("black_bridge_the_footings", "The Footings", "deeproads_black_bridge",
          "There are chambers at both ends of the bridge, below the road "
          "level, and the bridge grows out of them.",
          "deeproads_footings", minutes=14),

    poi("echo_halls_the_eleventh", "The Eleventh Chamber",
        "deeproads_echo_halls", "crossing",
        "It will not let a word through, and until something is said "
        "correctly the far door does not open.", minutes=8, interior=False,
        gate="deeproads_echo_ward", tags=["crossing"]),
    landmark("echo_halls_the_ten", "The Ten Chambers", "deeproads_echo_halls",
             "A word comes back four times in each of them, each from a "
             "different direction, and none of them from the wall.",
             minutes=8),
    delve("echo_halls_the_listening_room", "The Listening Room",
          "deeproads_echo_halls",
          "Off the seventh chamber, and in it there is no echo at all, which "
          "is worse.", "deeproads_listening_room", minutes=14),

    landmark("broken_stair_the_stair", "The Broken Stair",
             "deeproads_broken_stair",
             "A hundred feet wide, going up towards the Ember Reach, with "
             "about a third of it missing.", minutes=8),
    ruin("broken_stair_the_landing", "The Great Landing",
         "deeproads_broken_stair",
         "Halfway up, an acre of flat floor with the bases of columns on it "
         "and nothing above them.", minutes=8, trade="delved", size="large"),
    delve("broken_stair_beneath_the_treads", "Beneath the Treads",
          "deeproads_broken_stair",
          "Where the stair has gone, you can see that it was hollow, and that "
          "there are rooms in the thickness of it.",
          "deeproads_beneath_treads", minutes=14),

    landmark("weeping_vault_the_roof", "The Weeping Roof",
             "deeproads_the_weeping_vault",
             "Water through the roof in ten thousand places, and it has been "
             "doing it long enough to build the floor up to meet it.",
             minutes=8),
    poi("weeping_vault_the_shaft", "The Tarn Shaft", "deeproads_the_weeping_vault",
        "crossing",
        "The way up to the Weeping Moor, square-cut, and the rungs are rusted "
        "through for the top thirty feet.", minutes=10, interior=False,
        gate="deeproads_tarn_shaft", tags=["crossing"]),
    delve("weeping_vault_the_columns", "The Columns",
          "deeproads_the_weeping_vault",
          "Where the drip has met the floor it has built columns, and eleven "
          "of them are hollow, and one of them has a door.",
          "deeproads_the_columns", minutes=14, hidden=True,
          discover=("perception", 15), tags=["secret"]),
]

DUNGEONS = [
    dungeon("deeproads_lower_workings", "The Lower Workings", "dungeon_delved",
            "Four hundred years of Lantern Deep quarrying its own cavern "
            "larger, and it goes further than the plan admits.",
            rooms="13", depth="3", branchiness=0.5),
    dungeon("deeproads_ninth_door", "Behind the Ninth Door", "dungeon_delved",
            "The ninth door on the left of the Long Hall, and everything "
            "behind it laid out on the same plan as the other two hundred "
            "and ten.",
            rooms="14", depth="4", algorithm="bsp", bsp={"minLeaf": 5}),
    dungeon("deeproads_the_rot", "The Rot", "dungeon_cave",
            "Where the fungus canopy came down and the floor beneath it was "
            "eaten out from underneath.",
            rooms="12", depth="3", algorithm="caverns", caverns={"fill": 0.47, "smoothingPasses": 4, "birthThreshold": 5}),
    dungeon("deeproads_downstream", "Downstream", "dungeon_drowned",
            "The Sunless River goes somewhere. Following it is the only way "
            "to find out and nobody has come back to say.",
            rooms="13", depth="5", branchiness=0.15,
            corridorLength="5d3", corridor={"style": "winding", "width": 2}),
    dungeon("deeproads_footings", "The Footings", "dungeon_delved",
            "Chambers at both ends of the Black Bridge, below road level, and "
            "the bridge grows out of them rather than resting on them.",
            rooms="11", depth="4", branchiness=0.25),
    dungeon("deeproads_listening_room", "The Listening Room", "dungeon_delved",
            "Off the seventh chamber of the Echo Halls, and in it there is no "
            "echo at all, which is worse.",
            rooms="10", depth="4", branchiness=0.2),
    dungeon("deeproads_beneath_treads", "Beneath the Treads", "dungeon_delved",
            "The Broken Stair is hollow, and where it has gone you can see "
            "there are rooms in the thickness of it.",
            rooms="12", depth="4", algorithm="bsp", bsp={"minLeaf": 5}),
    dungeon("deeproads_the_columns", "The Columns", "dungeon_cave",
            "Eleven of the flowstone columns in the Weeping Vault are hollow, "
            "and one of them has a door in it.",
            rooms="11", depth="4", algorithm="caverns", caverns={"fill": 0.43, "smoothingPasses": 5, "birthThreshold": 5}),
]

# --- prose ------------------------------------------------------------------

pool("deeproads_lantern_deep_desc",
     "Nine hundred people in a cavern, lit by fungus and by what they can "
     "afford to burn, which is not much.",
     "Lantern Deep. Terraces cut into the cavern wall forty feet up, and "
     "stairs everybody complains about.",
     "The Great Lantern hangs over the whole town on a chain nobody can "
     "account for, unlit.",
     "Warm, dry, and considerably more cheerful than it has any right to be.")

pool("deeproads_mycelt_desc",
     "Eleven acres of fungus in terraces, and a village attached to it as an "
     "afterthought.",
     "Mycelt. Everything here glows very slightly, including the residents' "
     "clothes.",
     "The drying house is warm and dry and is the only place in the "
     "Deeproads that is either.",
     "The beds are fed on what Lantern Deep produces, and nobody dwells on "
     "it.")

pool("deeproads_the_long_hall_desc",
     "Four miles of dressed corridor, forty feet wide, dead straight, with a "
     "ceiling nobody has surveyed.",
     "The Long Hall. Two hundred and eleven doors down both walls, all the "
     "same size, and about nine of them open.",
     "Your lamp reaches the walls and not the roof, and the walls are worked "
     "smooth as far up as it reaches.",
     "Footsteps go ahead of you a very long way and come back late.")

pool("deeproads_the_deep_market_road_desc",
     "The one stretch that is genuinely a road: kept up, lit at intervals, "
     "and patrolled after a fashion.",
     "Lamps every two hundred paces, filled by somebody from Lantern Deep on "
     "a rota.",
     "It is the safest place in the Deeproads and that is not a strong claim.",
     "An arch stands over it halfway along, where somebody once charged for "
     "passage.")

pool("deeproads_fungus_gallery_desc",
     "A cavern a mile across with a canopy of fungus forty feet up, and it is "
     "bright enough underneath to read by.",
     "The Fungus Gallery. Blue-green light from above, evenly, all the time, "
     "and no shadows worth the name.",
     "Pickers work the wild stands, which pay better and are considerably "
     "worse for you.",
     "Where the canopy has come down, the floor beneath it has gone too.")

pool("deeproads_the_sunless_river_desc",
     "Sixty feet wide, black, and it makes no sound at all, which you will "
     "not get used to.",
     "The Sunless River. It has been going the same way for a very long time "
     "and it is in no hurry.",
     "There is a boat and a rope and nobody to work either.",
     "The water is warmer than the air. It should not be.")

pool("deeproads_black_bridge_desc",
     "A single span over a chasm of no measured depth, with no parapet and no "
     "supports anybody has been able to find.",
     "The Black Bridge. Eleven feet wide, four hundred long, and it does not "
     "flex.",
     "You can drop a lamp off it and watch it for an uncomfortably long "
     "time.",
     "It grows out of chambers at both ends rather than resting on "
     "anything.")

pool("deeproads_echo_halls_desc",
     "Eleven chambers where a word comes back four times, each from a "
     "different direction, and none of them from a wall.",
     "The Echo Halls. You stop talking after the second chamber. Everybody "
     "does.",
     "There is a phrase cut over the tenth door and it is not in a language "
     "anybody at Lantern Deep reads.",
     "The eleventh will not let a word through at all.")

pool("deeproads_broken_stair_desc",
     "A stair a hundred feet wide going up towards the Ember Reach, with "
     "about a third of it missing.",
     "The Broken Stair. Halfway up there is an acre of landing with column "
     "bases on it and nothing above them.",
     "Where the treads have gone you can see the stair was hollow.",
     "It is warm on this stair and it gets warmer going up, which tells you "
     "where it comes out.")

pool("deeproads_the_weeping_vault_desc",
     "Water through the roof in ten thousand places, and it has been doing it "
     "long enough to build the floor up to meet it.",
     "The Weeping Vault. Columns of flowstone from floor to roof in a forest, "
     "and eleven of them are hollow.",
     "The noise is continuous and it is the only noise, and it is not "
     "restful.",
     "There is a square-cut shaft going up out of it, to the moor, and the "
     "rungs are rusted through at the top.")

pool("lantern_deep_fungus_market_desc",
     "Eleven kinds of light and forty kinds of food, all of it grown within "
     "two miles of where it is standing.",
     "The Fungus Market. Everything on the trestles glows, faintly, in a "
     "different colour.",
     "It is the brightest room in the Deeproads and it is lit entirely by "
     "vegetables.")

pool("lantern_deep_the_lantern_desc",
     "Hung from the roof of the cavern on a chain that nobody can account "
     "for, over the whole town, unlit.",
     "The Great Lantern. It has never been lit by anybody living and there is "
     "a shrine dedicated to the proposition that it will be.",
     "The chain goes up into dark and does not appear to be fixed to "
     "anything.")

pool("long_hall_the_span_desc",
     "Four miles, dead straight, forty feet wide, and the ceiling is not in "
     "your lamplight at any point.",
     "Two hundred and eleven doors down both walls, identical, and nine of "
     "them stand open.",
     "The floor is dressed and jointed and there is not a crack in four "
     "miles.")

pool("black_bridge_the_span_desc",
     "Eleven feet wide, four hundred long, no parapet, no supports, and it "
     "does not flex under you at all.",
     "The chasm underneath has never been sounded and several people have "
     "tried.",
     "It grows out of the rock at both ends. It was not laid on anything.")

pool("echo_halls_the_ten_desc",
     "A word comes back four times in each chamber, from four directions, and "
     "none of the four is a wall.",
     "You will stop talking. Everybody stops talking, usually in the second "
     "chamber.",
     "There is a phrase cut over the tenth door in a script nobody at Lantern "
     "Deep reads.")

pool("weeping_vault_the_roof_desc",
     "Ten thousand points of water coming through the roof, continuously, "
     "into a floor that has grown up to meet them.",
     "Columns of flowstone floor to roof in a forest, and eleven of them ring "
     "hollow.",
     "The noise never stops and it is the only noise there is.")

pool("sunless_river_the_water_desc",
     "Sixty feet across, black, moving, and silent — completely silent, which "
     "is the part that stays with you.",
     "It is warmer than the air above it and that is the wrong way round.",
     "Nothing on the surface. Nothing at the margins. Nothing audible at "
     "all.")

pool("broken_stair_the_stair_desc",
     "A hundred feet wide, going up, and about a third of the treads are not "
     "there any more.",
     "It is warm here and warmer further up, which tells you what it is "
     "going towards.",
     "Where the treads have gone you can see straight into the thickness of "
     "the stair, and there are rooms in it.")

pool("fungus_gallery_the_canopy_desc",
     "Forty feet up and a mile across, and it is bright enough underneath to "
     "read a letter by.",
     "Blue-green, even, shadowless, and it has been like this since before "
     "Lantern Deep was cut.",
     "Where a section has come down, the floor under it went with it.")

pool("deeproads_deep_gate_blocked",
     "\"Twenty to go down,\" says the gatewarden, \"and the hold would rather "
     "you did not, and charges accordingly.\"",
     "It costs more to leave Karn Dolur downward than it does to enter it at "
     "all, and the hold considers that a policy.",
     "The door is open. The ledger is not.")

pool("deeproads_river_crossing_blocked",
     "The boat is on the far bank. The rope is slack in the water. There is "
     "nobody at either end.",
     "Somebody worked this crossing once. The winch is greased and the grease "
     "is old.",
     "Sixty feet of silent water and no way across that does not involve "
     "getting into it.")

pool("deeproads_echo_ward_blocked",
     "The eleventh chamber takes your words and does not give them back, and "
     "the far door does not move.",
     "You speak. Nothing comes back at all, which after the first ten "
     "chambers is genuinely alarming.",
     "There is a phrase over the tenth door. It is presumably the phrase.")
