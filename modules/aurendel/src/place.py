"""Shared constructors for Aurendel's places.

The region files are meant to read like a gazetteer, not like JSON. These
helpers hold the conventions so each region only has to say what is different:
map sizes by role, `descriptionKey` naming, interior palettes by trade.
"""
import prose

# Map sizes by the role a place plays. Wilderness is the biggest because it is
# the only one you cross rather than arrive in.
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

# Interior footprints. A generated interior is a walled rectangle, so these are
# outside dimensions: subtract two in each direction for floor.
ROOM_SIZES = {
    "small": ("9", "7"), "medium": ("11", "9"),
    "large": ("15", "11"), "hall": ("19", "13"),
}


def area(aid, name, biome, role, danger, level, description, *,
         entry=None, tags=(), faction=None, **kw):
    """One place with a map. `role` picks the map size."""
    width, height = SIZES[role]
    entry_point = entry or {"x": int(width) // 2, "y": int(height) // 2}
    out = {
        "id": aid, "name": name, "description": description,
        "biome": biome, "layer": kw.pop("layer", "overworld"),
        "descriptionKey": f"{aid}_desc",
        "dangerLevel": danger, "recommendedLevel": level,
        "tags": list(tags),
        "map": {"width": width, "height": height},
        "entryPoint": entry_point,
        "extra": {"role": role},
    }
    if faction:
        out["controllingFaction"] = faction
    out.update(kw)
    return out


# Where an ordinary place gets its prose from when it has not earned its own.
# Four hundred points of interest cannot each have a hand-written pool, and
# most of them should not: a house in Ashcott and a house in Slagfoot want the
# same three sentences, and the *named* places want all the attention.
KIND_POOL = {
    "settlement": "generic_settlement", "market": "generic_market",
    "shrine": "generic_shrine", "ruin": "generic_ruin",
    "camp": "generic_camp", "dungeonEntrance": "generic_dungeon_mouth",
    "landmark": "generic_landmark", "crossing": "generic_crossing",
    "lair": "generic_lair", "wilds": "generic_wilds",
}


def poi(pid, name, in_area, kind, description, *, at=None, minutes=5,
        trade=None, size="medium", services=(), tags=(), desc_key=None,
        unique=False, static=None, dungeon=None, gate=None, hidden=False,
        discover=None, interior=True, **kw):
    """A building, landmark, or way down.

    `trade` picks the interior palette and, with `size`, the footprint. Pass
    `interior=False` for something you stand *at* rather than *in* — a well, a
    stone circle, a crossroads — which leaves the party on the area map.

    Prose comes from `desc_key` if given, from a pool of the place's own name
    if `unique`, and otherwise from the shared pool for its `kind`.
    """
    out = {
        "id": pid, "name": name, "description": description,
        "area": in_area, "kind": kind,
        "descriptionKey": desc_key or (f"{pid}_desc" if unique else KIND_POOL[kind]),
        "travelMinutes": minutes,
        "tags": list(tags),
    }
    if at:
        out["position"] = {"x": at[0], "y": at[1]}
    if services:
        out["services"] = list(services)
    if gate:
        out["gate"] = gate
    if hidden:
        out["hidden"] = True
    if discover:
        out["discover"] = {"skill": discover[0], "difficulty": discover[1]}
    if dungeon:
        out["dungeon"] = dungeon
    elif static:
        out["map"] = {"static": static}
    elif interior and trade:
        width, height = ROOM_SIZES[size]
        out["map"] = {"width": width, "height": height,
                      "palette": TRADE_PALETTE[trade]}
    out.update(kw)
    return out


# --- settlement shorthands --------------------------------------------------
# A town has an inn, a smithy, a store, a temple and some houses wherever it
# is; only the names and the reasons change. These keep the region files to the
# part that is actually different.

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


def shared(pid, *texts):
    """A pool many places point at — `int_house`, `int_smithy`, and friends."""
    if not prose.has(pid):
        prose.pool(pid, *texts)
    return pid


def gate(gid, name, kind, description, *, requires=None, bypass=None,
         opens_with=(), on_open=(), stays_open=True, blocked_key=None):
    out = {"id": gid, "name": name, "kind": kind, "description": description,
           "staysOpen": stays_open}
    if requires:
        out["requires"] = requires
    if bypass:
        skill, difficulty = bypass[0], bypass[1]
        out["bypass"] = {"skill": skill, "difficulty": difficulty,
                         "retryable": bypass[2] if len(bypass) > 2 else True}
    if opens_with:
        out["opensWith"] = list(opens_with)
    if on_open:
        out["onOpen"] = list(on_open)
    if blocked_key:
        out["blockedTextKey"] = blocked_key
    return out


def toll(gid, name, amount, description, *, bypass=None, blocked_key=None):
    """A way through that wants paying for, and usually can be got round."""
    return gate(
        gid, name, "toll", description,
        requires={"description": f"{amount} marks", "currency": amount},
        bypass=bypass, stays_open=False, blocked_key=blocked_key,
        on_open=[{"adjustCurrency": {"amount": -amount}}],
    )
