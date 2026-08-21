"""Constructors for places — areas, points of interest, and the ways between."""
from dmkit import prose


def area(aid, name, biome, role, danger, level, description, *, size,
         entry=None, tags=(), faction=None, **kw):
    """One place with a map."""
    width, height = size
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


def poi(pid, name, in_area, kind, description, *, desc_key, at=None,
        minutes=5, palette=None, footprint=None, services=(), tags=(),
        static=None, dungeon=None, gate=None, hidden=False,
        discover=None, **kw):
    """A building, landmark, or way down."""
    out = {
        "id": pid, "name": name, "description": description,
        "area": in_area, "kind": kind,
        "descriptionKey": desc_key,
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
    elif footprint and palette:
        width, height = footprint
        out["map"] = {"width": width, "height": height, "palette": palette}
    out.update(kw)
    return out


def shared(pid, *texts):
    """A pool many places point at, registered once, first spelling winning."""
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
