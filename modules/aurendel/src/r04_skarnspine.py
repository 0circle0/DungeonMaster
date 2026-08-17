"""Region 4 — The Skarnspine.

The northern range, and Karn Dolur inside it: a hold-city of three districts
cut into the rock, reached through a gate at the top of a stair. The only ways
north to the ice go through here, and the pass is shut more often than not.
"""
from place import (area, poi, gate, toll, house, inn, smithy, store, workshop,
                   temple, stable, warehouse, guild, square, landmark, ruin,
                   delve)
from dmkit.dungeons import dungeon
from dmkit.prose import pool

WILD, STONE, TIMBER, DELVED = "alpine", "urban_stone", "urban_timber", "urban_delved"
TAGS = ["skarnspine"]

AREAS = [
    area("karn_dolur_gatehall", "Karn Dolur — Gatehall", DELVED, "city", 1, 4,
         "The first hall inside the mountain: the gate, the muster floor, and "
         "everything the hold wants a stranger to see.",
         tags=TAGS + ["karn_dolur", "city"], layer="underworld"),
    area("karn_dolur_deep_market", "Karn Dolur — The Deep Market", DELVED, "city", 0, 4,
         "A cavern the size of a town square with four galleries of shopfronts "
         "cut round the walls of it.",
         tags=TAGS + ["karn_dolur", "city"], layer="underworld"),
    area("karn_dolur_forgetiers", "Karn Dolur — The Forgetiers", DELVED, "city", 1, 5,
         "Six levels of furnace stacked down a shaft, and the shaft is the "
         "chimney.", tags=TAGS + ["karn_dolur", "city"], layer="underworld"),

    area("skarnspine_highpass", "Highpass", STONE, "town", 2, 4,
         "The last town on the road and the reason the road exists: a ward, a "
         "wall, and eleven hundred feet of altitude.", tags=TAGS + ["town"]),
    area("skarnspine_snowgate", "Snowgate", TIMBER, "village", 3, 4,
         "Nine houses, all of them dug half into the slope, and a bell to ring "
         "when the road is shut.", tags=TAGS + ["village"]),

    area("skarnspine_the_cut", "The Cut", WILD, "wild", 4, 4,
         "A pass a hundred feet deep and forty wide, and somebody made it that "
         "way on purpose.", tags=TAGS),
    area("skarnspine_ironstair", "The Ironstair", WILD, "wild", 4, 5,
         "Nine hundred steps up a cliff face to the gate of Karn Dolur, cut "
         "and railed and swept.", tags=TAGS),
    area("skarnspine_cold_shoulder", "The Cold Shoulder", WILD, "wild", 5, 5,
         "The north face, in shade from Emberfall to Greening, and the way to "
         "the ice.", tags=TAGS),
    area("skarnspine_weirwater_head", "The Weirwater Head", WILD, "wild", 4, 4,
         "Where the river starts: a corrie, a lake, and a waterfall that goes "
         "into the ground rather than out of it.", tags=TAGS),
    area("skarnspine_broken_road", "The Broken Road", WILD, "wild", 3, 4,
         "The old road up from the vale, taken out by a slip in the year of "
         "the great rains and never properly mended.", tags=TAGS),
]

EDGES = [
    ("skarnspine_broken_road", "skarnspine_the_cut", 50),
    ("skarnspine_the_cut", "skarnspine_highpass", 40, {"gate": "skarnspine_pass_ward"}),
    ("skarnspine_highpass", "skarnspine_ironstair", 45),
    ("skarnspine_ironstair", "karn_dolur_gatehall", 30,
     {"gate": "karn_dolur_hold_gate"}),
    ("karn_dolur_gatehall", "karn_dolur_deep_market", 6),
    ("karn_dolur_deep_market", "karn_dolur_forgetiers", 8),
    ("karn_dolur_forgetiers", "karn_dolur_gatehall", 10),
    ("skarnspine_highpass", "skarnspine_snowgate", 40),
    ("skarnspine_snowgate", "skarnspine_cold_shoulder", 55),
    ("skarnspine_cold_shoulder", "skarnspine_weirwater_head", 45),
    ("skarnspine_weirwater_head", "skarnspine_the_cut", 50),
    ("skarnspine_broken_road", "skarnspine_ironstair", 60),
]

GATES = [
    gate("skarnspine_pass_ward", "The Pass Ward", "hazard",
         "A wall across the pass with a gate in it, and the gate is shut "
         "whenever the wind is from the north, which is most of the time.",
         bypass=("survival", 14),
         requires={"description": "the ward-captain's leave to pass",
                   "minLevel": 3},
         blocked_key="skarnspine_pass_ward_blocked"),
    toll("karn_dolur_hold_gate", "The Hold Gate", 12,
         "Forty tons of stone on a counterweight, and a gate-fee that the "
         "hold has charged since it was cut.",
         bypass=("persuasion", 16), blocked_key="karn_dolur_hold_gate_blocked"),
    gate("karn_dolur_deep_door", "The Deep Door", "story",
         "The door to the abandoned levels, sealed by the hold and marked so "
         "in four languages.", bypass=("lore", 16),
         requires={"description": "a hold-warrant for the deep levels",
                   "minLevel": 6},
         blocked_key="karn_dolur_deep_door_blocked"),
    gate("frostmere_ice_road", "The Ice Road", "hazard",
         "The way north off the Cold Shoulder, over a snow bridge that is "
         "there in Deepdark and is not there in Longlight.",
         bypass=("survival", 15), blocked_key="frostmere_ice_road_blocked"),
]

POIS = [
    # ===== Karn Dolur — Gatehall =====
    poi("gatehall_the_gate", "The Hold Gate", "karn_dolur_gatehall", "landmark",
        "Forty tons of stone on a counterweight, and two of the hold's own on "
        "either side of it at all hours.", minutes=3, interior=False,
        tags=["landmark"]),
    poi("gatehall_muster_floor", "The Muster Floor", "karn_dolur_gatehall",
        "landmark",
        "Six hundred feet of flagged hall, kept empty, which is itself the "
        "statement.", minutes=4, interior=False, tags=["landmark"]),
    guild("gatehall_wardens_hall", "The Wardens' Hall", "karn_dolur_gatehall",
          "Who comes in, who goes out, and who is answerable for both.",
          size="hall"),
    poi("gatehall_lamp_works", "The Lamp Works", "karn_dolur_gatehall", "market",
        "Every lamp in the hold is filled from here and there are eleven "
        "thousand of them.", minutes=4, trade="foundry", size="large",
        desc_key="int_workshop", services=["market"], tags=["shop"]),
    store("gatehall_outfitters", "The Gate Outfitters", "karn_dolur_gatehall",
          "Lamps, rope, cleats, and cold-weather gear for people going out.",
          trade="chandler", size="large"),
    inn("gatehall_the_counterweight", "The Counterweight", "karn_dolur_gatehall",
        "First inn inside the gate, and it charges for the privilege.",
        size="large"),
    temple("gatehall_stone_shrine", "The Shrine of the First Cut",
           "karn_dolur_gatehall",
           "Marks the spot where the hold was begun, which is nine hundred "
           "feet from where it now starts."),
    house("gatehall_house_a", "Gatewarden's Lodging", "karn_dolur_gatehall",
          "Cut into the wall beside the gate, so the warden is never more than "
          "a minute from it."),
    house("gatehall_house_b", "The Visitors' Cells", "karn_dolur_gatehall",
          "Where the hold puts people it has not decided about yet."),
    landmark("gatehall_the_ledger_stone", "The Ledger Stone",
             "karn_dolur_gatehall",
             "Every gate-fee since the hold was cut, in columns, and the "
             "columns go round three walls.", minutes=3),

    # ===== Karn Dolur — The Deep Market =====
    square("deep_market_floor", "The Market Floor", "karn_dolur_deep_market",
           "A cavern the size of a town square, four galleries of shopfronts "
           "cut round it, and a roof you cannot see."),
    store("deep_market_stone_merchant", "The Stone Merchant",
          "karn_dolur_deep_market",
          "Sells rock, by weight, by grade, and by argument.", size="large"),
    store("deep_market_lamp_oil", "The Oil Gallery", "karn_dolur_deep_market",
          "Eleven grades of lamp oil and a proprietor who can smell the "
          "difference."),
    store("deep_market_provisioner", "The Deep Provisioner",
          "karn_dolur_deep_market",
          "Everything that keeps, in a place where nothing grows.",
          size="large"),
    store("deep_market_apothecary", "The Fungus Rows", "karn_dolur_deep_market",
          "Grown three levels down and sold up here, and about a third of it "
          "is medicine.", trade="apothecary"),
    guild("deep_market_hall_of_measures", "The Hall of Measures",
          "karn_dolur_deep_market",
          "Where a weight becomes a legal weight, and where the standards "
          "themselves are kept."),
    inn("deep_market_the_lamplit", "The Lamplit", "karn_dolur_deep_market",
        "Four hundred years old, entirely underground, and there is a "
        "waiting list for the corner table.", size="large"),
    temple("deep_market_deep_shrine", "The Deep Shrine", "karn_dolur_deep_market",
           "Cut so that a single lamp lights the whole chamber, which took "
           "somebody a lifetime to work out.", size="large"),
    house("deep_market_house_a", "Fourth Gallery, Thirteen",
          "karn_dolur_deep_market",
          "A shop below and a family above, cut out of one block."),
    house("deep_market_house_b", "The Weighers' Rooms", "karn_dolur_deep_market",
          "Lodging for the hall's clerks, and a view down onto the floor."),

    # ===== Karn Dolur — The Forgetiers =====
    poi("forgetiers_great_forge", "The Great Forge", "karn_dolur_forgetiers",
        "market",
        "Six levels of furnace stacked down a shaft that serves as the "
        "chimney for all of them.", minutes=6, static="karn_dolur_forge",
        services=["smith", "guild"], tags=["shop", "landmark"]),
    smithy("forgetiers_platers", "The Platers' Tier", "karn_dolur_forgetiers",
           "Armour, and a waiting list measured in seasons.", size="hall"),
    smithy("forgetiers_edge_tier", "The Edge Tier", "karn_dolur_forgetiers",
           "Blades only, and they will not discuss anything else.", size="large"),
    workshop("forgetiers_wire_drawers", "The Wire Drawers",
             "karn_dolur_forgetiers",
             "Draw-plates in fifty sizes and a smell of hot tallow.",
             size="large"),
    warehouse("forgetiers_ore_stores", "The Ore Stores", "karn_dolur_forgetiers",
              "Graded, weighed, and stacked by seam of origin.", size="hall"),
    poi("forgetiers_bellows_hall", "The Bellows Hall", "karn_dolur_forgetiers",
        "landmark",
        "The waterwheel that drives every bellows in the tier, fed from a "
        "shaft nobody is allowed to look down.", minutes=5,
        trade="delved", size="hall", desc_key="int_workshop", tags=["landmark"]),
    inn("forgetiers_the_slack_tub", "The Slack Tub", "karn_dolur_forgetiers",
        "Loud, hot, and closed for one hour a day to be swept."),
    house("forgetiers_house_a", "Smiths' Cells", "karn_dolur_forgetiers",
          "Sixty rooms off one corridor, and the corridor is warm all year."),
    poi("forgetiers_deep_door", "The Deep Door", "karn_dolur_forgetiers",
        "dungeonEntrance",
        "The way to the levels the hold gave up: sealed, marked, and inspected "
        "monthly.", minutes=10, dungeon="karn_dolur_deeps",
        gate="karn_dolur_deep_door", tags=["dungeon"]),
    delve("forgetiers_old_seams", "The Old Seams", "karn_dolur_forgetiers",
          "Worked out four hundred years ago and left open, because a hold "
          "does not fill in what it might want back.",
          "karn_dolur_old_seams", minutes=12),

    # ===== Highpass =====
    poi("highpass_ward", "Highpass Ward", "skarnspine_highpass", "landmark",
        "A wall across the valley with a gate in it, and a garrison who spend "
        "most of the year shovelling.", minutes=5, trade="keep",
        size="hall", tags=["castle"]),
    square("highpass_market", "The Ward Market", "skarnspine_highpass",
           "Three days a week, and only in the four months anybody can get "
           "here."),
    inn("highpass_the_last_house", "The Last House", "skarnspine_highpass",
        "Genuinely the last one, in the direction that matters.", size="large"),
    smithy("highpass_smithy", "The Ward Forge", "skarnspine_highpass",
           "Cleats, crampons, shovel-blades, and cart-iron.", size="large"),
    store("highpass_outfitters", "Skarn Outfitters", "skarnspine_highpass",
          "Ropes, lamps, furs, and honest advice about the pass.",
          trade="chandler", size="large"),
    temple("highpass_chapel", "The Ward Chapel", "skarnspine_highpass",
           "Small, thick-walled, and warm, which is the whole of its appeal."),
    stable("highpass_mule_lines", "The Mule Lines", "skarnspine_highpass",
           "Nothing above Highpass goes by cart. Ninety mules live here."),
    store("highpass_bakehouse", "The Ward Bakehouse", "skarnspine_highpass",
          "Bakes for the garrison first and the town second, and says so.",
          trade="bakery"),
    house("highpass_house_a", "The Captain's House", "skarnspine_highpass",
          "Stone, slate, and shutters two inches thick."),
    house("highpass_house_b", "Shovellers' Row", "skarnspine_highpass",
          "Built for the men who keep the road open, which is most of the "
          "town."),
    delve("highpass_ward_cellars", "The Ward Cellars", "skarnspine_highpass",
          "The wall has more below it than above, and some of the below is "
          "older than the wall.", "highpass_cellars", minutes=10),

    # ===== Snowgate =====
    landmark("snowgate_bell", "The Snowgate Bell", "skarnspine_snowgate",
             "Rung when the road shuts. It is heard at Highpass and at "
             "Karn Dolur both.", minutes=2),
    store("snowgate_store", "The Gate Store", "skarnspine_snowgate",
          "Sells fuel, fat, and rope, and buys nothing.", size="small"),
    inn("snowgate_the_drift", "The Drift", "skarnspine_snowgate",
        "One room, dug into the slope, and warmer than anywhere in Highpass.",
        size="small"),
    smithy("snowgate_forge", "The Snowgate Forge", "skarnspine_snowgate",
           "Sharpens ice-tools and mends the bell frame, which needs it.",
           size="small"),
    house("snowgate_house_a", "The Deep House", "skarnspine_snowgate",
          "Dug in eleven feet, and it does not need a fire until Rimewatch."),
    house("snowgate_house_b", "The Watch Cottage", "skarnspine_snowgate",
          "Somebody sits here and looks north, all winter, in shifts."),

    # ===== the mountains =====
    poi("the_cut_the_narrows", "The Cut", "skarnspine_the_cut", "crossing",
        "A hundred feet deep, forty wide, dead straight, and the tool marks "
        "are still on the walls.", minutes=6, interior=False,
        tags=["crossing", "landmark"]),
    ruin("the_cut_toll_ruin", "The Old Toll Fort", "skarnspine_the_cut",
         "Built across the Cut to charge for it, and slighted by somebody who "
         "objected.", minutes=8, trade="keep", size="medium"),
    delve("the_cut_quarry_galleries", "The Cut Galleries", "skarnspine_the_cut",
          "Where the stone from the Cut went, and the galleries go a great "
          "deal further than the stone would account for.",
          "skarn_cut_galleries", minutes=12),

    landmark("ironstair_the_steps", "The Ironstair", "skarnspine_ironstair",
             "Nine hundred steps up a cliff face, cut, railed, and swept "
             "daily by somebody.", minutes=8),
    poi("ironstair_halfway_house", "The Halfway House", "skarnspine_ironstair",
        "settlement",
        "A cut chamber at step four hundred and fifty with a bench and a "
        "brazier.", minutes=5, trade="delved", size="small",
        desc_key="int_house", services=["inn"], tags=["inn"]),
    ruin("ironstair_fallen_stair", "The Fallen Stair", "skarnspine_ironstair",
         "The first stair, which came off the cliff in one piece four hundred "
         "years ago and is lying at the bottom.", minutes=10),

    landmark("cold_shoulder_north_face", "The North Face",
             "skarnspine_cold_shoulder",
             "In shade from Emberfall to Greening, and the snow on it is older "
             "than anybody using the road.", minutes=8),
    poi("cold_shoulder_ice_road", "The Ice Road", "skarnspine_cold_shoulder",
        "crossing",
        "A snow bridge over a gap of unknown depth. It is there in winter. It "
        "is not there in summer.", minutes=10, interior=False,
        gate="frostmere_ice_road", tags=["crossing"]),
    delve("cold_shoulder_wind_cave", "The Wind Cave", "skarnspine_cold_shoulder",
          "Blows out at dawn and in at dusk, hard enough to lean on, which "
          "means it goes a very long way.", "skarn_wind_cave", minutes=14),

    landmark("weirwater_head_corrie_lake", "The Corrie Lake",
             "skarnspine_weirwater_head",
             "Black, round, three hundred feet deep at the middle, and the "
             "start of the Weirwater.", minutes=6),
    landmark("weirwater_head_swallet", "The Swallet", "skarnspine_weirwater_head",
             "Where the whole outflow goes into the ground rather than down "
             "the valley, and comes out somewhere nobody has proved.",
             minutes=8),
    delve("weirwater_head_sink", "The Sink", "skarnspine_weirwater_head",
          "Follows the water in. It has been followed for two miles and "
          "somebody did not come back from the third.",
          "skarn_the_sink", minutes=15),

    ruin("broken_road_the_slip", "The Slip", "skarnspine_broken_road",
         "Half a mile of the old road, and the hillside it was on, at the "
         "bottom of the valley.", minutes=6),
    poi("broken_road_wayhouse", "The Broken Road Wayhouse",
        "skarnspine_broken_road", "settlement",
        "Built for the traffic the road used to carry, and running at about a "
        "fifth of that.", minutes=5, trade="inn", size="medium",
        desc_key="int_inn", services=["inn", "stable"], tags=["inn"]),
    ruin("broken_road_bridge", "The Broken Bridge", "skarnspine_broken_road",
         "Three arches standing and two not, and the river going through the "
         "gap perfectly happily.", minutes=6, trade="hall", size="small"),
]

DUNGEONS = [
    dungeon("karn_dolur_deeps", "The Deeps of Karn Dolur", "dungeon_delved",
            "The levels the hold gave up: eleven tiers of hall and gallery, "
            "sealed at the top and not, apparently, at the bottom.",
            rooms="16", depth="4", algorithm="bsp", bsp={"minLeaf": 6}, branchiness=0.4),
    dungeon("karn_dolur_old_seams", "The Old Seams", "dungeon_delved",
            "Worked out four centuries back and left open, because a hold "
            "does not fill in what it might want again.",
            rooms="12", depth="2", branchiness=0.55,
            corridorLength="4d3"),
    dungeon("highpass_cellars", "The Ward Cellars", "dungeon_delved",
            "Magazine, gaol, and store below the wall — and below those, "
            "chambers the wall was built on top of.",
            rooms="9", depth="2",),
    dungeon("skarn_cut_galleries", "The Cut Galleries", "dungeon_delved",
            "Galleries running off the Cut, going a great deal further than "
            "the stone taken out of it could possibly account for.",
            rooms="13", depth="3", branchiness=0.45),
    dungeon("skarn_wind_cave", "The Wind Cave", "dungeon_cave",
            "Breathes out at dawn and in at dusk, which means it connects to "
            "something with a great deal of air in it.",
            rooms="12", depth="3", algorithm="caverns", caverns={"fill": 0.44, "smoothingPasses": 5, "birthThreshold": 5}),
    dungeon("skarn_the_sink", "The Sink", "dungeon_drowned",
            "Follows the Weirwater into the mountain. Two miles have been "
            "surveyed. The third took the surveyor.",
            rooms="11", depth="3", algorithm="caverns", caverns={"fill": 0.47, "smoothingPasses": 4, "birthThreshold": 5}),
]

# --- prose ------------------------------------------------------------------

pool("karn_dolur_gatehall_desc",
     "Six hundred feet of flagged hall, lit by lamps somebody has to fill, and "
     "kept deliberately empty.",
     "Gatehall. The ceiling is out of the lamplight and stays there.",
     "Everything about this hall is a statement addressed to whoever has just "
     "walked into it.",
     "Your footsteps go a long way ahead of you and come back changed.")

pool("karn_dolur_deep_market_desc",
     "A cavern the size of a town square, with four galleries of shopfronts "
     "cut round the walls and stairs at the corners.",
     "The Deep Market, and it is louder in here than anywhere above ground in "
     "the whole range.",
     "Lamps in rows on every gallery, and the light of them going up and not "
     "reaching the roof.",
     "Everything for sale here came from somewhere else, which is most of the "
     "price.")

pool("karn_dolur_forgetiers_desc",
     "Six levels of furnace stacked down a shaft, and the shaft is the "
     "chimney for all of them.",
     "The Forgetiers. Hot, orange, and continuously loud in a rhythm that is "
     "several rhythms.",
     "You look down over a rail at four more tiers of the same thing, "
     "receding.",
     "The air moves upward here, hard, and takes the heat and the noise with "
     "it.")

pool("skarnspine_highpass_desc",
     "A wall across a valley with a town behind it, eleven hundred feet up, "
     "and shovels stacked against every building.",
     "Highpass: the last town, in the direction that counts.",
     "Slate roofs pitched steeply enough to shed a winter, and shutters two "
     "inches thick.",
     "The garrison is out clearing the road again. They are always out "
     "clearing the road.")

pool("skarnspine_snowgate_desc",
     "Nine houses dug half into the slope, and a bell on a frame that is the "
     "tallest thing here.",
     "Snowgate. When the bell goes, the road is shut, and that is the whole "
     "of the village's business.",
     "Smoke comes out of the hillside in nine places, which is the only way "
     "you would know.",
     "Warmer than Highpass, and everybody here will tell you so.")

pool("skarnspine_the_cut_desc",
     "A hundred feet deep, forty wide, and dead straight for a mile and a "
     "quarter. Somebody made this.",
     "The Cut. The tool marks are still on the walls at the top, where the "
     "weather has not got at them.",
     "Wind funnels down it in one direction only and does not let up.",
     "The strip of sky overhead is a very long way away and a peculiar shade.")

pool("skarnspine_ironstair_desc",
     "Nine hundred steps up a cliff face, cut into the rock, railed on the "
     "outside, and swept.",
     "The Ironstair. Somebody sweeps this, every day, all nine hundred.",
     "Halfway up there is a chamber with a bench in it, and you will use it.",
     "Below you the valley goes on being a valley, further down each time you "
     "look.")

pool("skarnspine_cold_shoulder_desc",
     "The north face, in shade from Emberfall through to Greening, and the "
     "snow on it does not date from this year.",
     "The Cold Shoulder. The way to the ice, for anybody who has decided they "
     "want to go there.",
     "Old snow, hard and grey, with the wind writing on it.",
     "It is measurably colder here than fifty yards back the way you came.")

pool("skarnspine_weirwater_head_desc",
     "A corrie, a black lake, and a waterfall going into the ground instead "
     "of out of the valley.",
     "The Weirwater starts here, and then immediately stops, and then starts "
     "again forty miles away.",
     "Three hundred feet deep at the middle, they say, and nobody has been "
     "able to disprove it.",
     "Cliffs on three sides and the way you came on the fourth.")

pool("skarnspine_broken_road_desc",
     "The old road up from the vale, and half a mile of it is at the bottom "
     "of the valley with the hillside it was on.",
     "The Broken Road. Passable, in the sense that people do pass.",
     "Cairns mark the diversions, and some of the cairns mark older "
     "diversions.",
     "Three arches of the bridge are standing, which is one more than you "
     "need.")

pool("the_cut_the_narrows_desc",
     "Forty feet across, a hundred deep, and the walls are dressed. This was "
     "cut, not found.",
     "You can put a hand on the tool marks. They are the width of a thumb and "
     "there are millions of them.",
     "Whatever needed a road through this mountain wanted it very badly.")

pool("ironstair_the_steps_desc",
     "Nine hundred of them, cut into a cliff, with an iron rail on the "
     "outside that is bolted into the rock every six feet.",
     "Every step is the same height. Nine hundred times.",
     "There is a man with a broom, and he starts again at the bottom when he "
     "gets to the top.")

pool("forgetiers_great_forge_desc",
     "Six furnaces on six levels down one shaft, all drawing on the same "
     "chimney, all going at once.",
     "The Great Forge of Karn Dolur, where the hold's reputation is actually "
     "manufactured.",
     "The heat comes at you up the shaft and you feel it two tiers before you "
     "arrive.")

pool("gatehall_the_gate_desc",
     "Forty tons of dressed stone on a counterweight, and two of the hold's "
     "own standing either side at every hour there is.",
     "It has been shut eleven times in nine hundred years and there is a list "
     "of the occasions on the wall.",
     "The counterweight shaft goes down out of sight. You do not want to know "
     "how far.")

pool("weirwater_head_swallet_desc",
     "The entire outflow of the lake goes into a hole in the valley floor and "
     "does not come out anywhere in this valley.",
     "The Swallet. Four hundredweight of dye went in here in 'twelve and was "
     "never seen again by anybody who reported it.",
     "The noise is enormous and entirely downward.")

pool("cold_shoulder_ice_road_desc",
     "A snow bridge over a gap of no known depth, and it is there in Deepdark "
     "and gone by Longlight.",
     "The Ice Road. There are marker poles. Some of them are leaning.",
     "It has held every winter anybody can remember. That is the case for it "
     "and the case against it.")

pool("skarnspine_pass_ward_blocked",
     "The gate is shut and the wind is from the north, and at Highpass those "
     "are the same sentence.",
     "\"Not today,\" says the ward-captain, without looking up from the "
     "weather-board.",
     "Snow across the road above the wall, deeper than a mule, and the "
     "garrison already digging.")

pool("karn_dolur_hold_gate_blocked",
     "The gate stands open and the gate-fee does not care. Twelve marks, and "
     "the clerk has all day.",
     "\"Twelve,\" says the gatewarden. \"Same as it was for your "
     "grandfather.\"",
     "Two of the hold's own, one ledger, and no discussion.")

pool("karn_dolur_deep_door_blocked",
     "Sealed, and marked so in four languages, one of which you cannot read.",
     "The hold inspects this door every month and the last inspection was "
     "eleven days ago.",
     "It is not locked so much as *closed*, in a way that suggests the "
     "closing was the important part.")

pool("frostmere_ice_road_blocked",
     "The bridge is not there. There is a gap, and below the gap there is "
     "blue, and below the blue there is nothing you can see.",
     "Marker poles on both sides and no snow between them.",
     "It is Longlight. The Ice Road is a winter road.")
