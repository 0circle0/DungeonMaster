"""Gathering a questline out of the files that declare pieces of it."""
import collections
import importlib

from dmkit.quests import arc as _arc


def load(names):
    """Import each name, in order, and return the modules."""
    return [importlib.import_module(name) for name in names]


def gather(modules, attr):
    out = []
    for module in modules:
        out.extend(getattr(module, attr, []))
    return out


def arcs(modules, *, ending=None):
    """Every arc, plus the ending arc if one is asked for."""
    out = gather(modules, "ARCS")
    if ending:
        aid, name, description, spine = ending
        have = {q["id"] for q in gather(modules, "QUESTS")}
        finale = [q for q in spine if q in have]
        if finale:
            out.append(_arc(aid, name, description, finale, ending=True))
    return out


def attach_triggers(modules, poi_list, *, base=None):
    """Arrival triggers, from the questline and from whichever chains want one."""
    wanted = dict(base or {})
    for module in modules:
        for poi_id, triggers in getattr(module, "POI_TRIGGERS", {}).items():
            wanted.setdefault(poi_id, []).extend(triggers)

    for poi in poi_list:
        extra = wanted.get(poi["id"])
        if extra:
            poi["triggers"] = list(poi.get("triggers", [])) + extra


def attach_patches(modules, poi_list):
    """Turn an existing place into a hidden one, or hang a door on it."""
    wanted = {}
    for module in modules:
        for poi_id, patch in getattr(module, "POI_PATCHES", {}).items():
            wanted.setdefault(poi_id, {}).update(patch)

    seen = set()
    for poi in poi_list:
        patch = wanted.get(poi["id"])
        if patch:
            poi.update(patch)
            seen.add(poi["id"])

    missing = sorted(set(wanted) - seen)
    if missing:
        # Loud, because a patch that lands on nothing is a thread anybody can walk into.
        raise ValueError(f"POI_PATCHES names points of interest that do not exist: {missing}")


# Which places a questline turns live.
Population = collections.namedtuple("Population", [
    "biome_encounters",    # biome id   -> [table id]
    "biome_loot",          # biome id   -> [table id]
    "area_encounters",     # area id    -> [table id]
    "dungeon_bosses",      # dungeon id -> table id
    "live_room_biomes",    # {biome id} whose room templates stop being empty
], defaults=({}, {}, {}, {}, frozenset()))


def attach_content(modules, biome_list, dungeon_list, room_templates, area_list,
                   *, population=Population()):
    """Turn the route live: encounters, loot, and rooms that are not empty."""
    for biome in biome_list:
        tables = population.biome_encounters.get(biome["id"])
        if tables:
            biome["encounterTables"] = list(tables)
        drops = population.biome_loot.get(biome["id"])
        if drops:
            biome["lootTables"] = list(drops)

    # An area's own tables, then whatever a module adds to them.
    extra_area_tables = {}
    for module in modules:
        for area_id, tables in getattr(module, "AREA_ENCOUNTERS", {}).items():
            extra_area_tables.setdefault(area_id, []).extend(tables)

    for area in area_list:
        tables = list(population.area_encounters.get(area["id"]) or [])
        tables += [t for t in extra_area_tables.get(area["id"], [])
                   if t not in tables]
        if tables:
            area["encounterTables"] = tables

    # Bosses the questline named, then the ones a module claims for itself.
    bosses = dict(population.dungeon_bosses)
    for module in modules:
        bosses.update(getattr(module, "BOSSES", {}))

    for dungeon in dungeon_list:
        boss = bosses.get(dungeon["id"])
        if boss:
            dungeon["bossTable"] = boss

    # This is the switch described above.
    for template in room_templates:
        biome_id = template["id"].rsplit("_", 1)[0]
        if biome_id not in population.live_room_biomes:
            continue
        role = template.get("role", "chamber")
        if role == "boss":
            # The boss room draws from the dungeon's `bossTable`, once.
            template["alwaysEncounter"] = True
        elif role in ("entrance", "corridor"):
            template["encounterChance"] = 0.15
        else:
            template["encounterChance"] = 0.4
