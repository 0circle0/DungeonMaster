"""Aurendel — the side chains, and the five rules every one of them keeps.

A side chain is a small questline: three or four quests, one region, its own
people, its own dungeon, its own ending. What makes it a *side* chain rather
than a branch of the spine is a contract, and the contract is mechanical:

  1. **Skippable.** Nothing here appears in an ending arc, and nothing on the
     spine waits on a flag written here. A party that walks past every one of
     these still finishes the game.
  2. **Act-contained.** One region, one level band. An Act I chain does not send
     you to the Frostmere and does not require an Act II quest.
  3. **Never expiring.** Gated on the act being open and on nothing else. There
     is no window to miss, because permanently locking a player out of content
     they did not know existed is a cruelty the geography does not need.
  4. **Startable.** A `giver` who lists it in `offersQuests` — the linter's
     `unobtainable_quest` warning is the floor, not the goal.
  5. **Paying.** Gear the spine does not offer, a faction that moves, and the
     deed emitted from the node where the work is reported.

`check_quests.py` asserts all five against the built module, because four of
them are the kind of thing that reads fine in the source and fails silently in
play.

The two things worth knowing before writing one:

  * **`quest.tags` is inert.** The engine's `QuestDef` has no `tags` field and
    nothing dereferences it. `tags=["side", "act1", key]` is written for
    `check_quests.py` and for us; it gates nothing. Everything that actually
    gates lives in `requires`.
  * **`unlocks` marks a quest available; it does not gate starting it.** So
    every link states its own `requires` as well — belt and braces, the idiom
    `act2.py` established.
"""
from questkit import quest

# The gate that says an act is open, per act. Act III's is the same predicate
# `the_way_below` uses, imported rather than copied: "two of the three routes
# are done" is one fact about a run and should have one definition.
from act3 import TWO_KEYS

ACT_GATES = {
    # The tutorial. Everything in the Kingsvale, the capital and the coast is
    # open once the barrow is dealt with.
    "act1": {"quests": [{"quest": "the_open_door", "status": "complete"}]},
    # The Undercroft is what puts the three roads on the map; it is also what
    # makes a level-4 region survivable.
    "act2": {"quests": [{"quest": "the_undercroft", "status": "complete"}]},
    # Deliberately *not* "you are in the Deeproads". Two ward-keys says Act II
    # is behind you without insisting you have gone underground first, so the
    # Frostmere and the Isles are reachable in the order a player chooses.
    "act3": TWO_KEYS,
}


# --- chains ---------------------------------------------------------------

def link(qid, name, description, objectives=(), **kw):
    """One quest of a chain, before `chain()` wires its gating in.

    Everything `questkit.quest` takes is accepted and passed through; `chain`
    supplies `tags`, `requires` and `unlocks` and will not overwrite a
    `requires` written here — it merges into it.
    """
    return {"id": qid, "name": name, "description": description,
            "objectives": list(objectives), **kw}


def chain(key, links, *, act, region, giver, level=None):
    """Wire a list of `link()`s into a startable, gated, act-contained chain.

    The head gets the act gate and the `giver`; every later link requires the
    one before it *and* is named in its `unlocks`. `region` is recorded on each
    quest's tags so `check_quests.py` can assert that nothing in the chain
    reaches outside it.
    """
    if act not in ACT_GATES:
        raise ValueError(f"{key}: unknown act {act!r}")

    out = []
    for index, entry in enumerate(links):
        spec = dict(entry)
        qid = spec.pop("id")
        name = spec.pop("name")
        description = spec.pop("description")
        objectives = spec.pop("objectives", [])

        gate = dict(spec.pop("requires", None) or {})
        if index == 0:
            gate.update(ACT_GATES[act])
            # The level floor is on the head only. Gating every link on it
            # would strand a party that levelled down — which cannot happen —
            # while making the middle of a chain look conditional, which it is
            # not.
            if level:
                gate["minLevel"] = level
            spec["giver"] = giver
        else:
            gate["quests"] = list(gate.get("quests", [])) + [
                {"quest": links[index - 1]["id"], "status": "complete"}]

        if index + 1 < len(links):
            spec["unlocks"] = list(spec.get("unlocks", [])) + [links[index + 1]["id"]]

        out.append(quest(qid, name, description, objectives,
                         requires=gate, tags=["side", act, key, region],
                         **spec))
    return out


# --- gear -----------------------------------------------------------------

def gear(gid, name, slot, value, description, *, skills=None, guard=None,
         initiative=None, carry=None, resist=(), weight=1, rarity=None,
         tags=(), damage=None, properties=()):
    """A piece of equipment, in one of the four slots the spine never uses.

    `head`, `cloak`, `ring` and `belt` hold nothing in Aurendel — every one of
    the module's twenty-nine items is a hand or a body — so a chain can pay out
    in real power without touching the weapon and armour numbers the main line
    was tuned against.

    `skills` is the reason the engine changed: `item.modifiers` is keyed by
    `rules.derivedStats` and can only ever move guard, initiative and carry.
    `skillBonuses` is read by `skillRankOf`, which both the dice and the
    `minRank` gates go through.
    """
    # `kind` is not decoration. `weaponOf` (rules/combat/attack.ts) returns the
    # first equipped item that is `kind: "weapon"` *and* has `damage`, so a
    # blade filed as a trinket hits for nothing at all — which is precisely the
    # failure `items.py` exists to document. Anything that declares damage is a
    # weapon, whatever slot it hangs in.
    if damage:
        kind = "weapon"
    elif slot in ("body", "head", "cloak"):
        kind = "armor"
    else:
        kind = "trinket"

    out = {"id": gid, "name": name, "description": description, "kind": kind,
           "slot": slot, "value": value, "weight": weight, "tags": list(tags)}

    modifiers = {}
    if guard:
        modifiers["guard"] = guard
    if initiative:
        modifiers["initiative"] = initiative
    if carry:
        modifiers["carry"] = carry
    if modifiers:
        out["modifiers"] = modifiers

    if skills:
        out["skillBonuses"] = dict(skills)
    if resist:
        # `unless` is left off deliberately: a cloak that turns fire turns fire.
        # Silver's exception belongs on the monster, not on the coat.
        out["damageInteractions"] = [{"damageType": d, "multiplier": m}
                                     for d, m in resist]
    if damage:
        dice, damage_type, stat = damage
        out["damage"] = {"dice": dice, "damageType": damage_type, "stat": stat}
    if properties:
        out["properties"] = list(properties)
    if rarity:
        out["rarity"] = rarity
    return out


# --- factions -------------------------------------------------------------

def regional(fid, name, description, *, standing=0, decay=0.05, relations=None,
             ranks=()):
    """A power that holds one region and has an opinion about you.

    `relations` spills one hop and is directional, so a regional faction can
    reach the main six without the main six having to declare it — which is how
    salvaging a wreck ends up mattering to the Crown.
    """
    return {"id": fid, "name": name, "description": description,
            "initialStanding": standing, "decayPerDay": decay,
            "relations": dict(relations or {}),
            "ranks": [{"id": r, "name": n, "atLeast": at} for r, n, at in ranks]}


def deed_kind(did, name, faction, severity, *, memorability=1.5, distortion=0.2):
    """Something you did that somebody saw.

    A faction moved only by `adjustReputation` is a number. A faction with a
    deed kind is a number plus the people who tell each other about it, which
    is the part the memory model exists for.
    """
    return {"id": did, "name": name, "faction": faction, "severity": severity,
            "memorability": memorability, "distortion": distortion}


def standing_gate(faction, minimum, hint):
    """A dialogue option that shows what it would take, rather than hiding it.

    Splat it into `option(...)`: the door stays visible with the price written
    on it, which is the whole reason `showWhenLocked` exists.
    """
    return {"requires": {"factions": [{"faction": faction, "minStanding": minimum}]},
            "locked_hint": hint}
