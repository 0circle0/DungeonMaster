"""Wiring a list of quests into a startable, gated, ordered chain.

A chain is a small questline: three or four quests, one region, its own people, its own ending. What
makes it a side chain rather than a branch of the spine is a contract rather than a field — the
engine has no idea what optional content means — so the contract is asserted by a linter. See
`dmkit.lint`.

Two things worth knowing before writing one:

  * `quest.tags` is inert. The engine's `QuestDef` has no `tags` field. The tags written here are
    for the linter; everything that gates lives in `requires`.
  * `unlocks` marks a quest available and does not gate starting it, so every link past the head
    states its own `requires` as well.

`chain()` takes the act gate as an argument rather than looking one up: a module owns its own act
structure, and a shared kit may not import content.
"""
from dmkit.quests import quest


def link(qid, name, description, objectives=(), **kw):
    """One quest of a chain, before `chain()` wires its gating in.

    Everything `dmkit.quests.quest` takes is accepted and passed through; `chain` supplies `tags`,
    `requires` and `unlocks`, and merges into a `requires` written here rather than overwriting it.
    """
    return {"id": qid, "name": name, "description": description,
            "objectives": list(objectives), **kw}


def chain(key, links, *, act, gate, region, giver, level=None):
    """Wire a list of `link()`s into a startable, gated, act-contained chain.

    The head gets `gate` and the `giver`; every later link requires the one before it and is named
    in its `unlocks`. `act` and `region` are recorded on each quest's tags so a linter can assert
    that nothing in the chain reaches outside either.
    """
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
            # The level floor is on the head only. Gating every link on it would make the middle of
            # a chain look conditional when it is not.
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
