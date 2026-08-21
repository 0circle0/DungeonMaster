"""Region 8 — Thornmere."""
from place import (
    area, poi, gate, toll, house, inn, smithy, store, workshop, temple,
    warehouse, square, landmark, ruin, delve,
)
from dmkit.dungeons import dungeon
from dmkit.prose import pool

WILD, TIMBER = "swamp", "urban_timber"
TAGS = ["thornmere"]

AREAS = [
    area("thornmere_stiltmarket", "Stiltmarket", TIMBER, "town", 2, 5,
         "Two thousand people on piles over open water, connected entirely by "
         "boardwalk and boat.", tags=TAGS + ["town"]),
    area("thornmere_reedy_bottom", "Reedy Bottom", TIMBER, "village", 3, 5,
         "Reed cutters on the western margin, where the swamp gives way to "
         "something you can nearly walk on.", tags=TAGS + ["village"]),
    area("thornmere_drowned_bell", "Drowned Bell", TIMBER, "village", 4, 6,
         "Named for the one that is still down there and still, occasionally, "
         "audible.", tags=TAGS + ["village"]),

    area("thornmere_sunken_causeway", "The Sunken Causeway", WILD, "wild", 4, 5,
         "A raised road under two feet of water for eleven miles, and it is "
         "the only hard bottom in the region.", tags=TAGS),
    area("thornmere_the_black_water", "The Black Water", WILD, "wild", 5, 6,
         "Open water under cypress, of no honest depth, going in every "
         "direction and looking identical in all of them.", tags=TAGS),
    area("thornmere_cypress_maze", "The Cypress Maze", WILD, "wild", 6, 6,
         "Knees and trunks so thick you navigate by touch, and the channels "
         "between them close and open with the season.", tags=TAGS),
    area("thornmere_leech_channels", "The Leech Channels", WILD, "wild", 6, 7,
         "Warm, slow, shallow, and thoroughly inhabited.", tags=TAGS),
    area("thornmere_the_hummocks", "The Hummocks", WILD, "wild", 5, 6,
         "Islands of firm ground, a few yards across, scattered across ten "
         "miles of water, and half of them have something on them.",
         tags=TAGS),
]

EDGES = [
    ("thornmere_sunken_causeway", "thornmere_stiltmarket", 40),
    ("thornmere_stiltmarket", "thornmere_the_black_water", 45),
    ("thornmere_the_black_water", "thornmere_cypress_maze", 50),
    ("thornmere_cypress_maze", "thornmere_drowned_bell", 40),
    ("thornmere_drowned_bell", "thornmere_leech_channels", 45),
    ("thornmere_leech_channels", "thornmere_the_hummocks", 40),
    ("thornmere_the_hummocks", "thornmere_reedy_bottom", 35),
    ("thornmere_reedy_bottom", "thornmere_sunken_causeway", 40),
    ("thornmere_stiltmarket", "thornmere_the_hummocks", 55),
]

GATES = [
    toll("thornmere_pole_ferry", "The Pole Ferry", 6,
         "A flat-bottomed punt and a man with a pole, and there is no other "
         "way across the Black Water in one day.",
         bypass=("athletics", 14), blocked_key="thornmere_pole_ferry_blocked"),
    gate("drowned_bell_belfry", "The Belfry Hatch", "lock",
         "In the floor of the new bell tower, over the old one, and the "
         "village keeps it shut.", bypass=("lockpicking", 14),
         requires={"description": "the ringers' consent", "minLevel": 4},
         blocked_key="drowned_bell_belfry_blocked"),
    gate("isles_passage", "The Passage", "toll",
         "The run out west through the shoals to the Sundered Isles, and "
         "nobody attempts it without somebody who has done it.",
         requires={"description": "passage money and a pilot who knows the "
                                  "shoals", "currency": 25},
         bypass=("survival", 16), stays_open=False,
         on_open=[{"adjustCurrency": {"amount": -25}}],
         blocked_key="isles_passage_blocked"),
]

POIS = [
    # ===== Stiltmarket =====
    poi("stiltmarket_boardwalk_inn", "The Long Boardwalk", "thornmere_stiltmarket",
        "settlement",
        "An inn, a market, and four hundred feet of covered walk, all of it "
        "one building on nine hundred piles.", minutes=5,
        static="boardwalk_inn", services=["inn", "market"],
        tags=["landmark", "inn"]),
    square("stiltmarket_water_market", "The Water Market", "thornmere_stiltmarket",
           "Sold boat to boat, in a basin, and nobody involved is standing on "
           "anything."),
    poi("stiltmarket_pile_yard", "The Pile Yard", "thornmere_stiltmarket",
        "market",
        "Drives the piles the town stands on, and the town needs about four "
        "hundred a year.", minutes=4, trade="boathouse", size="hall",
        desc_key="int_workshop", services=["market"], tags=["shop"]),
    workshop("stiltmarket_boatyard", "The Punt Yard", "thornmere_stiltmarket",
             "Flat-bottomed, shallow-draught, and every one of them made to "
             "the same pattern for six hundred years.", size="large"),
    smithy("stiltmarket_smithy", "The Floating Forge", "thornmere_stiltmarket",
           "On a barge, moored, because the town will not have a fire on "
           "piles.", size="large"),
    store("stiltmarket_store", "The Dry Store", "thornmere_stiltmarket",
          "The clue is the name and the name is the entire business model.",
          size="large"),
    store("stiltmarket_apothecary", "The Fever House", "thornmere_stiltmarket",
          "Bark, quinine, and a brisk trade in things for the fever.",
          trade="apothecary"),
    warehouse("stiltmarket_reed_store", "The Reed Store", "thornmere_stiltmarket",
              "Cut, bundled, dried, and shipped out as the region's one "
              "export.", size="hall"),
    temple("stiltmarket_water_chapel", "The Water Chapel", "thornmere_stiltmarket",
           "On its own piles, apart from the rest, reached by one walk."),
    inn("stiltmarket_the_pole", "The Pole", "thornmere_stiltmarket",
        "Where the punt-men drink, which is to say where the news is."),
    house("stiltmarket_house_a", "Third Walk, Eleven", "thornmere_stiltmarket",
          "Two rooms over water, and the floor moves when the wind gets up."),
    house("stiltmarket_house_b", "The Pilot's House", "thornmere_stiltmarket",
          "Whoever takes boats out through the shoals lives here and is "
          "wealthy."),

    # ===== Reedy Bottom =====
    landmark("reedy_bottom_cuttings", "The Reed Beds", "thornmere_reedy_bottom",
             "Cut every winter, in blocks, on a nine-year rotation that "
             "everybody in the village can recite.", minutes=4),
    inn("reedy_bottom_the_bundle", "The Bundle", "thornmere_reedy_bottom",
        "Thatched, obviously, and rethatched every third year out of "
        "principle.", size="small"),
    store("reedy_bottom_store", "The Cutters' Store", "thornmere_reedy_bottom",
          "Hooks, whetstones, waders, and rope.", size="small"),
    workshop("reedy_bottom_thatcher", "The Thatcher's", "thornmere_reedy_bottom",
             "Trains four apprentices at a time and has a waiting list of "
             "eleven years.", size="small"),
    house("reedy_bottom_house_a", "Bottom Farm", "thornmere_reedy_bottom",
          "The only ploughed land in the region and it is under water two "
          "years in five."),
    house("reedy_bottom_house_b", "Wader's Cottage", "thornmere_reedy_bottom",
          "Boots by the door, eleven pairs, all of them somebody's."),

    # ===== Drowned Bell =====
    poi("drowned_bell_new_tower", "The New Bell Tower", "thornmere_drowned_bell",
        "landmark",
        "Built directly over the old one, which is under it, and under water.",
        minutes=4, trade="hall", size="medium", gate="drowned_bell_belfry",
        tags=["landmark"]),
    inn("drowned_bell_the_ringers", "The Ringers", "thornmere_drowned_bell",
        "Six ringers, one inn, and they will tell you about the bell.",
        size="small"),
    store("drowned_bell_store", "The Bell Store", "thornmere_drowned_bell",
          "Everything, in small quantities, at swamp prices.", size="small"),
    temple("drowned_bell_chapel", "The Chapel Above", "thornmere_drowned_bell",
           "The second one on this site. The first is beneath it.",
           size="small"),
    house("drowned_bell_house_a", "The Sexton's", "thornmere_drowned_bell",
          "Keeps the keys to the belfry hatch and does not lend them."),
    house("drowned_bell_house_b", "Pile Cottage", "thornmere_drowned_bell",
          "Rebuilt four times as the water came up, each time nine inches "
          "higher."),
    delve("drowned_bell_the_old_church", "The Old Church",
          "thornmere_drowned_bell",
          "Down the hatch, past the old bell, into a nave that has been under "
          "water for two hundred years and is not full.",
          "thornmere_old_church", minutes=12, gate="drowned_bell_belfry"),

    # ===== the swamp =====
    poi("sunken_causeway_the_road", "The Causeway", "thornmere_sunken_causeway",
        "crossing",
        "A raised road under two feet of water for eleven miles, and the only "
        "hard bottom in the region.", minutes=8, interior=False,
        tags=["crossing", "landmark"]),
    poi("sunken_causeway_marker_house", "The Marker House",
        "thornmere_sunken_causeway", "settlement",
        "Somebody lives on the causeway and resets the marker poles after "
        "every flood, which is often.", minutes=5,
        trade="house", size="small", desc_key="int_house", services=["inn"]),
    ruin("sunken_causeway_toll_ruin", "The Old Toll House",
         "thornmere_sunken_causeway",
         "Stood on the causeway when the causeway was dry, and is now "
         "standing in it.", minutes=8, trade="hall", size="small"),

    landmark("black_water_the_crossing", "The Ferry Crossing",
             "thornmere_the_black_water",
             "A punt, a pole, and a man who has done this for thirty-one "
             "years and will not be hurried.", minutes=5, gate="thornmere_pole_ferry"),
    ruin("black_water_dead_stand", "The Dead Stand", "thornmere_the_black_water",
         "Forty acres of cypress that died standing, all in the same year, "
         "and nobody knows which year.", minutes=10),
    delve("black_water_sunken_hall", "The Sunken Hall", "thornmere_the_black_water",
          "A roof-ridge showing above the water, and below it a hall, and "
          "below the hall a floor that is dry.",
          "thornmere_sunken_hall", minutes=14, hidden=True,
          discover=("perception", 13), tags=["secret"]),

    landmark("cypress_maze_the_knees", "The Knees", "thornmere_cypress_maze",
             "Cypress roots up out of the water in thousands, waist-high, and "
             "you navigate this by touch.", minutes=10),
    poi("cypress_maze_hunters_stand", "The Hunter's Stand",
        "thornmere_cypress_maze", "camp",
        "A platform in a tree with a ladder, and somebody keeps the ladder in "
        "repair.", minutes=6, trade="house", size="small",
        desc_key="int_house"),
    delve("cypress_maze_the_mound", "The Cypress Mound", "thornmere_cypress_maze",
          "A rise in the middle of the maze that is not a natural rise, with "
          "a way into the side of it.", "thornmere_cypress_mound", minutes=14),

    landmark("leech_channels_the_warm", "The Warm Channels",
             "thornmere_leech_channels",
             "Blood-warm, slow, shallow, and thoroughly inhabited by things "
             "that appreciate all three.", minutes=8),
    poi("leech_channels_leech_camp", "The Leech Camp", "thornmere_leech_channels",
        "camp",
        "They are farmed here and sold to every apothecary in the south, "
        "which is a living.", minutes=6, trade="house", size="small",
        desc_key="int_house"),
    ruin("leech_channels_drowned_mill", "The Drowned Mill",
         "thornmere_leech_channels",
         "There was a fall of water here once, which means the land was "
         "different, which is worth thinking about.", minutes=10,
         trade="hall", size="medium"),

    landmark("hummocks_the_islands", "The Hummocks", "thornmere_the_hummocks",
             "Islands of firm ground a few yards across, scattered over ten "
             "miles, and about half of them have something on them.",
             minutes=8),
    ruin("hummocks_hermit_hummock", "The Hermit's Hummock",
         "thornmere_the_hummocks",
         "One hut, one garden, one grave, and all three well kept by "
         "somebody.", minutes=8, trade="house", size="small"),
    delve("hummocks_the_deep_hummock", "The Deep Hummock",
          "thornmere_the_hummocks",
          "The largest of them, and the only one made of stone rather than "
          "silt, and there is a way down through it.",
          "thornmere_deep_hummock", minutes=14),
]

DUNGEONS = [
    dungeon("thornmere_old_church", "The Old Church", "dungeon_drowned",
            "Under the new bell tower, past the old bell, into a nave that has "
            "been under water two hundred years and is not full.",
            rooms="10", depth="2",),
    dungeon("thornmere_sunken_hall", "The Sunken Hall", "dungeon_drowned",
            "A roof-ridge above the water, a hall below it, and below the hall "
            "a floor that is somehow dry.",
            rooms="11", depth="3", branchiness=0.3),
    dungeon("thornmere_cypress_mound", "The Cypress Mound", "dungeon_barrow",
            "A rise in the middle of the maze that is not a natural rise, and "
            "the way in was cut, not washed.",
            rooms="9", depth="2",),
    dungeon("thornmere_deep_hummock", "The Deep Hummock", "dungeon_drowned",
            "The one hummock made of stone rather than silt, and a stair "
            "through it going down under the water table.",
            rooms="12", depth="4", branchiness=0.35),
]

# --- prose ------------------------------------------------------------------

pool("thornmere_stiltmarket_desc",
     "Two thousand people on nine hundred piles over open water, and not one "
     "square yard of ground anywhere in it.",
     "Stiltmarket. You get about by boardwalk or by boat and there is no "
     "third option.",
     "The whole town moves very slightly, all the time, and visitors notice "
     "for about a day.",
     "Punts under every walkway, tied three deep, and somebody always "
     "shifting them.")

pool("thornmere_reedy_bottom_desc",
     "Reed beds on three sides, cut in blocks on a nine-year rotation "
     "everybody can recite.",
     "Reedy Bottom. The western margin, where the swamp gives way to "
     "something you can nearly walk on.",
     "Thatch on every roof, and the thatch is the local industry as well as "
     "the local roof.",
     "Bundles stacked to the eaves and eleven pairs of waders by every door.")

pool("thornmere_drowned_bell_desc",
     "A bell tower built directly on top of an older one, which is under it, "
     "and under water.",
     "Drowned Bell. The old bell is still down there and it is still, "
     "occasionally, audible, and the village has stopped explaining this.",
     "Cottages rebuilt four times, each time nine inches higher than the "
     "last.",
     "Six ringers, and they ring the new one every evening without fail.")

pool("thornmere_sunken_causeway_desc",
     "A raised road under two feet of water for eleven miles, and the only "
     "hard bottom in the region.",
     "Marker poles either side, reset after every flood, which is often.",
     "You can walk this. Everything either side of it you cannot.",
     "The water is clear over the causeway and black off it, which is how you "
     "stay on.")

pool("thornmere_the_black_water_desc",
     "Open water under cypress, of no honest depth, going in every direction "
     "and looking identical in all of them.",
     "The Black Water. There is a ferry, and there is a very good reason "
     "there is a ferry.",
     "Something goes in off to your left, unhurried, and does not come up "
     "again anywhere you can see.",
     "Forty acres of cypress that died standing, all in one year, and nobody "
     "can tell you which.")

pool("thornmere_cypress_maze_desc",
     "Knees and trunks packed so close you navigate by touch, and the "
     "channels close and open with the season.",
     "The Cypress Maze. This route worked last year. That is not an argument.",
     "Moss down to the water, and you go through it rather than round it.",
     "Roots up out of the water in their thousands, waist-high, and every one "
     "of them where your shin is going.")

pool("thornmere_leech_channels_desc",
     "Blood-warm, slow, shallow, and thoroughly inhabited by things that "
     "appreciate all three.",
     "The Leech Channels. They are farmed here, which sounds worse than it "
     "is, and is also exactly as bad as it sounds.",
     "The water is warmer than the air and that is the wrong way round.",
     "Very still, very green, and something has just moved under the surface "
     "beside your boot.")

pool("thornmere_the_hummocks_desc",
     "Islands of firm ground a few yards across, scattered over ten miles of "
     "water.",
     "The Hummocks. About half of them have something on them and it is never "
     "the same half.",
     "You can stand up here. That is the entire appeal and it is "
     "considerable.",
     "One hut, one garden, one grave, on the third hummock along, all well "
     "kept.")

pool("stiltmarket_boardwalk_inn_desc",
     "Four hundred feet of covered walk with an inn at one end and a market "
     "at the other, all one building on nine hundred piles.",
     "The Long Boardwalk. It sways. Everybody says it does not sway and it "
     "sways.",
     "Lamps the whole length, lit at dusk by one man who starts at one end.")

pool("sunken_causeway_the_road_desc",
     "Eleven miles of raised road under two feet of clear water, with poles "
     "either side.",
     "The stone is dressed and laid and it is a very great deal older than "
     "anybody's records of it.",
     "You walk down the middle of it and the black water is a yard away on "
     "both sides.")

pool("drowned_bell_new_tower_desc",
     "The new tower, built on the old one, with a hatch in the floor over "
     "what is left of the first belfry.",
     "The old bell is nine feet under the hatch, in water, and it has been "
     "heard.",
     "Nobody in the village disputes that it has been heard. They dispute "
     "everything else about it.")

pool("black_water_dead_stand_desc",
     "Forty acres of cypress that died standing, all in the same year, and "
     "nobody agrees which year.",
     "Bare grey trunks out of black water, all of them still upright, none of "
     "them rotting.",
     "Two hundred trees, and not one has fallen. Cypress does not do that.")

pool("hummocks_the_islands_desc",
     "Firm ground, a few yards across, scattered across ten miles of water "
     "with no pattern anyone has found.",
     "About half have something on them: a hut, a stone, a grave, a stand of "
     "something planted.",
     "They are the only places in Thornmere you can put a fire.")

pool("thornmere_pole_ferry_blocked",
     "The punt is on the far bank and the ferryman is having his dinner, and "
     "six marks would change both of those things.",
     "\"Six,\" says the ferryman, \"each, and the pole is thirty-one years "
     "old and so am I at this.\"",
     "No punt, no crossing. The Black Water is not a thing you wade.")

pool("drowned_bell_belfry_blocked",
     "The hatch is padlocked and the sexton has the key and the sexton is "
     "not persuaded.",
     "\"Nobody goes down,\" says the head ringer. \"That was decided.\"",
     "Oak, banded, and a padlock that is newer than everything around it.")

pool("isles_passage_blocked",
     "You need a pilot who has done the shoals, and passage money, and you "
     "have neither.",
     "\"Twenty-five,\" says the pilot, \"and I take her out, and if you have "
     "not got it you are not going, and that is the kindness in it.\"",
     "The run west goes through eleven miles of shoal that moves. Nobody "
     "attempts it cold.")
