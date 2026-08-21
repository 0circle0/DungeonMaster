"""Aurendel — the conventions its places are built on.

`dmkit.places` shapes an area or a point of interest; this file decides what the shapes are for
Aurendel. Four tables and the shorthands that use them: how big each kind of settlement's map is,
which interior palette a trade gets, what an interior measures, and which pool a place falls back on
when it has not earned prose of its own.

The region files import from here rather than from `dmkit.places`, so they read as a gazetteer.
"""
from dmkit import places as _kit
from dmkit.places import gate, shared, toll  # noqa: F401  re-exported

# The pools `KIND_POOL` and the shorthands name. Imported for the side effect: the file that names a
# pool has to make sure it exists.
import prose  # noqa: F401

# Map sizes by the role a place plays. Wilderness is the biggest because it is the only one you
# cross rather than arrive in.
SIZES = {
    "wild":     ("51", "35"),
    "frontier": ("45", "31"),
    "city":     ("45", "31"),
    "town":     ("41", "27"),
    "village":  ("31", "21"),
}

# Interior palettes by what the building is for.
TRADE_PALETTE = {
    "house": "int_timber", "inn": "int_timber", "farm": "int_timber",
    "mill": "int_timber", "bakery": "int_timber", "weaver": "int_timber",
    "brewery": "int_timber", "stable": "int_timber", "boathouse": "int_hull",
    "shop": "int_shop", "market": "int_shop", "warehouse": "int_shop",
    "chandler": "int_shop", "apothecary": "int_shop", "fletcher": "int_shop",
    "smithy": "int_forge", "foundry": "int_forge", "mason": "int_forge",
    "temple": "int_temple", "shrine": "int_temple",
    "hall": "int_stone", "guild": "int_stone", "keep": "int_stone",
    "watch": "int_stone", "library": "int_stone", "gaol": "int_stone",
    "delved": "int_delved", "hull": "int_hull", "sun": "int_mudbrick",
    "cave": "int_cave",
}

# Interior footprints. A generated interior is a walled rectangle, so these are outside dimensions:
# subtract two in each direction for floor.
ROOM_SIZES = {
    "small": ("9", "7"), "medium": ("11", "9"),
    "large": ("15", "11"), "hall": ("19", "13"),
}

# Where an ordinary place gets its prose from when it has not earned its own. Four hundred points of
# interest cannot each have a hand-written pool, and most should not: a house in Ashcott and a house
# in Slagfoot want the same three sentences.
KIND_POOL = {
    "settlement": "generic_settlement", "market": "generic_market",
    "shrine": "generic_shrine", "ruin": "generic_ruin",
    "camp": "generic_camp", "dungeonEntrance": "generic_dungeon_mouth",
    "landmark": "generic_landmark", "crossing": "generic_crossing",
    "lair": "generic_lair", "wilds": "generic_wilds",
}


def area(aid, name, biome, role, danger, level, description, **kw):
    """`dmkit.places.area`, with the map size Aurendel gives that role."""
    return _kit.area(aid, name, biome, role, danger, level, description,
                     size=SIZES[role], **kw)


def poi(pid, name, in_area, kind, description, *, trade=None, size="medium",
        desc_key=None, unique=False, interior=True, **kw):
    """`dmkit.places.poi`, resolving trade and size against Aurendel's tables.

    `trade` picks the interior palette and, with `size`, the footprint. Pass `interior=False` for
    something you stand at rather than in. Prose comes from `desc_key` if given, from a pool of the
    place's own name if `unique`, and otherwise from the shared pool for its `kind`.
    """
    return _kit.poi(
        pid, name, in_area, kind, description,
        desc_key=desc_key or (f"{pid}_desc" if unique else KIND_POOL[kind]),
        palette=TRADE_PALETTE[trade] if trade else None,
        footprint=ROOM_SIZES[size] if (interior and trade) else None,
        **kw)


# --- settlement shorthands --------------------------------------------------
# A town has an inn, a smithy, a store, a temple and some houses wherever it is; only the names and
# the reasons change. These keep the region files to the part that is different.

def house(pid, name, in_area, description, at=None, tags=()):
    return poi(pid, name, in_area, "settlement", description, at=at, minutes=2,
               trade="house", size="small", desc_key="int_house",
               tags=list(tags) + ["house"])


def inn(pid, name, in_area, description, at=None, size="medium", tags=()):
    return poi(pid, name, in_area, "settlement", description, at=at, minutes=3,
               trade="inn", size=size, desc_key="int_inn",
               services=["inn"], tags=list(tags) + ["inn"])


def smithy(pid, name, in_area, description, at=None, size="medium", tags=()):
    return poi(pid, name, in_area, "market", description, at=at, minutes=3,
               trade="smithy", size=size, desc_key="int_smithy",
               services=["smith"], tags=list(tags) + ["shop"])


def store(pid, name, in_area, description, at=None, size="medium",
          trade="shop", tags=()):
    return poi(pid, name, in_area, "market", description, at=at, minutes=3,
               trade=trade, size=size, desc_key="int_store",
               services=["market"], tags=list(tags) + ["shop"])


def workshop(pid, name, in_area, description, at=None, size="medium",
             trade="shop", tags=()):
    return poi(pid, name, in_area, "market", description, at=at, minutes=3,
               trade=trade, size=size, desc_key="int_workshop",
               services=["market"], tags=list(tags) + ["shop"])


def temple(pid, name, in_area, description, at=None, size="medium", tags=()):
    return poi(pid, name, in_area, "shrine", description, at=at, minutes=3,
               trade="temple", size=size, desc_key="int_temple",
               services=["temple"], tags=list(tags) + ["shrine"])


def stable(pid, name, in_area, description, at=None, tags=()):
    return poi(pid, name, in_area, "settlement", description, at=at, minutes=3,
               trade="stable", desc_key="int_stable",
               services=["stable"], tags=list(tags))


def warehouse(pid, name, in_area, description, at=None, size="large", tags=()):
    return poi(pid, name, in_area, "market", description, at=at, minutes=3,
               trade="warehouse", size=size, desc_key="int_warehouse",
               services=["market"], tags=list(tags) + ["shop"])


def guild(pid, name, in_area, description, at=None, size="large", tags=()):
    return poi(pid, name, in_area, "market", description, at=at, minutes=4,
               trade="guild", size=size, services=["guild"],
               tags=list(tags) + ["shop"])


def square(pid, name, in_area, description, at=None, tags=()):
    """An open place you stand in rather than go inside."""
    return poi(pid, name, in_area, "market", description, at=at, minutes=2,
               interior=False, services=["market"], tags=list(tags) + ["shop"])


def landmark(pid, name, in_area, description, at=None, minutes=6, tags=(),
             **kw):
    return poi(pid, name, in_area, "landmark", description, at=at,
               minutes=minutes, interior=False, tags=list(tags), **kw)


def ruin(pid, name, in_area, description, at=None, minutes=10, trade="cave",
         size="medium", tags=(), **kw):
    return poi(pid, name, in_area, "ruin", description, at=at, minutes=minutes,
               trade=trade, size=size, tags=list(tags) + ["ruin"], **kw)


def delve(pid, name, in_area, description, dungeon, at=None, minutes=12,
          tags=(), **kw):
    """A way down into a generated complex."""
    return poi(pid, name, in_area, "dungeonEntrance", description, at=at,
               minutes=minutes, dungeon=dungeon,
               tags=list(tags) + ["dungeon"], **kw)
