"""Gathering a continent out of the files that declare pieces of it."""
import importlib


def load(names):
    """Import each name, in order, and return the modules."""
    return [importlib.import_module(name) for name in names]


def gather(modules, attr):
    out = []
    for module in modules:
        out.extend(getattr(module, attr, []))
    return out


def edges(modules):
    seen = {}
    for module in modules:
        for edge in getattr(module, "EDGES", []):
            a, b, minutes = edge[0], edge[1], edge[2]
            opts = edge[3] if len(edge) > 3 else {}
            key = (a, b)
            if key in seen:
                raise ValueError(f"duplicate road {a} -> {b}")
            seen[key] = (minutes, opts)
    return seen


def areas(modules):
    """Areas with their connections attached, in declaration order."""
    entries = gather(modules, "AREAS")
    known = {a["id"] for a in entries}
    by_id = {a["id"]: a for a in entries}
    for entry in entries:
        entry["connections"] = []

    deferred = []
    for (a, b), (minutes, opts) in edges(modules).items():
        # Regions can land one at a time while inter-region roads are declared all at once.
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


def pois(modules):
    """Points of interest, each promoted to its own prose if any was written."""
    from dmkit import prose
    entries = gather(modules, "POIS")
    for entry in entries:
        own = f"{entry['id']}_desc"
        if prose.has(own):
            entry["descriptionKey"] = own
    lay_out(entries, areas(modules))
    return entries


def lay_out(entries, area_list):
    """Give every point of interest a spot on its area's map."""
    sizes = {a["id"]: (int(a["map"]["width"]), int(a["map"]["height"]))
             for a in area_list}
    counters = {}
    for entry in entries:
        if "position" in entry:
            continue
        width, height = sizes.get(entry["area"], (31, 21))
        index = counters.get(entry["area"], 0)
        counters[entry["area"]] = index + 1

        # A ring of spots inset from the wall, filled clockwise, then a second ring further in.
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


def attach_room_templates(modules, biome_list):
    """Wire each biome's room templates and traps in."""
    for field, attr in (("roomTemplates", "BIOME_ROOMS"), ("traps", "BIOME_TRAPS")):
        wanted = {}
        for module in modules:
            for biome_id, ids in getattr(module, attr, {}).items():
                wanted.setdefault(biome_id, []).extend(ids)
        for biome in biome_list:
            ids = wanted.get(biome["id"])
            if ids:
                biome[field] = sorted(dict.fromkeys(ids))
