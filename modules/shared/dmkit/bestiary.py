"""Monsters, and the one rule that governs every entry.

**A monster's ability must carry its own damage.** `weaponDamage` only fires
when an ability produced none itself, and it reads the attacker's `equipped` —
which for a spawned monster is empty. An ability with no `onUse` therefore hits
for nothing at all, and nothing reports it. That is why a bestiary declares its
own abilities rather than reusing the party's `strike`.

`faction` and `creature_type` are **required**. Both are facts about the world
rather than about the engine, and a monster that quietly picks up a default
fights on the wrong side and validates perfectly. A module that wants defaults
should wrap this — see `modules/aurendel/src/bestiary.py`.
"""


def bite(aid, name, dice, damage_type, description, *, stat="might", range_=0,
         condition=None, cooldown=0, targeting="single", action="action"):
    effects = [{"damage": {"target": {"ref": "target.id"},
                           "amount": {"roll": dice}, "damageType": damage_type}}]
    if condition:
        effects.append({"applyCondition": {"target": {"ref": "target.id"},
                                           "condition": condition[0],
                                           "duration": condition[1]}})
    out = {
        "id": aid, "name": name, "description": description,
        "actionType": action, "targeting": targeting,
        "attack": {"stat": stat, "against": "guard"},
        "onUse": effects,
    }
    if range_:
        out["range"] = range_
    if cooldown:
        out["cooldown"] = cooldown
    return out


def creature(mid, name, level, xp, attrs, abilities, description, *,
             faction, creature_type,
             behaviour=None, loot=None, conditional=(), size="medium",
             descriptors=(), interactions=(), immunities=(), special=(), reactions=(),
             hp=None, guard=None):
    out = {
        "id": mid, "name": name, "description": description,
        "level": level, "xp": xp,
        "attributes": attrs,
        "abilities": list(abilities),
        "behaviour": behaviour or [{"priority": 0, "use": abilities[0]}],
        "faction": faction, "creatureType": creature_type, "size": size,
        "descriptors": list(descriptors),
        "conditionalLoot": list(conditional),
    }
    if loot:
        out["loot"] = loot
    if interactions:
        out["damageInteractions"] = list(interactions)
    if immunities:
        out["conditionImmunities"] = list(immunities)
    if special:
        out["specialTurns"] = list(special)
    if reactions:
        out["reactions"] = list(reactions)
    if hp is not None:
        out["resourceOverrides"] = {"hp": hp}
    if guard is not None:
        out["derivedOverrides"] = {"guard": guard}
    return out


A = lambda might, agility, endurance, intellect, instinct, presence: {
    "might": might, "agility": agility, "endurance": endurance,
    "intellect": intellect, "instinct": instinct, "presence": presence,
}

