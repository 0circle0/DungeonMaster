"""Aurendel after the Unsealing — the trials, and the five rules they keep.

The ninth door was the one everybody watched, because it was the one standing
open. Eight were opened before it, in order, over a long time, and whatever came
through those eight has been in Aurendel ever since — in cellars under places
you saved, in galleries nobody works, in a listening room four miles down. It
has been quiet because the ninth door was the interesting one. It is not any
more.

A trial is post-game content. The contract, all asserted by `check_quests.py`:

  1. **Behind the ending.** Nothing here is offered until `aurendel_finished` is
     set, which `the_unsealing` writes in its `onComplete` and which nothing
     read until this file existed. A trial can never appear in an `isEnding`
     arc, and nothing on the spine, in a chain or in a hidden thread may read a
     trial flag — the same containment the other two kinds of optional content
     keep, in the same direction.
  2. **A ladder, in order.** Tier one opens on the ending. Tier two opens on
     tier one's warrant, tier three on tier two's. The gate is an item the
     previous tier pays out, so the ladder is a thing you carry rather than a
     number the engine remembers.
  3. **Kitted, and checked.** Every tier's first door wants a fabled relic
     *worn*, not owned — `requires.items[].equipped`. A hidden thread is where
     fabled gear comes from, so the door that asks for it is asking whether you
     went and looked, and says so in words rather than refusing silently.
  4. **Tuned above the game.** A party that has done the spine finishes at
     level 10; one that has done the spine and the chains at 14; one that has
     pulled all thirty-eight threads at 19. Trials are written for the top of
     that, because the equipment gate means anybody standing at the door has
     been to the bottom of the threads.
  5. **The world changed.** A tier is not only a new dungeon. Places already
     walked get encounter groups gated on the same flag, so the quiet half of
     the continent stops being quiet the moment the ending lands.

Two things worth knowing before writing one:

  * **`start.postVictory` has to be `continue`,** or none of this is reachable:
    `settle` sets `outcome: 'victory'` and every affordance stops. `build.py`
    writes it into the `start` block; without it a trial validates perfectly and
    cannot be played.
  * **`quest.tags` is inert,** exactly as it is for a side chain. `["trial",
    key]` is written for `check_quests.py` and for us. Everything that gates
    lives in `requires`.
"""
from questkit import quest

# What each tier waits on. Tier one is the ending itself; the other two are the
# warrant the tier below pays out, which is why they are items rather than
# flags — a thing in the pack reads better in a journal than a boolean, and
# `requires.items` was already there.
TIER_GATES = {
    "trial_one": {"flags": [{"flag": "aurendel_finished", "equals": True}]},
    "trial_two": {"items": [{"item": "first_warrant"}]},
    "trial_three": {"items": [{"item": "second_warrant"}]},
}

# The relics a tier's door will accept as proof you have been down a thread.
# Several rather than one, and `anyOf` rather than `items`, because insisting on
# a particular cloak would make the door a lottery over which region a party
# happened to work — every one of these is the payout of a hidden thread.
PROOFS = {
    "trial_one": ["greenway_cloak", "hermits_watch_cloak", "signal_hood",
                  "warm_water_hood", "breathing_hood"],
    "trial_two": ["beaters_cloak", "bog_belt", "ninth_column_coat",
                  "rime_singers_torc", "marshlight_belt"],
    "trial_three": ["bell_rope_ring", "shilling_ring", "hearth_ring",
                    "pilots_glass_ring", "cistern_keepers_ring"],
}


def warrant(iid, name, description):
    """The thing a finished tier pays out, and the next tier's key.

    `kind: "key"` and `value: 0` for the reason `items.key` gives: a quest
    object on a shop shelf is a quest object a party can sell by accident and
    then not be able to buy back.
    """
    return {"id": iid, "name": name, "description": description,
            "kind": "key", "value": 0, "weight": 0,
            "tags": ["warrant", "trial"]}


def proving(gid, name, description, blocked_key, key, *, opens_flag):
    """A door that wants a fabled relic *worn*.

    `equipped: True` rather than merely carried, which is the whole point of the
    field: what is being asked is not whether you own the thing but whether you
    came dressed for this. `consume` is false everywhere here — a trial takes
    the party's time and its hit points, never its gear.

    Built by hand rather than through `lorekit.sealed`, because that helper's
    `requires` is a flat `items` list and this needs `anyOf` over five of them.
    """
    return {
        "id": gid, "name": name, "description": description, "kind": "ward",
        "blockedTextKey": blocked_key, "staysOpen": True,
        "onOpen": [{"setFlag": {"flag": opens_flag, "value": True}}],
        "onBlocked": [], "opensWith": [], "tags": ["trial"],
        "requires": {
            **TIER_GATES[key],
            "anyOf": [{"items": [{"item": relic, "quantity": 1,
                                  "consume": False, "equipped": True}]}
                      for relic in PROOFS[key]],
        },
    }


def tier(key, links, *, giver, warrant_item, level):
    """Wire a tier's quests into an ordered, gated, startable ladder rung.

    The same shape as `sidekit.chain` and for the same reasons — the head gets
    the gate and the giver, every later link states its own `requires` as well
    as being named in the one before's `unlocks`, because `unlocks` marks a
    quest available and does not gate starting it.

    The difference is what the head is gated on: `TIER_GATES[key]`, which is the
    ending for tier one and the tier below's warrant after that.
    """
    if key not in TIER_GATES:
        raise ValueError(f"unknown tier {key!r}")

    out = []
    for index, entry in enumerate(links):
        spec = dict(entry)
        qid = spec.pop("id")
        name = spec.pop("name")
        description = spec.pop("description")
        objectives = spec.pop("objectives", [])

        gate = dict(spec.pop("requires", None) or {})
        if index == 0:
            gate.update(TIER_GATES[key])
            # The floor is on the head only, as it is for a chain: gating every
            # rung on it would make the middle of a tier look conditional when
            # it is not.
            gate["minLevel"] = level
            spec["giver"] = giver
        else:
            gate["quests"] = list(gate.get("quests", [])) + [
                {"quest": links[index - 1]["id"], "status": "complete"}]

        if index + 1 < len(links):
            spec["unlocks"] = list(spec.get("unlocks", [])) + [links[index + 1]["id"]]
        else:
            # The last rung pays the warrant, which is the next tier's gate.
            spec["items"] = list(spec.get("items", ())) + [(warrant_item, 1)]

        out.append(quest(qid, name, description, objectives,
                         requires=gate, tags=["trial", key], **spec))
    return out


def link(qid, name, description, objectives=(), **kw):
    """One quest of a tier, before `tier()` wires its gating in."""
    return {"id": qid, "name": name, "description": description,
            "objectives": list(objectives), **kw}


# What every post-game encounter group is gated on. A group that fails its
# `requires` is removed from the draw entirely (`world/populate.ts`), so before
# the ending the whole table collapses to its empty weight and the place is
# exactly as quiet as it has always been.
AFTER_THE_ENDING = {"flags": [{"flag": "aurendel_finished", "equals": True}]}


def loosed(table_id, entries, *, chance=0.4, empty=3):
    """An encounter table for a place already walked, live only after the end.

    Rule 5: a tier is not only three new dungeons. `entries` is a list of
    `(group_id, [(monster, count, scale), ...], weight)`, and the flag goes on
    every group here rather than at each call site, because a group that gets
    left out of the gating is a monster the party meets in Act I at level
    three.

    Attached to areas rather than biomes, so this stays a list of named places
    rather than a change to what a whole terrain means.
    """
    from loot import group, encounters
    return encounters(
        table_id,
        [group(gid, monsters, weight=weight, requires=AFTER_THE_ENDING)
         for gid, monsters, weight in entries],
        chance=chance, empty=empty, scale=2)
