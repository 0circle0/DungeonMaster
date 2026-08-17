"""Constructors for places — areas, points of interest, and the ways between.

Nothing here names a palette, a text pool or a size. `area()` takes the map it
should be, `poi()` takes the palette and footprint it should have, and the
tables that decide those — what a "city" measures, which palette a smithy gets,
which pool an unnamed shrine falls back on — belong to the module, because
every one of them is a choice about a world rather than a fact about the
engine. See `modules/aurendel/src/place.py` for a worked set.

Two engine facts these do encode:

  * a place narrates from the `narrative.textGrammar` pool named by its
    `descriptionKey`; the plain `description` is only ever shown by
    `look <name>` (narrate.ts:709);
  * a generated interior is one undivided walled rectangle
    (sim/enter.ts sets `rooms: []`), so `poi.map` is outside dimensions —
    subtract two in each direction for floor.
"""
from dmkit import prose


def area(aid, name, biome, role, danger, level, description, *, size,
         entry=None, tags=(), faction=None, **kw):
    """One place with a map.

    `size` is the `(width, height)` the map should be; `role` is recorded on
    `extra` and is otherwise the module's business.
    """
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
    """A building, landmark, or way down.

    `palette` and `footprint` together make an interior; leave both off for
    something you stand *at* rather than *in* — a well, a stone circle, a
    crossroads — which leaves the party on the area map. A `dungeon` or a
    `static` map wins over both.

    `desc_key` is required rather than defaulted: which pool an unnamed place
    falls back on is a decision about a world's prose, and a silently wrong
    `descriptionKey` is a place that narrates as something else.
    """
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
