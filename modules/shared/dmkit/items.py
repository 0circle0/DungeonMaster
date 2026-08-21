"""Things you can carry.

The trap this module documents: `strike` declares no damage of its own, so damage comes entirely
from an equipped weapon (`rules/combat/attack.ts`). A party with no weapons swings for zero and
nothing reports it.

The sibling trap is `kind`. `weaponOf` returns the first equipped item that is `kind: "weapon"` and
has `damage`, so a blade filed as a trinket hits for nothing. Every constructor here derives `kind`
rather than taking it.
"""

def gear(gid, name, slot, value, description, *, skills=None, guard=None,
         initiative=None, carry=None, resist=(), weight=1, rarity=None,
         tags=(), damage=None, properties=()):
    """A piece of equipment, for the slots the main questline leaves empty.

    `head`, `cloak`, `ring` and `belt` are the four a spine written around hands and bodies never
    fills, so optional content can pay out in real power without touching the weapon and armour
    numbers the main line was tuned against.

    `skills` is why the engine changed: `item.modifiers` is keyed by `rules.derivedStats` and can
    only move guard, initiative and carry, while `skillBonuses` is read by `skillRankOf`, which both
    the dice and the `minRank` gates go through.
    """
    # `kind` is not decoration. `weaponOf` (rules/combat/attack.ts) returns the first equipped item
    # that is `kind: "weapon"` and has `damage`, so a blade filed as a trinket hits for nothing.
    # Anything that declares damage is a weapon, whatever slot it hangs in.
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
        # `unless` is left off deliberately: a cloak that turns fire turns fire. Silver's exception
        # belongs on the monster, not on the coat.
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


def weapon(wid, name, dice, damage_type, value, description, *, stat="might",
           properties=(), tags=(), rarity=None):
    out = {
        "id": wid, "name": name, "description": description, "kind": "weapon",
        "slot": "hand", "value": value, "weight": 3,
        "damage": {"dice": dice, "damageType": damage_type, "stat": stat},
        "properties": list(properties), "tags": list(tags),
    }
    if rarity:
        out["rarity"] = rarity
    return out


def armour(aid, name, guard, value, description, *, weight=8, rarity=None):
    out = {
        "id": aid, "name": name, "description": description, "kind": "armor",
        "slot": "body", "value": value, "weight": weight,
        "modifiers": {"guard": guard},
    }
    if rarity:
        out["rarity"] = rarity
    return out


def potion(pid, name, value, description, effects, *, tags=("consumable",)):
    return {
        "id": pid, "name": name, "description": description, "kind": "consumable",
        "value": value, "weight": 0.5, "stackable": True, "consumedOnUse": True,
        "onUse": effects, "tags": list(tags),
    }


def treasure(tid, name, value, description):
    return {
        "id": tid, "name": name, "description": description, "kind": "treasure",
        "value": value, "weight": 1, "tags": ["treasure"],
    }


def key(kid, name, description, *, kind="key"):
    # `value: 0` keeps it off every shop shelf: `shopStock` skips anything worth nothing.
    return {
        "id": kid, "name": name, "description": description, "kind": kind,
        "value": 0, "weight": 0.5, "tags": ["quest"],
    }


HEAL = lambda dice: [{"heal": {"target": {"ref": "actor.id"}, "amount": {"roll": dice}}}]


def outfit(classes, kit):
    """Give every class its gear. Mutates the list the build is about to emit.

    `kit` is class id -> [(item id, quantity), ...]. Separate from the class definitions because
    `core_fantasy` says what a warden is, and the world it is played in says what a warden starts
    out holding.
    """
    for entry in classes:
        items = kit.get(entry["id"])
        if items:
            entry["startingItems"] = [{"item": i, "quantity": q} for i, q in items]
    return classes
