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

    # -- what the Act I side chains leave ---------------------------------
    table("weir_scraps", [w(5, "old_coin"), w(3, "eel_skin"), w(2, "bandages")],
          empty=0.5, bonus_skill="survival"),
    table("strand_scraps", [
        w(5, "old_coin", "1d3"), w(3, "wreck_brass"), w(2, "bandages"),
        w(1, "amber_lump"),
    ], empty=0.4, bonus_skill="perception"),
    table("marsh_scraps", [
        w(5, "old_coin"), w(3, "antidote"), w(2, "amber_lump"),
        w(2, "bandages"),
    ], empty=0.4, bonus_skill="nature"),
    table("ice_scraps", [
        w(5, "old_coin"), w(3, "barrow_torc"), w(2, "ward_salt"),
    ], empty=0.45, bonus_skill="survival"),
    # `alpine_scraps` was here, keyed for a `dungeon_alpine` biome that does
    # not exist — the Skarnspine's dungeons are delved and cave like everywhere
    # else, so it was rolled by nothing. Everything it dropped drops elsewhere.

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

    # -- side chain payoffs -----------------------------------------------
    # Smaller than an act's hoard and richer than a wandering table, which is
    # the whole shape of the bargain: a detour is paid better per fight than
    # the road, and the road is still where the story is.
    table("setts_hoard", [
        w(4, "old_coin", "2d4"), w(3, "poachers_lamp"), w(2, "healing_draught"),
        w(2, "amber_lump"),
    ], rolls="2", name="The Far End of the Setts"),
    table("gaol_hoard", [
        w(4, "old_coin", "2d6"), w(3, "tallow_hood"), w(2, "barrow_torc"),
        w(2, "healing_draught", "1d2"),
    ], rolls="2", name="What Was Bricked Up With Him"),
    # `smugglers_hoard` was here under the same name as `the_run`, for the same
    # dungeon, and `DUNGEON_BOSSES` picks `the_run`. Two tables for one room.
    table("saltcliff_hoard", [
        w(4, "wreck_brass", "1d4"), w(3, "pilots_glass"), w(2, "amber_lump"),
        w(2, "healing_draught", "1d2"),
    ], rolls="2", name="Under the Light"),

    table("beeches_hoard", [
        w(4, "amber_lump", "1d3"), w(3, "greenway_charm"),
        w(3, "healing_draught", "1d2"), w(2, "old_coin", "2d6"),
    ], rolls="2", name="Inside the Hollow Beech"),
    table("diggers_hoard", [
        w(4, "barrow_torc"), w(3, "torc_of_the_ridge"), w(2, "ward_salt", "1d2"),
        w(2, "healing_draught", "1d2"),
    ], rolls="2", name="The Undug End"),
    table("dry_river_hoard", [
        w(4, "hold_silver", "1d3"), w(3, "horn_bow"), w(2, "glass_bead", "1d2"),
        w(2, "healing_draught", "1d2"),
    ], rolls="2", name="What the River Left"),
    table("sink_hoard", [
        w(4, "iron_ore", "1d4"), w(3, "hold_hammer"), w(2, "hold_silver", "1d2"),
        w(2, "healing_draught", "1d2"),
    ], rolls="2", name="The Bottom of the Sink"),
    table("throat_hoard", [
        w(4, "glass_bead", "1d3"), w(3, "cinder_cloak"), w(2, "iron_ore", "1d4"),
        w(2, "healing_draught", "1d2"),
    ], rolls="2", name="Down the Throat"),
    table("bell_hoard", [
        w(4, "old_coin", "2d6"), w(3, "bell_bronze_mace"), w(2, "amber_lump"),
        w(2, "antidote", "1d2"),
    ], rolls="2", name="Under the Old Church"),

    table("seams_hoard", [
        w(4, "hold_silver", "2d3"), w(3, "hold_plate"), w(2, "iron_ore", "2d4"),
        w(2, "healing_draught", "1d3"),
    ], rolls="3", name="The Old Seams"),
    table("rot_hoard", [
        w(4, "fungus_cap", "2d4"), w(3, "sporeward_mask"),
        w(3, "healing_draught", "1d3"), w(2, "antidote", "1d2"),
    ], rolls="3", name="What Grows Mycelt"),
    table("ninth_well_hoard", [
        w(4, "glass_bead", "2d3"), w(3, "fulgurite_lens"), w(2, "amber_lump"),
        w(2, "healing_draught", "1d3"),
    ], rolls="3", name="Down the Ninth Well"),
    table("last_cairn_hoard", [
        w(4, "barrow_torc"), w(3, "rimeward_coat"), w(2, "ward_salt", "1d3"),
        w(2, "healing_draught", "1d3"),
    ], rolls="3", name="Under the Last Cairn"),
    table("drowned_fort_hoard", [
        w(4, "wreck_brass", "2d3"), w(3, "drowned_blade"),
        w(2, "hold_silver", "1d3"), w(2, "healing_draught", "1d3"),
    ], rolls="3", name="The Drowned Battery"),

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
    # Shops the side chains open, each behind its faction's standing. What a
    # regional power will sell you is the most legible reward standing has.
    table("ratcatchers_stock", [
        w(5, "bandages", "1d3"), w(4, "tallow_hood"), w(3, "antidote"),
        w(2, "leather_jerkin"), w(1, "silvered_blade"),
    ], rolls="3", name="What the Guild Will Part With"),
    table("salvors_stock", [
        w(5, "wreck_brass", "1d3"), w(4, "wreckers_lantern"),
        w(3, "healing_draught"), w(2, "hunting_bow"), w(2, "ring_mail"),
    ], rolls="3", name="Off the Bar, Unasked"),
    table("countinghouse_stock", [
        w(5, "healing_draught", "1d2"), w(4, "pilots_glass"), w(3, "ring_mail"),
        w(3, "antidote", "1d2"), w(2, "iron_sword"),
    ], rolls="3", name="Bonded, and Priced Accordingly"),

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

    # The Act I side chains. The Kingsvale's own wandering table already
    # covers the hedges and the road; these are the water and the city under
    # the city, which the questline never had a reason to fill.
    encounters("weirwater_things", [
        group("lampreys", [("weir_lamprey", "1d2", True)], weight=5),
        group("a_hand", [("drowned_hand", "1", False)], weight=1,
              requires={"minLevel": 3}),
    ], chance=0.3, empty=8),

    encounters("undercity_things", [
        group("rats", [("barrow_rat", "1d4", True)], weight=5),
        group("thieves", [("cellar_thief", "1d2", True)], weight=3),
        group("both", [("cellar_thief", "1", False), ("barrow_rat", "1d2", True)],
              weight=1, requires={"minLevel": 3}),
    ], chance=0.4, empty=5),

    encounters("coast_things", [
        group("wreckers", [("strand_wrecker", "1d2", True)], weight=4),
        group("hands", [("drowned_hand", "1", True)], weight=3),
        group("shore_party", [("strand_wrecker", "1d3", True)], weight=1,
              requires={"minLevel": 3}),
    ], chance=0.35, empty=6),

    # --- the shared dungeon biomes, bracketed by level --------------------
    # `dungeon_cave` and `dungeon_delved` are not places, they are *kinds* of
    # place: between them they are thirty-three dungeons from the Hedge Setts,
    # which a level-1 party can find with a survival check, to the workings
    # under Karn Dolur. Pointing a whole biome at one table meant the Badger
    # Hole rolled Deeproads horrors at level 1 — a wipe with no warning, and
    # true of the module before any of this was written.
    #
    # `requires` on a group takes the whole requirement vocabulary, so the fix
    # is brackets rather than a new table per dungeon: each tier states the
    # levels it belongs to and the engine picks from the ones that hold.
    encounters("cave_things", [
        group("vermin", [("barrow_rat", "1d3", True)], weight=5,
              requires={"maxLevel": 4}),
        group("lampreys", [("weir_lamprey", "1d2", True)], weight=3,
              requires={"maxLevel": 4}),
        group("hounds", [("grave_hound", "1d2", True)], weight=4,
              requires={"minLevel": 3, "maxLevel": 6}),
        group("crawlers", [("slag_crawler", "1", True)], weight=3,
              requires={"minLevel": 4, "maxLevel": 7}),
        group("deep", [("fungal_horror", "1", True)], weight=4,
              requires={"minLevel": 6}),
        group("rime", [("rime_shade", "1d2", True)], weight=3,
              requires={"minLevel": 7}),
    ], chance=0.4, empty=5),

    encounters("delved_things", [
        group("vermin", [("barrow_rat", "1d4", True)], weight=5,
              requires={"maxLevel": 4}),
        group("thieves", [("cellar_thief", "1d2", True)], weight=3,
              requires={"maxLevel": 4}),
        group("walkers", [("hollow_walker", "1", True)], weight=4,
              requires={"minLevel": 3, "maxLevel": 7}),
        group("deep", [("fungal_horror", "1", True)], weight=4,
              requires={"minLevel": 6}),
        group("rime", [("rime_shade", "1d2", True)], weight=4,
              requires={"minLevel": 7}),
    ], chance=0.45, empty=4),

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

    # One per side chain, same shape: the thing at the end, alone.
    encounters("the_delver", [
        group("delver", [("sett_delver", "1", False)])], chance=1, empty=0),
    encounters("the_gaoler", [
        group("gaoler", [("the_gaoler", "1", False)])], chance=1, empty=0),
    # Fixed counts, not `1d2`. A boss room that rolls one wrecker cannot
    # satisfy an objective that asks for two, and the failure is a quest that
    # simply never finishes rather than anything that looks like a bug.
    encounters("the_run", [
        group("wreckers", [("strand_wrecker", "2", False),
                           ("drowned_hand", "1", False)])], chance=1, empty=0),
    encounters("the_light_on_the_point", [
        group("shade", [("wreck_shade", "1", False)])], chance=1, empty=0),

    # Act II side chains.
    encounters("the_hollow_beech", [
        group("beech", [("beech_hollow", "1", False)])], chance=1, empty=0),
    encounters("the_east_end", [
        group("wight", [("long_barrow_wight", "1", False)])], chance=1, empty=0),
    encounters("the_dry_river", [
        group("shade", [("dust_shade", "1", False)])], chance=1, empty=0),
    encounters("the_sink", [
        group("thing", [("sink_thing", "1", False)])], chance=1, empty=0),
    encounters("the_throat", [
        group("wyrm", [("vent_wyrm", "1", False)])], chance=1, empty=0),
    encounters("the_old_church", [
        group("bell", [("bell_shade", "1", False)])], chance=1, empty=0),

    # Act III side chains.
    encounters("the_old_seams", [
        group("seam", [("seam_thing", "1", False)])], chance=1, empty=0),
    encounters("the_rot_itself", [
        group("rot", [("rot_mother", "1", False)])], chance=1, empty=0),
    encounters("the_ninth_well", [
        group("salt", [("salt_thing", "1", False)])], chance=1, empty=0),
    encounters("the_last_cairn", [
        group("cairn", [("cairn_thing", "1", False)])], chance=1, empty=0),
    encounters("the_drowned_battery", [
        group("battery", [("reef_thing", "1", False)])], chance=1, empty=0),

    # The last three boss rooms on the continent with nothing to draw from.
    # No quest, chain or thread goes near these dungeons, so what waits at the
    # bottom is not somebody in particular — it is whatever the place has,
    # in a fixed group, because a boss room that rolls empty is the one room a
    # player is guaranteed to notice.
    encounters("the_deeps_below", [
        group("deeps", [("slag_crawler", "2", False),
                        ("fungal_horror", "1", False)])], chance=1, empty=0),
    encounters("the_bottom_of_the_shaft", [
        group("shaft", [("bog_walker", "2", False),
                        ("drowned_hand", "1", False)])], chance=1, empty=0),
    encounters("the_top_of_the_chimney", [
        group("chimney", [("drowned_hand", "2", False),
                          ("strand_wrecker", "1", False)])], chance=1, empty=0),

    # The ice and the sea, the last two stretches of the continent with no
    # wandering monsters at all.
    encounters("ice_things", [
        group("wights", [("rime_wight", "1d2", True)], weight=4),
        group("shades", [("rime_shade", "1", True)], weight=3,
              requires={"minLevel": 6}),
        group("hounds", [("grave_hound", "1d2", True)], weight=3,
              requires={"maxLevel": 6}),
    ], chance=0.4, empty=5),

    encounters("isles_things", [
        group("hands", [("drowned_hand", "1d2", True)], weight=5),
        group("wreckers", [("strand_wrecker", "1d2", True)], weight=3),
        group("deep", [("reef_thing", "1", False)], weight=1,
              requires={"minLevel": 7}),
    ], chance=0.4, empty=5),

    # The marsh and the mountain, which had no wandering monsters at all
    # because the questline never crossed either.
    encounters("marsh_things", [
        group("leeches", [("leech_swarm", "1", True)], weight=5),
        group("walkers", [("bog_walker", "1d2", True)], weight=4),
        group("both", [("bog_walker", "1", False), ("leech_swarm", "1", True)],
              weight=2, requires={"minLevel": 5}),
    ], chance=0.45, empty=4),

    encounters("alpine_things", [
        group("hounds", [("grave_hound", "1d2", True)], weight=4),
        group("walkers", [("hollow_walker", "1", True)], weight=3),
        group("crawlers", [("slag_crawler", "1", True)], weight=2,
              requires={"minLevel": 5}),
    ], chance=0.35, empty=6),

    # The drowned dungeons, which are fifteen of the sixty-eight and have
    # generated an empty room every time anybody has ever walked into one.
    encounters("drowned_things", [
        group("leeches", [("leech_swarm", "1d2", True)], weight=4,
              requires={"maxLevel": 5}),
        group("hands", [("drowned_hand", "1d2", True)], weight=4),
        group("walkers", [("bog_walker", "1d2", True)], weight=4,
              requires={"minLevel": 3}),
        group("rime", [("rime_shade", "1", True)], weight=3,
              requires={"minLevel": 7}),
    ], chance=0.45, empty=4),
]


# --- where all of that gets attached --------------------------------------
# Only the biomes and areas the questline crosses. The rest of the continent
# stays as empty as it was, which is what "questline-scoped" means.

BIOME_ENCOUNTERS = {
    "vale": ["kingsvale_wanderers"],
    # The side chains widen this, one biome per act, and only where a chain
    # actually goes. Everything not named here stays as quiet as it was.
    "coast": ["coast_things"],
    "deepwood": ["duskwood_things"],
    "moor": ["moor_things"],
    "volcanic": ["ember_things"],
    "steppe": ["steppe_things"],
    "desert": ["glasslands_things"],
    "underdeep": ["deeproads_things"],
    "dungeon_barrow": ["barrow_things"],
    # Both of these span the continent and every tier of it, so they draw from
    # the level-bracketed tables rather than from one region's monsters.
    "dungeon_delved": ["delved_things"],
    "dungeon_cave": ["cave_things"],
    "dungeon_ruin": ["duskwood_things"],
    "dungeon_ember": ["ember_things"],
    "dungeon_sewer": ["undercity_things"],
    # Fifteen dungeons across Thornmere, the Isles, the Frostmere and the moor
    # that have generated an empty room every time anybody has walked into one.
    "dungeon_drowned": ["drowned_things"],
    "dungeon_ice": ["ice_things"],
    # And the overworld the side chains cross.
    "swamp": ["marsh_things"],
    "alpine": ["alpine_things"],
    "glacier": ["ice_things"],
    "isles": ["isles_things"],
}

BIOME_LOOT = {
    "dungeon_barrow": ["barrow_scraps"],
    "dungeon_delved": ["deep_scraps"],
    "dungeon_ruin": ["wood_scraps"],
    "dungeon_ember": ["ember_scraps"],
    "dungeon_sewer": ["vermin_scraps"],
    "dungeon_cave": ["deep_scraps"],
    "dungeon_drowned": ["marsh_scraps"],
    "dungeon_ice": ["ice_scraps"],
}

# Wilderness areas the questline sends you across, so the road is not empty.
AREA_ENCOUNTERS = {
    "kingsvale_hedge_country": ["kingsvale_wanderers"],
    "kingsvale_kingsroad_south": ["kingsvale_wanderers"],
    # Act I side chains.
    "kingsvale_weirwater_crossing": ["weirwater_things"],
    "kingsvale_oxbow_meadows": ["weirwater_things"],
    "coast_wreckers_strand": ["coast_things"],
    "coast_gannet_head": ["coast_things"],
    # Act II side chains.
    "duskwood_hollow_beeches": ["duskwood_things"],
    "moor_kestrel_edge": ["moor_things"],
    "steppe_dry_river": ["steppe_things"],
    "steppe_the_long_grass": ["steppe_things"],
    "skarnspine_the_cut": ["alpine_things"],
    "skarnspine_weirwater_head": ["alpine_things"],
    "ember_firewatch_ridge": ["ember_things"],
    "thornmere_the_black_water": ["marsh_things"],
    "thornmere_leech_channels": ["marsh_things"],
    # Act III side chains.
    "frostmere_the_last_cairn": ["ice_things"],
    "frostmere_glass_ice": ["ice_things"],
    "isles_wreck_reef": ["isles_things"],
    "isles_drowned_fort_shoal": ["isles_things"],
    "glasslands_bone_wells": ["glasslands_things"],
    "glasslands_the_fulgurite": ["glasslands_things"],
    "deeproads_fungus_gallery": ["deeproads_things"],
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
    # Act I side chains — four of the sixty-two dungeons that had no end.
    "hedge_setts": "the_delver",
    "warren_cellars": "the_gaoler",
    "strand_smugglers_run": "the_run",
    "saltcliff_workings": "the_light_on_the_point",
    # Act II side chains.
    "duskwood_deadfall": "the_hollow_beech",
    "moor_long_barrow": "the_east_end",
    "steppe_dry_well": "the_dry_river",
    "skarn_the_sink": "the_sink",
    "ember_the_throat": "the_throat",
    "thornmere_old_church": "the_old_church",
    # Act III side chains.
    "karn_dolur_old_seams": "the_old_seams",
    "deeproads_the_rot": "the_rot_itself",
    "glasslands_ninth_well": "the_ninth_well",
    "frostmere_the_hollow": "the_last_cairn",
    "isles_drowned_fort": "the_drowned_battery",
    "moor_beneath_sisters": "the_sisters_shade",
    "steppe_great_kurgan": "the_kurgan_rider",
    "glasslands_centre_shaft": "the_glass_thing",
    "deeproads_ninth_door": "the_keeper_of_the_ninth",
    # The three that nothing else claimed. Every other dungeon on the
    # continent gets its boss from a quest, a chain or a thread; these are
    # fronted by a POI and are otherwise nobody's.
    "karn_dolur_deeps": "the_deeps_below",
    "moor_tarn_shaft": "the_bottom_of_the_shaft",
    "isles_gullstone_chimney": "the_top_of_the_chimney",
}

# Room templates in these biomes stop being empty. Everything else on the
# continent keeps its zero and stays quiet.
LIVE_ROOM_BIOMES = {
    "dungeon_barrow", "dungeon_delved", "dungeon_ruin",
    "dungeon_ember", "dungeon_sewer", "dungeon_cave",
    # Added with the side chains. `dungeon_drowned` and `dungeon_ice` were
    # authored, given seven room templates each and fifteen dungeons between
    # them, and never once turned on.
    "dungeon_drowned", "dungeon_ice",
}
