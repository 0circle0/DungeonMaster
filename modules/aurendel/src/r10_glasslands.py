"""Region 10 — The Glasslands.

The far south: dune over fused sand, a crater of green glass, and a city that
the sand has mostly won. Vashta Qal in two districts, one town on a salt run,
one village at a cistern, and five stretches of desert.
"""
from place import (area, poi, gate, toll, house, inn, smithy, store, workshop,
                   temple, stable, warehouse, guild, square, landmark, ruin,
                   delve)
from dungeonkit import dungeon
from prose import pool

WILD, DESERT = "desert", "urban_desert"
TAGS = ["glasslands"]

AREAS = [
    area("vashta_qal_oasis", "Vashta Qal — The Oasis", DESERT, "city", 1, 6,
         "Palms, water, and eleven thousand people arranged in rings around "
         "the only spring for a hundred miles.",
         tags=TAGS + ["vashta_qal", "city"]),
    area("vashta_qal_glass_quarter", "Vashta Qal — The Glass Quarter", DESERT,
         "city", 2, 6,
         "Built on the lip of the crater, out of the crater, and the walls "
         "here are green and let light through.",
         tags=TAGS + ["vashta_qal", "city"]),

    area("glasslands_saltrun", "Saltrun", DESERT, "town", 2, 6,
         "Where the salt is cut, loaded, and argued about, on a flat that "
         "goes white to the horizon.", tags=TAGS + ["town"]),
    area("glasslands_dry_cistern", "Dry Cistern", DESERT, "village", 3, 6,
         "Named optimistically. It is dry nine years in ten and the tenth is "
         "why anybody stays.", tags=TAGS + ["village"]),

    area("glasslands_sunken_road", "The Sunken Road", WILD, "wild", 5, 6,
         "A paved road under the dunes, showing in stretches where the wind "
         "has been kind, and going somewhere.", tags=TAGS),
    area("glasslands_shifting_dunes", "The Shifting Dunes", WILD, "wild", 6, 6,
         "Two hundred feet high and moving south at about eleven yards a "
         "year, and everything under them is preserved.", tags=TAGS),
    area("glasslands_the_crater", "The Crater", WILD, "wild", 7, 7,
         "Four miles across, green glass from lip to lip, and something "
         "happened here.", tags=TAGS),
    area("glasslands_the_fulgurite", "The Fulgurite Fields", WILD, "wild", 6, 7,
         "Where lightning has been fusing sand into branching glass tubes for "
         "longer than anybody has records, and the tubes stand up out of the "
         "ground like trees.", tags=TAGS),
    area("glasslands_bone_wells", "The Bone Wells", WILD, "wild", 6, 7,
         "Eleven shafts sunk into the sand for water, all dry, all deep, and "
         "all of them full of something.", tags=TAGS),
]

EDGES = [
    ("glasslands_sunken_road", "glasslands_saltrun", 40),
    ("glasslands_saltrun", "glasslands_shifting_dunes", 50),
    ("glasslands_shifting_dunes", "vashta_qal_oasis", 60,
     {"gate": "vashta_qal_water_toll"}),
    ("vashta_qal_oasis", "vashta_qal_glass_quarter", 8),
    ("vashta_qal_glass_quarter", "glasslands_the_crater", 45),
    ("glasslands_the_crater", "glasslands_the_fulgurite", 50),
    ("glasslands_the_fulgurite", "glasslands_bone_wells", 45),
    ("glasslands_bone_wells", "glasslands_dry_cistern", 40),
    ("glasslands_dry_cistern", "glasslands_sunken_road", 45),
    ("vashta_qal_oasis", "glasslands_bone_wells", 55),
]

GATES = [
    toll("vashta_qal_water_toll", "The Water Gate", 15,
         "Vashta Qal does not charge to enter. It charges to drink, at the "
         "gate, in advance, per head.",
         bypass=("deception", 15), blocked_key="vashta_qal_water_blocked"),
    gate("vashta_qal_sunken_bath_door", "The Bath Door", "lock",
         "Bronze, green, and it has been shut since the level dropped.",
         bypass=("lockpicking", 16),
         requires={"description": "the water-warden's key", "minLevel": 6},
         blocked_key="vashta_qal_bath_blocked"),
    gate("glasslands_crater_ward", "The Crater Lip", "hazard",
         "Nothing across it. The glass simply gets thin, and the thin part is "
         "over something.", bypass=("survival", 16),
         blocked_key="glasslands_crater_blocked"),
]

POIS = [
    # ===== Vashta Qal — The Oasis =====
    poi("vashta_qal_the_spring", "The Spring", "vashta_qal_oasis", "landmark",
        "The only water for a hundred miles, and eleven thousand people are "
        "arranged in rings around it.", minutes=4, interior=False,
        tags=["landmark"]),
    poi("vashta_qal_sunken_bath", "The Sunken Bath", "vashta_qal_oasis", "landmark",
        "Built when the water was forty feet higher, and the top three "
        "storeys of it are now the bottom three.", minutes=6,
        static="sunken_bath", gate="vashta_qal_sunken_bath_door",
        services=["temple"], tags=["landmark"]),
    square("vashta_qal_shade_market", "The Shade Market", "vashta_qal_oasis",
           "Under awnings, all of it, and the awnings are municipal and "
           "somebody's whole department."),
    guild("vashta_qal_water_wardens", "The Water Wardens", "vashta_qal_oasis",
          "Decide who drinks, how much, and in what order, and are the "
          "single most powerful body in the south.", size="hall"),
    store("vashta_qal_date_market", "The Date Halls", "vashta_qal_oasis",
          "Eleven varieties, graded, and the grading is a profession.",
          size="large"),
    store("vashta_qal_store", "The Caravan Stores", "vashta_qal_oasis",
          "Water skins, salt, rope, and shade cloth.", size="large"),
    workshop("vashta_qal_potter", "The Potters' Row", "vashta_qal_oasis",
             "Water jars, in four sizes, and the four sizes are legally "
             "defined.", size="large"),
    smithy("vashta_qal_smithy", "The Oasis Forge", "vashta_qal_oasis",
           "Charcoal comes eleven days by camel, so nothing is forged here "
           "that could be forged elsewhere."),
    temple("vashta_qal_water_temple", "The Temple of the Spring",
           "vashta_qal_oasis",
           "Built over the spring head, and the priesthood and the wardens "
           "have been the same people for four hundred years.", size="hall"),
    inn("vashta_qal_the_palm", "The Palm", "vashta_qal_oasis",
        "Courtyard, fountain, and rooms that face inward away from the sun.",
        size="large"),
    stable("vashta_qal_camel_yard", "The Camel Yard", "vashta_qal_oasis",
           "Four hundred of them, and the smell is a permanent feature of the "
           "eastern city."),
    house("vashta_qal_house_a", "The Second Ring", "vashta_qal_oasis",
          "Whitewashed, thick-walled, and it faces away from the street on "
          "every side."),
    house("vashta_qal_house_b", "The Warden's House", "vashta_qal_oasis",
          "Closest of any private house to the spring, which is the entire "
          "message."),

    # ===== Vashta Qal — The Glass Quarter =====
    poi("glass_quarter_the_lip", "The Crater Lip", "vashta_qal_glass_quarter",
        "landmark",
        "The quarter is built on it, out of it, and the walls let light "
        "through.", minutes=4, interior=False, tags=["landmark"]),
    square("glass_quarter_glass_market", "The Glass Market",
           "vashta_qal_glass_quarter",
           "Green glass by the block and by the finished piece, and the "
           "finished pieces go north for a great deal of money."),
    workshop("glass_quarter_cutters", "The Cutters' Hall",
             "vashta_qal_glass_quarter",
             "Crater glass is cut cold, never worked hot, for reasons nobody "
             "here will discuss with a stranger.", size="hall"),
    store("glass_quarter_lens_maker", "The Lens Maker", "vashta_qal_glass_quarter",
          "Glasses, burning lenses, and one instrument in the window that "
          "nobody will price."),
    warehouse("glass_quarter_bond_store", "The Glass Store",
              "vashta_qal_glass_quarter",
              "Packed in sand, crated, and shipped north eleven times a "
              "year.", size="large"),
    inn("glass_quarter_the_green_room", "The Green Room",
        "vashta_qal_glass_quarter",
        "The walls are crater glass and the light inside it is a colour you "
        "will not find anywhere else."),
    temple("glass_quarter_shrine", "The Shrine on the Lip",
           "vashta_qal_glass_quarter",
           "Faces the crater rather than the city, which was a decision."),
    house("glass_quarter_house_a", "Cutters' Terrace", "vashta_qal_glass_quarter",
          "Green-walled, and the residents claim it is cooler and it is not."),
    house("glass_quarter_house_b", "The Old Consulate", "vashta_qal_glass_quarter",
          "Somebody's embassy, once, to a city that has since stopped "
          "existing."),
    poi("glass_quarter_crater_stair", "The Crater Stair",
        "vashta_qal_glass_quarter", "dungeonEntrance",
        "Cut down the inside of the lip, in glass, and it goes below the "
        "floor of the crater.", minutes=10, dungeon="glasslands_crater_deep",
        tags=["dungeon"]),

    # ===== Saltrun =====
    landmark("saltrun_the_pans", "The Salt Pans", "glasslands_saltrun",
             "Cut in squares, flooded, evaporated, and cut again, over about "
             "eleven square miles.", minutes=4),
    square("saltrun_salt_market", "The Salt Market", "glasslands_saltrun",
           "Weighed, graded, and argued about, and the arguing is where the "
           "money is."),
    inn("saltrun_the_white_house", "The White House", "glasslands_saltrun",
        "Everything in Saltrun is white. This one is whiter.", size="large"),
    store("saltrun_store", "The Run Stores", "glasslands_saltrun",
          "Shovels, rakes, barrows, and eye protection.", size="large"),
    smithy("saltrun_forge", "The Salt Forge", "glasslands_saltrun",
           "Everything corrodes here in a season, so the forge never stops."),
    warehouse("saltrun_salt_store", "The Salt Stores", "glasslands_saltrun",
              "Blocks stacked in a building made of blocks.", size="hall"),
    temple("saltrun_chapel", "The White Chapel", "glasslands_saltrun",
           "Built of salt block, which means it is dissolving, slowly, and is "
           "rebuilt every generation."),
    stable("saltrun_camel_lines", "The Camel Lines", "glasslands_saltrun",
           "Salt goes out by camel and there is no other way it goes."),
    house("saltrun_house_a", "Pan Cottages", "glasslands_saltrun",
          "Six, in a row, all with white-rimed boots outside."),
    house("saltrun_house_b", "The Weigher's House", "glasslands_saltrun",
          "Has the only accurate scales in the region and is guarded "
          "accordingly."),
    delve("saltrun_deep_pan", "The Deep Pan", "glasslands_saltrun",
          "They cut down through the salt looking for better grade and came "
          "out the bottom of it into a room.",
          "glasslands_deep_pan", minutes=12),

    # ===== Dry Cistern =====
    poi("dry_cistern_the_cistern", "The Cistern", "glasslands_dry_cistern",
        "landmark",
        "Roman in its ambition and empty nine years in ten, and the tenth is "
        "why anybody stays.", minutes=4, trade="sun", size="hall",
        desc_key="int_store", tags=["landmark"]),
    inn("dry_cistern_the_drop", "The Drop", "glasslands_dry_cistern",
        "Named for what everyone here is waiting for.", size="small"),
    store("dry_cistern_store", "The Cistern Store", "glasslands_dry_cistern",
          "Water at a price that would be criminal anywhere else.",
          size="small"),
    house("dry_cistern_house_a", "The Keeper's", "glasslands_dry_cistern",
          "Whoever measures the cistern lives beside it and does so daily."),
    house("dry_cistern_house_b", "The Waiting Houses", "glasslands_dry_cistern",
          "Four, empty most years, occupied entirely in the wet one."),
    delve("dry_cistern_the_feeder", "The Feeder", "glasslands_dry_cistern",
          "The channel that fills the cistern, walked upstream, in the nine "
          "years when it is dry enough to walk.",
          "glasslands_the_feeder", minutes=12),

    # ===== the desert =====
    landmark("sunken_road_the_paving", "The Paving", "glasslands_sunken_road",
             "A dressed road under the dunes, showing in stretches where the "
             "wind has been kind, and going somewhere.", minutes=8),
    poi("sunken_road_caravanserai", "The Caravanserai", "glasslands_sunken_road",
        "settlement",
        "Four walls, one gate, a well, and it has been here since the road "
        "was above ground.", minutes=6, trade="sun", size="hall",
        desc_key="int_store", services=["inn", "stable"], tags=["inn"]),
    delve("sunken_road_milepost_vault", "The Milepost Vault",
          "glasslands_sunken_road",
          "One of the mileposts is hollow and there is a stair in it.",
          "glasslands_milepost", minutes=12, hidden=True,
          discover=("lore", 13), tags=["secret"]),

    landmark("shifting_dunes_the_crest", "The Crest", "glasslands_shifting_dunes",
             "Two hundred feet high and moving south at about eleven yards a "
             "year, and everything under it is preserved.", minutes=10),
    ruin("shifting_dunes_uncovered_town", "The Uncovered Town",
         "glasslands_shifting_dunes",
         "The dune moved off it eleven years ago and will move back over it "
         "in about thirty.", minutes=10, trade="sun", size="large"),
    delve("shifting_dunes_under_town", "Under the Uncovered Town",
          "glasslands_shifting_dunes",
          "The cellars are intact because sand is an excellent roof.",
          "glasslands_uncovered_town", minutes=14),

    poi("crater_the_lip_crossing", "The Thin Glass", "glasslands_the_crater",
        "crossing",
        "The glass gets thin about a mile in, and the thin part is over "
        "something.", minutes=8, interior=False, gate="glasslands_crater_ward",
        tags=["crossing"]),
    landmark("crater_the_centre", "The Centre", "glasslands_the_crater",
             "Four miles from any lip, and the glass here is clear rather "
             "than green, and you can see down.", minutes=12),
    delve("crater_the_shaft", "The Centre Shaft", "glasslands_the_crater",
          "Straight down from the middle, glass-walled, and whatever made the "
          "crater went this way.", "glasslands_centre_shaft", minutes=16,
          gate="glasslands_crater_ward"),

    landmark("fulgurite_the_grove", "The Glass Grove",
             "glasslands_the_fulgurite",
             "Branching tubes of fused sand standing eleven feet out of the "
             "ground, in thousands, where lightning has been striking the "
             "same field for a very long time.", minutes=8),
    poi("fulgurite_collectors_camp", "The Collectors' Camp",
        "glasslands_the_fulgurite", "camp",
        "Fulgurite is worth money and getting it out whole is a skill.",
        minutes=6, trade="house", size="small", desc_key="int_house"),
    delve("fulgurite_the_root", "The Root", "glasslands_the_fulgurite",
          "One tube goes down rather than up, and it is wide enough, and "
          "somebody has widened it further.",
          "glasslands_the_root", minutes=14),

    landmark("bone_wells_the_shafts", "The Bone Wells", "glasslands_bone_wells",
             "Eleven shafts sunk for water, all dry, all deep, and all of "
             "them full of something.", minutes=8),
    poi("bone_wells_diggers_camp", "The Diggers' Camp", "glasslands_bone_wells",
        "camp",
        "Somebody sank these. Somebody else has been coming back to look at "
        "what is in them.", minutes=6, trade="house", size="small",
        desc_key="int_house"),
    delve("bone_wells_the_ninth", "The Ninth Well", "glasslands_bone_wells",
          "The only one with rungs, and they go down further than the shaft "
          "was ever dug.", "glasslands_ninth_well", minutes=14),
]

DUNGEONS = [
    dungeon("glasslands_crater_deep", "The Crater Deep", "dungeon_ember",
            "A stair cut down the inside of the lip, in glass, going below "
            "the floor of the crater and continuing.",
            rooms="14", depth="4", branchiness=0.3),
    dungeon("glasslands_deep_pan", "The Deep Pan", "dungeon_delved",
            "They cut down through the salt for better grade and came out of "
            "the bottom of it into a finished room.",
            rooms="11", depth="3", algorithm="bsp", bsp={"minLeaf": 5}),
    dungeon("glasslands_the_feeder", "The Feeder", "dungeon_drowned",
            "The channel that fills the cistern, walked upstream in the nine "
            "years out of ten when that is possible.",
            rooms="10", depth="2", branchiness=0.15,
            corridorLength="5d3"),
    dungeon("glasslands_milepost", "The Milepost Vault", "dungeon_delved",
            "One milepost on the sunken road is hollow, and there is a stair "
            "in it, and it does not stop at the road's level.",
            rooms="9", depth="3",),
    dungeon("glasslands_uncovered_town", "Under the Uncovered Town",
            "dungeon_ruin",
            "The dune moved off it eleven years ago; the cellars are intact "
            "because sand turns out to be an excellent roof.",
            rooms="13", depth="2", algorithm="bsp", bsp={"minLeaf": 5}),
    dungeon("glasslands_centre_shaft", "The Centre Shaft", "dungeon_ember",
            "Straight down from the middle of the crater, glass-walled the "
            "whole way, and whatever made the crater went out this way.",
            rooms="15", depth="5", branchiness=0.2),
    dungeon("glasslands_the_root", "The Root", "dungeon_cave",
            "A fulgurite that went down instead of up, wide enough to enter, "
            "and widened since by hands.",
            rooms="11", depth="3", algorithm="caverns", caverns={"fill": 0.44, "smoothingPasses": 5, "birthThreshold": 5}),
    dungeon("glasslands_ninth_well", "The Ninth Well", "dungeon_delved",
            "The only one of the eleven with rungs, and the rungs go down "
            "further than the shaft was ever dug.",
            rooms="12", depth="4", branchiness=0.25),
]

# --- prose ------------------------------------------------------------------

pool("vashta_qal_oasis_desc",
     "Palms, water, and eleven thousand people arranged in rings around the "
     "only spring for a hundred miles.",
     "Vashta Qal. The closer to the water you live, the more you are, and "
     "everybody can read the address.",
     "Shade is municipal property here and there is a department for it.",
     "Water running in a stone channel down the middle of the street, and "
     "nobody touching it.")

pool("vashta_qal_glass_quarter_desc",
     "Built on the crater lip, out of the crater, and the walls are green and "
     "let the light through.",
     "The Glass Quarter. Everything here is a colour that does not occur "
     "anywhere else on the continent.",
     "Blocks of crater glass laid like stone, and the sun coming through four "
     "inches of it.",
     "Cutters working cold, always cold, and nobody will tell you why.")

pool("glasslands_saltrun_desc",
     "Eleven square miles of pans, cut in squares, and a town in the middle "
     "of it made of salt block.",
     "Saltrun. White to the horizon, and everybody here squints "
     "professionally.",
     "The buildings are dissolving. Slowly. They are rebuilt every "
     "generation and everybody has made their peace with it.",
     "The light off the flats is genuinely painful and there is a trade in "
     "smoked lenses.")

pool("glasslands_dry_cistern_desc",
     "A cistern of enormous ambition, empty nine years in ten, and a village "
     "waiting for the tenth.",
     "Dry Cistern. Named optimistically, and everybody knows it, and nobody "
     "has proposed a change.",
     "Four houses stand empty most years and fill entirely in the wet one.",
     "The keeper measures the depth daily and writes it down, and there is a "
     "book going back two hundred years.")

pool("glasslands_sunken_road_desc",
     "Dressed paving under the dunes, showing in stretches where the wind has "
     "been kind, and going somewhere.",
     "The Sunken Road. It runs dead straight and the dunes cross it at an "
     "angle.",
     "Where it shows, the kerbs are still in place and the ruts are still "
     "visible.",
     "There are mileposts. Somebody counted this road out.")

pool("glasslands_shifting_dunes_desc",
     "Two hundred feet high and moving south at about eleven yards a year.",
     "The Shifting Dunes. Everything under them is preserved and everything "
     "in front of them is going to be.",
     "A town came out from under the sand eleven years ago and will go back "
     "under in about thirty.",
     "The crest hisses continuously. That is the dune moving.")

pool("glasslands_the_crater_desc",
     "Four miles across, green glass from lip to lip, and something happened "
     "here.",
     "The Crater. Nobody argues about whether. Everybody argues about what.",
     "The glass is green at the edge and clear at the centre and you can see "
     "down through the clear part.",
     "It rings underfoot in a note that gets lower as you go in.")

pool("glasslands_the_fulgurite_desc",
     "Branching tubes of fused sand standing eleven feet out of the ground, "
     "in thousands.",
     "The Fulgurite Fields. Lightning has been striking this same field for "
     "longer than anybody has records.",
     "It looks like a wood and it is glass and it snaps if you lean on it.",
     "There is a storm most afternoons and nobody is out here during one.")

pool("glasslands_bone_wells_desc",
     "Eleven shafts sunk into the sand for water, all dry, all deep, and all "
     "of them full of something.",
     "The Bone Wells. Somebody sank these, at enormous cost, and found no "
     "water in any of them.",
     "You can drop a stone down the ninth and count a long way.",
     "The spoil heaps are still beside them, which means nobody has been back "
     "to tidy up.")

pool("vashta_qal_sunken_bath_desc",
     "Built when the water stood forty feet higher, so its top three storeys "
     "are now its bottom three.",
     "The Sunken Bath. The colonnade is under the floor level and the floor "
     "level is under the street.",
     "Bronze doors, green, shut since the water dropped, and the wardens keep "
     "the key.")

pool("crater_the_centre_desc",
     "Four miles from any lip. The glass here is clear rather than green and "
     "you can see down through it.",
     "There is a shaft. It goes straight down and it is glass-walled the "
     "whole way.",
     "The note underfoot here is so low you feel it rather than hear it.")

pool("fulgurite_the_grove_desc",
     "Thousands of branching glass tubes standing out of the sand, up to "
     "eleven feet, in a field about two miles across.",
     "They are hollow. They ring. They break if you look at them wrongly and "
     "they are worth money whole.",
     "Every one of them is a lightning strike, fossilised, and there are "
     "thousands.")

pool("bone_wells_the_shafts_desc",
     "Eleven shafts, dressed and lined, sunk at enormous cost, and dry every "
     "one.",
     "The spoil heaps are still there beside them, undisturbed, which means "
     "nobody came back.",
     "The ninth has rungs. The others do not. The rungs go further down than "
     "the shaft was dug.")

pool("shifting_dunes_uncovered_town_desc",
     "The dune moved off it eleven years ago and everything is exactly where "
     "it was left, because sand is an excellent roof.",
     "Doors still on hinges. Shutters still latched. Everything the colour of "
     "sand.",
     "It will be under again in about thirty years and everybody knows it and "
     "nobody is moving anything.")

pool("sunken_road_the_paving_desc",
     "Dressed stone, kerbed, rutted, running dead straight, and under two "
     "hundred feet of dune for most of its length.",
     "Where it shows the workmanship is better than the Kingsroad's.",
     "It has mileposts. One of them is hollow.")

pool("vashta_qal_water_blocked",
     "\"Fifteen,\" says the warden at the gate, \"per head, and you drink "
     "inside or you do not drink.\"",
     "The city does not charge you to come in. It charges you to be thirsty, "
     "and it is not subtle about the difference.",
     "There is a queue. There is always a queue. It moves at the wardens' "
     "pace.")

pool("vashta_qal_bath_blocked",
     "Bronze doors, gone green, and they have not moved since the water "
     "dropped.",
     "The wardens hold the key and the wardens have never explained the "
     "policy.",
     "There is a channel under the door and there is still water in it, which "
     "there should not be.")

pool("glasslands_crater_blocked",
     "The glass thins about a mile in. You can see it thinning. You can see "
     "through it.",
     "There is nothing across your path. There is simply less and less "
     "between you and whatever is under the crater.",
     "It rings differently here, and lower, and you have stopped walking "
     "without deciding to.")
