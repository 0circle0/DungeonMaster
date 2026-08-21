"""Things you can carry."""

def gear(gid, name, slot, value, description, *, skills=None, guard=None,
         initiative=None, carry=None, resist=(), weight=1, rarity=None,
         tags=(), damage=None, properties=()):
    """A piece of equipment, for the slots the main questline leaves empty."""
    # `kind` is not decoration.
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
    """Give every class its gear."""
    for entry in classes:
        items = kit.get(entry["id"])
        if items:
            entry["startingItems"] = [{"item": i, "quantity": q} for i, q in items]
    return classes
