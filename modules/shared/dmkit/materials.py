"""The vocabulary places are built out of: terrains, palettes, biomes."""


def sc(terrain, frequency, distribution="speckle", **kw):
    entry = {"terrain": terrain, "frequency": frequency, "distribution": distribution}
    entry.update(kw)
    return entry


def terrains(rows, *, extras=None, tags=None, marks=None):
    """`(id, name, glyph, colour, passable, opaque, moveCost, description)` tuples into terrain entries."""
    by_tag = {}
    for tag, ids in (tags or {}).items():
        for i in ids:
            by_tag.setdefault(i, []).append(tag)

    holds = {}
    for group, kept in (marks or {}).items():
        for i in (tags or {}).get(group, ()):
            holds[i] = kept

    out = []
    for tid, name, glyph, colour, passable, opaque, cost, desc in rows:
        entry = {
            "id": tid, "name": name, "description": desc,
            "glyph": glyph, "color": colour,
            "passable": bool(passable), "opaque": bool(opaque),
            "moveCost": cost,
        }
        if tid in by_tag:
            entry["tags"] = by_tag[tid]
        if tid in holds:
            entry["marks"] = dict(holds[tid])
        entry.update((extras or {}).get(tid, {}))
        out.append(entry)
    return out


def palettes(rows):
    """`(id, name, floor, wall, door, exterior, scatter)` tuples into palettes."""
    out = []
    for pid, name, floor, wall, door, exterior, scatter in rows:
        entry = {"id": pid, "name": name, "floor": floor, "wall": wall,
                 "exterior": exterior, "scatter": scatter}
        if door:
            entry["door"] = door
        out.append(entry)
    return out


def biomes(rows, *, ambience_prefix="dungeon_"):
    """`(id, name, layer, palette, description)` tuples into biomes."""
    out = []
    for bid, name, layer, palette, desc in rows:
        entry = {"id": bid, "name": name, "description": desc, "layer": layer,
                 "palette": palette, "roomTemplates": [],
                 "encounterTables": [], "lootTables": [], "traps": []}
        # Ambience fires on entering an area (sim/enter.ts).
        if not bid.startswith(ambience_prefix):
            entry["ambienceKey"] = f"{bid}_ambience"
        out.append(entry)
    return out
