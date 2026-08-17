"""Room vocabularies and dungeon constructors.

`world.roomTemplates` is what a *generated* room can be. Every template needs a
`descriptionKey`, and `enterRoom` fires it once per room per save, so a room
family is mostly prose — which is why the prose lives in the module and only
the shaping lives here. A module passes its own role table and its own
sentences; nothing in this file names a biome, a room or a trap.

`fit()` is the part that is genuinely not obvious. `corridorLength` is room
*spacing*, not corridor length, and `roomCount` is a request rather than a
promise — a map too small for the rooms asked for silently gets fewer.
"""
from dmkit.prose import pool

def family(biome, label, texts, *, roles, role_names, trap=0.12, loot=0.2):
    """Build the seven room templates for one dungeon biome.

    `roles` maps a role id to `(weight, minExits, maxExits, extras)` and
    `role_names` to the word that goes in the template's name; both belong to
    the module, because what rooms a dungeon is made of is a choice about the
    world rather than about the engine. The one role the engine reads is
    `boss`, and it reads it off whatever string the module wrote
    (world/dungeon.ts:660).

    `texts` maps role -> tuple of variant strings. Returns (templates, ids) and
    registers a `<biome>_<role>_desc` pool for each.
    """
    templates = []
    for role, (weight, lo, hi, extras) in roles.items():
        rid = f"{biome}_{role}"
        key = pool(f"{rid}_desc", *texts[role])
        entry = {
            "id": rid, "name": f"{label} {role_names[role]}",
            "descriptionKey": key, "weight": weight,
            "minExits": lo, "maxExits": hi,
            "encounterChance": 0, "trapChance": trap, "lootChance": loot,
            "tags": [biome, role],
        }
        entry.update(extras)
        templates.append(entry)
    return templates, [t["id"] for t in templates]


def dice_mean(notation, fallback):
    """The static mean of `NdS+C`, matching world/dungeon/rooms.ts:diceMean."""
    import re
    if not notation:
        return fallback
    total, ok = 0.0, False
    for sign, count, sides, const in re.findall(
            r"([+-]?)\s*(?:(\d*)d(\d+)|(\d+))", notation):
        s = -1 if sign == "-" else 1
        if sides:
            total += s * int(count or 1) * (int(sides) + 1) / 2
        else:
            total += s * int(const)
        ok = True
    return total if ok else fallback


# How much of a dungeon's map rejection sampling can realistically fill before
# it starts dropping rooms on the floor. `placeRooms` gives each room forty
# attempts, so packing much past this loses the tail of the list silently.
PACKING = 0.42
MAX_SIDE = 81


def fit(rooms, room_size, corridor_length, aspect=1.0):
    """Pick a map — and if need be a corridor length — that holds `rooms` rooms.

    `corridorLength` is not decoration: `placeRooms` uses its *mean* as the
    spacing every room must keep from every other (world/dungeon/rooms.ts:6).
    Asking for fifteen rooms with `5d3` corridors on a 47x27 map produced two
    rooms and a great deal of empty stone, which is how this function came to
    exist.

    Returns (width, height, corridor_length). Grow the map first, because a
    long corridor is the thing the author actually asked for; only when the
    map hits its ceiling does the spacing give way.
    """
    room_mean = dice_mean(room_size, 7)
    wanted = dice_mean(corridor_length, 6)
    ceiling = MAX_SIDE * MAX_SIDE

    for spacing, notation in _spacings(corridor_length, wanted):
        span = room_mean + spacing + 2
        needed = rooms * span * span / PACKING
        if needed <= ceiling or spacing <= 2:
            height = max(21, int(round((needed / aspect) ** 0.5)))
            width = max(21, int(round(height * aspect)))
            return (str(min(MAX_SIDE, width | 1)),
                    str(min(MAX_SIDE, height | 1)),
                    notation)
    raise AssertionError("unreachable: the spacing walk ends at 2")


def _spacings(notation, wanted):
    """The requested corridor length, then progressively shorter ones."""
    yield wanted, notation
    for fallback in ("4d3", "3d3", "2d3", "1d3+1", "1d2+1"):
        mean = dice_mean(fallback, 4)
        if mean < wanted:
            yield mean, fallback
    yield 2, "1d2+1"


def dungeon(did, name, biome, description, *, rooms="10", depth="1",
            algorithm="rooms", size=None, palette=None, aspect=1.0, **kw):
    """One generated complex.

    One map — the engine has no notion of levels, so a deep place is several of
    these, each behind its own point of interest. The map is sized from the
    room count and the corridor length unless `size` says otherwise, because
    getting that arithmetic wrong is invisible until you walk the thing.
    """
    out = {
        "id": did, "name": name, "description": description,
        "biome": biome, "roomCount": rooms, "depth": depth,
        "algorithm": algorithm,
        # No items in this world, so a locked door would place a key that does
        # not exist. Gating happens on the way in, at the point of interest.
        "lockedDoorChance": 0, "doorGates": [],
        "rollEncounters": False,
        "safeEntrance": True,
    }
    out.update(kw)
    if palette:
        out["palette"] = palette

    if size:
        out["width"], out["height"] = size
    elif algorithm == "rooms":
        width, height, corridor = fit(
            int(rooms), out.get("roomSize", "2d3+3"),
            out.get("corridorLength", "3d3"), aspect)
        out["width"], out["height"] = width, height
        out["corridorLength"] = corridor
    elif algorithm == "caverns":
        # Caverns do not place rooms; the chambers are whatever the automaton
        # leaves behind. Room count is a target for how much cave to carve.
        side = max(27, int(round(((int(rooms) * 90) / 0.5) ** 0.5)))
        out["width"] = str(min(MAX_SIDE, side | 1))
        out["height"] = str(min(MAX_SIDE, int(round(side / aspect)) | 1))
    elif algorithm == "bsp":
        # BSP splits the whole rectangle, so it wants room for `minLeaf` cells
        # rather than spacing — but it still cannot make more leaves than fit.
        leaf = out.get("bsp", {}).get("minLeaf", 5) + 2
        side = max(25, int(round(((int(rooms) * leaf * leaf) / 0.75) ** 0.5)))
        out["width"] = str(min(MAX_SIDE, side | 1))
        out["height"] = str(min(MAX_SIDE, int(round(side / aspect)) | 1))
    return out


# --- the six vocabularies ---------------------------------------------------


def trap(tid, name, description, detect, disarm, damage, dtype, *, condition=None,
          reusable=False):
    trigger = [{"damage": {"target": {"ref": "target.id"},
                           "amount": {"roll": damage}, "damageType": dtype}}]
    if condition:
        trigger.append({"applyCondition": {"target": {"ref": "target.id"},
                                           "condition": condition[0],
                                           "duration": condition[1]}})
    return {
        "id": tid, "name": name, "description": description,
        "detect": {"skill": detect[0], "difficulty": detect[1]},
        "disarm": {"skill": disarm[0], "difficulty": disarm[1]},
        "onTrigger": trigger, "reusable": reusable,
        "tags": ["trap"],
    }
