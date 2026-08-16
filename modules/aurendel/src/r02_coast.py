"""Region 2 — The Silver Coast.

Chalk cliffs down the western edge of the continent, with Sarnport in the one
gap wide enough to put a harbour in. Everything here either arrived by sea or
is waiting to leave by it. Three city districts, one town, two villages, three
stretches of coast.
"""
from place import (area, poi, gate, toll, house, inn, smithy, store, workshop,
                   temple, stable, warehouse, guild, square, landmark, ruin,
                   delve)
from dungeonkit import dungeon
from prose import pool

WILD, STONE, TIMBER = "coast", "urban_stone", "urban_timber"
TAGS = ["silver_coast"]

AREAS = [
    area("sarnport_harbourside", "Sarnport — Harbourside", STONE, "city", 1, 2,
         "The harbour, the mole, and every trade that happens within a rope's "
         "throw of salt water.", tags=TAGS + ["sarnport", "city"]),
    area("sarnport_countinghouse", "Sarnport — The Countinghouse", STONE, "city", 0, 2,
         "Where the cargo becomes a number. Banks, brokers, insurers, and the "
         "harbour court.", tags=TAGS + ["sarnport", "city"]),
    area("sarnport_saltcliff", "Sarnport — Saltcliff Rise", STONE, "city", 0, 2,
         "Up the hill and out of the smell: the battery, the lighthouse road, "
         "and the houses of people who own ships rather than sail them.",
         tags=TAGS + ["sarnport", "city"]),

    area("coast_cobbleway", "Cobbleway", STONE, "town", 0, 2,
         "A market town a day inland of the harbour, and the last place a cart "
         "can be repaired before the downs.", tags=TAGS + ["town"]),

    area("coast_gullmere", "Gullmere", TIMBER, "village", 1, 2,
         "Eleven boats, forty people, and a beach they haul up rather than a "
         "harbour they moor in.", tags=TAGS + ["village"]),
    area("coast_thrift", "Thrift", TIMBER, "village", 1, 2,
         "Named for the flower that grows on the cliff, not the habit, though "
         "both apply.", tags=TAGS + ["village"]),

    area("coast_chalk_downs", "The Chalk Downs", WILD, "wild", 2, 2,
         "Short turf over white rock, sheep, and a horse cut into the hillside "
         "by nobody anybody remembers.", tags=TAGS),
    area("coast_wreckers_strand", "Wreckers' Strand", WILD, "wild", 3, 3,
         "Nine miles of shingle under a cliff, and everything the sea has "
         "given back for four hundred years still lying on it.", tags=TAGS),
    area("coast_gannet_head", "Gannet Head", WILD, "wild", 3, 3,
         "The headland: four hundred feet of chalk, forty thousand birds, and "
         "a path along the top that is narrower than it was.", tags=TAGS),
]

EDGES = [
    ("sarnport_harbourside", "sarnport_countinghouse", 5),
    ("sarnport_countinghouse", "sarnport_saltcliff", 8),
    ("sarnport_saltcliff", "sarnport_harbourside", 7),
    ("sarnport_saltcliff", "coast_chalk_downs", 30, {"gate": "sarnport_landward_gate"}),
    ("sarnport_harbourside", "coast_wreckers_strand", 45),
    ("coast_chalk_downs", "coast_cobbleway", 45),
    ("coast_cobbleway", "coast_gullmere", 35),
    ("coast_gullmere", "coast_gannet_head", 35),
    ("coast_gannet_head", "coast_wreckers_strand", 40),
    ("coast_cobbleway", "coast_thrift", 25),
    ("coast_thrift", "coast_chalk_downs", 30),
]

GATES = [
    toll("sarnport_landward_gate", "The Landward Gate", 4,
         "Sarnport charges to leave as well as to arrive, which the "
         "corporation describes as a road levy and nobody else does.",
         bypass=("deception", 13), blocked_key="sarnport_landward_gate_blocked"),
    gate("saltcliff_battery_door", "The Battery Door", "lock",
         "A magazine door, iron on oak, with the corporation's seal across the "
         "keyhole.", bypass=("lockpicking", 15),
         requires={"description": "the harbour master's warrant", "minLevel": 3},
         blocked_key="saltcliff_battery_blocked"),
    gate("gannet_head_path", "The Cliff Path", "hazard",
         "Two feet wide with four hundred below it, and the last winter took "
         "some of the two feet.", bypass=("acrobatics", 13),
         blocked_key="gannet_head_path_blocked"),
]

POIS = [
    # ===== Sarnport — Harbourside =====
    poi("harbourside_the_mole", "The Mole", "sarnport_harbourside", "landmark",
        "Half a mile of piled stone out into the bay, and the whole town is "
        "behind it in every sense.", minutes=5, interior=False, tags=["docks"]),
    poi("harbourside_harbour_master", "The Harbour Master's Office",
        "sarnport_harbourside", "landmark",
        "Decides who berths where and is not open to discussion about it.",
        minutes=4, trade="hall", size="medium", tags=["docks"]),
    warehouse("harbourside_bond_stores", "The Bond Stores", "sarnport_harbourside",
              "Four floors of other people's cargo, waiting on duty being paid.",
              size="hall", tags=["docks"]),
    store("harbourside_chandlery", "Rell's Chandlery", "sarnport_harbourside",
          "Rope, canvas, tar, biscuit, and charts of varying honesty.",
          trade="chandler", size="large"),
    workshop("harbourside_sailmaker", "The Sail Loft", "sarnport_harbourside",
             "One long room, one long floor, and canvas laid out the whole "
             "length of it.", size="large"),
    workshop("harbourside_ropewalk", "The Ropewalk", "sarnport_harbourside",
             "A shed a quarter of a mile long and eight feet wide, because "
             "that is how rope is made.", size="hall"),
    smithy("harbourside_anchor_smith", "The Anchor Smith", "sarnport_harbourside",
           "Chain, anchors, and fittings too big for anybody else's fire.",
           size="large"),
    square("harbourside_fish_quay", "The Fish Quay", "sarnport_harbourside",
           "Sold off the stones from four in the morning, and swept by eight."),
    inn("harbourside_the_capstan", "The Capstan", "sarnport_harbourside",
        "Crews in, crews out, and a landlord who can tell which within a "
        "minute.", size="large"),
    temple("harbourside_seamens_chapel", "The Seamen's Chapel", "sarnport_harbourside",
           "Names on the wall in five columns and room left for a sixth."),
    house("harbourside_house_a", "Netloft Row", "sarnport_harbourside",
          "Living below, nets above, and a smell that has soaked into the "
          "beams."),

    # ===== Sarnport — The Countinghouse =====
    guild("counting_exchange", "The Exchange", "sarnport_countinghouse",
          "A floor, a bell, and a great deal of shouting about cargoes nobody "
          "in the room has seen.", size="hall"),
    poi("counting_harbour_court", "The Harbour Court", "sarnport_countinghouse",
        "landmark",
        "Where a collision, a salvage, or a mutiny becomes somebody's fault.",
        minutes=4, trade="hall", size="large"),
    guild("counting_insurers_hall", "The Insurers' Hall", "sarnport_countinghouse",
          "Men who make a living being right about how dangerous the sea is."),
    poi("counting_countinghouse", "The Countinghouse", "sarnport_countinghouse",
        "landmark",
        "The building the district is named for. Three storeys of ledgers and "
        "one very good strongroom.", minutes=5, static="countinghouse",
        services=["guild"], tags=["landmark"]),
    store("counting_map_seller", "Ottley's, Charts and Instruments",
          "sarnport_countinghouse",
          "Charts, compasses, glasses, and a proprietor who corrects you."),
    store("counting_goldsmith", "The Goldsmith's", "sarnport_countinghouse",
          "Takes deposits, issues notes, and would rather you did not linger."),
    inn("counting_the_ledger", "The Ledger", "sarnport_countinghouse",
        "A chophouse with rooms, where the food is incidental to the "
        "conversations."),
    stable("counting_posting_yard", "The Posting Yard", "sarnport_countinghouse",
           "Coaches for Cobbleway and the Kingsvale, twice daily, weather "
           "allowing."),
    house("counting_house_a", "Broker's Row, Number Nine", "sarnport_countinghouse",
          "Narrow, tall, and worth more than the street it stands in."),
    house("counting_house_b", "The Clerks' Lodging", "sarnport_countinghouse",
          "Eleven beds, one washstand, and a landlady with rules."),

    # ===== Sarnport — Saltcliff Rise =====
    poi("saltcliff_lighthouse", "The Saltcliff Light", "sarnport_saltcliff", "landmark",
        "A hundred and ten feet of stone with a fire on top of it, and the "
        "keeper's stair going round the inside.", minutes=8,
        static="saltcliff_light", tags=["landmark"]),
    poi("saltcliff_battery", "The Saltcliff Battery", "sarnport_saltcliff", "landmark",
        "Guns pointing at a sea nobody has come across in ninety years, kept "
        "up regardless.", minutes=6, trade="keep", size="large",
        gate="saltcliff_battery_door", tags=["castle"]),
    temple("saltcliff_high_chapel", "The High Chapel", "sarnport_saltcliff",
           "Up here for the view, which the priesthood insists is theological.",
           size="large"),
    store("saltcliff_apothecary", "The Rise Apothecary", "sarnport_saltcliff",
          "Serves the merchants' houses and charges them accordingly.",
          trade="apothecary"),
    guild("saltcliff_pilots_hall", "The Pilots' Hall", "sarnport_saltcliff",
          "Twenty men who know the bar, and will not write down how."),
    inn("saltcliff_the_lantern", "The Lantern", "sarnport_saltcliff",
        "Quiet, expensive, and with a window that looks straight down the "
        "harbour mouth."),
    house("saltcliff_house_a", "Vaunder House", "sarnport_saltcliff",
          "Four floors, a walled garden, and a family that owns eleven ships."),
    house("saltcliff_house_b", "The Keeper's Cottage", "sarnport_saltcliff",
          "Beside the light, and the light never lets it sleep properly."),
    landmark("saltcliff_cliff_stair", "The Cliff Stair", "sarnport_saltcliff",
             "Two hundred and forty steps from the Rise to the Quay, cut "
             "into the chalk and wet at the bottom.", minutes=4),
    delve("saltcliff_chalk_workings", "The Chalk Workings", "sarnport_saltcliff",
          "Quarried out from under the Rise to build the town, and the town is "
          "now standing on the hole.", "saltcliff_workings", minutes=10),

    # ===== Cobbleway =====
    square("cobbleway_market_cross", "The Market Cross", "coast_cobbleway",
           "Roofed, octagonal, and the whole reason there is a town here."),
    inn("cobbleway_the_two_wheels", "The Two Wheels", "coast_cobbleway",
        "Coaching inn, forty beds, and a yard that never entirely empties.",
        size="large"),
    smithy("cobbleway_wheelwright", "The Wheelwright's", "coast_cobbleway",
           "Tyres shrunk on hot in the yard, which the whole street comes out "
           "for.", size="large"),
    workshop("cobbleway_cartwright", "The Cartwright's", "coast_cobbleway",
             "Bodies, shafts, and a stock of seasoned ash going back a decade."),
    store("cobbleway_general", "Fennick's", "coast_cobbleway",
          "Sells to farms, carters, and anybody heading for the downs.",
          size="large"),
    store("cobbleway_saddler", "The Saddlery", "coast_cobbleway",
          "Harness, collars, and repairs while you wait if you are patient."),
    temple("cobbleway_church", "The Wayfarers' Church", "coast_cobbleway",
           "Big for the town, because the town used to be bigger.", size="large"),
    stable("cobbleway_stables", "The Coach Stables", "coast_cobbleway",
           "Sixty stalls, and forty of them full on a market day."),
    store("cobbleway_bakery", "The Bakehouse", "coast_cobbleway",
          "Bakes the town's bread and the town's pies in the same oven, in "
          "that order.", trade="bakery"),
    house("cobbleway_house_a", "The Bailiff's House", "coast_cobbleway",
          "Sits at the top of the market place, looking down it."),
    house("cobbleway_house_b", "Tanyard Cottages", "coast_cobbleway",
          "Four under one roof, and the tanyard is no longer there, which "
          "everybody is glad about."),
    landmark("cobbleway_pound", "The Pound", "coast_cobbleway",
             "Stone walls, one gate, and any beast found straying goes in it "
             "until somebody pays.", minutes=2),

    # ===== Gullmere =====
    landmark("gullmere_haul", "The Haul", "coast_gullmere",
             "Shingle beach with eleven boats drawn up it and a capstan for "
             "each.", minutes=2),
    store("gullmere_store", "The Beach Store", "coast_gullmere",
          "Line, hooks, tar, and salt in the quantities a boat needs.",
          size="small"),
    inn("gullmere_the_bass", "The Bass", "coast_gullmere",
        "One room, one barrel, and a view of the weather coming.", size="small"),
    smithy("gullmere_smithy", "The Beach Forge", "coast_gullmere",
           "Fittings, hooks, and boat-nails, mostly.", size="small"),
    house("gullmere_house_a", "Sprat Row", "coast_gullmere",
          "Three cottages gable-on to the sea, which is the only sensible way "
          "to build here."),
    house("gullmere_house_b", "The Net Loft", "coast_gullmere",
          "Living underneath, mending above, and the smell of both."),

    # ===== Thrift =====
    landmark("thrift_green", "Thrift Green", "coast_thrift",
             "Cropped short by sheep and edged with the flower the place is "
             "named for.", minutes=1),
    store("thrift_store", "The Cliff Stores", "coast_thrift",
          "Last shop before the downs, and priced with that in mind.",
          size="small"),
    inn("thrift_the_pink", "The Pink", "coast_thrift",
        "Two rooms, and a landlord who will tell you about the flower.",
        size="small"),
    temple("thrift_chapel", "Thrift Chapel", "coast_thrift",
           "Flint and lime, and a bell that can be heard at Gullmere on a "
           "still night.", size="small"),
    house("thrift_house_a", "Downs Farm", "coast_thrift",
          "Sheep, sheep, and a very good dog."),
    house("thrift_house_b", "The Old Coastguard", "coast_thrift",
          "Built to watch for smugglers and now lived in by their "
          "descendants."),

    # ===== the coast =====
    landmark("chalk_downs_white_horse", "The White Horse", "coast_chalk_downs",
             "Cut through the turf into the chalk, three hundred feet from "
             "nose to tail, and scoured every seventh year by everybody.",
             minutes=8),
    landmark("chalk_downs_dew_pond", "The Dew Pond", "coast_chalk_downs",
             "Clay-lined, on the top of a dry hill, and full. Nobody can "
             "entirely explain it and everybody uses it.", minutes=5),
    poi("chalk_downs_shepherds_hut", "The Shepherd's Hut", "coast_chalk_downs",
        "camp", "On wheels, moved twice a year, and unlocked.",
        minutes=6, trade="house", size="small", desc_key="int_house"),
    delve("chalk_downs_flint_mines", "The Flint Mines", "coast_chalk_downs",
          "Shafts sunk into the chalk for flint before anybody here worked "
          "iron, and galleries running off every one of them.",
          "chalk_flint_mines", minutes=14),

    landmark("wreckers_strand_bone_beach", "The Bone Beach", "coast_wreckers_strand",
             "Four hundred years of ribs and stem-posts standing out of the "
             "shingle at every angle.", minutes=8),
    ruin("wreckers_strand_lime_kiln", "The Lime Kiln", "coast_wreckers_strand",
         "Burnt the chalk to build Sarnport, and has been cold for sixty "
         "years.", minutes=8, trade="cave", size="small"),
    poi("wreckers_strand_wreckers_hut", "The Wreckers' Hut", "coast_wreckers_strand",
        "camp",
        "Not the name they use. There is a good fire and a very good view of "
        "the bar.", minutes=6, trade="house", size="small", desc_key="int_house"),
    delve("wreckers_strand_smugglers_cave", "The Smugglers' Cave",
          "coast_wreckers_strand",
          "Goes in at the back of the beach and comes out somewhere up on the "
          "downs, which is the whole point of it.",
          "strand_smugglers_run", minutes=10, hidden=True,
          discover=("perception", 12), tags=["secret"]),

    landmark("gannet_head_stack", "The Stack", "coast_gannet_head",
             "Four hundred feet of chalk standing off the head, white with "
             "birds top to bottom.", minutes=6),
    poi("gannet_head_path_poi", "The Cliff Path", "coast_gannet_head", "crossing",
        "Two feet of turf between the fence and the drop, and the fence is "
        "advisory.", minutes=8, interior=False, gate="gannet_head_path",
        tags=["crossing"]),
    ruin("gannet_head_watchtower", "The Gannet Watchtower", "coast_gannet_head",
         "Built to see the fleet coming. It saw it, once, and has had nothing "
         "to do since.", minutes=10, trade="keep", size="medium"),
    delve("gannet_head_seacaves", "The Sea Caves", "coast_gannet_head",
          "Cut by the sea into the foot of the head, and dry at the back for "
          "as far as anybody has gone.", "gannet_sea_caves", minutes=12),
]

DUNGEONS = [
    dungeon("saltcliff_workings", "The Chalk Workings", "dungeon_delved",
            "Quarried out from under the Rise to build the town, in pillar and "
            "stall, and the pillars are not all still there.",
            rooms="11", depth="2", algorithm="bsp", bsp={"minLeaf": 5}),
    dungeon("chalk_flint_mines", "The Flint Mines", "dungeon_cave",
            "Shafts and galleries sunk for flint before iron, and worked with "
            "antler picks that are still lying where they were put down.",
            rooms="12", depth="2", branchiness=0.5,
            corridorLength="3d3", roomSize="2d2+2"),
    dungeon("strand_smugglers_run", "The Smugglers' Run", "dungeon_cave",
            "A sea cave at one end, a hole in a sheep field at the other, and "
            "a great deal of deliberate confusion in between.",
            rooms="10", depth="1", algorithm="caverns", caverns={"fill": 0.44, "smoothingPasses": 5, "birthThreshold": 5}),
    dungeon("gannet_sea_caves", "The Gannet Sea Caves", "dungeon_drowned",
            "Cut by the sea into the foot of the head. The front half floods "
            "twice a day and the back half has not in living memory.",
            rooms="9", depth="2", algorithm="caverns", caverns={"fill": 0.47, "smoothingPasses": 4, "birthThreshold": 5}),
]

# --- prose ------------------------------------------------------------------

pool("sarnport_harbourside_desc",
     "Masts against the sky in a thicket, and under them a quay you cannot "
     "cross in a straight line.",
     "Harbourside: tar, fish, hemp, and eight hundred people all in a hurry "
     "about something.",
     "The tide is out and half the harbour is standing on mud with its lines "
     "gone slack.",
     "A crane going, a bell going, and somebody's cargo coming apart on the "
     "stones.")

pool("sarnport_countinghouse_desc",
     "Narrow streets of tall narrow buildings, all of them quiet, all of them "
     "expensive.",
     "The Countinghouse district, where the loudest thing is a door.",
     "Brass plates beside every entrance, and none of them say what the "
     "business actually is.",
     "You can smell the harbour from here but you cannot see it, which is the "
     "arrangement.")

pool("sarnport_saltcliff_desc",
     "Up the hill, out of the smell, and into a wind that comes straight off "
     "the sea with nothing in the way.",
     "Saltcliff Rise: walled gardens, a battery, and a lighthouse standing "
     "over the lot of it.",
     "From up here the whole harbour is laid out below like something drawn.",
     "The houses are set back from the road and the road is set back from the "
     "cliff, and neither is far enough for comfort.")

pool("coast_cobbleway_desc",
     "A market cross, four streets, and more wheelwrights than a town this "
     "size can possibly need.",
     "Cobbleway. Everything going to or from Sarnport stops here, and the town "
     "has arranged itself entirely around that.",
     "Carts nose to tail in the market place, and the smell of hot iron from "
     "the tyring yard.",
     "Stone-built and slate-roofed, and prosperous in an unshowy way.")

pool("coast_gullmere_desc",
     "Eleven boats up the shingle, a capstan for each, and forty people who "
     "are all related.",
     "Gullmere. There is no harbour; there is a beach, and that has been "
     "enough for six hundred years.",
     "Nets over every fence and a smell of tar you stop noticing after an "
     "hour.",
     "The whole village faces the sea and turns its back on the downs.")

pool("coast_thrift_desc",
     "Turf, flint cottages, and pink flowers over the cliff edge in every "
     "direction.",
     "Thrift, which is the flower, though the villagers are happy to let you "
     "assume the other thing.",
     "A green, a chapel, and a very long way down about eighty yards that way.",
     "The wind here never stops and everything grows sideways because of it.")

pool("coast_chalk_downs_desc",
     "Short turf over white rock, sheep to the horizon, and a horse cut into "
     "the hillside by somebody four thousand years ago.",
     "The downs. No hedges, no trees, no shelter, and a view of about twenty "
     "miles.",
     "Dry underfoot, springy, and the chalk shows white wherever a track has "
     "worn through.",
     "Skylarks going up, one after another, all the way across.")

pool("coast_wreckers_strand_desc",
     "Nine miles of shingle under a cliff, and four hundred years of ships "
     "still lying on it.",
     "Ribs, stem-posts, and iron gone to lace, standing out of the stones at "
     "every angle.",
     "The beach shelves steeply and the water is deep close in, which is "
     "exactly the problem.",
     "Nobody lives here. A good many people come here.")

pool("coast_gannet_head_desc",
     "Four hundred feet of chalk, forty thousand birds, and a noise you feel "
     "in your chest.",
     "Gannet Head. The path along the top is narrower than it was and getting "
     "narrower.",
     "White cliffs, white birds, white water at the bottom, and the smell of "
     "all three.",
     "The whole headland is going into the sea, in its own time, about a foot "
     "a year.")

pool("saltcliff_lighthouse_desc",
     "A hundred and ten feet of dressed stone with a coal fire on top and a "
     "stair going round the inside of it.",
     "The Saltcliff Light, and the keeper carries the coal up by hand because "
     "the hoist broke in 'sixty and nobody replaced it.",
     "From the gallery you can see Gannet Head one way and nothing at all the "
     "other.")

pool("harbourside_the_mole_desc",
     "Half a mile of piled stone out into the bay, and the entire town is "
     "behind it in every sense that matters.",
     "The Mole. Waves come over it in a westerly and the town watches from the "
     "Rise.",
     "You can walk to the end. There is a light on the end. There is also a "
     "great deal of water.")

pool("counting_countinghouse_desc",
     "The building the whole district is named after: three storeys of "
     "ledgers, and a strongroom with a door two feet thick.",
     "Clerks at desks in rows, and above them a gallery of principals who "
     "watch the rows.",
     "The quietest working building you have ever been in.")

pool("chalk_downs_white_horse_desc",
     "Cut through the turf into the chalk, three hundred feet from nose to "
     "tail, and nobody can tell you who by.",
     "The White Horse. Scoured every seventh year by everybody who lives "
     "within a day's walk, whether they want to or not.",
     "From below it is a horse. From directly above, which nobody has ever "
     "been, it is presumably something else.")

pool("wreckers_strand_bone_beach_desc",
     "The bones of about sixty ships, standing out of the shingle at every "
     "angle, in every stage of going.",
     "Some of them still have names on. Most of them do not have anything "
     "on.",
     "You could walk from one end to the other on timber and never touch "
     "stone.")

pool("gannet_head_stack_desc",
     "A tower of chalk standing off the head, white with birds from the "
     "waterline to the top.",
     "The Stack was part of the cliff within somebody's grandmother's memory. "
     "It is not now.",
     "The gap between it and the land is forty feet, and the noise across it "
     "is extraordinary.")

pool("wreckers_strand_smugglers_cave_desc",
     "A hole at the back of the beach behind a fall of shingle that somebody "
     "renews after every storm.",
     "It goes in level for a hundred feet and then starts going up, which is "
     "the interesting part.",
     "There are steps. Somebody cut steps. That is not what caves do.")

pool("chalk_downs_flint_mines_desc",
     "Shafts sunk thirty feet into the chalk, ringed with spoil, and grassed "
     "over so completely they look like dew ponds.",
     "One of them is open. The others are not, and one of them was open last "
     "year.",
     "They were sinking these for flint before anybody on this coast had seen "
     "iron.")

pool("gannet_head_seacaves_desc",
     "The sea has cut into the foot of the head and kept going, and at low "
     "water you can get in dry.",
     "The entrance is only there for four hours in twelve. You should know "
     "which four.",
     "Green water at the mouth, black air behind it, and a draught coming out "
     "that has been somewhere.")

pool("saltcliff_chalk_workings_desc",
     "The town was quarried out from under this hill, in pillar and stall, and "
     "the hill is standing on what was left.",
     "A ramp goes down into the chalk from behind a wall in a garden, which is "
     "not where you would expect a mine.",
     "White dust on everything, and the sound of your own footsteps going a "
     "very long way ahead of you.")

pool("sarnport_landward_gate_blocked",
     "\"Road levy,\" says the gateman, in the tone of a man who has had this "
     "argument. \"Four marks. It is not a toll.\"",
     "The corporation's man taps a board with a number on it and waits.",
     "\"Four marks out, same as in. You will find it is the same everywhere.\" "
     "It is not the same everywhere.")

pool("saltcliff_battery_blocked",
     "The magazine door is sealed with the corporation's stamp across the "
     "keyhole, and the stamp is not old.",
     "Iron on oak, and a bar across the outside as well, which is belt and "
     "braces.",
     "It is a powder store. It is locked the way powder stores are locked.")

pool("gannet_head_path_blocked",
     "The path has gone into the sea for a stretch of about fifteen feet, and "
     "what is left is turf over nothing.",
     "There is a fence. The fence ends where the path does, which is not "
     "reassuring.",
     "You could get across that. You would want to be very sure about it "
     "first.")
