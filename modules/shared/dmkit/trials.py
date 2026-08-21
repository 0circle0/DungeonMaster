"""Post-game content: a ladder of tiers, each gated on the one below."""
from dmkit.quests import quest


def warrant(iid, name, description):
    """The thing a finished tier pays out, and the next tier's key."""
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": 0, "weight": 0,
            "tags": ["warrant", "trial"]}


def link(qid, name, description, objectives=(), **kw):
    """One quest of a tier, before `tier()` wires its gating in."""
    return {"id": qid, "name": name, "description": description,
            "objectives": list(objectives), **kw}


def proving(gid, name, description, blocked_key, *, gate, proofs, opens_flag):
    """A door that wants one of several fabled relics worn."""
    return {
        "id": gid, "name": name, "description": description, "kind": "ward",
        "blockedTextKey": blocked_key, "staysOpen": True,
        "onOpen": [{"setFlag": {"flag": opens_flag, "value": True}}],
        "onBlocked": [], "opensWith": [], "tags": ["trial"],
        "requires": {
            **gate,
            "anyOf": [{"items": [{"item": relic, "quantity": 1,
                                  "consume": False, "equipped": True}]}
                      for relic in proofs],
        },
    }


def tier(key, links, *, gate, giver, warrant_item, level):
    """Wire a tier's quests into an ordered, gated, startable ladder rung."""
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
            # The floor is on the head only, as for a chain.
            wants["minLevel"] = level
            spec["giver"] = giver
        else:
            wants["quests"] = list(wants.get("quests", [])) + [
                {"quest": links[index - 1]["id"], "status": "complete"}]

        if index + 1 < len(links):
            spec["unlocks"] = list(spec.get("unlocks", [])) + [links[index + 1]["id"]]
        else:
            spec["items"] = list(spec.get("items", ())) + [(warrant_item, 1)]

        out.append(quest(qid, name, description, objectives,
                         requires=wants, tags=["trial", key], **spec))
    return out


def loosed(table_id, entries, *, requires, chance=0.4, empty=3):
    """An encounter table for a place already walked, live only behind a gate."""
    from dmkit.loot import group, encounters
    return encounters(
        table_id,
        [group(gid, monsters, weight=weight, requires=requires)
         for gid, monsters, weight in entries],
        chance=chance, empty=empty, scale=2)
