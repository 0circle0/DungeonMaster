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


# What a creature does when nothing is telling it what to do, keyed by what it
# is. A table rather than a block per monster: what a thing *is* decides how it
# hunts far more reliably than which dungeon it was dropped into, and a bestiary
# of a hundred and twenty-seven would otherwise be a hundred and twenty-seven
# hand-written opinions nobody would keep consistent.
#
# Anything absent inherits `rules.temperament`. `investigates` is a preference
# order, not a filter -- a beast listing smell first follows its nose past
# something it can plainly see -- and omitting `tracks` from that list is how a
# creature comes to have no idea what a footprint means.
#
# **Every distance below is in module units, and a tile is two feet**, because
# `tileSize` is the *smallest* declared size and this ruleset declares tiny at
# 2. So halve to read these in tiles. Written the wrong way round the first
# time: a leash of 400 is two hundred tiles, which is larger than any dungeon
# this generates and so is no leash at all. See `docs/rules-provenance.md` G4a.
TEMPERAMENTS = {
    # Ranges wide, hunts by nose, cannot read the ground.
    "beast": {
        "roamRadius": 50, "investigateRadius": 120, "leashRadius": 180,
        "wanderChance": 0.6, "disengageTurns": 3,
        "speeds": {"wander": 0.5, "investigate": 1.25},
        "investigates": ["smell", "hearing", "sight"],
        "notices": ["hostile", "neutral"],
    },
    # Keeps to its barrow, and slow about it, but it hunts. It does not read
    # footprints -- `tracks` is absent from the list it acts on -- and that is
    # the whole of what it fails to understand. `followsTrails` would be the
    # wrong way to say it: that switch turns off *every* lingering trace, scent
    # included, and a grave hound that cannot smell where you went is not an
    # incurious monster, it is a broken one.
    "undead": {
        "roamRadius": 12, "investigateRadius": 40, "leashRadius": 60,
        "wanderChance": 0.1, "disengageTurns": 1,
        "speeds": {"wander": 0.5, "investigate": 0.5},
        "investigates": ["sight", "hearing", "smell"],
    },
    # Walks a post, and reads the ground because somebody taught it to.
    "humanoid": {
        "roamRadius": 24, "investigateRadius": 70, "leashRadius": 100,
        "wanderChance": 0.4, "disengageTurns": 2,
        "investigates": ["sight", "hearing", "tracks", "smell"],
        "notices": ["hostile", "neutral"],
    },
    # Holds its post exactly. Never wanders, never gives up.
    "construct": {
        "roamRadius": 0, "investigateRadius": 16, "leashRadius": 16,
        "wanderChance": 0, "disengageTurns": 4,
        "speeds": {"wander": 0},
        "investigates": ["sight"],
        "followsTrails": False,
    },
    "plant": {
        "roamRadius": 0, "wanderChance": 0, "disengageTurns": 0,
        "speeds": {"wander": 0},
        "investigates": [],
        "followsTrails": False,
    },
    "ooze": {
        "roamRadius": 16, "investigateRadius": 40, "leashRadius": 50,
        "wanderChance": 0.25, "disengageTurns": 2,
        "speeds": {"wander": 0.4, "investigate": 0.6},
        "investigates": ["smell"],
    },
    "aberration": {
        "roamRadius": 30, "investigateRadius": 90, "leashRadius": 140,
        "wanderChance": 0.3, "disengageTurns": 3,
        "investigates": ["hearing", "smell", "sight"],
        "notices": ["hostile", "neutral"],
    },
    # Fire and air leave no nose behind them: this one genuinely perceives
    # nothing the ground has kept, which is what `followsTrails` is for.
    "elemental": {
        "roamRadius": 24, "investigateRadius": 60, "leashRadius": 80,
        "wanderChance": 0.45, "disengageTurns": 2,
        "investigates": ["sight", "hearing"],
        "followsTrails": False,
    },
}


def creature(mid, name, level, xp, attrs, abilities, description, *,
             faction, creature_type,
             behaviour=None, loot=None, conditional=(), size="medium",
             descriptors=(), interactions=(), immunities=(), special=(), reactions=(),
             hp=None, guard=None, temperament=None):
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

    # What it is, unless this particular one says otherwise. Merged shallowly
    # so a monster can say "like other beasts, but it never leaves the pool"
    # without restating the rest.
    habits = dict(TEMPERAMENTS.get(creature_type, {}))
    habits.update(temperament or {})
    if habits:
        out["temperament"] = habits
    return out


A = lambda might, agility, endurance, intellect, instinct, presence: {
    "might": might, "agility": agility, "endurance": endurance,
    "intellect": intellect, "instinct": instinct, "presence": presence,
}

