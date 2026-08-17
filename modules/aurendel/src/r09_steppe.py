"""Region 9 — The Sunward Steppe.

Grass to every horizon in the south, broken only by burial mounds and the
smoke of somebody's camp. One town that is really a permanent camp, two
villages built round the only reliable water, and six stretches of grass.
"""
from place import (
    area, poi, gate, toll, house, inn, smithy, store, workshop, temple,
    stable, square, landmark, ruin, delve,
)
from dungeonkit import dungeon
from prose import pool

WILD, TIMBER = "steppe", "urban_timber"
TAGS = ["sunward_steppe"]

AREAS = [
    area("steppe_ilkhet", "Ilkhet", TIMBER, "town", 1, 3,
         "A town that is legally a camp, because moving it is still, in "
         "principle, an option.", tags=TAGS + ["town"]),
    area("steppe_three_wells", "Three Wells", TIMBER, "village", 2, 3,
         "Three, sunk in a line, and only two of them have ever gone dry at "
         "the same time.", tags=TAGS + ["village"]),
    area("steppe_tallgrass", "Tallgrass", TIMBER, "village", 2, 3,
         "In the one place where the grass goes over head height, which is "
         "shelter of a kind and a nuisance of another.", tags=TAGS + ["village"]),

    area("steppe_horse_road", "The Horse Road", WILD, "wild", 3, 3,
         "Not a road. A width of grass forty yards across that has been "
         "ridden flat for nine hundred years.", tags=TAGS),
    area("steppe_kurgan_field", "The Kurgan Field", WILD, "wild", 4, 4,
         "Two hundred burial mounds in eleven rows, and the rows are aligned "
         "on something that is not the sun.", tags=TAGS),
    area("steppe_the_long_grass", "The Long Grass", WILD, "wild", 3, 3,
         "Chest-high, unbroken, and it moves in a way that makes it very hard "
         "to tell what else is moving in it.", tags=TAGS),
    area("steppe_dry_river", "The Dry River", WILD, "wild", 4, 4,
         "A bed a quarter of a mile wide with no water in it for eleven months "
         "and rather too much in the twelfth.", tags=TAGS),
    area("steppe_windbreak", "The Windbreak", WILD, "wild", 3, 3,
         "A line of trees eleven miles long, planted, and there is no record "
         "of anybody planting it.", tags=TAGS),
    area("steppe_the_south_reach", "The South Reach", WILD, "wild", 4, 5,
         "Where the grass thins, the ground pales, and the Glasslands start "
         "making themselves felt.", tags=TAGS),
]

EDGES = [
    ("steppe_horse_road", "steppe_ilkhet", 40),
    ("steppe_ilkhet", "steppe_kurgan_field", 45),
    ("steppe_kurgan_field", "steppe_three_wells", 40),
    ("steppe_three_wells", "steppe_the_long_grass", 50),
    ("steppe_the_long_grass", "steppe_dry_river", 45),
    ("steppe_dry_river", "steppe_tallgrass", 40),
    ("steppe_tallgrass", "steppe_windbreak", 45),
    ("steppe_windbreak", "steppe_horse_road", 40),
    ("steppe_ilkhet", "steppe_the_south_reach", 60),
    ("steppe_the_south_reach", "steppe_dry_river", 55),
]

GATES = [
    gate("steppe_kurgan_ward", "The Kurgan Ward", "story",
         "No wall and no gate. A line of horse skulls on poles, and the "
         "riders will not cross it, and they will explain why at length and "
         "you will not be reassured.",
         bypass=("resolve", 14),
         requires={"description": "a khan's word, or a very good reason",
                   "minLevel": 4},
         blocked_key="steppe_kurgan_ward_blocked"),
    toll("steppe_grazing_right", "The Grazing Right", 8,
         "Nobody owns the steppe. Everybody owns the grazing, and crossing "
         "somebody's grazing in season costs.",
         bypass=("persuasion", 12), blocked_key="steppe_grazing_blocked"),
]

POIS = [
    # ===== Ilkhet =====
    poi("ilkhet_khans_yurt", "The Khan's Yurt", "steppe_ilkhet", "landmark",
        "Sixty feet across, felt over a lattice, and it comes down in two "
        "hours if it has to.", minutes=5, static="khans_yurt",
        services=["guild", "inn"], tags=["landmark"]),
    square("ilkhet_horse_fair", "The Horse Fair", "steppe_ilkhet",
           "Four times a year, and the town exists to hold it and to argue "
           "about it for the rest of the time."),
    stable("ilkhet_the_lines", "The Horse Lines", "steppe_ilkhet",
           "Eleven hundred animals, picketed in rows, and every one of them "
           "known by somebody."),
    smithy("ilkhet_farrier", "The Farriers' Ring", "steppe_ilkhet",
           "Six fires in a circle, all working, and the circle is the point.",
           size="large"),
    workshop("ilkhet_saddlery", "The Saddlery", "steppe_ilkhet",
             "Trees, panels, and the particular geometry of a saddle that "
             "will be lived in for eleven hours a day.", size="large"),
    workshop("ilkhet_bowyer", "The Horn Bowyer", "steppe_ilkhet",
             "Horn, sinew, and glue, and the finished bow takes four years.",
             size="large"),
    store("ilkhet_store", "The Trade Yurt", "steppe_ilkhet",
          "Everything from the north, at four times what it costs in the "
          "north.", size="large"),
    store("ilkhet_felt_makers", "The Felt Makers", "steppe_ilkhet",
          "Roofs, walls, boots, and blankets, all from the same process and "
          "all of it smells the same."),
    inn("ilkhet_the_stirrup", "The Stirrup", "steppe_ilkhet",
        "Timber, which is a statement, and it is the only timber building "
        "for ninety miles.", size="large"),
    temple("ilkhet_sky_shrine", "The Sky Shrine", "steppe_ilkhet",
           "Open to the top, deliberately, and it rains in and that is "
           "considered correct."),
    house("ilkhet_house_a", "The Standing Yurts", "steppe_ilkhet",
          "Nine that have not been moved in three generations, which is a "
          "quiet scandal."),
    house("ilkhet_house_b", "The Winter Row", "steppe_ilkhet",
          "Dug in and turfed over, and used four months in twelve."),

    # ===== Three Wells =====
    landmark("three_wells_the_wells", "The Three Wells", "steppe_three_wells",
             "Sunk in a line a hundred paces apart, and only two of them have "
             "ever gone dry in the same year.", minutes=3),
    inn("three_wells_the_bucket", "The Bucket", "steppe_three_wells",
        "One room, and the well-head is inside it, which is either clever or "
        "unhygienic.", size="small"),
    store("three_wells_store", "The Well Store", "steppe_three_wells",
          "Rope, leather buckets, and a great deal of rope.", size="small"),
    smithy("three_wells_forge", "The Well Forge", "steppe_three_wells",
           "Chain, windlass gear, and horseshoes.", size="small"),
    house("three_wells_house_a", "The Waterman's", "steppe_three_wells",
          "Whoever keeps the wells lives between the first and the second."),
    house("three_wells_house_b", "Rope Cottage", "steppe_three_wells",
          "Makes rope, sells rope, and has rope in every room."),
    delve("three_wells_the_dry_well", "The Dry Well", "steppe_three_wells",
          "The fourth, which nobody counts, and which went dry two hundred "
          "years ago and has a doorway at the bottom.",
          "steppe_dry_well", minutes=10, hidden=True,
          discover=("perception", 12), tags=["secret"]),

    # ===== Tallgrass =====
    landmark("tallgrass_the_stand", "The Tall Stand", "steppe_tallgrass",
             "Grass over head height for eleven acres, and you can lose a "
             "horse in it and frequently do.", minutes=4),
    inn("tallgrass_the_scythe", "The Scythe", "steppe_tallgrass",
        "Named for the only tool that has ever made any difference here.",
        size="small"),
    store("tallgrass_store", "The Cut Store", "steppe_tallgrass",
          "Blades, whetstones, and hay forks.", size="small"),
    temple("tallgrass_shrine", "The Grass Shrine", "steppe_tallgrass",
           "Mown, in a circle, by hand, every week, by whoever is free.",
           size="small"),
    house("tallgrass_house_a", "The Mown Yard", "steppe_tallgrass",
          "Keeps a bare ring round the house because of what the grass does "
          "in a dry Reaping."),
    house("tallgrass_house_b", "Hayward's", "steppe_tallgrass",
          "Cut, stacked, and sold to Ilkhet for the winter lines."),

    # ===== the steppe =====
    landmark("horse_road_the_width", "The Horse Road", "steppe_horse_road",
             "Forty yards of grass ridden flat over nine hundred years, and "
             "it is not a road and everybody calls it one.", minutes=6),
    poi("horse_road_relay", "The Relay Post", "steppe_horse_road", "settlement",
        "Fresh horses every thirty miles, which is how news crosses the "
        "steppe in three days.", minutes=5, trade="stable",
        desc_key="int_stable", services=["stable", "inn"]),
    ruin("horse_road_stone_horse", "The Stone Horse", "steppe_horse_road",
         "Carved, life-size, lying on its side where it fell, and there is "
         "no stone within forty miles.", minutes=8, trade="cave",
         size="small"),

    poi("kurgan_field_the_line", "The Skull Line", "steppe_kurgan_field",
        "crossing",
        "Horse skulls on poles, a hundred paces apart, and no rider will "
        "cross it.", minutes=5, interior=False, gate="steppe_kurgan_ward",
        tags=["crossing"]),
    landmark("kurgan_field_the_rows", "The Kurgans", "steppe_kurgan_field",
             "Two hundred mounds in eleven rows, aligned on something, and "
             "the something is not the sun.", minutes=8),
    delve("kurgan_field_great_kurgan", "The Great Kurgan",
          "steppe_kurgan_field",
          "The largest, at the head of the middle row, and it is the only one "
          "with a way in.", "steppe_great_kurgan", minutes=14,
          gate="steppe_kurgan_ward"),

    landmark("long_grass_the_sea", "The Grass Sea", "steppe_the_long_grass",
             "Chest-high and unbroken to the horizon, moving in a way that "
             "makes it very hard to tell what else is moving in it.",
             minutes=8),
    poi("long_grass_watch_mound", "The Watch Mound", "steppe_the_long_grass",
        "landmark",
        "Twelve feet of raised earth, and it is the only place in nine miles "
        "you can see out of the grass.", minutes=6, interior=False),
    ruin("long_grass_lost_wagons", "The Lost Wagons", "steppe_the_long_grass",
         "Eleven of them in a defensive ring, in grass, four days from any "
         "route.", minutes=10, trade="hull", size="medium",
         hidden=True, discover=("survival", 13), tags=["secret"]),

    landmark("dry_river_the_bed", "The Dry Bed", "steppe_dry_river",
             "A quarter of a mile wide, with nothing in it for eleven months "
             "and a great deal in it for the twelfth.", minutes=6),
    poi("dry_river_ford_camp", "The Ford Camp", "steppe_dry_river", "camp",
        "Used by everybody crossing, and struck at the first sign of weather "
        "upstream.", minutes=5, trade="house", size="small",
        desc_key="int_house"),
    delve("dry_river_cut_bank", "The Cut Bank", "steppe_dry_river",
          "The flood took a bite out of the bank and opened a stair that had "
          "been in it.", "steppe_cut_bank", minutes=12),

    landmark("windbreak_the_line", "The Windbreak", "steppe_windbreak",
             "Eleven miles of trees in a single line, planted, and no record "
             "anywhere of anybody planting them.", minutes=8),
    poi("windbreak_shepherds_camp", "The Shade Camp", "steppe_windbreak",
        "camp",
        "The only shade on the steppe, and consequently the most contested "
        "ground in the region.", minutes=5, trade="house", size="small",
        desc_key="int_house"),
    ruin("windbreak_the_planter", "The Planter's Stone", "steppe_windbreak",
         "At the western end, cut with a great many names and one date.",
         minutes=8, trade="cave", size="small"),

    landmark("south_reach_the_pale", "The Pale Ground", "steppe_the_south_reach",
             "Where the grass thins and the ground goes white, and the "
             "Glasslands start making themselves felt.", minutes=8),
    poi("south_reach_last_water", "The Last Water", "steppe_the_south_reach",
        "settlement",
        "A spring, a trough, and a very firm local convention about who "
        "drinks in what order.", minutes=5, interior=False,
        services=["inn"]),
    delve("south_reach_sand_shaft", "The Sand Shaft", "steppe_the_south_reach",
          "Sand pours into it continuously and it never fills, which has "
          "been true for as long as anybody has watched.",
          "steppe_sand_shaft", minutes=14),
]

DUNGEONS = [
    dungeon("steppe_dry_well", "The Dry Well", "dungeon_delved",
            "The fourth well, which nobody counts, dry for two hundred years, "
            "and with a dressed doorway at the bottom of it.",
            rooms="9", depth="2",),
    dungeon("steppe_great_kurgan", "The Great Kurgan", "dungeon_barrow",
            "The largest mound, at the head of the middle row, and the only "
            "one of the two hundred with a way in.",
            rooms="12", depth="3", branchiness=0.2),
    dungeon("steppe_cut_bank", "The Cut Bank", "dungeon_barrow",
            "A flood took a bite out of the river bank and opened a stair "
            "that had been buried in it.",
            rooms="10", depth="2",),
    dungeon("steppe_sand_shaft", "The Sand Shaft", "dungeon_delved",
            "Sand pours into it continuously and it has never filled, which "
            "means it is going somewhere.",
            rooms="13", depth="4", algorithm="bsp", bsp={"minLeaf": 5}),
]

# --- prose ------------------------------------------------------------------

pool("steppe_ilkhet_desc",
     "A town that is legally a camp, because moving it is in principle still "
     "an option, and the principle matters here.",
     "Ilkhet: felt, horses, and one timber building that everybody has an "
     "opinion about.",
     "Eleven hundred animals on the lines, and the sound of them is the sound "
     "of the town.",
     "Smoke from a hundred fires going flat east, all day, every day.")

pool("steppe_three_wells_desc",
     "Three wells in a line a hundred paces apart, and the village strung "
     "between them.",
     "Three Wells. Only two have ever gone dry in the same year and the "
     "village talks about that year a great deal.",
     "Rope everywhere: coiled, drying, being made, being mended.",
     "The sound of a windlass, more or less continuously, from one of the "
     "three.")

pool("steppe_tallgrass_desc",
     "Grass over head height for eleven acres, and a village that has cut a "
     "hole in it.",
     "Tallgrass. Every house keeps a mown ring round it because of what a dry "
     "Reaping can do.",
     "You cannot see the next house. You can hear it perfectly.",
     "Hay stacked in ricks taller than the roofs.")

pool("steppe_horse_road_desc",
     "Forty yards of grass ridden flat over nine hundred years, and it is not "
     "a road and everybody calls it one.",
     "The Horse Road. You can see the flattening from a mile off in low sun.",
     "Riders go past at a pace that does not look fast until you try to match "
     "it.",
     "Nothing grows above ankle height in the whole width of it.")

pool("steppe_kurgan_field_desc",
     "Two hundred burial mounds in eleven rows, and the rows are aligned on "
     "something, and the something is not the sun.",
     "The Kurgan Field. Horse skulls on poles mark where the riders stop.",
     "Each mound is the same height. Two hundred times, over eleven miles, "
     "the same height.",
     "The grass on the mounds is a different colour and always has been.")

pool("steppe_the_long_grass_desc",
     "Chest-high, unbroken to the horizon, moving in a way that makes it very "
     "hard to tell what else is moving in it.",
     "The Long Grass. You navigate by the sun and by nothing else at all.",
     "Something is coming through it about two hundred yards off and you "
     "cannot see what.",
     "A watch mound, twelve feet high, is the only place in nine miles you can "
     "see out.")

pool("steppe_dry_river_desc",
     "A bed a quarter of a mile wide with nothing in it for eleven months of "
     "the year.",
     "The Dry River. In the twelfth month there is a great deal in it and "
     "everybody is somewhere else.",
     "Cobbles, sand, and driftwood forty feet up the bank, which tells you "
     "what it is capable of.",
     "The flood has cut the bank back this year and opened something in it.")

pool("steppe_windbreak_desc",
     "Eleven miles of trees in a single line across open grass, planted, and "
     "no record of anybody planting them.",
     "The Windbreak. The only shade on the steppe and therefore the most "
     "argued-over ground in the region.",
     "One species, one spacing, eleven miles. Somebody did this.",
     "The wind on the far side of it is noticeably less and that is the whole "
     "of the point.")

pool("steppe_the_south_reach_desc",
     "Where the grass thins, the ground goes pale, and the Glasslands start "
     "making themselves felt.",
     "The South Reach. Scrub, then tussock, then sand, over about eleven "
     "miles.",
     "The last reliable water is behind you and the next is a long way "
     "forward.",
     "Heat coming up off the ground as well as down onto it, for the first "
     "time.")

pool("ilkhet_khans_yurt_desc",
     "Sixty feet across, felt over a lattice, and it can be down and on carts "
     "in two hours if it has to be.",
     "The Khan's Yurt. There is a fire in the middle and a hole above it and "
     "nothing else structural in the whole span.",
     "Rugs eleven deep on the floor, and the pattern of them is a record of "
     "something.")

pool("kurgan_field_the_rows_desc",
     "Two hundred mounds, eleven rows, and every one of them the same height "
     "to within a hand.",
     "The alignment is exact and it is not on the sun, and it is not on any "
     "star that is currently there.",
     "The grass on them is a different colour. It has always been a different "
     "colour.")

pool("windbreak_the_line_desc",
     "Eleven miles of trees, one species, one spacing, in a dead straight "
     "line across open grass.",
     "There is a stone at the western end cut with a great many names and one "
     "date.",
     "Nobody planted this within record, and record here goes back a long "
     "way.")

pool("horse_road_the_width_desc",
     "Forty yards wide, and in low sun you can see the flattening from a mile "
     "off.",
     "Nine hundred years of hooves. The soil profile under it is different "
     "for eighteen inches down.",
     "There is a stone horse lying on its side beside it, life-size, and no "
     "stone within forty miles.")

pool("dry_river_the_bed_desc",
     "A quarter mile of cobble and sand, bone dry, with driftwood forty feet "
     "up the bank on both sides.",
     "Eleven months of nothing and one month of everything.",
     "You can walk straight across. You would not want to be doing it in "
     "Thawmoon.")

pool("three_wells_the_wells_desc",
     "Three, in a line, a hundred paces apart, and each with its own "
     "windlass, rope, and long-standing local etiquette.",
     "The middle one is the deepest and the sweetest and there is a queue.",
     "There is a fourth, further out, that nobody counts.")

pool("long_grass_the_sea_desc",
     "Chest-high to the horizon in every direction, and it moves like water "
     "does.",
     "You are navigating by the sun. There is nothing else.",
     "Something is moving through it two hundred yards off, making a wake, "
     "and you cannot see what.")

pool("south_reach_the_pale_desc",
     "The grass thins over about eleven miles and the ground goes from brown "
     "to white without any obvious step.",
     "Tussock, then scrub, then nothing, and then the dunes.",
     "The last water is behind you, and everybody who has come this way knows "
     "exactly how far behind.")

pool("steppe_kurgan_ward_blocked",
     "The skull line runs east and west as far as you can see, and every "
     "rider you are with has stopped without discussion.",
     "\"Not past the skulls,\" says the guide, and turns his horse, and that "
     "is the entire conversation.",
     "There is no wall. There is nothing at all. Nobody crosses it.")

pool("steppe_grazing_blocked",
     "Somebody's grazing, in season, and somebody is sitting on a horse "
     "watching you think about it.",
     "\"Eight,\" says the rider. \"For the grass, not for the road. There is "
     "no road.\"",
     "Nobody owns the steppe. Everybody owns the grazing, and this is theirs "
     "until Winnow.")
