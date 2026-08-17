"""Region 11 — The Sundered Isles.

An archipelago off the south-west, reached only through eleven miles of moving
shoal. Everything here arrived by water or was left by it, and most of the
buildings used to float. One free port, two villages, five stretches of sea.
"""
from place import (
    area, poi, gate, house, inn, smithy, store, workshop, temple, warehouse,
    guild, square, landmark, ruin, delve,
)
from dmkit.dungeons import dungeon
from dmkit.prose import pool

WILD, ISLE = "isles", "urban_isle"
TAGS = ["sundered_isles"]

AREAS = [
    area("isles_blackrigging", "Blackrigging", ISLE, "town", 3, 5,
         "A free port in the sense that nobody has successfully charged "
         "anything here, built out of about forty wrecks.",
         tags=TAGS + ["town"]),
    area("isles_cormorant", "Cormorant", ISLE, "village", 4, 5,
         "One rock, one jetty, and eleven families who have been here longer "
         "than Blackrigging has existed.", tags=TAGS + ["village"]),
    area("isles_halfmast", "Halfmast", ISLE, "village", 4, 6,
         "Built in and around a fort that the sea got into, and the fort is "
         "still the best building.", tags=TAGS + ["village"]),

    area("isles_the_narrows", "The Narrows", WILD, "wild", 5, 5,
         "Eleven miles of shoal that moves between one season and the next, "
         "and the only way in.", tags=TAGS),
    area("isles_wreck_reef", "Wreck Reef", WILD, "wild", 6, 6,
         "The reason for the Narrows: a reef three miles long with about "
         "sixty ships on it in various stages of going.", tags=TAGS),
    area("isles_gullstone", "Gullstone", WILD, "wild", 5, 6,
         "A rock four hundred feet out of the water with nothing on it but "
         "birds and a stair.", tags=TAGS),
    area("isles_drowned_fort_shoal", "The Drowned Fort Shoal", WILD, "wild", 6, 7,
         "A fortress on a bank that the sea took, standing in twelve feet of "
         "water at low tide and forty at high.", tags=TAGS),
    area("isles_tern_bank", "Tern Bank", WILD, "wild", 5, 5,
         "A shingle bank three miles long that is above water for nine months "
         "and a shoal for three.", tags=TAGS),
]

EDGES = [
    ("isles_the_narrows", "isles_blackrigging", 30),
    ("isles_blackrigging", "isles_wreck_reef", 40),
    ("isles_wreck_reef", "isles_gullstone", 45),
    ("isles_gullstone", "isles_cormorant", 35),
    ("isles_cormorant", "isles_tern_bank", 40),
    ("isles_tern_bank", "isles_halfmast", 35),
    ("isles_halfmast", "isles_drowned_fort_shoal", 40),
    ("isles_drowned_fort_shoal", "isles_the_narrows", 45),
    ("isles_blackrigging", "isles_tern_bank", 55),
]

GATES = [
    gate("isles_fort_hatch", "The Fort Hatch", "hazard",
         "The way down into the drowned fort, and it is open for about forty "
         "minutes either side of low water.",
         bypass=("athletics", 15),
         requires={"description": "a tide table and the nerve to trust it",
                   "minLevel": 6},
         blocked_key="isles_fort_hatch_blocked"),
    gate("gullstone_stair", "The Gullstone Stair", "hazard",
         "Four hundred feet of cut steps up a rock, with no rail, in a place "
         "where the wind does not stop.",
         bypass=("acrobatics", 14), blocked_key="gullstone_stair_blocked"),
]

POIS = [
    # ===== Blackrigging =====
    poi("blackrigging_wreck_tavern", "The Weatherly", "isles_blackrigging",
        "settlement",
        "A merchantman that came ashore stern-first in 'eighty-one and has "
        "been an inn ever since without anybody moving her.", minutes=5,
        static="wreck_tavern", services=["inn", "market"],
        tags=["landmark", "inn"]),
    square("blackrigging_free_market", "The Free Market", "isles_blackrigging",
           "Nobody has ever successfully charged a fee here, and several "
           "people have tried, and there is a list."),
    poi("blackrigging_the_hulks", "The Hulks", "isles_blackrigging", "landmark",
        "Eleven ships moored in a row and joined by planks, and about two "
        "hundred people live on them.", minutes=4, interior=False,
        tags=["landmark"]),
    workshop("blackrigging_breakers", "The Breakers' Yard", "isles_blackrigging",
             "Takes ships apart and sells them by the piece, which is most of "
             "the town's economy.", size="hall"),
    smithy("blackrigging_smithy", "The Salvage Forge", "isles_blackrigging",
           "Works nothing but recovered iron, and there is a great deal of "
           "recovered iron.", size="large"),
    store("blackrigging_chandlery", "The Long Chandlery", "isles_blackrigging",
          "Everything a ship needs, all of it off another ship.",
          trade="chandler", size="large"),
    warehouse("blackrigging_salvage_store", "The Salvage Store",
              "isles_blackrigging",
              "Sorted by what it came off rather than what it is, which "
              "makes perfect sense to everybody here.", size="hall"),
    store("blackrigging_apothecary", "The Wet Locker", "isles_blackrigging",
          "Rot, damp, salt sores, and the things a long voyage does.",
          trade="apothecary"),
    guild("blackrigging_pilots", "The Pilots' Shed", "isles_blackrigging",
          "Eleven people who know the Narrows, and the Narrows change, and "
          "so does the eleven."),
    temple("blackrigging_chapel", "The Ship's Chapel", "isles_blackrigging",
           "Lifted whole out of a wreck, roof and all, and set down here."),
    inn("blackrigging_the_bilge", "The Bilge", "isles_blackrigging",
        "Below the waterline of a ship that is on dry land, which is a "
        "distinction the landlord enjoys."),
    house("blackrigging_house_a", "Sternpost Row", "isles_blackrigging",
          "Four houses out of one ship, and you can see where the joins "
          "were."),
    house("blackrigging_house_b", "The Pilot's Berth", "isles_blackrigging",
          "Best view of the Narrows in the town and the only one anybody "
          "wants."),

    # ===== Cormorant =====
    landmark("cormorant_the_jetty", "The Jetty", "isles_cormorant",
             "One jetty, and everything that has ever happened here has "
             "happened on it.", minutes=2),
    inn("cormorant_the_shag", "The Shag", "isles_cormorant",
        "One room, one barrel, eleven families, and no strangers most years.",
        size="small"),
    store("cormorant_store", "The Rock Store", "isles_cormorant",
          "Line, hooks, salt, and lamp oil.", size="small"),
    temple("cormorant_chapel", "The Rock Chapel", "isles_cormorant",
           "Cut into the rock rather than built on it, because of the wind.",
           size="small"),
    house("cormorant_house_a", "The Old House", "isles_cormorant",
          "Older than Blackrigging, and the family will tell you by how "
          "much."),
    house("cormorant_house_b", "Ledge Cottages", "isles_cormorant",
          "Three, on a ledge, with the sea forty feet below the doorstep."),

    # ===== Halfmast =====
    poi("halfmast_the_fort", "Halfmast Fort", "isles_halfmast", "landmark",
        "The sea got into it in 'sixty-three and it is still the best "
        "building on the island.", minutes=5, trade="keep", size="hall",
        tags=["castle"]),
    inn("halfmast_the_half_mast", "The Half Mast", "isles_halfmast",
        "There is one, in the yard, cut off at about twelve feet, and nobody "
        "will say why it was cut.", size="small"),
    store("halfmast_store", "The Fort Store", "isles_halfmast",
          "In the old magazine, which is the only dry room on the island.",
          size="small"),
    smithy("halfmast_forge", "The Gun Forge", "isles_halfmast",
           "Was a gun forge. Is now a forge.", size="small"),
    house("halfmast_house_a", "The Gunner's House", "isles_halfmast",
          "Built into the rampart, and the rampart does most of the work."),
    house("halfmast_house_b", "Casemate Row", "isles_halfmast",
          "Four families living in gun positions, and it is warmer than it "
          "sounds."),

    # ===== the sea =====
    poi("narrows_the_passage", "The Passage", "isles_the_narrows", "crossing",
        "Eleven miles of shoal that moves between one season and the next, "
        "and it is the only way in.", minutes=8, interior=False,
        gate="isles_passage", tags=["crossing"]),
    poi("narrows_pilot_station", "The Pilot Station", "isles_the_narrows",
        "settlement",
        "A hut on a rock with a flagstaff, and somebody in it whenever "
        "anything is expected.", minutes=5, trade="hull", size="small",
        desc_key="int_house", services=["inn"]),
    ruin("narrows_marker_wreck", "The Marker", "isles_the_narrows",
         "A ship set deliberately on the shoal to mark it, forty years ago, "
         "and she is still where she was put.", minutes=8, trade="hull",
         size="medium"),

    landmark("wreck_reef_the_reef", "Wreck Reef", "isles_wreck_reef",
             "Three miles long, with about sixty ships on it in every stage "
             "of going, and the newest is four years old.", minutes=8),
    poi("wreck_reef_salvors_camp", "The Salvors' Camp", "isles_wreck_reef",
        "camp",
        "On the one dry rock, occupied whenever the weather allows, which is "
        "not often.", minutes=6, trade="house", size="small",
        desc_key="int_house"),
    delve("wreck_reef_the_deep_wreck", "The Deep Wreck", "isles_wreck_reef",
          "A ship on her side in the lee of the reef with her holds intact "
          "and her decks above water at low springs.",
          "isles_deep_wreck", minutes=14),

    poi("gullstone_the_stair", "The Gullstone Stair", "isles_gullstone",
        "crossing",
        "Four hundred feet of cut steps up a rock, no rail, and the wind "
        "never stops.", minutes=8, interior=False, gate="gullstone_stair",
        tags=["crossing"]),
    landmark("gullstone_the_top", "The Top", "isles_gullstone",
             "Flat, about an acre, forty thousand birds, and one building "
             "that nobody in the isles claims.", minutes=10),
    delve("gullstone_the_chimney", "The Chimney", "isles_gullstone",
          "A shaft through the middle of the rock from the top to the "
          "waterline, and the stair on the outside was cut to reach it.",
          "isles_gullstone_chimney", minutes=14, gate="gullstone_stair"),

    poi("drowned_fort_the_hatch", "The Fort Hatch", "isles_drowned_fort_shoal",
        "dungeonEntrance",
        "Open for about forty minutes either side of low water, and shut with "
        "the whole Iron Sea on top of it the rest of the time.", minutes=10,
        dungeon="isles_drowned_fort", gate="isles_fort_hatch",
        tags=["dungeon"]),
    landmark("drowned_fort_the_walls", "The Drowned Walls",
             "isles_drowned_fort_shoal",
             "Twelve feet of water over them at low tide and forty at high, "
             "and the parapet shows twice a day.", minutes=8),
    ruin("drowned_fort_the_battery", "The Sea Battery",
         "isles_drowned_fort_shoal",
         "Nine guns still in their positions, under water, pointing at a "
         "channel that has moved.", minutes=10, trade="keep", size="medium"),

    landmark("tern_bank_the_bank", "Tern Bank", "isles_tern_bank",
             "Three miles of shingle that is a bank for nine months and a "
             "shoal for three.", minutes=6),
    poi("tern_bank_hut", "The Bank Hut", "isles_tern_bank", "camp",
        "Rebuilt every spring, because it is under water every winter.",
        minutes=5, trade="house", size="small", desc_key="int_house"),
    delve("tern_bank_the_cut", "The Bank Cut", "isles_tern_bank",
          "A winter storm cut the bank through and exposed something that had "
          "been under it, and the bank has not closed up again.",
          "isles_bank_cut", minutes=12, hidden=True,
          discover=("perception", 13), tags=["secret"]),
]

DUNGEONS = [
    dungeon("isles_deep_wreck", "The Deep Wreck", "dungeon_drowned",
            "A great ship on her side in the lee of the reef, holds intact, "
            "decks above water at low springs and not otherwise.",
            rooms="11", depth="3", algorithm="bsp", bsp={"minLeaf": 5}),
    dungeon("isles_gullstone_chimney", "The Gullstone Chimney", "dungeon_cave",
            "A shaft through the middle of the rock from the top to the "
            "waterline, and the stair outside was cut in order to reach it.",
            rooms="10", depth="3", branchiness=0.2,
            corridorLength="4d3"),
    dungeon("isles_drowned_fort", "The Drowned Fort", "dungeon_drowned",
            "Three levels of casemate, magazine, and cistern under a shoal, "
            "reachable for forty minutes either side of low water.",
            rooms="14", depth="3", algorithm="bsp", bsp={"minLeaf": 6}),
    dungeon("isles_bank_cut", "The Bank Cut", "dungeon_drowned",
            "A winter storm cut the shingle through and exposed what was "
            "under it, and the bank has not closed since.",
            rooms="9", depth="2", algorithm="caverns", caverns={"fill": 0.45, "smoothingPasses": 4, "birthThreshold": 5}),
]

# --- prose ------------------------------------------------------------------

pool("isles_blackrigging_desc",
     "A free port built out of about forty wrecks, on piles, with the sea "
     "moving underneath all of it.",
     "Blackrigging. Nobody has ever successfully charged a fee here and "
     "several have tried.",
     "Eleven ships moored in a row and joined by planks, and two hundred "
     "people living on them.",
     "Tar, hemp, gull, and fish that has been out a while.")

pool("isles_cormorant_desc",
     "One rock, one jetty, eleven families, and no strangers most years.",
     "Cormorant. Older than Blackrigging, and they will tell you by how "
     "much.",
     "Three cottages on a ledge with the sea forty feet below the doorstep.",
     "The chapel is cut into the rock rather than built on it, because of "
     "what the wind does.")

pool("isles_halfmast_desc",
     "A fort the sea got into in 'sixty-three, and a village that moved into "
     "the fort afterwards.",
     "Halfmast. Four families living in gun positions, and it is warmer than "
     "that sounds.",
     "There is a mast in the inn yard, cut off at twelve feet, and nobody "
     "will say why it was cut.",
     "The ramparts do most of the work of most of the buildings.")

pool("isles_the_narrows_desc",
     "Eleven miles of shoal that moves between one season and the next, and "
     "it is the only way in.",
     "The Narrows. There are eleven people who know it and the eleven "
     "changes.",
     "Brown water over the banks and green over the channel, and the green is "
     "not where it was.",
     "A ship was set on the shoal forty years ago to mark it. She is still "
     "there and the shoal is not.")

pool("isles_wreck_reef_desc",
     "Three miles of reef with about sixty ships on it in every stage of "
     "going, and the newest is four years old.",
     "Wreck Reef. This is why the Narrows exist and why the pilots do.",
     "Masts out of the water at low tide in a line, like a drowned forest.",
     "Swell breaking white the whole length of it, all day, in any weather.")

pool("isles_gullstone_desc",
     "A rock four hundred feet out of the water with nothing on it but birds "
     "and a stair.",
     "Gullstone. Somebody cut four hundred feet of steps up this, without a "
     "rail, and there is a reason.",
     "The noise of the birds is continuous and physical.",
     "At the top there is an acre of flat ground and one building that nobody "
     "in the isles will claim.")

pool("isles_drowned_fort_shoal_desc",
     "A fortress on a bank the sea took, standing in twelve feet of water at "
     "low tide and forty at high.",
     "The parapet shows twice a day and the rest of the time it does not.",
     "Nine guns still in their positions, under water, pointing at a channel "
     "that has since moved.",
     "There is a hatch. It is open for about forty minutes either side of low "
     "water.")

pool("isles_tern_bank_desc",
     "Three miles of shingle that is a bank for nine months of the year and a "
     "shoal for three.",
     "Tern Bank. The hut is rebuilt every spring for the obvious reason.",
     "Terns in thousands, and they will go for your head, and they mean it.",
     "A winter storm cut the bank through and exposed something under it, and "
     "it has not closed up.")

pool("blackrigging_wreck_tavern_desc",
     "A merchantman that came ashore stern-first in 'eighty-one and has been "
     "an inn ever since, in exactly the position she landed.",
     "The Weatherly. The floors slope aft and everybody has stopped "
     "noticing.",
     "The great cabin is the best room and it is let by the week.")

pool("wreck_reef_the_reef_desc",
     "Three miles long, sixty ships, and the newest of them four years old.",
     "At low water the masts come up out of it in a line and it looks like a "
     "drowned forest.",
     "Everything in Blackrigging came off this reef, including several of the "
     "buildings.")

pool("gullstone_the_top_desc",
     "An acre of flat ground four hundred feet above the sea, forty thousand "
     "birds, and one building.",
     "Nobody in the isles will say who built it or claim it now.",
     "The wind up here is a solid thing and you lean into it as a matter of "
     "course.")

pool("drowned_fort_the_walls_desc",
     "Twelve feet of water over the parapet at low tide, forty at high, and "
     "the whole trace still perfectly legible from above.",
     "Nine guns in their positions, under water, pointing at a channel that "
     "moved eighty years ago.",
     "At dead low springs you can stand on the rampart. Briefly.")

pool("narrows_the_passage_desc",
     "Brown water over the banks, green over the channel, and the green is "
     "not where the chart says.",
     "Eleven miles of it, and the pilot is watching the colour rather than "
     "the compass.",
     "Nothing goes through here without somebody who has been through "
     "recently.")

pool("blackrigging_the_hulks_desc",
     "Eleven ships moored in a row and joined by planks, and about two "
     "hundred people living aboard them.",
     "The whole assembly rises and falls together, which is disconcerting for "
     "about a day.",
     "Washing between the masts, smoke from eleven stove-pipes, and children "
     "going from ship to ship at a run.")

pool("tern_bank_the_bank_desc",
     "Three miles of shingle, above water for nine months and a shoal for "
     "three.",
     "Terns in thousands, and they will go for your head, repeatedly, and "
     "they do not miss.",
     "The storm cut it through in Rimewatch and the cut has not closed.")

pool("isles_fort_hatch_blocked",
     "There is forty feet of the Iron Sea on top of the hatch and the tide "
     "has three hours to run.",
     "Low water is at dawn. It is not dawn.",
     "The hatch is open for about forty minutes either side of low water and "
     "this is neither of them.")

pool("gullstone_stair_blocked",
     "Four hundred feet of cut steps, no rail, and a wind that is currently "
     "taking the tops off the swell.",
     "The first fifty steps are wet from spray and it is not raining.",
     "You could go up that. Today, with this wind, you very much could not.")
