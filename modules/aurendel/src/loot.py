"""Aurendel — what drops, what is on the shelf, and what wanders the roads.

Three things here that are easy to get wrong and invisible when you do:

  * `entries` is a **weighted wrapper** — `{"weight": n, "value": {...}}` — not
    a bare loot entry. The schema will tell you, at least.
  * An encounter table consulted on the overworld is passed **no depth**, so it
    defaults to 0. A table with `minDepth` above zero never fires outside a
    dungeon, silently.
  * `roomTemplate.encounterChance` is 0 on all fifty-six of Aurendel's
    templates and `world.generationDefaults.encounterChance` is 0 too, so a
    dungeon stays empty however many monsters exist. `encounters.py` raises it
    on the biomes the questline actually crosses and leaves the rest of the
    continent quiet.
"""


def w(weight, item, quantity="1", **kw):
    entry = {"item": item, "quantity": quantity}
    entry.update(kw)
    return {"weight": weight, "value": entry}


def table(tid, entries, *, rolls="1", empty=0.0, name=None, bonus_skill=None):
    out = {"id": tid, "entries": entries, "rolls": rolls, "emptyChance": empty}
    if name:
        out["name"] = name
    if bonus_skill:
        out["bonusRollSkill"] = bonus_skill
        out["bonusRolls"] = {"onSuccess": 1, "onCritical": 2}
    return out


LOOT_TABLES = [
    # -- what ordinary things leave --------------------------------------
    table("vermin_scraps", [w(6, "old_coin"), w(2, "bandages")], empty=0.55),
    table("barrow_scraps", [
        w(5, "old_coin"), w(3, "wight_ash"), w(2, "bandages"),
        w(1, "barrow_torc"),
    ], empty=0.35, bonus_skill="perception"),
    table("wood_scraps", [w(5, "old_coin"), w(3, "amber_lump"), w(2, "antidote")],
          empty=0.4, bonus_skill="survival"),
    table("ember_scraps", [w(5, "iron_ore", "1d3"), w(3, "glass_bead"),
                           w(2, "old_coin")], empty=0.4),
    table("deep_scraps", [w(5, "fungus_cap", "1d4"), w(3, "hold_silver"),
                          w(2, "healing_draught")], empty=0.35,
          bonus_skill="survival"),

    # -- act payoffs ------------------------------------------------------
    table("door_warden_hoard", [
        w(4, "barrow_torc"), w(3, "warded_coat"), w(3, "healing_draught", "1d2"),
        w(2, "old_coin", "2d4"),
    ], rolls="2", name="The Door-Warden's Cist"),
    table("sisters_hoard", [
        w(4, "barrow_torc"), w(3, "ward_salt", "1d2"), w(2, "amber_lump"),
        w(2, "healing_draught"),
    ], rolls="2", name="Beneath the Sisters"),
    table("kurgan_hoard", [
        w(4, "hold_silver", "1d3"), w(3, "barrow_torc"), w(2, "ring_mail"),
        w(2, "healing_draught"),
    ], rolls="2", name="The Great Kurgan"),
    table("glass_hoard", [
        w(4, "glass_bead", "1d4"), w(3, "warded_coat"), w(2, "healing_draught"),
    ], rolls="2", name="The Crater Deep"),
    table("ninth_door_hoard", [
        w(4, "barrow_torc", "1d3"), w(3, "hold_silver", "1d3"),
        w(3, "healing_draught", "1d3"), w(2, "warded_coat"),
    ], rolls="3", name="Behind the Ninth Door"),

    # -- the silvered blade, once, and only for somebody who could use it --
    table("silvered_cache", [
        # `unique` removes it from the table for good rather than rolling and
        # discarding, so the odds shown are the odds experienced.
        w(1, "silvered_blade", unique=True,
          requires={"description": "somebody who would know what it is",
                    "skills": [{"skill": "lore", "minRank": 1}]},
          requirementScope="anyMember"),
    ], empty=0.5, name="A Silvered Cache"),
    table("warden_blade_cache", [
        w(1, "warden_blade", unique=True),
    ], name="The Ninth Blade"),

    # -- shop stock, rolled fresh each day from the run's seed -------------
    table("hollowdene_stock", [
        w(5, "bandages", "1d3"), w(3, "iron_sword"), w(3, "leather_jerkin"),
        w(2, "boar_spear"), w(2, "healing_draught"),
    ], rolls="3", name="The Village Store"),
    table("aurenhal_stock", [
        w(5, "healing_draught", "1d2"), w(4, "ring_mail"), w(3, "iron_sword"),
        w(3, "hunting_bow"), w(2, "antidote", "1d2"), w(1, "warded_coat"),
    ], rolls="4", name="Craftrow Stock"),
    table("keeper_stock", [
        w(5, "ward_salt", "1d2"), w(4, "antidote"), w(3, "healing_draught"),
        w(2, "iron_mace"), w(1, "silvered_blade"),
    ], rolls="3", name="What the Keepers Will Part With"),
    table("deep_stock", [
        w(5, "healing_draught", "1d2"), w(4, "fungus_cap", "1d4"),
        w(3, "ring_mail"), w(2, "warded_coat"), w(2, "antidote"),
    ], rolls="3", name="The Deep Stores"),
]


# --- encounters -----------------------------------------------------------
# `minDepth: 0` throughout: area and POI entry pass no depth, so anything
# higher never fires above ground.

def group(gid, entries, *, weight=1, hostile=True, requires=None):
    out = {"id": gid, "weight": weight, "hostile": hostile,
           "entries": [{"monster": m, "count": c, "scaleWithLevel": s}
                       for m, c, s in entries]}
    if requires:
        out["requires"] = requires
    return out


def encounters(eid, groups, *, chance=0.35, empty=6, scale=3, max_depth=999):
    return {"id": eid, "minDepth": 0, "maxDepth": max_depth, "chance": chance,
            "emptyWeight": empty, "scalePerLevels": scale, "groups": groups}


ENCOUNTER_TABLES = [
    encounters("kingsvale_wanderers", [
        group("rats", [("barrow_rat", "1d3", True)], weight=6),
        group("a_hound", [("grave_hound", "1", False)], weight=2),
    ], chance=0.25, empty=10),

    encounters("barrow_things", [
        group("rats", [("barrow_rat", "1d4", True)], weight=5),
        group("hounds", [("grave_hound", "1d2", True)], weight=4),
        group("warden", [("door_warden", "1", False)], weight=1,
              requires={"minLevel": 3}),
    ], chance=0.5, empty=4),

    encounters("duskwood_things", [
        group("thorns", [("thorn_thing", "1d2", True)], weight=5),
        group("walkers", [("hollow_walker", "1", True)], weight=3),
    ], chance=0.4, empty=5),

    encounters("moor_things", [
        group("hounds", [("grave_hound", "1d2", True)], weight=4),
        group("walkers", [("hollow_walker", "1d2", True)], weight=4),
        group("shade", [("sister_shade", "1", False)], weight=1,
              requires={"minLevel": 5}),
    ], chance=0.45, empty=4),

    encounters("ember_things", [
        group("crawlers", [("slag_crawler", "1d2", True)], weight=5),
        group("walkers", [("hollow_walker", "1", True)], weight=2),
    ], chance=0.45, empty=4),

    encounters("steppe_things", [
        group("hounds", [("grave_hound", "1d2", True)], weight=4),
        group("riders", [("kurgan_rider", "1", True)], weight=2,
              requires={"minLevel": 4}),
    ], chance=0.4, empty=5),

    encounters("glasslands_things", [
        group("glass", [("glass_thing", "1d2", True)], weight=5),
        group("crawlers", [("slag_crawler", "1", True)], weight=2),
    ], chance=0.4, empty=5),

    encounters("deeproads_things", [
        group("fungal", [("fungal_horror", "1", True)], weight=4),
        group("rime", [("rime_shade", "1d2", True)], weight=4),
        group("both", [("fungal_horror", "1", False), ("rime_shade", "1", True)],
              weight=2, requires={"minLevel": 7}),
    ], chance=0.5, empty=3),

    # Boss tables are consulted only where a room template says
    # `alwaysEncounter`, and there is exactly one such room per dungeon.
    # The Dene Barrow is the first dungeon a level-1 party sees, so its boss
    # room holds hounds. The Door-Warden itself waits under the Kingshold,
    # three quests later, by which point the party is level 3.
    # `1d2`, not `1d2+1`. Three hounds wipes a level-1 party of four in two
    # seeds out of three — measured, not guessed — and this is the climax of
    # the first quest in the game, fought at level 1 with iron.
    encounters("the_barrow_pack", [
        group("pack", [("grave_hound", "1d2", False)])], chance=1, empty=0),
    encounters("the_door_warden", [
        group("warden", [("door_warden", "1", False)])], chance=1, empty=0),
    encounters("the_sisters_shade", [
        group("shade", [("sister_shade", "1", False)])], chance=1, empty=0),
    encounters("the_kurgan_rider", [
        group("rider", [("kurgan_rider", "1", False)])], chance=1, empty=0),
    encounters("the_glass_thing", [
        group("glass", [("glass_thing", "1", False)])], chance=1, empty=0),
    encounters("the_keeper_of_the_ninth", [
        group("keeper", [("door_keeper", "1", False)])], chance=1, empty=0),
]


# --- where all of that gets attached --------------------------------------
# Only the biomes and areas the questline crosses. The rest of the continent
# stays as empty as it was, which is what "questline-scoped" means.

BIOME_ENCOUNTERS = {
    "vale": ["kingsvale_wanderers"],
    "deepwood": ["duskwood_things"],
    "moor": ["moor_things"],
    "volcanic": ["ember_things"],
    "steppe": ["steppe_things"],
    "desert": ["glasslands_things"],
    "underdeep": ["deeproads_things"],
    "dungeon_barrow": ["barrow_things"],
    "dungeon_delved": ["deeproads_things"],
    "dungeon_ruin": ["duskwood_things"],
    "dungeon_ember": ["ember_things"],
    "dungeon_sewer": ["barrow_things"],
    "dungeon_cave": ["deeproads_things"],
}

BIOME_LOOT = {
    "dungeon_barrow": ["barrow_scraps"],
    "dungeon_delved": ["deep_scraps"],
    "dungeon_ruin": ["wood_scraps"],
    "dungeon_ember": ["ember_scraps"],
    "dungeon_sewer": ["vermin_scraps"],
    "dungeon_cave": ["deep_scraps"],
}

# Wilderness areas the questline sends you across, so the road is not empty.
AREA_ENCOUNTERS = {
    "kingsvale_hedge_country": ["kingsvale_wanderers"],
    "kingsvale_kingsroad_south": ["kingsvale_wanderers"],
    "duskwood_witchwood": ["duskwood_things"],
    "duskwood_thornback_ride": ["duskwood_things"],
    "moor_nine_sisters": ["moor_things"],
    "moor_the_long_barrow": ["moor_things"],
    "ember_vent_fields": ["ember_things"],
    "ember_obsidian_shelf": ["ember_things"],
    "steppe_kurgan_field": ["steppe_things"],
    "glasslands_the_crater": ["glasslands_things"],
    "deeproads_the_long_hall": ["deeproads_things"],
    "deeproads_echo_halls": ["deeproads_things"],
    "deeproads_the_weeping_vault": ["deeproads_things"],
}

# Which dungeon's boss room draws from which table.
DUNGEON_BOSSES = {
    "dene_barrow": "the_barrow_pack",
    "kingshold_undercroft": "the_door_warden",
    "moor_beneath_sisters": "the_sisters_shade",
    "steppe_great_kurgan": "the_kurgan_rider",
    "glasslands_centre_shaft": "the_glass_thing",
    "deeproads_ninth_door": "the_keeper_of_the_ninth",
}

# Room templates in these biomes stop being empty. Everything else on the
# continent keeps its zero and stays quiet.
LIVE_ROOM_BIOMES = {
    "dungeon_barrow", "dungeon_delved", "dungeon_ruin",
    "dungeon_ember", "dungeon_sewer", "dungeon_cave",
}
