"""Post-game content: a ladder of tiers, each gated on the one below.

The same shape as `dmkit.chains` and for the same reasons — the head gets the
gate and the giver, every later rung states its own `requires` as well as being
named in the one before's `unlocks`, because `unlocks` marks a quest available
and does not gate starting it.

Two things that will make a tier validate perfectly and be unreachable:

  * **`start.postVictory` has to be `continue`.** Otherwise `settle` sets
    `outcome: 'victory'` on the ending and returns early ever after — no
    combat, no encounters, no affordances — and everything gated behind the
    ending is dead.
  * **`quest.tags` is inert**, exactly as it is for a chain. The tags written
    here are for the linter and for us. Everything that gates lives in
    `requires`.

Like `dmkit.chains`, nothing here looks a gate up: `gate`, `proofs` and
`requires` all arrive as arguments, because what counts as "the game is
finished" is the one fact a shared kit cannot know.
"""
from dmkit.quests import quest


def warrant(iid, name, description):
    """The thing a finished tier pays out, and the next tier's key.

    `kind: "key"` and `value: 0` for the reason `dmkit.items.key` gives:
    `shopStock` skips anything worth nothing, and a quest object on a shelf is
    a quest object a party can sell by accident and then not buy back.

    An item rather than a flag because a thing in the pack reads better in a
    journal than a boolean does, and `requires.items` was already there.
    """
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": 0, "weight": 0,
            "tags": ["warrant", "trial"]}


def link(qid, name, description, objectives=(), **kw):
    """One quest of a tier, before `tier()` wires its gating in."""
    return {"id": qid, "name": name, "description": description,
            "objectives": list(objectives), **kw}


def proving(gid, name, description, blocked_key, *, gate, proofs, opens_flag):
    """A door that wants one of several fabled relics *worn*.

    `equipped: True` rather than merely carried, which is the whole point of
    the field: what is being asked is not whether you own the thing but whether
    you came dressed for this. `consume` is false — a trial takes the party's
    time and its hit points, never its gear.

    `anyOf` over `proofs` rather than a flat `items` list, because insisting on
    one particular relic would make the door a lottery over which optional
    content a party happened to do.
    """
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
    """Wire a tier's quests into an ordered, gated, startable ladder rung.

    The last rung pays the warrant, which is the next tier's gate.
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
            # The floor is on the head only, as it is for a chain: gating every
            # rung on it would make the middle of a tier look conditional when
            # it is not.
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
    """An encounter table for a place already walked, live only behind a gate.

    A tier is not only a new dungeon: places the party has been get encounter
    groups gated on the same flag, so the quiet half of the map stops being
    quiet the moment the ending lands.

    `entries` is a list of `(group_id, [(monster, count, scale), ...], weight)`,
    and `requires` goes on every group here rather than at each call site,
    because a group left out of the gating is a monster the party meets in the
    first act at level three. A group that fails its `requires` is removed from
    the draw entirely (`world/populate.ts`), so before the gate opens the table
    collapses to its empty weight and the place is as quiet as it always was.

    Attached to areas rather than biomes, so this stays a list of named places
    rather than a change to what a whole terrain means.
    """
    from dmkit.loot import group, encounters
    return encounters(
        table_id,
        [group(gid, monsters, weight=weight, requires=requires)
         for gid, monsters, weight in entries],
        chance=chance, empty=empty, scale=2)
