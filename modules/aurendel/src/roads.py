"""The roads between the regions.

Region files own the lanes inside a region; the highways that stitch the continent together live
here, in one table, because that is the only way to see whether the map is connected.

Times are in minutes and long on purpose: the engine spends them on `advanceTime` before the
destination is entered (reduce.ts).

Geography, so the table can be checked against something:

              Frostmere
                  |
    Duskwood — Skarnspine — Weeping Moor
        |          |             |
  Silver Coast — Kingsvale — Ember Reach
        |          |             |
   Sundered — Thornmere ————————-+
    Isles         |
                  |
            Sunward Steppe
                  |
             Glasslands

The Deeproads run underneath all of it and surface in four places.
"""

EDGES = [
    # -- the western roads -------------------------------------------------
    ("kingsvale_hedge_country", "coast_chalk_downs", 180),
    ("kingsvale_wraymill", "coast_cobbleway", 200),

    # -- into the Duskwood -------------------------------------------------
    ("kingsvale_wraymill", "duskwood_the_undereaves", 150),
    ("coast_thrift", "duskwood_fenny_cross", 160),

    # -- north to the mountains --------------------------------------------
    ("kingsvale_weirwater_crossing", "skarnspine_broken_road", 210),
    ("duskwood_thornback_ride", "skarnspine_broken_road", 190),

    # -- and past them into the ice ----------------------------------------
    ("skarnspine_cold_shoulder", "frostmere_cairnhold", 240,
     {"gate": "frostmere_ice_road"}),
    ("frostmere_rimewatch_shore", "coast_gannet_head", 300,
     {"gate": "frostmere_north_passage"}),

    # -- the north-east ----------------------------------------------------
    ("kingsvale_oxbow_meadows", "moor_kestrel_edge", 200),
    ("skarnspine_weirwater_head", "moor_heatherlands", 220),

    # -- the east ----------------------------------------------------------
    ("moor_the_long_barrow", "ember_firewatch_ridge", 210),
    ("kingsvale_ashcott", "ember_the_burnt_march", 230),

    # -- the south-east ----------------------------------------------------
    ("ember_vent_fields", "thornmere_sunken_causeway", 220),
    ("kingsvale_kingsroad_south", "thornmere_sunken_causeway", 240),

    # -- the south ---------------------------------------------------------
    ("kingsvale_kingsroad_south", "steppe_horse_road", 200),
    ("thornmere_reedy_bottom", "steppe_windbreak", 200),

    # -- the far south -----------------------------------------------------
    ("steppe_the_south_reach", "glasslands_sunken_road", 240),

    # -- the isles, which you only reach by water --------------------------
    ("coast_wreckers_strand", "isles_the_narrows", 180, {"gate": "isles_passage"}),
    ("thornmere_drowned_bell", "isles_halfmast", 220, {"gate": "isles_passage"}),

    # -- and the ways down -------------------------------------------------
    ("karn_dolur_forgetiers", "deeproads_the_long_hall", 90,
     {"gate": "deeproads_deep_gate"}),
    ("moor_black_tarn", "deeproads_the_weeping_vault", 120,
     {"gate": "deeproads_tarn_shaft"}),
    ("glasslands_the_crater", "deeproads_echo_halls", 150),
    ("ember_obsidian_shelf", "deeproads_broken_stair", 130),
]
