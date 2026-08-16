"""Region 1 — The Kingsvale.

The heartland: the Weirwater running down out of the Skarnspine, the Kingsroad
crossing it at Aurenhal, and everything either side of both hedged into fields.
Four city districts, one town, three villages, four stretches of country. This
is where a party starts, so it is deliberately the safest ground on the
continent and the densest in doors you can open.
"""
from place import area, poi, gate, toll
from dungeonkit import dungeon
from prose import pool

B_WILD = "vale"
B_STONE = "urban_stone"
B_TIMBER = "urban_timber"
TAGS = ["kingsvale"]

AREAS = [
    # -- Aurenhal, the capital, in four districts -------------------------
    area("aurenhal_highgate", "Aurenhal — Highgate", B_STONE, "city", 0, 1,
         "The upper city: the Kingshold, the Grand Library, and the gate the "
         "Kingsroad actually arrives at.", tags=TAGS + ["aurenhal", "city"]),
    area("aurenhal_craftrow", "Aurenhal — Craftrow", B_STONE, "city", 0, 1,
         "Every trade that needs a chimney, arranged along one long street by "
         "somebody who was thinking about fire.", tags=TAGS + ["aurenhal", "city"]),
    area("aurenhal_riverside", "Aurenhal — Riverside", B_STONE, "city", 0, 1,
         "Wharves, warehouses, and the river gate. The Weirwater does most of "
         "the city's carrying.", tags=TAGS + ["aurenhal", "city"]),
    area("aurenhal_warrens", "Aurenhal — The Warrens", B_STONE, "city", 1, 1,
         "Older than the wall that was built to contain it, and it has been "
         "leaking out of that wall ever since.", tags=TAGS + ["aurenhal", "city"]),

    # -- town --------------------------------------------------------------
    area("kingsvale_wraymill", "Wraymill", B_TIMBER, "town", 0, 1,
         "Six mills on one leat, a grain market, and the reason Aurenhal eats.",
         tags=TAGS + ["town"]),

    # -- villages ----------------------------------------------------------
    area("kingsvale_hollowdene", "Hollowdene", B_TIMBER, "village", 0, 1,
         "A green, a well, a smithy, and eleven roofs. The road goes through "
         "rather than to it.", tags=TAGS + ["village"]),
    area("kingsvale_ashcott", "Ashcott", B_TIMBER, "village", 0, 1,
         "Sheep country. The village is mostly one lane and a very good "
         "hedge.", tags=TAGS + ["village"]),
    area("kingsvale_pennyford", "Pennyford", B_TIMBER, "village", 1, 1,
         "Named for what the ford used to cost. It is free now, and deeper.",
         tags=TAGS + ["village"]),

    # -- country -----------------------------------------------------------
    area("kingsvale_weirwater_crossing", "The Weirwater Crossing", B_WILD, "wild", 1, 1,
         "Where the Kingsroad meets the river on a bridge of nine arches, two "
         "of them younger than the rest.", tags=TAGS),
    area("kingsvale_hedge_country", "The Hedge Country", B_WILD, "wild", 1, 1,
         "Fields inside fields inside hedges laid before anybody's grandfather. "
         "Easy to walk and easy to lose a day in.", tags=TAGS),
    area("kingsvale_kingsroad_south", "The Kingsroad, South Reach", B_WILD, "wild", 2, 2,
         "Cut stone running dead straight to the southern horizon, with milestones "
         "counting down to places you have not been.", tags=TAGS),
    area("kingsvale_oxbow_meadows", "The Oxbow Meadows", B_WILD, "wild", 1, 1,
         "The Weirwater changed its mind here a long time ago and left good "
         "grazing and bad drainage behind.", tags=TAGS),
]

EDGES = [
    # Aurenhal's districts — minutes, not hours.
    ("aurenhal_highgate", "aurenhal_craftrow", 4),
    ("aurenhal_craftrow", "aurenhal_riverside", 4),
    ("aurenhal_riverside", "aurenhal_warrens", 3),
    ("aurenhal_warrens", "aurenhal_highgate", 6),

    # Out of the city.
    ("aurenhal_highgate", "kingsvale_kingsroad_south", 25, {"gate": "aurenhal_kings_gate"}),
    ("aurenhal_riverside", "kingsvale_weirwater_crossing", 25, {"gate": "aurenhal_river_gate"}),
    ("aurenhal_warrens", "kingsvale_hedge_country", 30),

    # The vale itself.
    ("kingsvale_weirwater_crossing", "kingsvale_wraymill", 40),
    ("kingsvale_wraymill", "kingsvale_oxbow_meadows", 35),
    ("kingsvale_oxbow_meadows", "kingsvale_pennyford", 30),
    ("kingsvale_pennyford", "kingsvale_weirwater_crossing", 45),
    ("kingsvale_hedge_country", "kingsvale_hollowdene", 25),
    ("kingsvale_hollowdene", "kingsvale_ashcott", 35),
    ("kingsvale_ashcott", "kingsvale_kingsroad_south", 30),
    ("kingsvale_kingsroad_south", "kingsvale_hedge_country", 25),
    ("kingsvale_hollowdene", "kingsvale_oxbow_meadows", 40),
]

GATES = [
    toll("aurenhal_kings_gate", "The King's Gate", 5,
         "Two towers, a portcullis nobody has dropped in thirty years, and a "
         "clerk with a ledger who will absolutely take your five marks.",
         bypass=("persuasion", 13), blocked_key="aurenhal_kings_gate_blocked"),
    toll("aurenhal_river_gate", "The River Gate", 3,
         "Where the wall meets the water. The wharfingers pay by the year; "
         "everyone else pays at the arch.",
         bypass=("stealth", 14), blocked_key="aurenhal_river_gate_blocked"),
    gate("kingshold_undercroft_door", "The Undercroft Door", "lock",
         "Iron-banded oak at the bottom of a stair nobody sweeps.",
         bypass=("lockpicking", 16),
         # Two ways in, which is the shape every gate on the critical path
         # takes: the Crown's key if you took the Crown's commission, and a
         # lock that can be picked if you did not.
         requires={"description": "the undercroft key, or a very good lockpick",
                   "items": [{"item": "undercroft_key", "consume": False}]},
         blocked_key="kingshold_undercroft_blocked"),
    gate("pennyford_sluice", "The Pennyford Sluice", "hazard",
         "The old ford gate. Shut, the channel runs deep and fast; open, it "
         "runs deeper and faster.",
         bypass=("athletics", 12),
         blocked_key="pennyford_sluice_blocked"),
]

# --- points of interest -----------------------------------------------------

# The shared interior pools live in prose.py; these are just their names.
HOUSE = "int_house"
SMITHY = "int_smithy"
STORE = "int_store"
INN = "int_inn"
TEMPLE = "int_temple"
STABLE = "int_stable"
STORE_HOUSE = "int_warehouse"
WORKSHOP = "int_workshop"
MILL = "int_mill"


def _house(pid, name, in_area, description, at, tags=()):
    return poi(pid, name, in_area, "settlement", description, at=at, minutes=2,
               trade="house", size="small", desc_key=HOUSE, tags=list(tags) + ["house"])


POIS = [
    # ================= Aurenhal — Highgate =================
    poi("aurenhal_kingshold", "The Kingshold", "aurenhal_highgate", "landmark",
        "A castle that began as a river-fort and has been argued with by every "
        "monarch since.", at=(22, 8), minutes=8, static="kingshold_hall",
        services=["guild"], tags=["castle", "aurenhal"]),
    poi("aurenhal_kingshold_undercroft", "The Kingshold Undercroft", "aurenhal_highgate",
        "dungeonEntrance",
        "Storerooms under the keep, and below those the older fort nobody has "
        "had a reason to survey.", at=(24, 10), minutes=10,
        dungeon="kingshold_undercroft", gate="kingshold_undercroft_door",
        tags=["dungeon", "aurenhal"]),
    poi("aurenhal_grand_library", "The Grand Library", "aurenhal_highgate", "landmark",
        "Four floors of shelving and one very determined argument about who is "
        "allowed on the fourth.", at=(14, 12), minutes=6,
        static="grand_library", services=["guild"], tags=["aurenhal"]),
    poi("aurenhal_high_temple", "The High Temple", "aurenhal_highgate", "shrine",
        "The oldest roof in the city, and the only one the fire of 'eighty-one "
        "went round.", at=(30, 14), minutes=5, trade="temple", size="hall",
        desc_key=TEMPLE, services=["temple"], tags=["aurenhal"]),
    poi("aurenhal_mint", "The Mint", "aurenhal_highgate", "landmark",
        "Where the marks come from. Two doors, both watched.",
        at=(18, 20), minutes=4, trade="hall", size="large", tags=["aurenhal"]),
    poi("aurenhal_watch_barracks", "The Highgate Barracks", "aurenhal_highgate", "landmark",
        "Where the city watch sleeps, eats, and complains about the Warrens.",
        at=(34, 20), minutes=4, trade="watch", size="large", tags=["aurenhal"]),
    poi("aurenhal_goldsmiths_hall", "The Goldsmiths' Hall", "aurenhal_highgate", "market",
        "A guild that pretends to be about craft and is entirely about credit.",
        at=(10, 18), minutes=4, trade="guild", size="large",
        services=["guild"], tags=["shop", "aurenhal"]),
    poi("aurenhal_scriptorium", "The Scriptorium", "aurenhal_highgate", "market",
        "Copies made, letters written, contracts drawn, no questions logged.",
        at=(12, 22), minutes=3, trade="shop", desc_key=STORE,
        services=["market"], tags=["shop", "aurenhal"]),
    poi("aurenhal_highgate_stables", "The Highgate Stables", "aurenhal_highgate", "settlement",
        "Where anybody with business at the Kingshold leaves their horse.",
        at=(26, 24), minutes=3, trade="stable", desc_key=STABLE,
        services=["stable"], tags=["aurenhal"]),
    _house("aurenhal_highgate_house_a", "The Chancellor's Town House", "aurenhal_highgate",
           "Three storeys, railings, and a door knocker shaped like something "
           "extinct.", (8, 26), ["aurenhal"]),
    _house("aurenhal_highgate_house_b", "Wren's Lodging", "aurenhal_highgate",
           "Rooms let by the month to clerks who wish they were closer to the "
           "Library.", (38, 12), ["aurenhal"]),
    poi("aurenhal_kings_garden", "The King's Garden", "aurenhal_highgate", "landmark",
        "Walled, gravelled, and open to the public on days that keep changing.",
        at=(28, 4), minutes=3, interior=False, tags=["aurenhal"]),

    # ================= Aurenhal — Craftrow =================
    poi("craftrow_great_forge", "The Great Forge", "aurenhal_craftrow", "market",
        "Six hearths under one roof, and a guild that decides whose iron gets "
        "which.", at=(20, 10), minutes=5, trade="smithy", size="hall",
        desc_key=SMITHY, services=["smith", "guild"], tags=["shop"]),
    poi("craftrow_armourers", "Vench & Daughters, Armourers", "aurenhal_craftrow", "market",
        "Plate, mail, and a very long wait unless you are somebody.",
        at=(14, 14), minutes=3, trade="smithy", size="large", desc_key=SMITHY,
        services=["smith"], tags=["shop"]),
    poi("craftrow_fletcher", "The Bowyer's", "aurenhal_craftrow", "market",
        "Staves seasoning in the rafters, some of them older than the bowyer.",
        at=(26, 14), minutes=3, trade="fletcher", desc_key=WORKSHOP,
        services=["market"], tags=["shop"]),
    poi("craftrow_apothecary", "The Sign of the Green Jar", "aurenhal_craftrow", "market",
        "Drawers, jars, and a proprietor who wants to know exactly what for.",
        at=(30, 18), minutes=3, trade="apothecary", desc_key=STORE,
        services=["market"], tags=["shop"]),
    poi("craftrow_cooper", "The Cooperage", "aurenhal_craftrow", "market",
        "Barrels going out at one end and staves coming in at the other.",
        at=(10, 20), minutes=3, trade="shop", desc_key=WORKSHOP,
        services=["market"], tags=["shop"]),
    poi("craftrow_tannery", "The Tanyard", "aurenhal_craftrow", "market",
        "Downwind of everything, by law, and still not far enough.",
        at=(6, 26), minutes=4, trade="shop", desc_key=WORKSHOP,
        services=["market"], tags=["shop"]),
    poi("craftrow_glassworks", "The Glasshouse", "aurenhal_craftrow", "market",
        "Southern sand, northern fuel, and a furnace that has not gone out in "
        "forty years.", at=(34, 22), minutes=4, trade="foundry", size="large",
        desc_key=SMITHY, services=["smith"], tags=["shop"]),
    poi("craftrow_market_square", "Craftrow Market", "aurenhal_craftrow", "market",
        "Trestles up at dawn, down at dusk, and a fight about pitches in "
        "between.", at=(20, 24), minutes=2, interior=False,
        services=["market"], tags=["shop"]),
    poi("craftrow_the_forge_arms", "The Forge Arms", "aurenhal_craftrow", "settlement",
        "Sooty, loud, and the best table in the city if you like being shouted "
        "at.", at=(24, 20), minutes=3, trade="inn", size="large",
        desc_key=INN, services=["inn"], tags=["inn"]),
    _house("craftrow_house_a", "Smiths' Row, Number Four", "aurenhal_craftrow",
           "One of nine identical houses, distinguished by the colour of the door.",
           (16, 28)),
    _house("craftrow_house_b", "Ledd's House", "aurenhal_craftrow",
           "Workshop below, family above, and a stair between them that "
           "everyone is tired of.", (28, 28)),

    # ================= Aurenhal — Riverside =================
    poi("riverside_long_wharf", "The Long Wharf", "aurenhal_riverside", "market",
        "Half a mile of stone quay, and never a free bollard when you want one.",
        at=(22, 6), minutes=3, interior=False, services=["market"], tags=["docks"]),
    poi("riverside_customs_house", "The Customs House", "aurenhal_riverside", "landmark",
        "Where a cargo becomes a number, and the number becomes an argument.",
        at=(18, 10), minutes=4, trade="hall", size="large", tags=["docks"]),
    poi("riverside_bonded_warehouse", "The Bonded Warehouse", "aurenhal_riverside", "market",
        "Locked, sealed, and rented by the cubic yard to people who like both.",
        at=(28, 10), minutes=4, trade="warehouse", size="hall",
        desc_key=STORE_HOUSE, services=["market"], tags=["shop", "docks"]),
    poi("riverside_chandlery", "The Chandlery", "aurenhal_riverside", "market",
        "Rope, tar, lamp oil, and every size of nail there is.",
        at=(14, 16), minutes=3, trade="chandler", desc_key=STORE,
        services=["market"], tags=["shop"]),
    poi("riverside_boatyard", "The Boatyard", "aurenhal_riverside", "market",
        "River barges on the stocks, and one sea-going hull that will never fit "
        "under the bridge.", at=(30, 16), minutes=4, trade="boathouse",
        size="large", desc_key=WORKSHOP, services=["market"], tags=["shop"]),
    poi("riverside_fishmarket", "The Fish Market", "aurenhal_riverside", "market",
        "Loud from before dawn, over by nine, and washed down by ten.",
        at=(24, 20), minutes=2, interior=False, services=["market"], tags=["shop"]),
    poi("riverside_ferrymans_rest", "The Ferryman's Rest", "aurenhal_riverside", "settlement",
        "Beds for boatmen, and a landlord who wakes you for the tide whether "
        "you asked or not.", at=(12, 22), minutes=3, trade="inn",
        desc_key=INN, services=["inn"], tags=["inn"]),
    poi("riverside_watergate_shrine", "The Watergate Shrine", "aurenhal_riverside", "shrine",
        "A niche in the wall, a shelf of offerings, and a very old stain of "
        "candle-wax.", at=(34, 24), minutes=2, interior=False,
        services=["temple"], tags=["shrine"]),
    _house("riverside_house_a", "The Wharfinger's House", "aurenhal_riverside",
           "Best window in the district and it looks directly at a warehouse "
           "wall.", (20, 26)),
    _house("riverside_house_b", "Netmenders' Row", "aurenhal_riverside",
           "One long building divided eight ways, with the nets hung outside "
           "all of them.", (8, 28)),
    poi("riverside_undercity_grate", "The Undercity Grate", "aurenhal_riverside",
        "dungeonEntrance",
        "Where the city's drains meet the river. It is not locked, which "
        "should tell you something.", at=(36, 8), minutes=6,
        dungeon="aurenhal_undercity", tags=["dungeon"]),

    # ================= Aurenhal — The Warrens =================
    poi("warrens_thieves_market", "The Thieves' Market", "aurenhal_warrens", "market",
        "It has another name on the ward map. Nobody uses it.",
        at=(20, 12), minutes=3, interior=False, services=["market"], tags=["shop"]),
    poi("warrens_pawnbroker", "Three Balls, Anchor Lane", "aurenhal_warrens", "market",
        "Everything in the window was somebody's, once, and briefly.",
        at=(14, 16), minutes=3, trade="shop", size="small", desc_key=STORE,
        services=["market"], tags=["shop"]),
    poi("warrens_the_leaning_man", "The Leaning Man", "aurenhal_warrens", "settlement",
        "The floor slopes, the stairs slope, and the landlord insists it is "
        "the customers.", at=(26, 16), minutes=3, trade="inn",
        desc_key=INN, services=["inn"], tags=["inn"]),
    poi("warrens_bone_alley_shrine", "The Bone Alley Shrine", "aurenhal_warrens", "shrine",
        "Somebody keeps a light burning here and nobody will say who.",
        at=(30, 22), minutes=2, interior=False, services=["temple"], tags=["shrine"]),
    poi("warrens_ratcatchers_guild", "The Ratcatchers' Guild", "aurenhal_warrens", "market",
        "A real guild, with a charter, and rather more to do than the name "
        "suggests.", at=(10, 22), minutes=3, trade="guild",
        services=["guild"], tags=["shop"]),
    poi("warrens_old_gaol", "The Old Gaol", "aurenhal_warrens", "ruin",
        "Emptied after the fire and never quite abandoned.",
        at=(34, 12), minutes=5, trade="gaol", size="large", tags=["ruin"]),
    poi("warrens_cellar_stair", "The Cellar Stair", "aurenhal_warrens", "dungeonEntrance",
        "Behind a wine-shop that is not a wine-shop, a stair down into what "
        "the Warrens were built on top of.", at=(18, 26), minutes=6,
        hidden=True, discover=("perception", 13),
        dungeon="warren_cellars", tags=["dungeon", "secret"]),
    _house("warrens_house_a", "Kettle Yard", "aurenhal_warrens",
           "Six families, one pump, and a yard that is nobody's job.", (22, 26)),
    _house("warrens_house_b", "The Nunnery", "aurenhal_warrens",
           "It has not been one for two hundred years and the name has outlived "
           "three rebuildings.", (8, 14)),
    _house("warrens_house_c", "Dogleg Lane", "aurenhal_warrens",
           "The lane is why. The house is incidental.", (28, 28)),

    # ================= Wraymill =================
    poi("wraymill_great_mill", "The Great Mill", "kingsvale_wraymill", "landmark",
        "Four storeys of shaking timber over a wheel you can hear from the "
        "bridge.", at=(20, 8), minutes=5, trade="mill", size="hall",
        desc_key=MILL, services=["market"], tags=["shop"]),
    poi("wraymill_grain_market", "The Grain Market", "kingsvale_wraymill", "market",
        "Sacks, scales, and men arguing about moisture.",
        at=(20, 14), minutes=3, interior=False, services=["market"], tags=["shop"]),
    poi("wraymill_smithy", "Wraymill Smithy", "kingsvale_wraymill", "market",
        "Millwork, mostly: gudgeons, bands, and the endless small iron of "
        "machines that shake.", at=(14, 12), minutes=3, trade="smithy",
        desc_key=SMITHY, services=["smith"], tags=["shop"]),
    poi("wraymill_the_wheel_and_sheaf", "The Wheel and Sheaf", "kingsvale_wraymill",
        "settlement",
        "The only inn, and it knows it.", at=(26, 12), minutes=3,
        trade="inn", size="large", desc_key=INN, services=["inn"], tags=["inn"]),
    poi("wraymill_store", "Barrow's Provisions", "kingsvale_wraymill", "market",
        "Everything a carter needs to get to Aurenhal and back.",
        at=(24, 18), minutes=3, trade="shop", desc_key=STORE,
        services=["market"], tags=["shop"]),
    poi("wraymill_temple", "The Wraymill Chapel", "kingsvale_wraymill", "shrine",
        "Small, flint-built, and very cold in Deepdark.", at=(12, 18),
        minutes=3, trade="temple", desc_key=TEMPLE, services=["temple"], tags=["shrine"]),
    poi("wraymill_stables", "Coaching Stables", "kingsvale_wraymill", "settlement",
        "Change here for Aurenhal, Cobbleway, or a long wait.",
        at=(30, 16), minutes=3, trade="stable", desc_key=STABLE,
        services=["stable"], tags=[]),
    poi("wraymill_brewery", "The Wraymill Brewery", "kingsvale_wraymill", "market",
        "Uses the same leat as the mills, three hundred yards further down, "
        "which is a subject of correspondence.", at=(16, 22), minutes=3,
        trade="brewery", size="large", desc_key=WORKSHOP, services=["market"], tags=["shop"]),
    poi("wraymill_weaver", "The Weaving Shed", "kingsvale_wraymill", "market",
        "Nine looms, and the noise of nine looms.", at=(28, 22),
        minutes=3, trade="weaver", desc_key=WORKSHOP, services=["market"], tags=["shop"]),
    _house("wraymill_house_a", "Millers' Row", "kingsvale_wraymill",
           "Built by the mill, rented from the mill, and dusted daily by the "
           "mill.", (20, 22)),
    _house("wraymill_house_b", "The Reeve's House", "kingsvale_wraymill",
           "Stone below, timber above, and the only slate roof in the town.",
           (10, 8)),

    # ================= Hollowdene (the starting village) =================
    poi("hollowdene_green", "Hollowdene Green", "kingsvale_hollowdene", "settlement",
        "Grass, a whipping-post nobody uses, and the well. Everything in the "
        "village faces it.", at=(15, 10), minutes=1, interior=False,
        services=["inn"], tags=["start"]),
    poi("hollowdene_well", "The Hollow Well", "kingsvale_hollowdene", "landmark",
        "Deeper than it needs to be, and cold all year.", at=(15, 12),
        minutes=1, interior=False, tags=[]),
    poi("hollowdene_smithy", "Hollowdene Smithy", "kingsvale_hollowdene", "market",
        "Shoes, hinges, and the occasional argument about a bill.",
        at=(10, 8), minutes=2, trade="smithy", desc_key=SMITHY,
        services=["smith"], tags=["shop"]),
    poi("hollowdene_store", "The Village Store", "kingsvale_hollowdene", "market",
        "Salt, nails, thread, lamp oil, and gossip at no extra charge.",
        at=(20, 8), minutes=2, trade="shop", size="small", desc_key=STORE,
        services=["market"], tags=["shop"]),
    poi("hollowdene_the_ploughshare", "The Ploughshare", "kingsvale_hollowdene", "settlement",
        "Four tables, one fire, and beds upstairs if you do not mind the roof "
        "being close.", at=(20, 14), minutes=2, trade="inn",
        desc_key=INN, services=["inn"], tags=["inn"]),
    poi("hollowdene_chapel", "Hollowdene Chapel", "kingsvale_hollowdene", "shrine",
        "One room, one bell, and a churchyard that has been filling slowly for "
        "six hundred years.", at=(10, 14), minutes=2, trade="temple",
        size="small", desc_key=TEMPLE, services=["temple"], tags=["shrine"]),
    _house("hollowdene_house_a", "Redding's Farm", "kingsvale_hollowdene",
           "The biggest holding in the parish, which is not saying a great "
           "deal.", (24, 5)),
    _house("hollowdene_house_b", "The Cottage on the Green", "kingsvale_hollowdene",
           "Thatch down to the window-tops and a garden doing better than the "
           "house.", (6, 12)),
    _house("hollowdene_house_c", "Wold's", "kingsvale_hollowdene",
           "Two rooms, a lean-to, and a dog with strong opinions.", (24, 16)),
    poi("hollowdene_old_barrow", "The Dene Barrow", "kingsvale_hollowdene", "dungeonEntrance",
        "A mound at the top of the sheep field with a stone doorway in the "
        "side, and the village has always told children to stay off it.",
        at=(27, 3), minutes=15, dungeon="dene_barrow", tags=["dungeon", "barrow"]),

    # ================= Ashcott =================
    poi("ashcott_green", "Ashcott Lane", "kingsvale_ashcott", "settlement",
        "Not a green so much as a wide place in the lane, but it does the same "
        "job.", at=(15, 10), minutes=1, interior=False, services=["inn"], tags=[]),
    poi("ashcott_woolhouse", "The Wool House", "kingsvale_ashcott", "market",
        "Fleeces graded, weighed, and argued over from Reaping to Winnow.",
        at=(11, 8), minutes=2, trade="warehouse", desc_key=STORE_HOUSE,
        services=["market"], tags=["shop"]),
    poi("ashcott_smithy", "Ashcott Forge", "kingsvale_ashcott", "market",
        "Shears, mostly, and the mending of shears.", at=(20, 8),
        minutes=2, trade="smithy", size="small", desc_key=SMITHY,
        services=["smith"], tags=["shop"]),
    poi("ashcott_the_shepherds_rest", "The Shepherd's Rest", "kingsvale_ashcott",
        "settlement", "Two rooms to let and a landlady who counts the spoons.",
        at=(20, 14), minutes=2, trade="inn", size="small", desc_key=INN,
        services=["inn"], tags=["inn"]),
    _house("ashcott_house_a", "Long Hedge Farm", "kingsvale_ashcott",
           "Named for the hedge, which is genuinely remarkable and predates the "
           "farm.", (25, 6)),
    _house("ashcott_house_b", "The Sexton's Cottage", "kingsvale_ashcott",
           "Nearest house to the chapel, for reasons of convenience nobody "
           "enjoys.", (8, 14)),
    poi("ashcott_hedge_maze", "The Long Hedge", "kingsvale_ashcott", "landmark",
        "Laid nine generations back and never once let through. It is a mile "
        "long and it goes where it wants.", at=(27, 16), minutes=10,
        interior=False, tags=[]),

    # ================= Pennyford =================
    poi("pennyford_ford", "The Ford", "kingsvale_pennyford", "crossing",
        "Paved bottom, marker posts, and a depth board that has been optimistic "
        "since the sluice went in.", at=(15, 6), minutes=3,
        interior=False, gate="pennyford_sluice", tags=["crossing"]),
    poi("pennyford_sluice_house", "The Sluice House", "kingsvale_pennyford", "landmark",
        "Winches, a chain, and a keeper's room with a very good view of the "
        "river doing whatever it likes.", at=(12, 6), minutes=3,
        trade="hall", size="small", tags=[]),
    poi("pennyford_store", "Ford Stores", "kingsvale_pennyford", "market",
        "Sells rope and dry stockings, in that order of profitability.",
        at=(18, 12), minutes=2, trade="shop", size="small", desc_key=STORE,
        services=["market"], tags=["shop"]),
    poi("pennyford_the_drowned_ox", "The Drowned Ox", "kingsvale_pennyford", "settlement",
        "Named after an incident the landlord will describe at length.",
        at=(12, 14), minutes=2, trade="inn", desc_key=INN,
        services=["inn"], tags=["inn"]),
    _house("pennyford_house_a", "The Keeper's Cottage", "kingsvale_pennyford",
           "Close enough to the water to hear it change.", (22, 8)),
    _house("pennyford_house_b", "Eel House", "kingsvale_pennyford",
           "Traps stacked to the eaves and a smell that never entirely leaves.",
           (8, 10)),

    # ================= the country =================
    poi("weirwater_nine_arches", "The Nine Arches", "kingsvale_weirwater_crossing",
        "crossing",
        "The bridge. Two of its arches were rebuilt after the flood and do not "
        "match, which locals will point out unprompted.",
        at=(25, 17), minutes=5, interior=False, tags=["crossing"]),
    poi("weirwater_toll_house", "The Bridge Toll House", "kingsvale_weirwater_crossing",
        "settlement",
        "Collects for the crown on one side and for the bridge fund on the "
        "other.", at=(29, 17), minutes=3, trade="hall", size="small", tags=[]),
    poi("weirwater_drowned_chapel", "The Drowned Chapel", "kingsvale_weirwater_crossing",
        "ruin",
        "Stands in the water at anything above summer level, and out of it in "
        "Highsun. Nobody has moved the altar.", at=(18, 24), minutes=12,
        trade="temple", size="small", desc_key=TEMPLE, tags=["ruin"]),
    poi("weirwater_eel_camp", "The Eel Camp", "kingsvale_weirwater_crossing", "camp",
        "Half a dozen huts on the bank, occupied in season and left standing "
        "the rest of the year.", at=(38, 22), minutes=15,
        trade="house", size="small", desc_key=HOUSE, tags=["camp"]),

    poi("hedge_country_crossroads", "The Four Hedges", "kingsvale_hedge_country",
        "crossing",
        "Where four lanes meet at an angle none of them intended. There is a "
        "signpost and it has been turned.", at=(25, 17), minutes=4,
        interior=False, tags=["crossing"]),
    poi("hedge_country_wayshrine", "The Hedge Wayshrine", "kingsvale_hedge_country",
        "shrine",
        "A stone hood over a stone shelf, with somebody's flowers in it, "
        "always.", at=(14, 10), minutes=6, interior=False,
        services=["temple"], tags=["shrine"]),
    poi("hedge_country_dovecote", "The Old Dovecote", "kingsvale_hedge_country", "ruin",
        "Round, roofless, and full of nesting boxes going back to stone.",
        at=(36, 12), minutes=10, trade="cave", size="small", tags=["ruin"]),
    poi("hedge_country_badger_hole", "The Badger Hole", "kingsvale_hedge_country",
        "dungeonEntrance",
        "Somebody's terrier went in after something and came out the far side "
        "of the field, which is a longer set than a badger digs.",
        at=(8, 28), minutes=12, hidden=True, discover=("survival", 12),
        dungeon="hedge_setts", tags=["dungeon", "secret"]),

    poi("kingsroad_south_milestone", "The Hundredth Milestone", "kingsvale_kingsroad_south",
        "landmark",
        "Cut with a number and a crown, and leaned on by everybody who gets "
        "this far.", at=(25, 17), minutes=3, interior=False, tags=[]),
    poi("kingsroad_south_posting_house", "The Posting House", "kingsvale_kingsroad_south",
        "settlement",
        "Fresh horses, bad food, and a book you have to sign.",
        at=(32, 12), minutes=6, trade="inn", size="large", desc_key=INN,
        services=["inn", "stable"], tags=["inn"]),
    poi("kingsroad_south_gibbet", "The Gibbet Oak", "kingsvale_kingsroad_south", "landmark",
        "Empty these forty years, and still nobody camps under it.",
        at=(12, 26), minutes=8, interior=False, tags=[]),
    poi("kingsroad_south_quarry", "The Roadstone Quarry", "kingsvale_kingsroad_south",
        "dungeonEntrance",
        "Where the Kingsroad came from. Worked out, flooded at the bottom, and "
        "not entirely empty.", at=(40, 26), minutes=14,
        dungeon="roadstone_quarry", tags=["dungeon"]),

    poi("oxbow_heronry", "The Heronry", "kingsvale_oxbow_meadows", "landmark",
        "Forty nests in a stand of dead alder, and the noise to match.",
        at=(20, 10), minutes=8, interior=False, tags=[]),
    poi("oxbow_withy_beds", "The Withy Beds", "kingsvale_oxbow_meadows", "settlement",
        "Cut every winter for baskets, and impassable every summer.",
        at=(34, 20), minutes=10, interior=False, tags=[]),
    poi("oxbow_sunken_boat", "The Sunken Barge", "kingsvale_oxbow_meadows", "ruin",
        "Went down loaded in somebody's grandfather's time. The ribs still "
        "show at low water.", at=(12, 24), minutes=12, hidden=True,
        discover=("perception", 11), trade="hull", size="small", tags=["ruin", "secret"]),
]

# --- prose ------------------------------------------------------------------

pool("aurendel_opening",
     "Hollowdene, an hour after dawn, in the second week of Greening. The "
     "green is wet, the well is cold, and the road out of the village goes two "
     "ways: east to Aurenhal and the Kingsroad, or west into the hedges and "
     "whatever is past them. Nobody here has asked you for anything. That is "
     "the last time that will be true.",
     "You come down onto Hollowdene green with the whole of the Kingsvale ahead "
     "of you and no particular reason to be in it. There is a well, an inn "
     "called the Ploughshare, a smithy going, and a barrow up the sheep field "
     "that everyone has told you to leave alone. The continent is considerably "
     "larger than this. It starts here anyway.",
     "Morning in Hollowdene. Eleven roofs, one bell, and a road. Aurenhal is a "
     "day east, the coast is a week west, and the ice is further north than "
     "anybody sensible goes. You have boots, forty marks, and the entire "
     "Kingsvale to be wrong about first.")

pool("aurenhal_highgate_desc",
     "The upper city, and it never lets you forget which way is up: the "
     "Kingshold on its rock, the Library's four floors of window, and stairs "
     "wherever a street would rather not climb.",
     "Highgate. Clean paving, clipped hedges, and the particular hush of a "
     "district where most of the doors are somebody's office.",
     "The Kingsroad arrives here and immediately becomes a formal avenue, which "
     "tells you most of what Highgate thinks about itself.",
     "Above the smoke, mostly. On a clear day you can see the Weirwater going "
     "out west between the hedges.")

pool("aurenhal_craftrow_desc",
     "One long street of chimneys. Somebody laid this district out around the "
     "fire risk and the fire risk won.",
     "Craftrow, and you can hear it before you turn into it: hammers on three "
     "different notes and somebody's grinding wheel under all of them.",
     "Soot on the render, sparks going up somewhere behind the roofline, and "
     "every shopfront open to the street.",
     "The trades that need heat, gathered where the wind takes it away from "
     "the rest of the city.")

pool("aurenhal_riverside_desc",
     "Wharf, warehouse, wharf, warehouse, and the Weirwater going past all of "
     "it at a speed the city finds convenient.",
     "Riverside. Cranes, cranes, and men standing about waiting for a tide "
     "that does not come this far up.",
     "The smell is river, tar, and fish in that order, and it changes with the "
     "wind but never entirely.",
     "Half the district is built on piles and the other half wishes it were.")

pool("aurenhal_warrens_desc",
     "The Warrens are older than the wall that was put round them, and the "
     "wall has been losing the argument ever since.",
     "Lanes that were never planned, going where the buildings let them. Two "
     "storeys overhead nearly touch.",
     "Washing across the alley, a light in a shrine nobody admits to keeping, "
     "and about four hundred people who would rather you moved along.",
     "It is not dangerous exactly. It simply has no interest in being legible "
     "to you.")

pool("kingsvale_wraymill_desc",
     "Six mills on one leat, and the whole town shakes very slightly all the "
     "time. You stop noticing by the second hour.",
     "Wraymill: flour in the air, grain on the cobbles, and carts queued from "
     "the market to the bridge.",
     "The leat runs straight through the middle of the town, and everything "
     "worth anything is built along it.",
     "A working town, entirely uninterested in being looked at.")

pool("kingsvale_hollowdene_desc",
     "The green, the well, the chapel, and eleven roofs round the edge of it. "
     "The road goes through Hollowdene rather than to it.",
     "Smoke from the smithy, a dog somewhere, and the bell rope swinging "
     "because somebody knocked it.",
     "Hollowdene is small enough that everyone knows you have arrived and "
     "polite enough not to say so.",
     "Sheep on the hill, a barrow above them that nobody walks on, and the "
     "Ploughshare's door propped open.")

pool("kingsvale_ashcott_desc",
     "One lane, a wool house, and a hedge that is more famous than the "
     "village.",
     "Ashcott. Fleeces stacked under a lean-to and the smell of lanolin over "
     "everything.",
     "A dozen houses strung along a lane that bends for a hedge nobody will "
     "cut.",
     "Sheep country: quiet, well-drained, and boring in the way villages hope "
     "to be.")

pool("kingsvale_pennyford_desc",
     "The ford is the village and the village is the ford. Everything else is "
     "downstream of that fact.",
     "Pennyford: a sluice, a depth board, and a great deal of local opinion "
     "about both.",
     "The river is close, loud, and higher than the board says.",
     "Eel traps stacked against every wall, and boots drying on every step.")

pool("kingsvale_weirwater_crossing_desc",
     "Nine arches over green water, and the Kingsroad going straight across as "
     "though the river were a formality.",
     "The bridge, the toll house, and a great deal of traffic that would "
     "rather not stop.",
     "Willows down both banks, and the drowned chapel standing in the shallows "
     "with its door under water.",
     "Everything in the Kingsvale crosses here eventually.")

pool("kingsvale_hedge_country_desc",
     "Fields inside fields, and hedges laid so long ago that they are "
     "genuinely load-bearing.",
     "Lanes sunk six feet below the fields either side, green over the top, "
     "and no view at all until you climb out.",
     "You can walk all day here and cover four miles, and it will have been "
     "pleasant.",
     "Somebody's cattle, somebody's gate, and a signpost that has been turned "
     "by somebody's children.")

pool("kingsvale_kingsroad_south_desc",
     "Cut stone running dead straight south, with the milestones counting down "
     "to somewhere you have not been.",
     "The Kingsroad. Whatever else the crown has failed at, it kept this up.",
     "Verges wide enough to camp on, drainage that works, and a gibbet oak "
     "about halfway that nobody camps under.",
     "Traffic in both directions, all of it moving faster than you.")

pool("kingsvale_oxbow_meadows_desc",
     "The Weirwater changed course here and left good grazing, bad drainage, "
     "and a great many herons.",
     "Loops of old river, half of them cut off and gone green.",
     "Withy beds, water meadows, and a barge that sank a lifetime ago showing "
     "its ribs at low water.",
     "Flat, wet, loud with birds, and difficult to cross in a straight line.")

# Places that earn their own voice. Declaring a `<poi_id>_desc` pool is all it
# takes — regions.pois() wires it up.

pool("aurenhal_kingshold_desc",
     "A castle that started as a river-fort and has been argued with by every "
     "monarch since: four periods of wall, three of roof, and one staircase "
     "that goes nowhere because somebody died mid-project.",
     "The Kingshold. The curtain wall is honest defensive work; everything "
     "inside it is somebody making a point.",
     "Guards on the gate who have been told to look bored and are managing it "
     "easily. Above them, banners, and above those, jackdaws.")

pool("aurenhal_kingshold_undercroft_desc",
     "Storerooms under the keep: barrels, ledgers, cold. And past the "
     "storerooms, a doorway cut in a wall that predates the castle by three "
     "hundred years.",
     "The undercroft goes back further than the plans do. Somebody surveyed to "
     "the fourth room and then the survey stops.",
     "Down, and then down again. The air changes at the second landing and "
     "does not change back.")

pool("aurenhal_grand_library_desc",
     "Four floors of shelving round a well of open air, with a lantern roof "
     "letting in the only light anybody trusts near the books.",
     "The Grand Library, and a whispering that is entirely staff.",
     "Ladders on rails, chained volumes on the second gallery, and a locked "
     "door on the fourth that everyone has a theory about.")

pool("aurenhal_high_temple_desc",
     "The oldest roof in Aurenhal, and the fire of 'eighty-one went round it "
     "on both sides, which the priesthood has never once let anybody forget.",
     "Pillars going up into dark, and a single light on the altar that is "
     "somebody's whole job.",
     "Cold stone, deep quiet, and six hundred years of feet wearing a channel "
     "up the centre aisle.")

pool("aurenhal_mint_desc",
     "Where marks come from: two doors, both watched, and a courtyard between "
     "them that you cross alone.",
     "The Mint. Nothing about the building is decorative and everything about "
     "it is expensive.",
     "You can hear the presses from the street, which is presumably the "
     "intention.")

pool("craftrow_great_forge_desc",
     "Six hearths under one roof, all lit, and a heat that arrives before you "
     "do.",
     "The Great Forge, where the guild decides whose iron goes on which fire "
     "and in what order.",
     "Hammer-fall on three counts at once, and a supervisor watching the "
     "colour of everything.")

pool("craftrow_market_square_desc",
     "Trestles up at dawn, down at dusk, and a fight about pitches in the "
     "middle of both.",
     "Craftrow Market: tools, findings, seconds, and a man selling very "
     "confident advice.",
     "Awnings, hawkers, and the smell of the tanyard when the wind swings.")

pool("riverside_long_wharf_desc",
     "Half a mile of stone quay, every bollard occupied, and a crane crew "
     "shouting at a barge that has misjudged the current.",
     "The Long Wharf, and the Weirwater going past it at a speed the port "
     "authority describes as convenient.",
     "Cargo out, cargo in, and a clerk at every gangplank counting both.")

pool("riverside_undercity_grate_desc",
     "Where the city's drains meet the river: an arch, an iron grate, and the "
     "grate is standing open.",
     "Cold air comes out of the tunnel even in Highsun. Nobody has ever "
     "explained where from.",
     "The grate has been forced, and then forced back, and then forced again.")

pool("warrens_thieves_market_desc",
     "It is called the Cordwainers' Yard on the ward map, which fools nobody "
     "and is not meant to.",
     "Goods laid on cloth rather than trestles, so the cloth can be gathered "
     "up quickly.",
     "Everything here has a history and none of it is written down.")

pool("warrens_old_gaol_desc",
     "Emptied after the fire and never demolished, because demolishing it "
     "would require somebody to own it.",
     "The doors are gone for the iron. The cells are not, and people sleep in "
     "them.",
     "Soot to the second floor, sky through the third, and the yard full of "
     "elder saplings.")

pool("warrens_cellar_stair_desc",
     "Behind a wine-shop with no wine in it, a stair going down past three "
     "cellars into something the Warrens were built on top of.",
     "The steps are cut, not laid, and they are worn in the middle, which "
     "means traffic.",
     "It smells of river down there, and the river is a quarter mile away.")

pool("wraymill_great_mill_desc",
     "Four storeys of shaking timber over a wheel you can hear from the "
     "bridge, and flour on absolutely everything.",
     "Gears the size of a cart, all wooden, all turning, all a little out of "
     "true.",
     "The Great Mill. Standing inside it is like standing inside a very "
     "patient animal.")

pool("hollowdene_green_desc",
     "Grass, a whipping-post nobody has used in living memory, and the well. "
     "Every roof in Hollowdene faces this.",
     "The green, at the hour when the smithy has been lit and nothing else "
     "has.",
     "Somebody's hens are on the green again and somebody else's problem.",
     "A dozen paces across. Everything that has ever happened in Hollowdene "
     "happened here.")

pool("hollowdene_well_desc",
     "Deeper than a village well needs to be, and cold in a way that suggests "
     "it is fed from further off than the hill.",
     "Windlass, rope, and a bucket that has been replaced more often than the "
     "rope.",
     "You can hear the drop before you hear the splash, and there is more gap "
     "between them than you expected.")

pool("hollowdene_old_barrow_desc",
     "A long mound at the top of the sheep field, with a stone doorway let "
     "into the side of it and the grass worn off the lintel.",
     "The Dene Barrow. Every child in Hollowdene has been told to stay off it "
     "and about half of them have.",
     "The doorway is open. It has always been open. Nothing has ever come out "
     "of it, which the village considers settled.")

pool("ashcott_hedge_maze_desc",
     "Laid nine generations back, never once let through, and now a mile of "
     "thorn thick enough to lean on.",
     "The Long Hedge goes where it wants and takes the lane with it.",
     "You could get over it with a ladder and nobody in Ashcott would forgive "
     "you.")

pool("pennyford_ford_desc",
     "Paved bottom, marker posts, and a depth board that has been optimistic "
     "since the sluice went in.",
     "The ford, running fast and brown, with the far posts further apart than "
     "they should look.",
     "Cart ruts go down into the water on this side and come out on that one. "
     "Between them is a matter of judgement.")

pool("weirwater_nine_arches_desc",
     "Nine arches over green water. Two of them are newer than the rest and do "
     "not match, and every local will tell you why.",
     "The bridge, with traffic in both directions and a toll house at the far "
     "end deciding how fast it goes.",
     "You can look over the parapet at the willows going under and coming out "
     "the other side.")

pool("weirwater_drowned_chapel_desc",
     "Stands in the water at anything above summer level. The door is under, "
     "the windows are not, and the altar has never been moved.",
     "Reeds through the floor and daylight through the roof, and the whole of "
     "it half a foot into the Weirwater.",
     "In Highsun you can walk in dry. It is not Highsun.")

pool("hedge_country_crossroads_desc",
     "Four lanes meeting at an angle none of them intended, with a signpost in "
     "the middle that has been turned.",
     "The Four Hedges. Whichever way you were going, you will now think about "
     "it.",
     "Somebody has scratched a correction into the signpost, and somebody else "
     "has scratched out the correction.")

pool("hedge_country_badger_hole_desc",
     "A hole under a hedge bank, and a terrier once went in after something "
     "and came out the far side of the field, which is a longer set than a "
     "badger digs.",
     "Spoil outside is fresh and there is rather too much of it.",
     "It is a badger hole for about eight feet. After that the walls are cut.")

pool("kingsroad_south_gibbet_desc",
     "One oak, one iron cage, empty these forty years, and nobody camps under "
     "it even in rain.",
     "The Gibbet Oak. The cage still turns in the wind and still creaks doing "
     "it.",
     "Milestones either side, verge wide and dry, and the whole thing "
     "completely unused as a campsite.")

pool("kingsroad_south_quarry_desc",
     "Where the Kingsroad came from: benches cut in white stone, worked out "
     "sixty years ago, flooded at the bottom.",
     "The Roadstone Quarry. Somebody drove galleries into the face when the "
     "open work stopped paying, and those are not flooded.",
     "Spoil heaps gone green, a crane frame gone black, and water at the "
     "bottom of a colour you would not drink.")

pool("kingsroad_south_milestone_desc",
     "Cut with a number and a crown, and polished on one side by everybody who "
     "gets this far and leans on it.",
     "The hundredth stone from Aurenhal. Somebody has added a second number "
     "underneath, in a different hand, counting somewhere else.",
     "It is a stone by a road. It is also, for a great many people, the "
     "furthest they have ever been.")

pool("oxbow_heronry_desc",
     "Forty nests in a stand of dead alder, and the noise carries a mile.",
     "Whitewash down every trunk, fish bones in the grass, and the birds "
     "regarding you without any concern whatsoever.",
     "The trees died of the herons. The herons are not finished.")

pool("oxbow_sunken_boat_desc",
     "Went down loaded, in somebody's grandfather's time. The ribs still show "
     "at low water and the cargo was never got out.",
     "A barge on its side in four feet of water, silted to the gunwale on the "
     "upstream flank.",
     "Willow has gone through the deck. There is still a hold under it.")

# Why a barred way is barred. A gate with a `blockedTextKey` says so in its own
# words; without one the play layer falls back to listing the requirement.

pool("aurenhal_kings_gate_blocked",
     "The clerk does not look up. \"Five marks the party, or the ledger, and "
     "the ledger takes longer.\"",
     "A halberd comes down across the arch, unhurriedly. \"Toll.\"",
     "\"Five marks,\" says the gate-clerk, \"and before you ask, yes, "
     "everyone.\"")

pool("aurenhal_river_gate_blocked",
     "\"Three marks or a wharfinger's chit,\" says the man on the arch, "
     "\"and you have not got a chit.\"",
     "The chain across the water gate stays where it is. Somebody points at a "
     "board with a number on it.",
     "\"Wharf dues,\" says the collector, already holding out a hand.")

pool("kingshold_undercroft_blocked",
     "The door is iron-banded oak and it has been shut a long time by somebody "
     "who meant it.",
     "There is a lock, and above the lock a steward's seal, and the seal is "
     "not yours to break.",
     "Locked, and the hinges have been kept oiled, which is the part you do "
     "not like.")

pool("pennyford_sluice_blocked",
     "The sluice is down and the channel below it is running full and brown.",
     "The gate is shut and the water is going over the top of it, which is not "
     "how it is supposed to work.",
     "You could get across. You would not enjoy it and you would not stay dry.")


# --- what is under the Kingsvale --------------------------------------------

DUNGEONS = [
    dungeon("dene_barrow", "The Dene Barrow", "dungeon_barrow",
            "A long barrow above Hollowdene: an entrance passage, side cists, "
            "and a chamber at the end that the whole mound was raised over.",
            rooms="6", depth="1", corridorLength="2d3",
            roomSize="2d2+3"),
    dungeon("hedge_setts", "The Hedge Setts", "dungeon_cave",
            "Badger workings that go on rather too long and end in something "
            "that was cut with tools.",
            rooms="7", depth="1", algorithm="caverns", caverns={"fill": 0.46, "smoothingPasses": 4, "birthThreshold": 5}),
    dungeon("roadstone_quarry", "The Roadstone Galleries", "dungeon_delved",
            "Galleries driven into the quarry face when the open work stopped "
            "paying, and abandoned when the water came in.",
            rooms="11", depth="2", algorithm="bsp", bsp={"minLeaf": 6}),
    dungeon("aurenhal_undercity", "The Aurenhal Undercity", "dungeon_sewer",
            "The city's drains, and beneath them the streets they were cut "
            "through — three centuries of Aurenhal built on top of itself.",
            rooms="14", depth="2", branchiness=0.5,
            corridor={"style": "l", "width": 2}),
    dungeon("warren_cellars", "The Warren Cellars", "dungeon_delved",
            "Cellar under cellar under cellar, connected by people who did not "
            "want the connections known about.",
            rooms="10", depth="2", branchiness=0.55,
            corridorLength="2d2", roomSize="2d2+2"),
    dungeon("kingshold_undercroft", "The Kingshold Undercroft", "dungeon_delved",
            "Storerooms, and past the storerooms the river-fort the castle was "
            "built on, which nobody has surveyed past the fourth room.",
            rooms="13", depth="3", branchiness=0.3,
            winding={"continueChance": 0.7, "turnPenalty": 0.35}),
]

BIOME_ROOMS = {}
ROOM_TEMPLATES = []
TRAPS = []
