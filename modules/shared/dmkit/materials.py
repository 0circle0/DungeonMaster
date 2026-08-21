"""The vocabulary places are built out of: terrains, palettes, biomes.

Two engine facts shape every module that uses this:

  * `biome.palette` overrides `area.map.palette` (sim/enter.ts), so a settlement cannot borrow its
    region's biome — every built-up place needs an urban biome of its own or the town renders as the
    field it stands in.
  * A POI interior is built by `buildMap` with no palette override (sim/enter.ts), so
    `poi.map.palette` is honoured. That is what the `int_*` palettes are for.

The four constructors take rows of tuples, so a module's materials file reads as a table.
`INTERIOR_PALETTES` is the set `dmkit.places.TRADE_PALETTE` names.
"""


def sc(terrain, frequency, distribution="speckle", **kw):
    entry = {"terrain": terrain, "frequency": frequency, "distribution": distribution}
    entry.update(kw)
    return entry


def terrains(rows, *, extras=None, tags=None, marks=None):
    """`(id, name, glyph, colour, passable, opaque, moveCost, description)` tuples into terrain
    entries. `tags` is tag -> [terrain id]; `extras` is per-id and merged last, so it can
    override anything derived.

    `marks` is how well ground keeps a trace, as `{group: {sense: 0..1}}` with `group` naming a list
    in `tags`. Keyed by tag rather than by id because a module has scores of terrains and about four
    kinds of footing. Anything in no listed group is left absent, which the engine reads as keeping
    a trace perfectly.
    """
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
    """`(id, name, floor, wall, door, exterior, scatter)` tuples into palettes. A falsy `door` is
    left off, for a place with no door.
    """
    out = []
    for pid, name, floor, wall, door, exterior, scatter in rows:
        entry = {"id": pid, "name": name, "floor": floor, "wall": wall,
                 "exterior": exterior, "scatter": scatter}
        if door:
            entry["door"] = door
        out.append(entry)
    return out


def biomes(rows, *, ambience_prefix="dungeon_"):
    """`(id, name, layer, palette, description)` tuples into biomes. Every biome gets an
    `<id>_ambience` key except those whose id starts with `ambience_prefix`.
    """
    out = []
    for bid, name, layer, palette, desc in rows:
        entry = {"id": bid, "name": name, "description": desc, "layer": layer,
                 "palette": palette, "roomTemplates": [],
                 "encounterTables": [], "lootTables": [], "traps": []}
        # Ambience fires on entering an area (sim/enter.ts). No area is ever in a dungeon biome — a
        # dungeon is reached through a point of interest — so an ambience pool there would be prose
        # nothing could read.
        if not bid.startswith(ambience_prefix):
            entry["ambienceKey"] = f"{bid}_ambience"
        out.append(entry)
    return out
