"""Aurendel — the twelve regions, assembled.

Each `r??_*.py` module owns one region and exports whatever it has so far:

    AREAS      list of area dicts (no `connections` — see EDGES)
    EDGES      (a, b, minutes) or (a, b, minutes, {...opts}) — written BOTH ways
    POIS       list of point-of-interest dicts
    GATES      list of gate dicts
    DUNGEONS   list of dungeon dicts
    ROOM_TEMPLATES  list of room-template dicts
    TRAPS      list of trap dicts
    BIOME_ROOMS  {biome_id: [room_template_id, ...]}

Roads are declared once here and emitted on both sides, because
`world.areas[].connections` is one-directional in the engine (reduce.ts:300)
and a road you can only walk one way is almost never what was meant. Pass
`{"oneWay": True}` when it is.
"""
import importlib

REGION_MODULES = [
    "dungeonkit",
    "r01_kingsvale", "r02_coast", "r03_duskwood", "r04_skarnspine",
    "r05_frostmere", "r06_moor", "r07_ember", "r08_thornmere",
    "r09_steppe", "r10_glasslands", "r11_isles", "r12_deeproads",
    "roads",
]

_LOADED = []
for _name in REGION_MODULES:
    try:
        _LOADED.append(importlib.import_module(_name))
    except ImportError:
        pass


def _gather(attr):
    out = []
    for module in _LOADED:
        out.extend(getattr(module, attr, []))
    return out


def _edges():
    seen = {}
    for module in _LOADED:
        for edge in getattr(module, "EDGES", []):
            a, b, minutes = edge[0], edge[1], edge[2]
            opts = edge[3] if len(edge) > 3 else {}
            key = (a, b)
            if key in seen:
                raise ValueError(f"duplicate road {a} -> {b}")
            seen[key] = (minutes, opts)
    return seen


def areas():
    """Areas with their connections attached, in declaration order.

    Idempotent: the area dicts are the very objects the region files hold, so
    a second call would otherwise append a second copy of every road and the
    play layer would offer each destination twice. It is called more than once
    — `_lay_out` needs the map sizes — so the reset is not optional.
    """
    entries = _gather("AREAS")
    known = {a["id"] for a in entries}
    by_id = {a["id"]: a for a in entries}
    for entry in entries:
        entry["connections"] = []

    deferred = []
    for (a, b), (minutes, opts) in _edges().items():
        # Regions land one at a time, and the inter-region roads are declared
        # all at once in roads.py. A road to a region that does not exist yet
        # is dropped and reported rather than crashing the build — but it is
        # reported, because a silently missing highway is how a continent ends
        # up with an unreachable third of itself.
        if a not in known or b not in known:
            deferred.append(f"{a} <-> {b}")
            continue

        one_way = bool(opts.get("oneWay"))
        forward = {"to": b, "travelMinutes": minutes}
        back = {"to": a, "travelMinutes": opts.get("returnMinutes", minutes)}
        if opts.get("gate"):
            forward["gate"] = opts["gate"]
            back["gate"] = opts["gate"]
        if one_way:
            forward["oneWay"] = True

        by_id[a].setdefault("connections", []).append(forward)
        if not one_way:
            by_id[b].setdefault("connections", []).append(back)

    for entry in entries:
        entry.setdefault("connections", [])
    if deferred:
        print(f"  ! {len(deferred)} road(s) deferred, region not built yet:")
        for road in deferred:
            print(f"      {road}")
    return entries


def pois():
    """Points of interest, each promoted to its own prose if any was written.

    A place earns a unique voice simply by having a `<id>_desc` pool declared
    somewhere; otherwise it keeps the shared pool for its kind. That makes
    "write prose for this one" a one-line change in the region file rather than
    an edit in two places that can fall out of step.
    """
    import prose
    entries = _gather("POIS")
    for entry in entries:
        own = f"{entry['id']}_desc"
        if prose.has(own):
            entry["descriptionKey"] = own
    _lay_out(entries)
    return entries


def _lay_out(entries):
    """Give every point of interest a spot on its area's map.

    `position` is where the party stands when they arrive somewhere with no
    interior, and where the place shows on the map when it has one. Hand-placing
    four hundred of them is not a good use of anyone; hand-placing the ones that
    matter and laying the rest out on a grid is. `freeNear` (sim/enter.ts:82)
    shifts anybody who lands on a wall, so the only hard requirement is that a
    spot is inside the map.
    """
    sizes = {a["id"]: (int(a["map"]["width"]), int(a["map"]["height"]))
             for a in areas()}
    counters = {}
    for entry in entries:
        if "position" in entry:
            continue
        width, height = sizes.get(entry["area"], (31, 21))
        index = counters.get(entry["area"], 0)
        counters[entry["area"]] = index + 1

        # A ring of spots inset from the wall, filled clockwise, then a second
        # ring further in. Two rings hold twenty-odd places, which is more than
        # any settlement here has.
        ring = index // 12
        step = index % 12
        inset = 3 + ring * 4
        left, right = inset, width - 1 - inset
        top, bottom = inset, height - 1 - inset
        if right - left < 4 or bottom - top < 4:
            left, right, top, bottom = 3, width - 4, 3, height - 4
        span_x = right - left
        span_y = bottom - top
        if step < 4:
            x, y = left + span_x * step // 4, top
        elif step < 6:
            x, y = right, top + span_y * (step - 4) // 2
        elif step < 10:
            x, y = right - span_x * (step - 6) // 4, bottom
        else:
            x, y = left, bottom - span_y * (step - 10) // 2
        entry["position"] = {"x": max(1, min(width - 2, x)),
                             "y": max(1, min(height - 2, y))}


def gates():
    return _gather("GATES")


def dungeons():
    return _gather("DUNGEONS")


def room_templates():
    return _gather("ROOM_TEMPLATES")


def traps():
    return _gather("TRAPS")


def attach_room_templates(biome_list):
    """Wire each biome's room templates and traps in, from wherever they came.

    Stable and de-duplicated: two regions may contribute to the same biome, and
    a repeated id is a weighting bug rather than a feature.
    """
    for field, attr in (("roomTemplates", "BIOME_ROOMS"), ("traps", "BIOME_TRAPS")):
        wanted = {}
        for module in _LOADED:
            for biome_id, ids in getattr(module, attr, {}).items():
                wanted.setdefault(biome_id, []).extend(ids)
        for biome in biome_list:
            ids = wanted.get(biome["id"])
            if ids:
                biome[field] = sorted(dict.fromkeys(ids))


def start():
    return {
        "partySize": 4,
        "creation": {
            "attributePoints": 27,
            "attributeCosts": {"8": 0, "9": 1, "10": 2, "11": 3,
                               "12": 4, "13": 5, "14": 7, "15": 9},
            "startingLevel": 1,
            "skillRanks": 4,
            "startingItems": [{"item": i, "quantity": q}
                              for i, q in __import__("items").PARTY_KIT],
            "startingCurrency": 40,
        },
        "startingArea": "kingsvale_hollowdene",
        "startingPoi": "hollowdene_green",
        "openingTextKey": "aurendel_opening",
        "initialFlags": {},
        "partyFollow": {"catchUpDistance": 3, "catchUpSteps": 2},
    }
