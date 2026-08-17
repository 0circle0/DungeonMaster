"""Factions: a power that holds ground and has an opinion about you.

A faction moved only by `adjustReputation` is a number. A faction with a deed
kind is a number plus the people who tell each other about it, which is the
part the memory model exists for — so a module that declares factions and no
deed kinds has built a scoreboard rather than a society.
"""


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
