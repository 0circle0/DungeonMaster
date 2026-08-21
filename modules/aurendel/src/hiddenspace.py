"""The empty half of Aurendel, frozen."""

EMPTY = {
    # levels 9–10
    "deeproads": [
        "deeproads_black_bridge",  # The Black Bridge
        "deeproads_broken_stair",  # The Broken Stair
        "deeproads_the_deep_market_road",  # The Deep Market Road
        "deeproads_the_sunless_river",  # The Sunless River
        "deeproads_the_weeping_vault",  # The Weeping Vault
    ],
    # levels 3–4
    "duskwood": [
        "duskwood_fenny_cross",  # Fenny Cross
        "duskwood_moot_road",  # The Moot Road
        "duskwood_rooksrest",  # Rooksrest
        "duskwood_the_greenway",  # The Greenway
        "duskwood_the_undereaves",  # The Undereaves
    ],
    # levels 7–8
    "ember_reach": [
        "ember_obsidian_shelf",  # The Obsidian Shelf
        "ember_slagfoot",  # Slagfoot
        "ember_smoking_road",  # The Smoking Road
        "ember_the_ashfall",  # The Ashfall
        "ember_the_burnt_march",  # The Burnt March
    ],
    # levels 8–9
    "frostmere": [
        "frostmere_bone_strand",  # The Bone Strand
        "frostmere_glass_ice",  # The Glass Ice
        "frostmere_rimewatch_shore",  # The Rimewatch Shore
        "frostmere_whalebone_landing",  # Whalebone Landing
        "frostmere_wind_scoured_flats",  # The Wind-Scoured Flats
    ],
    # levels 6–7
    "glasslands": [
        "glasslands_dry_cistern",  # Dry Cistern
        "glasslands_saltrun",  # Saltrun
        "glasslands_shifting_dunes",  # The Shifting Dunes
        "glasslands_the_fulgurite",  # The Fulgurite Fields
        "vashta_qal_glass_quarter",  # Vashta Qal — The Glass Quarter
        "vashta_qal_oasis",  # Vashta Qal — The Oasis
    ],
    # levels 1–2
    "kingsvale": [
        "aurenhal_craftrow",  # Aurenhal — Craftrow
        "aurenhal_riverside",  # Aurenhal — Riverside
        "kingsvale_ashcott",  # Ashcott
        "kingsvale_kingsroad_south",  # The Kingsroad, South Reach
        "kingsvale_pennyford",  # Pennyford
        "kingsvale_wraymill",  # Wraymill
    ],
    # levels 2–3
    "silver_coast": [
        "coast_chalk_downs",  # The Chalk Downs
        "coast_cobbleway",  # Cobbleway
        "coast_gannet_head",  # Gannet Head
        "coast_gullmere",  # Gullmere
        "coast_thrift",  # Thrift
        "sarnport_harbourside",  # Sarnport — Harbourside
    ],
    # levels 4–5
    "skarnspine": [
        "skarnspine_broken_road",  # The Broken Road
        "skarnspine_cold_shoulder",  # The Cold Shoulder
        "skarnspine_ironstair",  # The Ironstair
        "skarnspine_snowgate",  # Snowgate
    ],
    # levels 5–6
    "sundered_isles": [
        "isles_cormorant",  # Cormorant
        "isles_halfmast",  # Halfmast
        "isles_tern_bank",  # Tern Bank
        "isles_the_narrows",  # The Narrows
        "isles_wreck_reef",  # Wreck Reef
    ],
    # levels 3–5
    "sunward_steppe": [
        "steppe_dry_river",  # The Dry River
        "steppe_horse_road",  # The Horse Road
        "steppe_tallgrass",  # Tallgrass
        "steppe_the_south_reach",  # The South Reach
        "steppe_windbreak",  # The Windbreak
    ],
    # levels 5–7
    "thornmere": [
        "thornmere_cypress_maze",  # The Cypress Maze
        "thornmere_leech_channels",  # The Leech Channels
        "thornmere_reedy_bottom",  # Reedy Bottom
        "thornmere_sunken_causeway",  # The Sunken Causeway
        "thornmere_the_hummocks",  # The Hummocks
    ],
    # levels 4–5
    "weeping_moor": [
        "moor_colders_hearth",  # Colder's Hearth
        "moor_heatherlands",  # The Heatherlands
        "moor_kestrel_edge",  # Kestrel Edge
        "moor_mirestead",  # Mirestead
    ],}


def areas():
    """Every empty area, flat."""
    return [a for group in EMPTY.values() for a in group]


def region_of(area_id):
    for region, group in EMPTY.items():
        if area_id in group:
            return region
    return None
