"""Wiring a list of quests into a startable, gated, ordered chain."""
from dmkit.quests import quest


def link(qid, name, description, objectives=(), **kw):
    """One quest of a chain, before `chain()` wires its gating in."""
    return {"id": qid, "name": name, "description": description,
            "objectives": list(objectives), **kw}


def chain(key, links, *, act, gate, region, giver, level=None):
    """Wire a list of `link()`s into a startable, gated, act-contained chain."""
    out = []
    for index, entry in enumerate(links):
        spec = dict(entry)
        qid = spec.pop("id")
        name = spec.pop("name")
        description = spec.pop("description")
        objectives = spec.pop("objectives", [])

        wants = dict(spec.pop("requires", None) or {})
        if index == 0:
            wants.update(gate)
            # The level floor is on the head only.
            if level:
                wants["minLevel"] = level
            spec["giver"] = giver
        else:
            wants["quests"] = list(wants.get("quests", [])) + [
                {"quest": links[index - 1]["id"], "status": "complete"}]

        if index + 1 < len(links):
            spec["unlocks"] = list(spec.get("unlocks", [])) + [links[index + 1]["id"]]

        out.append(quest(qid, name, description, objectives,
                         requires=wants, tags=["side", act, key, region],
                         **spec))
    return out
