"""Region 6 — The Weeping Moor."""
from place import (
    area, poi, gate, house, inn, smithy, store, temple, stable, square,
    landmark, ruin, delve,
)
from dmkit.dungeons import dungeon
from dmkit.prose import pool

WILD, STONE, TIMBER = "moor", "urban_stone", "urban_timber"
TAGS = ["weeping_moor"]

AREAS = [
    area("moor_barrowgate", "Barrowgate", STONE, "town", 1, 4,
         "A market town with a keep, built on and partly out of a barrow that "
         "nobody has ever fully opened.", tags=TAGS + ["town"]),
    area("moor_mirestead", "Mirestead", TIMBER, "village", 3, 4,
         "Peat cutters, on the only firm ground for two miles in any "
         "direction.", tags=TAGS + ["village"]),
    area("moor_colders_hearth", "Colder's Hearth", TIMBER, "village", 3, 5,
         "Named for a man who kept a fire going here for forty years so people "
         "could find the way, and they still keep it going.",
         tags=TAGS + ["village"]),

    area("moor_kestrel_edge", "Kestrel Edge", WILD, "wild", 3, 4,
         "The southern scarp: a gritstone edge two hundred feet high with the "
         "whole vale laid out below it.", tags=TAGS),
    area("moor_heatherlands", "The Heatherlands", WILD, "wild", 4, 4,
         "Purple to the skyline in Winnow and brown the rest of the year, and "
         "no shelter anywhere in it.", tags=TAGS),
    area("moor_nine_sisters", "The Nine Sisters", WILD, "wild", 5, 5,
         "The highest ground on the moor, and nine stones standing on it in a "
         "ring sixty yards across.", tags=TAGS),
    area("moor_the_long_barrow", "The Long Barrow", WILD, "wild", 5, 6,
         "Four hundred yards of raised ground running east and west, and it is "
         "all one grave.", tags=TAGS),
    area("moor_black_tarn", "The Black Tarn", WILD, "wild", 6, 6,
         "A peat lake of no measured depth, with a shaft going down beside it "
         "that somebody cut.", tags=TAGS),
]

EDGES = [
    ("moor_kestrel_edge", "moor_barrowgate", 35),
    ("moor_barrowgate", "moor_heatherlands", 40),
    ("moor_heatherlands", "moor_nine_sisters", 45),
    ("moor_nine_sisters", "moor_the_long_barrow", 40),
    ("moor_the_long_barrow", "moor_black_tarn", 50),
    ("moor_black_tarn", "moor_mirestead", 35),
    ("moor_mirestead", "moor_colders_hearth", 40),
    ("moor_colders_hearth", "moor_kestrel_edge", 45),
    ("moor_barrowgate", "moor_black_tarn", 60),
]

GATES = [
    gate("barrowgate_keep_door", "The Keep Door", "lock",
         "The keep's own door, and the keep is standing on the barrow, and "
         "the two facts are related.", bypass=("lockpicking", 15),
         requires={"description": "the constable's leave", "minLevel": 4},
         blocked_key="barrowgate_keep_blocked"),
    gate("moor_sisters_ward", "The Sisters' Ward", "ward",
         "Nothing across the gap between the two southern stones, and you can "
         "walk it, and you very much do not want to.",
         bypass=("resolve", 15),
         requires={"description": "the words cut on the fallen stone",
                   "minLevel": 5},
         blocked_key="moor_sisters_ward_blocked"),
    gate("deeproads_tarn_shaft", "The Tarn Shaft", "hazard",
         "A shaft beside the Black Tarn, cut square, with the rungs rusted "
         "through for the first thirty feet.",
         bypass=("athletics", 15), blocked_key="deeproads_tarn_shaft_blocked"),
]

POIS = [
    # ===== Barrowgate =====
    poi("barrowgate_keep", "Barrowgate Keep", "moor_barrowgate", "landmark",
        "Built on the barrow, out of the barrow, and by people who were "
        "explicitly told not to.", minutes=6, trade="keep", size="hall",
        gate="barrowgate_keep_door", tags=["castle"]),
    poi("barrowgate_moot_hall", "The Moot Hall", "moor_barrowgate", "landmark",
        "Where the moor's business is done: grazing rights, peat rights, and "
        "the one subject nobody raises.", minutes=4,
        static="barrowgate_moot", services=["guild"], tags=["landmark"]),
    square("barrowgate_market", "The Barrow Market", "moor_barrowgate",
           "Wool, peat, and mutton, on the flat ground beside the mound "
           "rather than on it."),
    inn("barrowgate_the_standing_stone", "The Standing Stone", "moor_barrowgate",
        "There is one, in the yard, and the inn was built around rather than "
        "moving it.", size="large"),
    smithy("barrowgate_smithy", "The Gate Forge", "moor_barrowgate",
           "Peat spades, turf irons, and the ironwork for eleven miles of "
           "wall.", size="large"),
    store("barrowgate_store", "Hasp's", "moor_barrowgate",
          "Everything the moor cannot grow, which is nearly everything.",
          size="large"),
    store("barrowgate_wool_hall", "The Wool Hall", "moor_barrowgate",
          "Graded and sold twice a year and the town lives off both days.",
          trade="warehouse", size="large"),
    temple("barrowgate_church", "The Church on the Mound", "moor_barrowgate",
           "Built on the east end of the barrow, deliberately, and the "
           "foundations went into something.", size="large"),
    stable("barrowgate_stables", "The Moor Stables", "moor_barrowgate",
           "Ponies, not horses. Anything taller is no use up here."),
    house("barrowgate_house_a", "The Constable's House", "moor_barrowgate",
          "Beside the keep, and the constable does not sleep in the keep."),
    house("barrowgate_house_b", "Peatman's Row", "moor_barrowgate",
          "Six cottages, each with a peat stack against the gable taller than "
          "the door."),
    delve("barrowgate_under_keep", "Under the Keep", "moor_barrowgate",
          "The keep's cellars go into the barrow, which the builders swore "
          "they would not do.", "moor_under_keep", minutes=10,
          gate="barrowgate_keep_door"),

    # ===== Mirestead =====
    landmark("mirestead_peat_cuttings", "The Cuttings", "moor_mirestead",
             "Faces of black peat eight feet high, cut in steps, and drying "
             "stacks between them.", minutes=4),
    inn("mirestead_the_turf", "The Turf", "moor_mirestead",
        "Burns peat, obviously, and the smell is in everything including the "
        "beer.", size="small"),
    store("mirestead_store", "The Cutters' Store", "moor_mirestead",
          "Spades, boots, rope, and dry socks.", size="small"),
    smithy("mirestead_forge", "The Mire Forge", "moor_mirestead",
           "Peat spades and turf irons, and it makes nothing else at all.",
           size="small"),
    house("mirestead_house_a", "The Dry House", "moor_mirestead",
          "On the only rock in the village, and every other house envies it."),
    house("mirestead_house_b", "Duckboard Cottages", "moor_mirestead",
          "Reached by planks, and the planks are municipal property."),
    delve("mirestead_bog_body_cut", "The Deep Cutting", "moor_mirestead",
          "They cut down eleven feet here and found a floor, and stopped "
          "cutting.", "moor_deep_cutting", minutes=12),

    # ===== Colder's Hearth =====
    landmark("colders_hearth_the_fire", "Colder's Fire", "moor_colders_hearth",
             "Kept burning for forty years by one man so that people could "
             "find the way, and kept burning since by everybody.", minutes=3),
    inn("colders_hearth_inn", "The Beacon", "moor_colders_hearth",
        "Exists to take in whoever the fire brought.", size="small"),
    store("colders_hearth_store", "The Hearth Store", "moor_colders_hearth",
          "Fuel, mostly. Fuel is the local currency and the local anxiety.",
          size="small"),
    temple("colders_hearth_chapel", "The Small Chapel", "moor_colders_hearth",
           "One room, and the fire is visible through its one window.",
           size="small"),
    house("colders_hearth_house_a", "The Keeper's Cottage", "moor_colders_hearth",
          "Whoever lives here tends the fire. It is not a job you apply for."),
    house("colders_hearth_house_b", "Wayfarers' Rest", "moor_colders_hearth",
          "Beds for people the moor nearly kept, and there are several every "
          "winter."),

    # ===== the moor =====
    landmark("kestrel_edge_the_edge", "The Edge", "moor_kestrel_edge",
             "Two hundred feet of gritstone with the whole Kingsvale laid out "
             "below it, and kestrels hanging along the whole length.",
             minutes=6),
    ruin("kestrel_edge_shooting_house", "The Shooting House", "moor_kestrel_edge",
         "Built for a sport that stopped, and used since by shepherds and "
         "whoever else.", minutes=6, trade="house", size="small"),
    delve("kestrel_edge_grit_caves", "The Grit Caves", "moor_kestrel_edge",
          "Where blocks have come away from the edge and left slots behind "
          "them, and one of the slots does not end.",
          "moor_grit_caves", minutes=12),

    landmark("heatherlands_the_crossing", "The Moor Crossing",
             "moor_heatherlands",
             "A line of marker stones a hundred paces apart, and in poor "
             "visibility it is the only thing standing between you and a very "
             "long walk.", minutes=8),
    poi("heatherlands_bothy", "The Heather Bothy", "moor_heatherlands", "camp",
        "Unlocked, unstaffed, stocked, and it has saved more lives than the "
        "keep has.", minutes=5, trade="house", size="small",
        desc_key="int_house", services=["inn"]),
    ruin("heatherlands_burnt_farm", "The Burnt Farm", "moor_heatherlands",
         "Somebody tried to farm up here, once, and the moor was extremely "
         "clear about it.", minutes=8),

    poi("nine_sisters_the_ring", "The Nine Sisters", "moor_nine_sisters",
        "shrine",
        "Nine stones in a ring sixty yards across, on the highest ground for "
        "twenty miles, and none of them is local rock.", minutes=6,
        interior=False, gate="moor_sisters_ward", tags=["shrine", "landmark"]),
    landmark("nine_sisters_fallen", "The Fallen Sister", "moor_nine_sisters",
             "The tenth, lying down, with writing on the underside that "
             "somebody has propped it up to read.", minutes=5),
    delve("nine_sisters_under_ring", "Beneath the Sisters", "moor_nine_sisters",
          "A stair between the two eastern stones, going down, cut into the "
          "gritstone and worn in the middle.",
          "moor_beneath_sisters", minutes=14, gate="moor_sisters_ward"),

    landmark("long_barrow_the_ridge", "The Long Barrow", "moor_the_long_barrow",
             "Four hundred yards of raised ground running east and west, and "
             "it is all one grave.", minutes=8),
    poi("long_barrow_east_end", "The East End", "moor_the_long_barrow",
        "dungeonEntrance",
        "The only way in that anybody has found, at the sunrise end, behind a "
        "slab that has been moved before.", minutes=10,
        dungeon="moor_long_barrow", tags=["dungeon", "barrow"]),
    ruin("long_barrow_diggers_camp", "The Diggers' Camp", "moor_the_long_barrow",
         "Somebody excavated here for two seasons, wrote nothing down that "
         "survives, and left in a hurry.", minutes=8, trade="house",
         size="small"),

    landmark("black_tarn_the_water", "The Black Tarn", "moor_black_tarn",
             "Peat-black, forty yards across, and every attempt to sound it "
             "has run out of line.", minutes=6),
    poi("black_tarn_shaft", "The Tarn Shaft", "moor_black_tarn", "dungeonEntrance",
        "Cut square, beside the water, with rungs in the wall and the first "
        "thirty feet of them rusted through.", minutes=10,
        dungeon="moor_tarn_shaft", gate="deeproads_tarn_shaft",
        tags=["dungeon"]),
    ruin("black_tarn_sunken_chapel", "The Sunken Chapel", "moor_black_tarn",
         "Shows above the water in a dry Highsun and not otherwise, and it is "
         "the wrong shape for a chapel.", minutes=10, trade="temple",
         size="small", hidden=True, discover=("perception", 14),
         tags=["secret"]),
]

DUNGEONS = [
    dungeon("moor_under_keep", "Under Barrowgate Keep", "dungeon_barrow",
            "The keep's cellars, and then the barrow they were cut into, which "
            "the builders swore in writing they would not do.",
            rooms="10", depth="2",),
    dungeon("moor_deep_cutting", "The Deep Cutting", "dungeon_drowned",
            "Eleven feet down through peat, a floor, and rooms under the "
            "floor, all of them wet.",
            rooms="9", depth="2",),
    dungeon("moor_grit_caves", "The Grit Caves", "dungeon_cave",
            "Slots left where blocks came away from the edge, and one of them "
            "goes back into the hill and keeps going.",
            rooms="10", depth="2", algorithm="caverns", caverns={"fill": 0.45, "smoothingPasses": 4, "birthThreshold": 5}),
    dungeon("moor_beneath_sisters", "Beneath the Sisters", "dungeon_barrow",
            "A cut stair between the eastern stones, and chambers under the "
            "ring laid out to the same plan as the ring.",
            rooms="12", depth="3", branchiness=0.2),
    dungeon("moor_long_barrow", "The Long Barrow", "dungeon_barrow",
            "Four hundred yards of grave: an entrance passage and forty cists "
            "off it, and a chamber at the west end.",
            rooms="15", depth="3", branchiness=0.15,
            corridorLength="5d3", corridor={"style": "straight", "width": 1}),
    dungeon("moor_tarn_shaft", "The Tarn Shaft", "dungeon_delved",
            "A cut shaft beside the tarn going down to galleries that are on "
            "the Deeproads' plan, not the moor's.",
            rooms="12", depth="4", branchiness=0.3),
]

# --- prose ------------------------------------------------------------------

pool("moor_barrowgate_desc",
     "A market town with a keep, both of them standing on a mound that "
     "everybody is careful not to call a grave.",
     "Barrowgate. Gritstone, slate, and a great deal of wall.",
     "The mound is in the middle of the town and the town has grown round it "
     "rather than over it, except for the keep, which did not.",
     "Peat smoke, wool, and a wind that comes across eleven miles of heather "
     "to get here.")

pool("moor_mirestead_desc",
     "Peat cuttings on three sides and standing water on the fourth, and the "
     "village on the only firm ground.",
     "Mirestead. Black faces of cut peat eight feet high, and stacks drying "
     "between them.",
     "Duckboards from door to door, and they are maintained by the parish.",
     "The smell of peat smoke is not unpleasant and it is inescapable.")

pool("moor_colders_hearth_desc",
     "A fire on a stone platform in the middle of the village, kept going "
     "since a man called Colder started it.",
     "Colder's Hearth. You can see the fire from three miles off in clear "
     "weather and that is the entire point of the village.",
     "Everything here is arranged so that somebody can always see the flame.",
     "The fuel stack is enormous and it is everybody's responsibility.")

pool("moor_kestrel_edge_desc",
     "Two hundred feet of gritstone, and the whole Kingsvale laid out below "
     "it like something drawn.",
     "Kestrels hanging along the length of the edge, one every hundred yards, "
     "all facing into the wind.",
     "Blocks the size of houses have come off here and are lying at the "
     "bottom in a jumble.",
     "The wind comes up the face and over the top and takes your hat with it.")

pool("moor_heatherlands_desc",
     "Purple to the skyline in Winnow, brown the rest of the year, and no "
     "shelter anywhere in it.",
     "Marker stones a hundred paces apart, and in mist they are the only "
     "thing between you and a very long walk.",
     "The ground gives and then does not, without warning either way.",
     "A curlew goes up somewhere and the sound travels for what feels like a "
     "mile.")

pool("moor_nine_sisters_desc",
     "The highest ground for twenty miles, and nine stones standing on it in "
     "a ring sixty yards across.",
     "None of the stones is local rock. The nearest source is four days' "
     "haul.",
     "You can see the whole moor from here and everything on the moor can see "
     "you.",
     "The wind goes through the ring and makes a noise that is not quite a "
     "note.")

pool("moor_the_long_barrow_desc",
     "Four hundred yards of raised ground running east and west, and it is "
     "all one grave.",
     "Sheep graze it. Nothing else about it is ordinary.",
     "The east end has been opened. The west end has not, and the west end is "
     "where the ground is highest.",
     "You can walk the whole length in ten minutes and you will not enjoy the "
     "last three.")

pool("moor_black_tarn_desc",
     "Peat-black, forty yards across, and every attempt to sound it has run "
     "out of line before it ran out of water.",
     "No inflow, no outflow, and the level has never once changed.",
     "Beside it there is a shaft, cut square, going down. Somebody cut that.",
     "Nothing grows at the margin. Nothing at all, in a bog.")

pool("nine_sisters_the_ring_desc",
     "Nine stones, sixty yards across, on the top of the moor, and not one of "
     "them is from within four days' haul of here.",
     "They are dressed. Somebody shaped these and then moved them.",
     "The gap between the two southern stones is empty and you can walk it "
     "and every part of you would rather not.")

pool("nine_sisters_fallen_desc",
     "The tenth, lying on its face for as long as anybody knows, with writing "
     "on the underside.",
     "Somebody has levered it up on packing stones to read it, and left the "
     "packing stones in.",
     "The writing is not weathered, because it has been face down, and it is "
     "perfectly legible, and nobody can read it.")

pool("long_barrow_the_ridge_desc",
     "Four hundred yards, running dead east and west, raised about twelve "
     "feet above the moor.",
     "It is aligned. Precisely. On something.",
     "The turf on it is a different colour from the turf either side and "
     "always has been.")

pool("black_tarn_the_water_desc",
     "Black, still, forty yards of it, and no line anybody has let down has "
     "found the bottom.",
     "The surface does not move even when the heather is flattening.",
     "The margin is bare mud for a yard all the way round, and nothing grows "
     "in it.")

pool("colders_hearth_the_fire_desc",
     "A stone platform, a fire on it, and forty years of one man's stubbornness "
     "keeping it lit before the village took over.",
     "It has not been out since. There is a book recording every night's "
     "keeper, and it goes back a long way.",
     "In clear weather you can see it from Kestrel Edge, which is eleven "
     "miles.")

pool("barrowgate_keep_blocked",
     "The keep door is shut and the constable is not minded to open it for "
     "this.",
     "\"The cellars are the constable's business,\" says the man on the door, "
     "\"and you are not.\"",
     "Iron-strapped, barred inside, and a spyhole that opens and closes "
     "again.")

pool("moor_sisters_ward_blocked",
     "The gap between the two southern stones is empty, and walking through "
     "it turns out to be an entirely different question from being able to.",
     "You get three paces in and your feet stop, and they stop before you "
     "decide to.",
     "Nothing is there. That is not the same as nothing being in the way.")

pool("deeproads_tarn_shaft_blocked",
     "The rungs are rusted through for the first thirty feet and then they "
     "are not, which is the wrong way round.",
     "Square-cut, dry, and the draught coming up it is warm.",
     "It is a long way down and the first third of it has nothing to hold.")
