"""What drops, what is on the shelf, and what wanders the roads."""


def w(weight, item, quantity="1", **kw):
    entry = {"item": item, "quantity": quantity}
    entry.update(kw)
    return {"weight": weight, "value": entry}


def table(tid, entries, *, rolls="1", empty=0.0, name=None, bonus_skill=None):
    out = {"id": tid, "entries": entries, "rolls": rolls, "emptyChance": empty}
    if name:
        out["name"] = name
    if bonus_skill:
        out["bonusRollSkill"] = bonus_skill
        out["bonusRolls"] = {"onSuccess": 1, "onCritical": 2}
    return out


def group(gid, entries, *, weight=1, hostile=True, requires=None):
    out = {"id": gid, "weight": weight, "hostile": hostile,
           "entries": [{"monster": m, "count": c, "scaleWithLevel": s}
                       for m, c, s in entries]}
    if requires:
        out["requires"] = requires
    return out


def encounters(eid, groups, *, chance=0.35, empty=6, scale=3, max_depth=999):
    return {"id": eid, "minDepth": 0, "maxDepth": max_depth, "chance": chance,
            "emptyWeight": empty, "scalePerLevels": scale, "groups": groups}
