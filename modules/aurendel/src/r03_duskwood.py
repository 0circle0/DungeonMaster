"""Region 3 — Duskwood.

Primeval forest across the north-west, standing over elf-work that the forest
got to first. One town, two villages, six stretches of trees, and a corner
called the Witchwood that the other five stretches do not talk about.
"""
from place import (
    area, poi, gate, house, inn, smithy, store, workshop, temple, stable,
    square, landmark, ruin, delve,
)
from dmkit.dungeons import dungeon
from dmkit.prose import pool

WILD, TIMBER = "deepwood", "urban_timber"
TAGS = ["duskwood"]

AREAS = [
    area("duskwood_elderhollow", "Elderhollow", TIMBER, "town", 1, 3,
         "Built in a clearing round an oak that the town is legally not "
         "allowed to touch.", tags=TAGS + ["town"]),
    area("duskwood_rooksrest", "Rooksrest", TIMBER, "village", 2, 3,
         "Charcoal burners, mostly, and the smoke never entirely leaves the "
         "clearing.", tags=TAGS + ["village"]),
    area("duskwood_fenny_cross", "Fenny Cross", TIMBER, "village", 2, 3,
         "Where the forest road meets the coast road in a wet hollow, and "
         "everybody arriving is already in a bad mood.", tags=TAGS + ["village"]),

    area("duskwood_the_undereaves", "The Undereaves", WILD, "wild", 3, 3,
         "The edge of the forest, where the fields stop and do not start "
         "again for four days.", tags=TAGS),
    area("duskwood_moot_road", "The Moot Road", WILD, "wild", 3, 3,
         "The only road anybody keeps up, running straight to Elderhollow "
         "because the trees were persuaded to allow it.", tags=TAGS),
    area("duskwood_hollow_beeches", "The Hollow Beeches", WILD, "wild", 4, 4,
         "A stand of beeches gone hollow with age, every one of them big "
         "enough to stand inside and several of them occupied.", tags=TAGS),
    area("duskwood_thornback_ride", "The Thornback Ride", WILD, "wild", 4, 4,
         "A cut through the forest going north, grown in to the width of one "
         "cart and closing.", tags=TAGS),
    area("duskwood_the_greenway", "The Greenway", WILD, "wild", 3, 4,
         "Older than the Moot Road and straighter, and nobody cut it.",
         tags=TAGS),
    area("duskwood_witchwood", "The Witchwood", WILD, "wild", 6, 6,
         "Nine square miles the foresters will not work, and they will not be "
         "drawn on why.", tags=TAGS),
]

EDGES = [
    ("duskwood_the_undereaves", "duskwood_moot_road", 40),
    ("duskwood_moot_road", "duskwood_elderhollow", 30),
    ("duskwood_elderhollow", "duskwood_hollow_beeches", 35),
    ("duskwood_hollow_beeches", "duskwood_rooksrest", 30),
    ("duskwood_rooksrest", "duskwood_thornback_ride", 45),
    ("duskwood_thornback_ride", "duskwood_the_greenway", 40),
    ("duskwood_the_greenway", "duskwood_fenny_cross", 30),
    ("duskwood_fenny_cross", "duskwood_the_undereaves", 35),
    ("duskwood_elderhollow", "duskwood_witchwood", 50, {"gate": "duskwood_thornward"}),
    ("duskwood_witchwood", "duskwood_thornback_ride", 55),
]

GATES = [
    gate("duskwood_thornward", "The Thornward", "ward",
         "A line of thorn laid across the ride, and it was laid across the "
         "ride, which thorn does not do by itself.",
         bypass=("nature", 14),
         requires={"description": "the Elderhollow moot's leave", "minLevel": 4},
         blocked_key="duskwood_thornward_blocked"),
    gate("elderhollow_moot_door", "The Moot Door", "story",
         "The door in the oak. It is a door, in an oak, and it has hinges.",
         bypass=("persuasion", 15), blocked_key="elderhollow_moot_blocked"),
]

POIS = [
    # ===== Elderhollow =====
    poi("elderhollow_moot_oak", "The Moot Oak", "duskwood_elderhollow", "landmark",
        "Nine yards round at the base, hollow for the first twenty feet, and "
        "the town holds its moot inside it.", minutes=5,
        static="moot_oak", gate="elderhollow_moot_door",
        services=["guild"], tags=["landmark"]),
    square("elderhollow_green_market", "The Green Market", "duskwood_elderhollow",
           "Timber, charcoal, honey, hides, and a great deal of arguing about "
           "coppice rights."),
    inn("elderhollow_the_long_bough", "The Long Bough", "duskwood_elderhollow",
        "Beams out of the forest, floor out of the forest, and a fire that "
        "has never once gone out.", size="large"),
    smithy("elderhollow_smithy", "The Ring Forge", "duskwood_elderhollow",
           "Axes, wedges, saw-teeth, and cart-iron for the timber wagons.",
           size="large"),
    workshop("elderhollow_sawpit", "The Sawpit", "duskwood_elderhollow",
             "Two men, one saw, one very long day. Somebody is always in the "
             "pit and it is never the same somebody.", size="large"),
    workshop("elderhollow_bowyer", "The Yew Shop", "duskwood_elderhollow",
             "Staves seasoning in the roof, some of them promised to people "
             "who have died waiting."),
    store("elderhollow_store", "Hask's", "duskwood_elderhollow",
          "Sells what the forest cannot provide, which is salt, iron, and "
          "news."),
    store("elderhollow_apiary", "The Bee House", "duskwood_elderhollow",
          "Honey, wax, and mead, and the mead is the reason people come.",
          trade="brewery"),
    temple("elderhollow_grove_chapel", "The Grove Chapel", "duskwood_elderhollow",
           "Roofed with shingles off the same oaks it was built between."),
    stable("elderhollow_ox_lines", "The Ox Lines", "duskwood_elderhollow",
           "Timber is hauled by oxen here, and there are forty of them."),
    house("elderhollow_house_a", "Warden's House", "duskwood_elderhollow",
          "The forest warden's, and it has a very large map on one wall."),
    house("elderhollow_house_b", "Coppice Row", "duskwood_elderhollow",
          "Five cottages built out of one very large tree, which is on record."),

    # ===== Rooksrest =====
    landmark("rooksrest_burn", "The Burn", "duskwood_rooksrest",
             "Six charcoal clamps smouldering under turf, watched day and "
             "night for a fortnight at a time.", minutes=3),
    store("rooksrest_store", "The Charcoal Store", "duskwood_rooksrest",
          "Sacks to the roof, and everything in the building is black.",
          size="small"),
    inn("rooksrest_the_black_hand", "The Black Hand", "duskwood_rooksrest",
        "Named for what every customer's are. The ale is good and the "
        "upholstery is not.", size="small"),
    house("rooksrest_house_a", "Burner's Hut", "duskwood_rooksrest",
          "A turf shelter that gets rebuilt wherever the clamp is that year."),
    house("rooksrest_house_b", "The Old Lodge", "duskwood_rooksrest",
          "Built for a hunt that stopped coming, and lived in by four "
          "families since."),

    # ===== Fenny Cross =====
    poi("fenny_cross_crossroads", "The Cross", "duskwood_fenny_cross", "crossing",
        "Forest road one way, coast road the other, and a foot of standing "
        "water in the middle of both.", minutes=2, interior=False,
        tags=["crossing"]),
    inn("fenny_cross_the_wet_boot", "The Wet Boot", "duskwood_fenny_cross",
        "Honest about itself, which is the best thing anybody says about it."),
    store("fenny_cross_store", "The Cross Stores", "duskwood_fenny_cross",
          "Dry stockings, lamp oil, and rope, in that order of turnover.",
          size="small"),
    smithy("fenny_cross_smithy", "The Cross Forge", "duskwood_fenny_cross",
           "Mends wheels and axles for people who have just discovered the "
           "hollow.", size="small"),
    house("fenny_cross_house_a", "The Toll Cottage", "duskwood_fenny_cross",
          "There has been no toll for eighty years and the name has outlasted "
          "it."),
    house("fenny_cross_house_b", "Duckboard House", "duskwood_fenny_cross",
          "Reached by a plank, which says everything about the site."),

    # ===== the forest =====
    landmark("undereaves_last_field", "The Last Field", "duskwood_the_undereaves",
             "Ploughed right up to the treeline, and the treeline has moved "
             "twice in the farmer's lifetime, both times the wrong way."),
    poi("undereaves_woodward_hut", "The Woodward's Hut", "duskwood_the_undereaves",
        "camp", "Where the forest warden sits when he wants to know who is "
        "going in.", minutes=5, trade="house", size="small",
        desc_key="int_house"),
    ruin("undereaves_boundary_stone", "The Boundary Stones",
         "duskwood_the_undereaves",
         "A line of them, half a mile apart, marking a boundary between two "
         "things that no longer exist.", minutes=8, trade="cave", size="small"),

    landmark("moot_road_mile_oaks", "The Mile Oaks", "duskwood_moot_road",
             "One planted at every mile, all on the same day, four hundred "
             "years ago, and all of them still standing."),
    poi("moot_road_wayhouse", "The Moot Road Wayhouse", "duskwood_moot_road",
        "settlement",
        "A roof, a hearth, and a woodpile, kept by the town for anybody caught "
        "out after dark.", minutes=5, trade="inn", size="small",
        desc_key="int_inn", services=["inn"], tags=["inn"]),
    delve("moot_road_hollow_way", "The Hollow Way", "duskwood_moot_road",
          "The road before the road: sunk twenty feet below the forest floor "
          "and roofed over by four centuries of growth.",
          "duskwood_hollow_way", minutes=10),

    landmark("hollow_beeches_the_king", "The Beech King", "duskwood_hollow_beeches",
             "Eleven yards round, hollow the whole way up, and you can stand "
             "in it and see sky."),
    poi("hollow_beeches_hermit", "The Hermit's Beech", "duskwood_hollow_beeches",
        "settlement",
        "Somebody has lived in this tree. The door is fitted properly.",
        minutes=6, trade="house", size="small", desc_key="int_house"),
    delve("hollow_beeches_root_cellar", "The Root Cellar",
          "duskwood_hollow_beeches",
          "Under the Beech King, and the roots are holding up a ceiling that "
          "is made of dressed stone.", "duskwood_root_cellar", minutes=12,
          hidden=True, discover=("perception", 14), tags=["secret"]),

    landmark("thornback_ride_the_narrows", "The Narrows",
             "duskwood_thornback_ride",
             "The ride closes to eight feet here and the branches meet "
             "overhead, and it is dark at noon."),
    ruin("thornback_ride_charcoal_ruin", "The Burnt Lodge",
         "duskwood_thornback_ride",
         "A hunting lodge that went up in somebody's grandfather's time, and "
         "the forest has taken three walls of four."),
    delve("thornback_ride_deadfall_cave", "The Deadfall", "duskwood_thornback_ride",
          "A tree came down and took a great deal of hillside with it, and "
          "under the hillside there was a doorway.",
          "duskwood_deadfall", minutes=12),

    landmark("greenway_the_avenue", "The Avenue", "duskwood_the_greenway",
             "Two rows of oak a hundred feet apart running dead straight for "
             "six miles, and nobody planted them within record."),
    ruin("greenway_elf_bridge", "The Green Bridge", "duskwood_the_greenway",
         "A single span of dressed stone over a stream you could step across, "
         "carved on both parapets, and older than the forest.",
         minutes=8, trade="hall", size="small"),
    delve("greenway_barrow_of_the_ride", "The Ride Barrow", "duskwood_the_greenway",
          "Sits directly on the Greenway, which means either the barrow came "
          "second or the road did.", "duskwood_ride_barrow", minutes=12),

    landmark("witchwood_the_ring", "The Ring", "duskwood_witchwood",
             "Nine trees in a circle sixty feet across, all the same age, all "
             "the same species, and nothing at all growing inside them."),
    ruin("witchwood_the_tower", "The Leaning Tower", "duskwood_witchwood",
         "Four storeys of elf-work with a beech growing through it, holding "
         "it up and pulling it apart at once.", minutes=12,
         trade="keep", size="large"),
    delve("witchwood_under_the_ring", "Under the Ring", "duskwood_witchwood",
          "There is a stair inside the Ring, going down, and the ninth tree "
          "has grown over the top of it.", "duskwood_under_ring", minutes=15),
    poi("witchwood_the_still_pool", "The Still Pool", "duskwood_witchwood", "shrine",
        "Forty feet across, black, and no wind has ever moved it.",
        minutes=10, interior=False, tags=["shrine"]),
]

DUNGEONS = [
    dungeon("duskwood_hollow_way", "The Hollow Way", "dungeon_ruin",
            "The road before the road, sunk twenty feet and roofed over by "
            "growth, with side-chambers cut into the banks.",
            rooms="9", depth="1", branchiness=0.2,
            corridorLength="4d3", corridor={"style": "winding", "width": 2}),
    dungeon("duskwood_root_cellar", "The Root Cellar", "dungeon_delved",
            "Dressed stone under the Beech King's roots, and the roots have "
            "been getting in for a century.",
            rooms="8", depth="2",),
    dungeon("duskwood_deadfall", "The Deadfall", "dungeon_cave",
            "A slip took the hillside off a doorway that was meant to stay "
            "shut, and what is behind it is not a cave.",
            rooms="10", depth="2", algorithm="caverns", caverns={"fill": 0.45, "smoothingPasses": 4, "birthThreshold": 5}),
    dungeon("duskwood_ride_barrow", "The Ride Barrow", "dungeon_barrow",
            "A long barrow astride the Greenway, and the Greenway goes round "
            "it, which settles the question of which came first.",
            rooms="7", depth="1", roomSize="2d2+3"),
    dungeon("duskwood_under_ring", "Under the Ring", "dungeon_ruin",
            "A stair inside the Ring going down into work that is not stone "
            "laid on stone but stone that was grown.",
            rooms="13", depth="3", algorithm="bsp", bsp={"minLeaf": 5}),
]

# --- prose ------------------------------------------------------------------

pool("duskwood_elderhollow_desc",
     "A clearing with a town in it, and an oak in the middle of the town that "
     "everything else is arranged around.",
     "Elderhollow: timber, charcoal, honey, and a moot that meets inside a "
     "tree.",
     "Every building here came out of the forest, and the forest is thirty "
     "yards away in all directions.",
     "Woodsmoke, sawdust, and oxen, and the light is green even in the "
     "market.")

pool("duskwood_rooksrest_desc",
     "Six charcoal clamps under turf, smoking gently, and everything within "
     "half a mile is black.",
     "Rooksrest. The burners sleep by the clamps and the clamps do not sleep.",
     "Smoke lies in the clearing rather than rising, most days.",
     "A hard place to live and a very profitable one, in a small way.")

pool("duskwood_fenny_cross_desc",
     "Two roads meeting in a hollow that holds water, and neither road wanted "
     "to be here.",
     "Fenny Cross: duckboards, a bad inn, and a smithy doing very well out of "
     "broken axles.",
     "Everybody arriving has been in the water and everybody leaving is about "
     "to be.",
     "Alder, standing water, and a great many midges.")

pool("duskwood_the_undereaves_desc",
     "The edge of it. Fields on one side, and on the other four days of trees.",
     "The treeline is a wall, and it has moved twice in one farmer's lifetime.",
     "Standing here the forest looks like weather rather than vegetation.",
     "Rooks going out over the fields at dawn and back in at dusk, in "
     "thousands.")

pool("duskwood_moot_road_desc",
     "The only road anybody keeps up: an oak every mile, all planted the same "
     "day, all still standing.",
     "Wide enough for two carts, drained on both sides, and utterly dark "
     "under the canopy.",
     "You can walk the Moot Road at night if you are willing to.",
     "The forest presses in at the verges and is cut back twice a year, "
     "grudgingly, by everybody.")

pool("duskwood_hollow_beeches_desc",
     "A stand of beeches gone hollow with age, every one big enough to stand "
     "inside.",
     "Grey trunks like columns, no undergrowth at all, and a floor of mast "
     "six inches deep.",
     "Several of the trees are occupied. It is not always obvious which.",
     "The light in here comes down green and there is no wind at ground "
     "level.")

pool("duskwood_thornback_ride_desc",
     "A cut going north, grown in to the width of one cart and getting "
     "narrower every year.",
     "The branches meet overhead and it is dark here at noon.",
     "Bramble to the shoulder on both sides, and a track of about eight feet "
     "in the middle of it.",
     "Somebody used to keep this open. Nobody does now.")

pool("duskwood_the_greenway_desc",
     "Older than the Moot Road, straighter than the Moot Road, and nobody cut "
     "it.",
     "Two rows of oak a hundred feet apart, running dead straight for six "
     "miles.",
     "The turf between them is short and even and no cart has been along here "
     "in centuries.",
     "It goes somewhere. It goes there very deliberately.")

pool("duskwood_witchwood_desc",
     "Nine square miles the foresters will not work, and they will not tell "
     "you why, and they are not joking.",
     "The Witchwood. Nothing is obviously wrong. That is most of the problem.",
     "No birds. You notice about ten minutes in, and then you cannot stop "
     "noticing.",
     "The trees are the same trees. The spacing is not.")

pool("elderhollow_moot_oak_desc",
     "Nine yards round at the base and hollow for the first twenty feet, with "
     "a door fitted into it and hinges let into the living wood.",
     "The moot meets inside the tree. Thirty people fit, standing.",
     "It is not the biggest tree in the forest. It is the one that agreed.")

pool("hollow_beeches_the_king_desc",
     "Eleven yards round, hollow the whole way up, and standing inside it you "
     "can see sky through the top.",
     "The Beech King. Dead for a hundred years by any reasonable measure and "
     "still putting out leaves on the south side.",
     "The floor inside is bare earth and somebody has swept it.")

pool("witchwood_the_ring_desc",
     "Nine trees in a circle sixty feet across, all one age, all one species, "
     "and nothing whatsoever growing inside them.",
     "The Ring. The grass inside is short and even and nobody cuts it.",
     "Nine, exactly. You will count them more than once.")

pool("witchwood_the_tower_desc",
     "Four storeys of elf-work with a beech growing straight through it, "
     "holding it up and pulling it apart in the same motion.",
     "The stonework has no joints you can find and the tree has found them "
     "anyway.",
     "It leans. It has leaned at exactly this angle for as long as anybody "
     "has records.")

pool("greenway_the_avenue_desc",
     "Two rows of oak, a hundred feet apart, dead straight for six miles, and "
     "no record of anybody planting them.",
     "Every tree is the same age. There are three hundred and twenty of them.",
     "Walking down the middle of it you can see both ends and neither of them "
     "is anywhere.")

pool("greenway_elf_bridge_desc",
     "A single span of dressed stone over a stream you could step across, "
     "carved on both parapets, and considerably older than the forest.",
     "The bridge is in perfect condition. The stream has moved.",
     "Whatever needed a bridge here was not worried about the water.")

pool("witchwood_the_still_pool_desc",
     "Forty feet across, black, and no wind has ever moved the surface of it.",
     "The Still Pool. It reflects the canopy exactly, and slightly late.",
     "There is no inflow and no outflow and it has never once been lower.")

pool("moot_road_mile_oaks_desc",
     "One at every mile, all planted on the same day four hundred years ago, "
     "all still standing.",
     "The seventh has a hollow you could sleep in and people do.",
     "They are numbered. Somebody carved the numbers and somebody keeps "
     "recutting them.")

pool("thornback_ride_the_narrows_desc",
     "The ride closes to eight feet here, branches meeting overhead, dark at "
     "noon and darker after.",
     "A cart came through this in living memory. It would not now.",
     "Thorn on both sides at shoulder height, and it has been broken through "
     "recently by something wider than a person.")

pool("duskwood_thornward_blocked",
     "The thorn lies across the ride in a single unbroken line, and thorn does "
     "not do that by itself.",
     "It has been laid — woven, rather — and the weave goes eleven feet up.",
     "The Elderhollow moot laid this and the Elderhollow moot has opinions "
     "about who lifts it.")

pool("elderhollow_moot_blocked",
     "The door in the oak is shut, and the moot is sitting, and you are not "
     "on the list.",
     "Somebody stands at the door with their arms folded and does not move.",
     "\"Moot's in,\" he says. \"You can wait or you can come back.\"")
